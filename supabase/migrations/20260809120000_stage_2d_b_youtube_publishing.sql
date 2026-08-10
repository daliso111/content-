-- Stage 2D-B: YouTube publishing through the existing durable queue.
-- The enum addition must commit before it can be referenced below.
alter type public.publishing_operation add value if not exists 'youtube_video';

begin;

alter table public.publishing_jobs
  drop constraint publishing_jobs_supported_platform,
  add constraint publishing_jobs_supported_platform
    check (platform in ('facebook', 'instagram', 'youtube'));

-- Resumable upload URLs are bearer capabilities. Keep them outside public job
-- history and expose them only in the service-role worker claim.
create table private.youtube_upload_sessions (
  publishing_job_id uuid primary key
    references public.publishing_jobs(id) on delete cascade,
  session_url text not null,
  upload_offset bigint not null default 0,
  provider_video_id text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint youtube_upload_session_url_length
    check (length(session_url) between 1 and 4096),
  constraint youtube_upload_offset_nonnegative check (upload_offset >= 0),
  constraint youtube_upload_provider_video_id_safe check (
    provider_video_id is null or provider_video_id ~ '^[A-Za-z0-9_-]{1,128}$'
  )
);

create trigger youtube_upload_sessions_set_updated_at
before update on private.youtube_upload_sessions
for each row execute function private.set_updated_at();

create or replace function private.replace_post_destinations(
  target_post_id uuid,
  target_workspace_id uuid,
  destination_account_ids uuid[]
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  safe_ids uuid[] := coalesce(destination_account_ids, array[]::uuid[]);
  existing_ids uuid[] := array[]::uuid[];
  selected_count integer := cardinality(coalesce(destination_account_ids, array[]::uuid[]));
begin
  select coalesce(array_agg(social_account_id), array[]::uuid[]) into existing_ids
  from public.post_destinations where post_id = target_post_id;
  if selected_count > 20 then
    raise exception 'DESTINATION_LIMIT_EXCEEDED' using errcode = '22023';
  end if;
  if array_position(safe_ids, null) is not null
     or selected_count <> (select count(distinct id) from unnest(safe_ids) as id) then
    raise exception 'DUPLICATE_DESTINATION_SELECTION' using errcode = '22023';
  end if;
  if selected_count <> (
    select count(*) from public.social_accounts as account
    where account.id = any(safe_ids)
      and account.workspace_id = target_workspace_id
      and (account.connection_status = 'connected' or account.id = any(existing_ids))
      and account.platform in ('facebook', 'instagram', 'youtube')
  ) then
    raise exception 'ACCOUNT_DISCONNECTED_OR_DENIED' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.social_accounts as account
    where account.id = any(safe_ids)
      and not exists (
        select 1 from public.post_platforms as platform_row
        where platform_row.post_id = target_post_id
          and platform_row.platform = account.platform
      )
  ) then
    raise exception 'DESTINATION_PLATFORM_MISMATCH' using errcode = '22023';
  end if;

  delete from public.post_destinations where post_id = target_post_id;
  perform set_config('postflow.preserve_disconnected_destination', 'allowed', true);
  insert into public.post_destinations(workspace_id, post_id, post_platform_id, social_account_id)
  select target_workspace_id, target_post_id, platform_row.id, account.id
  from unnest(safe_ids) with ordinality as selected(id, ordinality)
  join public.social_accounts as account on account.id = selected.id
  join public.post_platforms as platform_row
    on platform_row.post_id = target_post_id and platform_row.platform = account.platform
  order by selected.ordinality;
  perform set_config('postflow.preserve_disconnected_destination', '', true);
end;
$$;

create or replace function private.publishing_operation_for(
  target_post_id uuid,
  target_platform public.social_platform
)
returns public.publishing_operation
language plpgsql stable security definer set search_path = '' as $$
declare
  media_count integer;
  asset public.media_assets%rowtype;
  final_caption text;
  platform_title text;
  privacy_status text;
