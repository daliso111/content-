-- Stage 2E-C: video-only TikTok Direct Post through the durable queue.
-- Enum additions must commit before they can be referenced by later statements.
alter type public.publishing_operation add value if not exists 'tiktok_video';

begin;

alter table public.publishing_jobs
  add column if not exists failure_count integer not null default 0,
  add constraint publishing_jobs_failure_count_valid check (failure_count >= 0);

-- Preserve the already-consumed retry budget for pre-migration jobs. New
-- provider polling steps no longer increment this counter.
update public.publishing_jobs
set failure_count = least(attempt_count, max_attempts)
where attempt_count > 0;

alter table public.publishing_jobs
  drop constraint publishing_jobs_supported_platform,
  add constraint publishing_jobs_supported_platform
    check (platform in ('facebook', 'instagram', 'youtube', 'tiktok'));

-- This table deliberately contains no token, refresh token, or media URL.
create table private.tiktok_publish_sessions (
  publishing_job_id uuid primary key references public.publishing_jobs(id) on delete cascade,
  submission_started_at timestamptz,
  publish_id text,
  provider_status text,
  fail_reason text,
  status_checked_at timestamptz,
  next_status_check_at timestamptz,
  poll_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tiktok_publish_id_safe check (publish_id is null or publish_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  constraint tiktok_provider_status_safe check (provider_status is null or provider_status in ('INITIALIZED','PROCESSING_DOWNLOAD','PROCESSING_UPLOAD','PUBLISH_COMPLETE','FAILED')),
  constraint tiktok_fail_reason_safe check (fail_reason is null or fail_reason ~ '^[A-Za-z0-9_]{1,80}$'),
  constraint tiktok_poll_count_valid check (poll_count >= 0)
);

create trigger tiktok_publish_sessions_set_updated_at
before update on private.tiktok_publish_sessions
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
  if selected_count > 20 then raise exception 'DESTINATION_LIMIT_EXCEEDED' using errcode = '22023'; end if;
  if array_position(safe_ids, null) is not null
     or selected_count <> (select count(distinct id) from unnest(safe_ids) as id) then
    raise exception 'DUPLICATE_DESTINATION_SELECTION' using errcode = '22023';
  end if;
  if selected_count <> (
    select count(*) from public.social_accounts as account
    where account.id = any(safe_ids)
      and account.workspace_id = target_workspace_id
      and (account.connection_status = 'connected' or account.id = any(existing_ids))
      and account.platform in ('facebook', 'instagram', 'youtube', 'tiktok')
  ) then raise exception 'ACCOUNT_DISCONNECTED_OR_DENIED' using errcode = '22023'; end if;
  if (select count(*) from public.social_accounts where id = any(safe_ids) and platform = 'tiktok') > 1 then
    raise exception 'TIKTOK_DESTINATION_LIMIT_EXCEEDED' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.social_accounts as account where account.id = any(safe_ids)
      and not exists (
        select 1 from public.post_platforms as platform_row
        where platform_row.post_id = target_post_id and platform_row.platform = account.platform
      )
  ) then raise exception 'DESTINATION_PLATFORM_MISMATCH' using errcode = '22023'; end if;
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