begin
  select count(*) into media_count
  from public.post_media where post_id = target_post_id;
  select
    coalesce(nullif(btrim(platform_row.platform_caption), ''), post.caption),
    platform_row.platform_title,
    coalesce(nullif(platform_row.platform_settings ->> 'privacyStatus', ''), 'private')
  into final_caption, platform_title, privacy_status
  from public.posts as post
  join public.post_platforms as platform_row on platform_row.post_id = post.id
  where post.id = target_post_id and platform_row.platform = target_platform;

  if target_platform = 'youtube' then
    if media_count <> 1 then
      raise exception 'YOUTUBE_VIDEO_REQUIRED' using errcode = '22023';
    end if;
    select asset_row.* into asset
    from public.post_media as link
    join public.media_assets as asset_row on asset_row.id = link.media_asset_id
    where link.post_id = target_post_id;
    if asset.media_type <> 'video'
       or asset.mime_type not in ('video/mp4', 'video/quicktime', 'video/webm') then
      raise exception 'YOUTUBE_VIDEO_REQUIRED' using errcode = '22023';
    end if;
    if btrim(coalesce(platform_title, '')) = '' then
      raise exception 'YOUTUBE_TITLE_REQUIRED' using errcode = '22023';
    end if;
    if length(btrim(platform_title)) > 100 then
      raise exception 'YOUTUBE_TITLE_TOO_LONG' using errcode = '22023';
    end if;
    if length(coalesce(final_caption, '')) > 5000 then
      raise exception 'YOUTUBE_DESCRIPTION_TOO_LONG' using errcode = '22023';
    end if;
    if privacy_status not in ('private', 'unlisted', 'public') then
      raise exception 'YOUTUBE_PRIVACY_INVALID' using errcode = '22023';
    end if;
    return 'youtube_video'::public.publishing_operation;
  end if;

  if target_platform not in ('facebook', 'instagram') then
    raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023';
  end if;
  if media_count = 0 then
    if target_platform <> 'facebook' or btrim(coalesce(final_caption, '')) = '' then
      raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023';
    end if;
    return 'facebook_text';
  end if;
  if media_count <> 1 then
    raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023';
  end if;
  select asset_row.* into asset
  from public.post_media as link
  join public.media_assets as asset_row on asset_row.id = link.media_asset_id
  where link.post_id = target_post_id;
  if asset.media_type in ('image', 'graphic', 'logo')
     and asset.mime_type in ('image/jpeg', 'image/png', 'image/webp') then
    if target_platform = 'instagram' and (
      asset.mime_type <> 'image/jpeg'
      or asset.file_size is not null and asset.file_size > 8388608
      or asset.width is not null and asset.height is not null
         and (asset.width::numeric / asset.height < 0.8
           or asset.width::numeric / asset.height > 1.91)
    ) then
      raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023';
    end if;
    return case when target_platform = 'facebook'
      then 'facebook_image'::public.publishing_operation
      else 'instagram_image'::public.publishing_operation end;
  end if;
  if asset.media_type = 'video'
     and asset.mime_type in ('video/mp4', 'video/quicktime') then
    if asset.duration_seconds is not null
       and (asset.duration_seconds < 4 or asset.duration_seconds > 60) then
      raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023';
    end if;
    if asset.width is not null and asset.height is not null
       and asset.height <= asset.width then
      raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023';
    end if;
    return case when target_platform = 'facebook'
      then 'facebook_reel'::public.publishing_operation
      else 'instagram_reel'::public.publishing_operation end;
  end if;
  raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023';
end;
$$;

create or replace function private.validate_publishing_post(target_post_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  destination record;
  target_post public.posts%rowtype;
begin
  select * into target_post from public.posts where id = target_post_id;
  if not found then raise exception 'POST_NOT_FOUND' using errcode = 'P0002'; end if;
  if target_post.approval_required
     and not private.has_valid_post_approval(target_post.id) then
    raise exception 'PUBLISHING_BLOCKED_APPROVAL_REQUIRED' using errcode = '42501';
  end if;
  if not exists(select 1 from public.post_destinations where post_id = target_post_id) then
    raise exception 'NO_DESTINATION_SELECTED' using errcode = '22023';
  end if;
  for destination in
    select destination_row.*, account.platform, account.connection_status,
      account.granted_scopes, credential.expires_at,
      credential.encrypted_access_token, credential.access_token_iv,
      credential.encrypted_refresh_token, credential.refresh_token_iv
    from public.post_destinations as destination_row
    join public.social_accounts as account on account.id = destination_row.social_account_id
    left join private.social_credentials as credential
      on credential.social_account_id = account.id
    where destination_row.post_id = target_post_id
  loop
    if destination.connection_status <> 'connected'
       or destination.encrypted_access_token is null
       or destination.access_token_iv is null then
      raise exception 'ACCOUNT_DISCONNECTED' using errcode = '22023';
    end if;
    if destination.platform in ('facebook', 'instagram')
       and destination.expires_at is not null and destination.expires_at <= now() then
      raise exception 'ACCOUNT_DISCONNECTED' using errcode = '22023';
    end if;
    if destination.platform = 'facebook'
       and not destination.granted_scopes @> array[
         'pages_show_list','pages_read_engagement','pages_manage_posts'
       ]::text[] then
      raise exception 'MISSING_PERMISSION' using errcode = '42501';
    end if;
    if destination.platform = 'instagram'
       and not destination.granted_scopes @> array[
         'pages_show_list','pages_read_engagement','instagram_basic','instagram_content_publish'
       ]::text[] then
      raise exception 'MISSING_PERMISSION' using errcode = '42501';
    end if;
    if destination.platform = 'youtube' and (
      destination.encrypted_refresh_token is null
      or destination.refresh_token_iv is null
    ) then
      raise exception 'YOUTUBE_ACCOUNT_REAUTH_REQUIRED' using errcode = '42501';
    end if;
    if destination.platform = 'youtube'
       and not destination.granted_scopes @> array[
         'https://www.googleapis.com/auth/youtube.upload'
       ]::text[] then
      raise exception 'MISSING_PERMISSION' using errcode = '42501';
    end if;
    perform private.publishing_operation_for(target_post_id, destination.platform);
  end loop;
end;
$$;

create or replace function private.create_publishing_jobs(
  target_post_id uuid,
  target_scheduled_for timestamptz
)
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare
  target_post public.posts%rowtype;
  destination record;
  created_id uuid;
  created_ids uuid[] := array[]::uuid[];
  snapshot jsonb;
  chosen_operation public.publishing_operation;
  safe_platform_settings jsonb;
begin
  select * into target_post from public.posts where id = target_post_id for update;
  if not found then raise exception 'POST_NOT_FOUND' using errcode = 'P0002'; end if;
  perform private.validate_publishing_post(target_post.id);
  for destination in
    select destination_row.*, account.platform, account.id as account_id,
      platform_row.platform_caption, platform_row.platform_title,
      platform_row.platform_settings
    from public.post_destinations as destination_row
    join public.social_accounts as account on account.id = destination_row.social_account_id
    join public.post_platforms as platform_row on platform_row.id = destination_row.post_platform_id
    where destination_row.post_id = target_post.id
    order by destination_row.created_at, destination_row.id
  loop
    chosen_operation := private.publishing_operation_for(target_post.id, destination.platform);
    safe_platform_settings := case when destination.platform = 'youtube'
      then coalesce(destination.platform_settings, '{}'::jsonb) || jsonb_build_object(
        'privacyStatus', coalesce(nullif(destination.platform_settings ->> 'privacyStatus', ''), 'private')
      )
      else '{}'::jsonb end;
    select jsonb_build_object(
      'version', 1,
      'postId', target_post.id,
      'postRevision', target_post.revision,
      'workspaceId', target_post.workspace_id,
      'platform', destination.platform,
      'socialAccountId', destination.account_id,
      'caption', coalesce(nullif(btrim(destination.platform_caption), ''), target_post.caption),
      'platformTitle', nullif(btrim(destination.platform_title), ''),
      'platformSettings', safe_platform_settings,
      'scheduledFor', target_scheduled_for,
      'media', coalesce(jsonb_agg(jsonb_build_object(
        'mediaAssetId', asset.id, 'storageBucket', asset.storage_bucket,
        'storagePath', asset.storage_path, 'mimeType', asset.mime_type,
        'mediaType', asset.media_type, 'fileSize', asset.file_size,
        'width', asset.width, 'height', asset.height,
        'durationSeconds', asset.duration_seconds
      ) order by link.sort_order) filter (where asset.id is not null), '[]'::jsonb)
    ) into snapshot
    from (select 1) as base
    left join public.post_media as link on link.post_id = target_post.id
    left join public.media_assets as asset on asset.id = link.media_asset_id;

    insert into public.publishing_jobs(
      workspace_id, post_id, post_revision, post_destination_id,
      social_account_id, platform, operation, scheduled_for, available_at,
      payload_snapshot
    ) values (
      target_post.workspace_id, target_post.id, target_post.revision,
      destination.id, destination.account_id, destination.platform,
      chosen_operation, target_scheduled_for,
      greatest(target_scheduled_for, now()), snapshot
    ) on conflict (post_id, post_revision, social_account_id) do nothing
    returning id into created_id;
    if created_id is not null then
      perform pgmq.send(
        'postflow-publishing',
        jsonb_build_object('version', 1, 'publishingJobId', created_id)
      );
      created_ids := array_append(created_ids, created_id);
    end if;
    created_id := null;
  end loop;
  if cardinality(created_ids) > 0 then
    perform set_config('postflow.post_rpc_write', 'allowed', true);
    update public.posts set status = 'publishing', failure_message = null
    where id = target_post.id;
    perform set_config('postflow.post_rpc_write', '', true);
  end if;
  return created_ids;
end;
$$;

create or replace function public.claim_publishing_queue_batch(
  p_batch_size integer default 5,
  p_visibility_seconds integer default 120
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  message_row record;
  target public.publishing_jobs%rowtype;
  items jsonb := '[]'::jsonb;
  attempt_no integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_batch_size < 1 or p_batch_size > 5
     or p_visibility_seconds < 30 or p_visibility_seconds > 600 then
    raise exception 'INVALID_WORKER_LIMIT' using errcode = '22023';
  end if;
  for message_row in
    select * from pgmq.read('postflow-publishing', p_visibility_seconds, p_batch_size)
  loop
    if message_row.message ->> 'version' <> '1'
       or coalesce(message_row.message ->> 'publishingJobId', '') !~ '^[0-9a-f-]{36}$' then
      perform pgmq.archive('postflow-publishing', message_row.msg_id);
      continue;
    end if;
    select * into target from public.publishing_jobs
    where id = (message_row.message ->> 'publishingJobId')::uuid for update;
    if not found or target.status in (
      'succeeded','failed','cancelled','reconciliation_required'
    ) then
      perform pgmq.archive('postflow-publishing', message_row.msg_id);
      continue;
    end if;
    if target.status = 'processing'
       and target.updated_at > now() - make_interval(secs => p_visibility_seconds) then
      continue;
    end if;
    if target.available_at > now() then continue; end if;
    attempt_no := target.attempt_count + 1;
    if attempt_no > target.max_attempts then
      update public.publishing_jobs
      set status = 'failed', safe_error_code = 'RETRY_EXHAUSTED',
        safe_error_message = 'Publishing retry limit reached.', retryable = false,
        completed_at = now()
      where id = target.id;
      perform pgmq.archive('postflow-publishing', message_row.msg_id);
      perform private.recalculate_post_publishing_status(target.post_id);
      continue;
    end if;
    update public.publishing_jobs
    set status = 'processing', attempt_count = attempt_no,
      started_at = coalesce(started_at, now()), next_attempt_at = null
    where id = target.id returning * into target;
    insert into public.publishing_attempts(
      workspace_id, publishing_job_id, attempt_number, phase, outcome
    ) values (target.workspace_id, target.id, attempt_no, 'claimed', 'started');
    items := items || jsonb_build_array(jsonb_build_object(
      'messageId', message_row.msg_id,
      'attemptNumber', attempt_no,
      'job', to_jsonb(target),
      'account', (select jsonb_build_object(
        'id', a.id, 'workspaceId', a.workspace_id, 'platform', a.platform,
        'accountType', a.account_type, 'platformAccountId', a.platform_account_id,
        'parentPageId', a.parent_platform_account_id,
        'connectionStatus', a.connection_status,
        'tokenExpiresAt', a.token_expires_at,
        'grantedScopes', a.granted_scopes
      ) from public.social_accounts as a where a.id = target.social_account_id),
      'credential', (select jsonb_build_object(
        'encryptedAccessToken', c.encrypted_access_token,
        'accessTokenIv', c.access_token_iv,
        'encryptedRefreshToken', c.encrypted_refresh_token,
        'refreshTokenIv', c.refresh_token_iv,
        'tokenType', c.token_type,
        'expiresAt', c.expires_at,
        'grantedScopes', c.granted_scopes
      ) from private.social_credentials as c
        where c.social_account_id = target.social_account_id),
      'youtubeUploadSessionUrl', (select session.session_url
        from private.youtube_upload_sessions as session
        where session.publishing_job_id = target.id),
      'youtubeCompletedVideoId', (select session.provider_video_id
        from private.youtube_upload_sessions as session
        where session.publishing_job_id = target.id)
    ));
  end loop;
  return items;
end;
$$;

create function public.store_youtube_upload_session(
  p_publishing_job_id uuid,
  p_session_url text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if coalesce(p_session_url, '') = '' or length(p_session_url) > 4096
     or p_session_url !~ '^https://(www\.googleapis\.com|upload\.youtube\.com|www\.youtube\.com)/' then
    raise exception 'INVALID_YOUTUBE_UPLOAD_SESSION' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.publishing_jobs
    where id = p_publishing_job_id and platform = 'youtube'
  ) then
    raise exception 'JOB_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into private.youtube_upload_sessions(publishing_job_id, session_url)
  values (p_publishing_job_id, p_session_url)
  on conflict (publishing_job_id) do update set session_url = excluded.session_url;
end;
$$;

create function public.complete_youtube_upload(
  p_publishing_job_id uuid,
  p_provider_video_id text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if coalesce(p_provider_video_id, '') !~ '^[A-Za-z0-9_-]{1,128}$' then
    raise exception 'INVALID_YOUTUBE_VIDEO_ID' using errcode = '22023';
  end if;
  update private.youtube_upload_sessions
  set provider_video_id = p_provider_video_id, completed_at = now()
  where publishing_job_id = p_publishing_job_id;
  if not found then
    raise exception 'YOUTUBE_UPLOAD_SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

create function public.update_youtube_publishing_credential(
  p_social_account_id uuid,
  p_encrypted_access_token text,
  p_access_token_iv text,
  p_encrypted_refresh_token text,
  p_refresh_token_iv text,
  p_token_type text,
  p_token_expires_at timestamptz,
  p_granted_scopes text[]
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if coalesce(p_encrypted_access_token, '') = ''
     or coalesce(p_access_token_iv, '') = ''
     or (p_encrypted_refresh_token is null) <> (p_refresh_token_iv is null)
     or not exists (
       select 1 from public.social_accounts
       where id = p_social_account_id and platform = 'youtube'
     ) then
    raise exception 'INVALID_CONNECTION_PAYLOAD' using errcode = '22023';
  end if;
  update private.social_credentials
  set encrypted_access_token = p_encrypted_access_token,
      access_token_iv = p_access_token_iv,
      encrypted_refresh_token = coalesce(
        p_encrypted_refresh_token, encrypted_refresh_token
      ),
      refresh_token_iv = coalesce(p_refresh_token_iv, refresh_token_iv),
      token_type = coalesce(nullif(p_token_type, ''), token_type),
      expires_at = p_token_expires_at,
      granted_scopes = case when cardinality(coalesce(p_granted_scopes, array[]::text[])) > 0
        then p_granted_scopes else granted_scopes end
  where social_account_id = p_social_account_id;
  update public.social_accounts
  set token_expires_at = p_token_expires_at,
      last_refreshed_at = now(),
      connection_status = 'connected',
      last_error_code = null,
      last_error_message = null,
      granted_scopes = case when cardinality(coalesce(p_granted_scopes, array[]::text[])) > 0
        then p_granted_scopes else granted_scopes end
  where id = p_social_account_id;
end;
$$;

revoke all on table private.youtube_upload_sessions
  from public, anon, authenticated;
grant select, insert, update, delete on table private.youtube_upload_sessions
  to service_role;

revoke all on function public.store_youtube_upload_session(uuid, text)
  from public, anon, authenticated;
revoke all on function public.complete_youtube_upload(uuid, text)
  from public, anon, authenticated;
revoke all on function public.update_youtube_publishing_credential(
  uuid, text, text, text, text, text, timestamptz, text[]
) from public, anon, authenticated;
grant execute on function public.store_youtube_upload_session(uuid, text)
  to service_role;
grant execute on function public.complete_youtube_upload(uuid, text)
  to service_role;
grant execute on function public.update_youtube_publishing_credential(
  uuid, text, text, text, text, text, timestamptz, text[]
) to service_role;

commit;