create or replace function public.claim_publishing_queue_batch(
  p_batch_size integer default 5,
  p_visibility_seconds integer default 120
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  message_row record; target public.publishing_jobs%rowtype;
  items jsonb := '[]'::jsonb; attempt_no integer;
begin
  if auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501'; end if;
  if p_batch_size < 1 or p_batch_size > 5 or p_visibility_seconds < 30 or p_visibility_seconds > 600 then raise exception 'INVALID_WORKER_LIMIT' using errcode = '22023'; end if;
  for message_row in select * from pgmq.read('postflow-publishing', p_visibility_seconds, p_batch_size)
  loop
    if message_row.message ->> 'version' <> '1' or coalesce(message_row.message ->> 'publishingJobId', '') !~ '^[0-9a-f-]{36}$' then
      perform pgmq.archive('postflow-publishing', message_row.msg_id); continue;
    end if;
    select * into target from public.publishing_jobs where id = (message_row.message ->> 'publishingJobId')::uuid for update;
    if not found or target.status in ('succeeded','failed','cancelled','reconciliation_required') then
      perform pgmq.archive('postflow-publishing', message_row.msg_id); continue;
    end if;
    if target.status = 'processing' and target.updated_at > now() - make_interval(secs => p_visibility_seconds) then continue; end if;
    if target.available_at > now() then continue; end if;
    if target.failure_count >= target.max_attempts then
      update public.publishing_jobs set status = 'failed', safe_error_code = 'RETRY_EXHAUSTED',
        safe_error_message = 'Publishing retry limit reached.', retryable = false, completed_at = now()
      where id = target.id;
      perform pgmq.archive('postflow-publishing', message_row.msg_id);
      perform private.recalculate_post_publishing_status(target.post_id); continue;
    end if;
    attempt_no := target.attempt_count + 1;
    update public.publishing_jobs set status = 'processing', attempt_count = attempt_no,
      started_at = coalesce(started_at, now()), next_attempt_at = null
    where id = target.id returning * into target;
    insert into public.publishing_attempts(workspace_id, publishing_job_id, attempt_number, phase, outcome)
    values (target.workspace_id, target.id, attempt_no, 'claimed', 'started');
    items := items || jsonb_build_array(jsonb_build_object(
      'messageId', message_row.msg_id, 'attemptNumber', attempt_no, 'job', to_jsonb(target),
      'account', (select jsonb_build_object(
        'id', a.id, 'workspaceId', a.workspace_id, 'platform', a.platform,
        'accountType', a.account_type, 'platformAccountId', a.platform_account_id,
        'parentPageId', a.parent_platform_account_id, 'connectionStatus', a.connection_status,
        'tokenExpiresAt', a.token_expires_at, 'grantedScopes', a.granted_scopes
      ) from public.social_accounts as a where a.id = target.social_account_id),
      'credential', (select jsonb_build_object(
        'encryptedAccessToken', c.encrypted_access_token, 'accessTokenIv', c.access_token_iv,
        'encryptedRefreshToken', c.encrypted_refresh_token, 'refreshTokenIv', c.refresh_token_iv,
        'tokenType', c.token_type, 'expiresAt', c.expires_at, 'grantedScopes', c.granted_scopes
      ) from private.social_credentials as c where c.social_account_id = target.social_account_id),
      'youtubeUploadSessionUrl', (select session.session_url from private.youtube_upload_sessions as session where session.publishing_job_id = target.id),
      'youtubeCompletedVideoId', (select session.provider_video_id from private.youtube_upload_sessions as session where session.publishing_job_id = target.id),
      'tiktokPublishSession', (select jsonb_build_object(
        'submissionStartedAt', session.submission_started_at, 'publishId', session.publish_id,
        'providerStatus', session.provider_status, 'statusCheckedAt', session.status_checked_at,
        'nextStatusCheckAt', session.next_status_check_at, 'pollCount', session.poll_count
      ) from private.tiktok_publish_sessions as session where session.publishing_job_id = target.id)
    ));
  end loop;
  return items;
end;
$$;

create or replace function public.finish_publishing_step(
  p_publishing_job_id uuid, p_message_id bigint, p_attempt_number integer, p_result jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target public.publishing_jobs%rowtype; next_status public.publishing_job_status;
  delay_seconds integer; terminal boolean; attempt_outcome public.publishing_attempt_outcome;
begin
  if auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501'; end if;
  if jsonb_typeof(p_result) <> 'object' then raise exception 'INVALID_WORKER_RESULT' using errcode = '22023'; end if;
  select * into target from public.publishing_jobs where id = p_publishing_job_id for update;
  if not found then perform pgmq.archive('postflow-publishing', p_message_id); return jsonb_build_object('archived', true, 'status', 'missing'); end if;
  if target.attempt_count <> p_attempt_number then raise exception 'STALE_WORKER_RESULT' using errcode = '40001'; end if;
  next_status := (p_result ->> 'status')::public.publishing_job_status;
  if next_status not in ('waiting_provider','retry_wait','succeeded','failed','reconciliation_required') then raise exception 'INVALID_WORKER_RESULT' using errcode = '22023'; end if;
  delay_seconds := least(1800, greatest(0, coalesce((p_result ->> 'delaySeconds')::integer, 0)));
  terminal := next_status in ('succeeded','failed','reconciliation_required');
  attempt_outcome := case next_status
    when 'succeeded' then 'succeeded'::public.publishing_attempt_outcome
    when 'failed' then 'permanent_failure'::public.publishing_attempt_outcome
    when 'reconciliation_required' then 'ambiguous'::public.publishing_attempt_outcome
    else 'transient_failure'::public.publishing_attempt_outcome end;
  update public.publishing_attempts set phase = left(coalesce(p_result ->> 'phase', 'provider'), 80),
    outcome = attempt_outcome, http_status = (p_result ->> 'httpStatus')::integer,
    provider_error_code = left(nullif(p_result ->> 'errorCode', ''), 80),
    safe_error_message = left(nullif(p_result ->> 'safeMessage', ''), 500),
    provider_request_id = left(nullif(p_result ->> 'requestId', ''), 160),
    retryable = coalesce((p_result ->> 'retryable')::boolean, false),
    ambiguous = next_status = 'reconciliation_required', finished_at = now()
  where publishing_job_id = target.id and attempt_number = p_attempt_number;
  update public.publishing_jobs set status = next_status,
    failure_count = failure_count + case
      when next_status = 'retry_wait' or p_result ->> 'errorCode' = 'RETRY_EXHAUSTED' then 1
      else 0 end,
    available_at = case when terminal then available_at else now() + make_interval(secs => delay_seconds) end,
    next_attempt_at = case when terminal then null else now() + make_interval(secs => delay_seconds) end,
    provider_container_id = coalesce(nullif(p_result ->> 'providerContainerId', ''), provider_container_id),
    provider_post_id = coalesce(nullif(p_result ->> 'providerPostId', ''), provider_post_id),
    provider_permalink = coalesce(nullif(p_result ->> 'providerPermalink', ''), provider_permalink),
    safe_error_code = left(nullif(p_result ->> 'errorCode', ''), 80),
    safe_error_message = left(nullif(p_result ->> 'safeMessage', ''), 500),
    retryable = coalesce((p_result ->> 'retryable')::boolean, false),
    ambiguous_result = next_status = 'reconciliation_required', completed_at = case when terminal then now() else null end
  where id = target.id;
  perform pgmq.archive('postflow-publishing', p_message_id);
  if not terminal then perform pgmq.send('postflow-publishing', jsonb_build_object('version', 1, 'publishingJobId', target.id), delay_seconds); end if;
  perform private.recalculate_post_publishing_status(target.post_id);
  return jsonb_build_object('archived', true, 'status', next_status, 'requeued', not terminal);
end;
$$;

create or replace function private.validate_publishing_post(target_post_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare destination record; target_post public.posts%rowtype;
begin
  select * into target_post from public.posts where id = target_post_id;
  if not found then raise exception 'POST_NOT_FOUND' using errcode = 'P0002'; end if;
  if target_post.approval_required and not private.has_valid_post_approval(target_post.id) then
    raise exception 'PUBLISHING_BLOCKED_APPROVAL_REQUIRED' using errcode = '42501';
  end if;
  if not exists(select 1 from public.post_destinations where post_id = target_post_id) then raise exception 'NO_DESTINATION_SELECTED' using errcode = '22023'; end if;
  for destination in
    select destination_row.*, account.platform, account.connection_status,
      account.granted_scopes, credential.expires_at,
      credential.encrypted_access_token, credential.access_token_iv,
      credential.encrypted_refresh_token, credential.refresh_token_iv
    from public.post_destinations as destination_row
    join public.social_accounts as account on account.id = destination_row.social_account_id
    left join private.social_credentials as credential on credential.social_account_id = account.id
    where destination_row.post_id = target_post_id
  loop
    if destination.connection_status <> 'connected' or destination.encrypted_access_token is null or destination.access_token_iv is null then
      raise exception 'ACCOUNT_DISCONNECTED' using errcode = '22023';
    end if;
    if destination.platform in ('facebook', 'instagram') and destination.expires_at is not null and destination.expires_at <= now() then
      raise exception 'ACCOUNT_DISCONNECTED' using errcode = '22023';
    end if;
    if destination.platform = 'facebook' and not destination.granted_scopes @> array['pages_show_list','pages_read_engagement','pages_manage_posts']::text[] then
      raise exception 'MISSING_PERMISSION' using errcode = '42501';
    end if;
    if destination.platform = 'instagram' and not destination.granted_scopes @> array['pages_show_list','pages_read_engagement','instagram_basic','instagram_content_publish']::text[] then
      raise exception 'MISSING_PERMISSION' using errcode = '42501';
    end if;
    if destination.platform = 'youtube' and (destination.encrypted_refresh_token is null or destination.refresh_token_iv is null) then
      raise exception 'YOUTUBE_ACCOUNT_REAUTH_REQUIRED' using errcode = '42501';
    end if;
    if destination.platform = 'youtube' and not destination.granted_scopes @> array['https://www.googleapis.com/auth/youtube.upload']::text[] then
      raise exception 'MISSING_PERMISSION' using errcode = '42501';
    end if;
    if destination.platform = 'tiktok' and (destination.encrypted_refresh_token is null or destination.refresh_token_iv is null) then
      raise exception 'TIKTOK_ACCOUNT_REAUTH_REQUIRED' using errcode = '42501';
    end if;
    if destination.platform = 'tiktok' and not destination.granted_scopes @> array['video.publish']::text[] then
      raise exception 'TIKTOK_PUBLISHING_PERMISSION_REQUIRED' using errcode = '42501';
    end if;
    perform private.publishing_operation_for(target_post_id, destination.platform);
  end loop;
end;
$$;

create or replace function private.create_publishing_jobs(target_post_id uuid, target_scheduled_for timestamptz)
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare
  target_post public.posts%rowtype; destination record; created_id uuid;
  created_ids uuid[] := array[]::uuid[]; snapshot jsonb;
  chosen_operation public.publishing_operation; safe_platform_settings jsonb;
begin
  select * into target_post from public.posts where id = target_post_id for update;
  if not found then raise exception 'POST_NOT_FOUND' using errcode = 'P0002'; end if;
  perform private.validate_publishing_post(target_post.id);
  for destination in
    select destination_row.*, account.platform, account.id as account_id,
      platform_row.platform_caption, platform_row.platform_title, platform_row.platform_settings
    from public.post_destinations as destination_row
    join public.social_accounts as account on account.id = destination_row.social_account_id
    join public.post_platforms as platform_row on platform_row.id = destination_row.post_platform_id
    where destination_row.post_id = target_post.id order by destination_row.created_at, destination_row.id
  loop
    chosen_operation := private.publishing_operation_for(target_post.id, destination.platform);
    safe_platform_settings := case
      when destination.platform = 'youtube' then jsonb_build_object(
        'privacyStatus', coalesce(nullif(destination.platform_settings ->> 'privacyStatus', ''), 'private'))
      when destination.platform = 'tiktok' then jsonb_build_object(
        'privacyLevel', destination.platform_settings ->> 'privacyLevel',
        'disableComment', (destination.platform_settings ->> 'disableComment')::boolean,
        'disableDuet', (destination.platform_settings ->> 'disableDuet')::boolean,
        'disableStitch', (destination.platform_settings ->> 'disableStitch')::boolean,
        'brandContentToggle', (destination.platform_settings ->> 'brandContentToggle')::boolean,
        'brandOrganicToggle', (destination.platform_settings ->> 'brandOrganicToggle')::boolean,
        'publishConsent', (destination.platform_settings ->> 'publishConsent')::boolean,
        'creatorMaxVideoPostDurationSec', (destination.platform_settings ->> 'creatorMaxVideoPostDurationSec')::numeric)
      else '{}'::jsonb end;
    select jsonb_build_object(
      'version', 1, 'postId', target_post.id, 'postRevision', target_post.revision,
      'workspaceId', target_post.workspace_id, 'platform', destination.platform,
      'socialAccountId', destination.account_id,
      'caption', coalesce(nullif(btrim(destination.platform_caption), ''), target_post.caption),
      'platformTitle', nullif(btrim(destination.platform_title), ''),
      'platformSettings', safe_platform_settings, 'scheduledFor', target_scheduled_for,
      'media', coalesce(jsonb_agg(jsonb_build_object(
        'mediaAssetId', asset.id, 'storageBucket', asset.storage_bucket,
        'storagePath', asset.storage_path, 'mimeType', asset.mime_type,
        'mediaType', asset.media_type, 'fileSize', asset.file_size,
        'width', asset.width, 'height', asset.height, 'durationSeconds', asset.duration_seconds
      ) order by link.sort_order) filter (where asset.id is not null), '[]'::jsonb)
    ) into snapshot from (select 1) as base
    left join public.post_media as link on link.post_id = target_post.id
    left join public.media_assets as asset on asset.id = link.media_asset_id;
    insert into public.publishing_jobs(
      workspace_id, post_id, post_revision, post_destination_id, social_account_id,
      platform, operation, scheduled_for, available_at, payload_snapshot
    ) values (
      target_post.workspace_id, target_post.id, target_post.revision, destination.id,
      destination.account_id, destination.platform, chosen_operation,
      target_scheduled_for, greatest(target_scheduled_for, now()), snapshot
    ) on conflict (post_id, post_revision, social_account_id) do nothing returning id into created_id;
    if created_id is not null then
      perform pgmq.send('postflow-publishing', jsonb_build_object('version', 1, 'publishingJobId', created_id));
      created_ids := array_append(created_ids, created_id);
    end if;
    created_id := null;
  end loop;
  if cardinality(created_ids) > 0 then
    perform set_config('postflow.post_rpc_write', 'allowed', true);
    update public.posts set status = 'publishing', failure_message = null where id = target_post.id;
    perform set_config('postflow.post_rpc_write', '', true);
  end if;
  return created_ids;
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
  settings jsonb;
  privacy_status text;
begin
  select count(*) into media_count from public.post_media where post_id = target_post_id;
  select coalesce(nullif(btrim(platform_row.platform_caption), ''), post.caption),
    platform_row.platform_title, coalesce(platform_row.platform_settings, '{}'::jsonb),
    coalesce(nullif(platform_row.platform_settings ->> 'privacyStatus', ''), 'private')
  into final_caption, platform_title, settings, privacy_status
  from public.posts as post
  join public.post_platforms as platform_row on platform_row.post_id = post.id
  where post.id = target_post_id and platform_row.platform = target_platform;

  if target_platform in ('youtube', 'tiktok') then
    if media_count <> 1 then
      raise exception '%', case when target_platform = 'youtube' then 'YOUTUBE_VIDEO_REQUIRED' else 'TIKTOK_VIDEO_REQUIRED' end using errcode = '22023';
    end if;
    select asset_row.* into asset from public.post_media as link
    join public.media_assets as asset_row on asset_row.id = link.media_asset_id
    where link.post_id = target_post_id;
    if asset.media_type <> 'video' or asset.mime_type not in ('video/mp4', 'video/quicktime', 'video/webm')
       or asset.file_size is null or asset.file_size <= 0 or asset.file_size > 52428800 then
      raise exception '%', case when target_platform = 'youtube' then 'YOUTUBE_VIDEO_REQUIRED' else 'TIKTOK_VIDEO_REQUIRED' end using errcode = '22023';
    end if;
    if target_platform = 'youtube' then
      if btrim(coalesce(platform_title, '')) = '' then raise exception 'YOUTUBE_TITLE_REQUIRED' using errcode = '22023'; end if;
      if length(btrim(platform_title)) > 100 then raise exception 'YOUTUBE_TITLE_TOO_LONG' using errcode = '22023'; end if;
      if length(coalesce(final_caption, '')) > 5000 then raise exception 'YOUTUBE_DESCRIPTION_TOO_LONG' using errcode = '22023'; end if;
      if privacy_status not in ('private', 'unlisted', 'public') then raise exception 'YOUTUBE_PRIVACY_INVALID' using errcode = '22023'; end if;
      return 'youtube_video'::public.publishing_operation;
    end if;
    if btrim(coalesce(settings ->> 'privacyLevel', '')) = '' then raise exception 'TIKTOK_PRIVACY_REQUIRED' using errcode = '22023'; end if;
    if coalesce((settings ->> 'publishConsent')::boolean, false) is not true then raise exception 'TIKTOK_CONSENT_REQUIRED' using errcode = '22023'; end if;
    if jsonb_typeof(settings -> 'disableComment') <> 'boolean'
       or jsonb_typeof(settings -> 'disableDuet') <> 'boolean'
       or jsonb_typeof(settings -> 'disableStitch') <> 'boolean'
       or jsonb_typeof(settings -> 'brandContentToggle') <> 'boolean'
       or jsonb_typeof(settings -> 'brandOrganicToggle') <> 'boolean' then
      raise exception 'TIKTOK_SETTINGS_INVALID' using errcode = '22023';
    end if;
    if (settings ->> 'brandContentToggle')::boolean and settings ->> 'privacyLevel' = 'SELF_ONLY' then
      raise exception 'TIKTOK_BRANDED_CONTENT_PRIVATE' using errcode = '22023';
    end if;
    if asset.duration_seconds is not null and settings ? 'creatorMaxVideoPostDurationSec'
       and asset.duration_seconds > (settings ->> 'creatorMaxVideoPostDurationSec')::numeric then
      raise exception 'TIKTOK_VIDEO_TOO_LONG' using errcode = '22023';
    end if;
    if length(coalesce(final_caption, '')) > 2200 then raise exception 'TIKTOK_CAPTION_TOO_LONG' using errcode = '22023'; end if;
    return 'tiktok_video'::public.publishing_operation;
  end if;

  if target_platform not in ('facebook', 'instagram') then raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023'; end if;
  if media_count = 0 then
    if target_platform <> 'facebook' or btrim(coalesce(final_caption, '')) = '' then raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023'; end if;
    return 'facebook_text';
  end if;
  if media_count <> 1 then raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023'; end if;
  select asset_row.* into asset from public.post_media as link
  join public.media_assets as asset_row on asset_row.id = link.media_asset_id
  where link.post_id = target_post_id;
  if asset.media_type in ('image', 'graphic', 'logo') and asset.mime_type in ('image/jpeg', 'image/png', 'image/webp') then
    if target_platform = 'instagram' and (
      asset.mime_type <> 'image/jpeg' or asset.file_size is not null and asset.file_size > 8388608
      or asset.width is not null and asset.height is not null and
        (asset.width::numeric / asset.height < 0.8 or asset.width::numeric / asset.height > 1.91)
    ) then raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023'; end if;
    return case when target_platform = 'facebook' then 'facebook_image'::public.publishing_operation else 'instagram_image'::public.publishing_operation end;
  end if;
  if asset.media_type = 'video' and asset.mime_type in ('video/mp4', 'video/quicktime') then
    if asset.duration_seconds is not null and (asset.duration_seconds < 4 or asset.duration_seconds > 60) then raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023'; end if;
    if asset.width is not null and asset.height is not null and asset.height <= asset.width then raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023'; end if;
    return case when target_platform = 'facebook' then 'facebook_reel'::public.publishing_operation else 'instagram_reel'::public.publishing_operation end;
  end if;
  raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023';
end;
$$;

create function public.get_tiktok_creator_credential(
  p_workspace_id uuid, p_social_account_id uuid, p_actor_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.is_user_workspace_member(p_workspace_id, p_actor_id) then raise exception 'SOCIAL_ACCOUNT_NOT_FOUND_OR_DENIED' using errcode = 'P0002'; end if;
  select jsonb_build_object(
    'id', account.id, 'workspaceId', account.workspace_id,
    'platformAccountId', account.platform_account_id,
    'encryptedAccessToken', credential.encrypted_access_token,
    'accessTokenIv', credential.access_token_iv,
    'encryptedRefreshToken', credential.encrypted_refresh_token,
    'refreshTokenIv', credential.refresh_token_iv,
    'tokenType', credential.token_type, 'tokenExpiresAt', credential.expires_at,
    'grantedScopes', credential.granted_scopes
  ) into result
  from public.social_accounts as account
  join private.social_credentials as credential on credential.social_account_id = account.id
  where account.id = p_social_account_id and account.workspace_id = p_workspace_id
    and account.platform = 'tiktok' and account.connection_status = 'connected';
  if result is null then raise exception 'SOCIAL_ACCOUNT_NOT_FOUND_OR_DENIED' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create function public.update_tiktok_publishing_credential(
  p_social_account_id uuid, p_encrypted_access_token text, p_access_token_iv text,
  p_encrypted_refresh_token text, p_refresh_token_iv text, p_token_type text,
  p_token_expires_at timestamptz, p_refresh_token_expires_at timestamptz,
  p_granted_scopes text[]
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501'; end if;
  if coalesce(p_encrypted_access_token, '') = '' or coalesce(p_access_token_iv, '') = ''
     or coalesce(p_encrypted_refresh_token, '') = '' or coalesce(p_refresh_token_iv, '') = ''
     or p_token_expires_at is null or p_refresh_token_expires_at is null
     or not coalesce(p_granted_scopes, array[]::text[]) @> array['user.info.basic','video.publish']::text[]
     or not exists(select 1 from public.social_accounts where id = p_social_account_id and platform = 'tiktok') then
    raise exception 'INVALID_CONNECTION_PAYLOAD' using errcode = '22023';
  end if;
  update private.social_credentials set encrypted_access_token = p_encrypted_access_token,
    access_token_iv = p_access_token_iv, encrypted_refresh_token = p_encrypted_refresh_token,
    refresh_token_iv = p_refresh_token_iv, token_type = nullif(p_token_type, ''),
    expires_at = p_token_expires_at, granted_scopes = p_granted_scopes,
    provider_metadata = coalesce(provider_metadata, '{}'::jsonb) || jsonb_build_object(
      'encryptionVersion', 1, 'refreshTokenExpiresAt', p_refresh_token_expires_at)
  where social_account_id = p_social_account_id;
  if not found then raise exception 'SOCIAL_ACCOUNT_NOT_FOUND_OR_DENIED' using errcode = 'P0002'; end if;
  update public.social_accounts set token_expires_at = p_token_expires_at,
    granted_scopes = p_granted_scopes, last_refreshed_at = now(), connection_status = 'connected',
    last_error_code = null, last_error_message = null, disconnected_at = null
  where id = p_social_account_id;
end;
$$;

create function public.start_tiktok_publish_submission(p_publishing_job_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare inserted_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501'; end if;
  if not exists(select 1 from public.publishing_jobs where id = p_publishing_job_id and platform = 'tiktok' and operation = 'tiktok_video') then
    raise exception 'JOB_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into private.tiktok_publish_sessions(publishing_job_id, submission_started_at)
  values (p_publishing_job_id, now()) on conflict (publishing_job_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count <> 1 then
    raise exception 'TIKTOK_SUBMISSION_ALREADY_STARTED' using errcode = '55000';
  end if;
end;
$$;

create function public.clear_tiktok_submission_start(p_publishing_job_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501'; end if;
  delete from private.tiktok_publish_sessions where publishing_job_id = p_publishing_job_id and publish_id is null;
end;
$$;

create function public.store_tiktok_publish_id(p_publishing_job_id uuid, p_publish_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501'; end if;
  if coalesce(p_publish_id, '') !~ '^[A-Za-z0-9._:-]{1,128}$' then raise exception 'INVALID_TIKTOK_PUBLISH_ID' using errcode = '22023'; end if;
  update private.tiktok_publish_sessions set publish_id = p_publish_id, provider_status = 'INITIALIZED',
    next_status_check_at = now() + interval '30 seconds'
  where publishing_job_id = p_publishing_job_id and submission_started_at is not null and (publish_id is null or publish_id = p_publish_id);
  if not found then raise exception 'TIKTOK_SUBMISSION_STATE_INVALID' using errcode = '55000'; end if;
end;
$$;

create function public.record_tiktok_publish_status(
  p_publishing_job_id uuid, p_provider_status text, p_fail_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare next_delay integer;
begin
  if auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501'; end if;
  if p_provider_status not in ('PROCESSING_DOWNLOAD','PROCESSING_UPLOAD','PUBLISH_COMPLETE','FAILED')
     or (p_fail_reason is not null and p_fail_reason !~ '^[A-Za-z0-9_]{1,80}$') then raise exception 'INVALID_TIKTOK_STATUS' using errcode = '22023'; end if;
  select case when poll_count = 0 then 30 when poll_count = 1 then 60 when poll_count = 2 then 120 else 300 end
  into next_delay from private.tiktok_publish_sessions where publishing_job_id = p_publishing_job_id and publish_id is not null for update;
  if not found then raise exception 'TIKTOK_SUBMISSION_STATE_INVALID' using errcode = 'P0002'; end if;
  update private.tiktok_publish_sessions set provider_status = p_provider_status,
    fail_reason = p_fail_reason, status_checked_at = now(), poll_count = poll_count + 1,
    next_status_check_at = case when p_provider_status in ('PUBLISH_COMPLETE','FAILED') then null else now() + make_interval(secs => next_delay) end
  where publishing_job_id = p_publishing_job_id;
end;
$$;

create or replace function public.retry_publishing_job(p_publishing_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.publishing_jobs%rowtype; target_post public.posts%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into target from public.publishing_jobs where id = p_publishing_job_id for update;
  if not found then raise exception 'JOB_NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.can_manage_content(target.workspace_id) then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  select * into target_post from public.posts where id = target.post_id for update;
  if not found or target.post_revision <> target_post.revision or target.status <> 'failed'
     or target.retryable is not true or target.failure_count >= target.max_attempts then
    raise exception 'RETRY_NOT_ALLOWED' using errcode = '55000';
  end if;
  update public.publishing_jobs set status = 'queued', available_at = now(), next_attempt_at = null,
    safe_error_code = null, safe_error_message = null, completed_at = null where id = target.id;
  perform pgmq.send('postflow-publishing', jsonb_build_object('version', 1, 'publishingJobId', target.id));
  perform private.recalculate_post_publishing_status(target.post_id);
  return jsonb_build_object('publishingJobId', target.id, 'status', 'queued');
end;
$$;

revoke all on table private.tiktok_publish_sessions from public, anon, authenticated;
grant select, insert, update, delete on table private.tiktok_publish_sessions to service_role;

revoke all on function public.get_tiktok_creator_credential(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.update_tiktok_publishing_credential(uuid, text, text, text, text, text, timestamptz, timestamptz, text[]) from public, anon, authenticated;
revoke all on function public.start_tiktok_publish_submission(uuid) from public, anon, authenticated;
revoke all on function public.clear_tiktok_submission_start(uuid) from public, anon, authenticated;
revoke all on function public.store_tiktok_publish_id(uuid, text) from public, anon, authenticated;
revoke all on function public.record_tiktok_publish_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.get_tiktok_creator_credential(uuid, uuid, uuid) to service_role;
grant execute on function public.update_tiktok_publishing_credential(uuid, text, text, text, text, text, timestamptz, timestamptz, text[]) to service_role;
grant execute on function public.start_tiktok_publish_submission(uuid) to service_role;
grant execute on function public.clear_tiktok_submission_start(uuid) to service_role;
grant execute on function public.store_tiktok_publish_id(uuid, text) to service_role;
grant execute on function public.record_tiktok_publish_status(uuid, text, text) to service_role;

commit;
