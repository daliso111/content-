begin;

create extension if not exists pgmq;
create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from pgmq.meta where queue_name = 'postflow-publishing') then
    perform pgmq.create('postflow-publishing');
  end if;
end;
$$;

create type public.publishing_job_status as enum (
  'queued', 'processing', 'waiting_provider', 'retry_wait', 'succeeded',
  'failed', 'cancelled', 'reconciliation_required'
);

create type public.publishing_operation as enum (
  'facebook_text', 'facebook_image', 'facebook_reel',
  'instagram_image', 'instagram_reel'
);

create type public.publishing_attempt_outcome as enum (
  'started', 'succeeded', 'transient_failure', 'permanent_failure',
  'ambiguous', 'cancelled'
);

alter table public.social_accounts
  add constraint social_accounts_id_workspace_key unique (id, workspace_id);

create table public.post_destinations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  post_id uuid not null,
  post_platform_id uuid not null references public.post_platforms(id) on delete cascade,
  social_account_id uuid not null,
  created_at timestamptz not null default now(),
  constraint post_destinations_post_workspace_fkey foreign key (post_id, workspace_id)
    references public.posts(id, workspace_id) on delete cascade,
  constraint post_destinations_account_workspace_fkey foreign key (social_account_id, workspace_id)
    references public.social_accounts(id, workspace_id) on delete restrict,
  constraint post_destinations_post_account_key unique (post_id, social_account_id),
  constraint post_destinations_id_workspace_key unique (id, workspace_id)
);

create table public.publishing_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  post_id uuid not null,
  post_revision bigint not null,
  post_destination_id uuid not null,
  social_account_id uuid not null,
  platform public.social_platform not null,
  operation public.publishing_operation not null,
  status public.publishing_job_status not null default 'queued',
  scheduled_for timestamptz not null,
  available_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  provider_container_id text,
  provider_post_id text,
  provider_permalink text,
  safe_error_code text,
  safe_error_message text,
  retryable boolean,
  ambiguous_result boolean not null default false,
  payload_snapshot jsonb not null,
  started_at timestamptz,
  completed_at timestamptz,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint publishing_jobs_destination_workspace_fkey
    foreign key (post_destination_id, workspace_id)
    references public.post_destinations(id, workspace_id) on delete restrict,
  constraint publishing_jobs_post_workspace_fkey
    foreign key (post_id, workspace_id)
    references public.posts(id, workspace_id) on delete restrict,
  constraint publishing_jobs_account_workspace_fkey
    foreign key (social_account_id, workspace_id)
    references public.social_accounts(id, workspace_id) on delete restrict,
  constraint publishing_jobs_post_revision_account_key
    unique (post_id, post_revision, social_account_id),
  constraint publishing_jobs_id_workspace_key unique (id, workspace_id),
  constraint publishing_jobs_snapshot_object check (jsonb_typeof(payload_snapshot) = 'object'),
  constraint publishing_jobs_attempt_count_valid check (attempt_count >= 0),
  constraint publishing_jobs_max_attempts_valid check (max_attempts between 1 and 10),
  constraint publishing_jobs_safe_error_code_length check (safe_error_code is null or length(safe_error_code) <= 80),
  constraint publishing_jobs_safe_error_message_length check (safe_error_message is null or length(safe_error_message) <= 500),
  constraint publishing_jobs_supported_platform check (platform in ('facebook', 'instagram'))
);

create table public.publishing_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  publishing_job_id uuid not null,
  attempt_number integer not null,
  phase text not null,
  outcome public.publishing_attempt_outcome not null,
  http_status integer,
  provider_error_code text,
  safe_error_message text,
  provider_request_id text,
  retryable boolean,
  ambiguous boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  constraint publishing_attempts_job_attempt_key unique (publishing_job_id, attempt_number),
  constraint publishing_attempts_job_workspace_fkey
    foreign key (publishing_job_id, workspace_id)
    references public.publishing_jobs(id, workspace_id) on delete restrict,
  constraint publishing_attempts_number_positive check (attempt_number > 0),
  constraint publishing_attempts_phase_not_empty check (btrim(phase) <> ''),
  constraint publishing_attempts_http_status_valid check (http_status is null or http_status between 100 and 599),
  constraint publishing_attempts_error_code_length check (provider_error_code is null or length(provider_error_code) <= 80),
  constraint publishing_attempts_error_message_length check (safe_error_message is null or length(safe_error_message) <= 500),
  constraint publishing_attempts_request_id_length check (provider_request_id is null or length(provider_request_id) <= 160)
);

create index post_destinations_workspace_post_idx on public.post_destinations(workspace_id, post_id);
create index post_destinations_account_idx on public.post_destinations(social_account_id);
create index publishing_jobs_workspace_status_idx on public.publishing_jobs(workspace_id, status, created_at desc);
create index publishing_jobs_due_idx on public.publishing_jobs(status, available_at) where status in ('queued', 'retry_wait', 'waiting_provider');
create index publishing_jobs_post_idx on public.publishing_jobs(post_id, created_at desc);
create index publishing_jobs_account_idx on public.publishing_jobs(social_account_id, created_at desc);
create index publishing_attempts_job_idx on public.publishing_attempts(publishing_job_id, attempt_number);

create trigger publishing_jobs_set_updated_at before update on public.publishing_jobs
for each row execute function private.set_updated_at();

create function private.prevent_publishing_history_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.publishing_jobs where post_id=old.id) then
    raise exception 'POST_HAS_PUBLISHING_HISTORY' using errcode='55000';
  end if;
  return old;
end;
$$;

create trigger posts_preserve_publishing_history before delete on public.posts
for each row execute function private.prevent_publishing_history_delete();

create function private.validate_post_destination()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  platform_row public.post_platforms%rowtype;
  account_row public.social_accounts%rowtype;
begin
  select * into platform_row from public.post_platforms where id = new.post_platform_id;
  select * into account_row from public.social_accounts where id = new.social_account_id;
  if platform_row.id is null or platform_row.post_id <> new.post_id
     or platform_row.workspace_id <> new.workspace_id then
    raise exception 'DESTINATION_PLATFORM_MISMATCH' using errcode = '22023';
  end if;
  if account_row.id is null or account_row.workspace_id <> new.workspace_id
     or account_row.platform <> platform_row.platform then
    raise exception 'DESTINATION_ACCOUNT_MISMATCH' using errcode = '22023';
  end if;
  if account_row.connection_status <> 'connected'
     and coalesce(current_setting('postflow.preserve_disconnected_destination',true),'') <> 'allowed' then
    raise exception 'ACCOUNT_DISCONNECTED' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger post_destinations_validate before insert or update on public.post_destinations
for each row execute function private.validate_post_destination();

create trigger post_destinations_rpc_write_required before insert or update or delete on public.post_destinations
for each row execute function private.enforce_post_rpc_write();

create function private.replace_post_destinations(
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
  select coalesce(array_agg(social_account_id),array[]::uuid[]) into existing_ids
  from public.post_destinations where post_id=target_post_id;
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
      and account.platform in ('facebook', 'instagram')
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
  perform set_config('postflow.preserve_disconnected_destination','allowed',true);
  insert into public.post_destinations(workspace_id, post_id, post_platform_id, social_account_id)
  select target_workspace_id, target_post_id, platform_row.id, account.id
  from unnest(safe_ids) with ordinality as selected(id, ordinality)
  join public.social_accounts as account on account.id = selected.id
  join public.post_platforms as platform_row
    on platform_row.post_id = target_post_id and platform_row.platform = account.platform
  order by selected.ordinality;
  perform set_config('postflow.preserve_disconnected_destination','',true);
end;
$$;

create or replace function private.validate_post_state(target_post_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_post public.posts%rowtype;
  has_platform boolean;
  has_content boolean;
begin
  select * into target_post from public.posts where id = target_post_id;
  if not found then return; end if;
  if target_post.status = 'cancelled' and target_post.scheduled_at is not null then
    raise exception 'A cancelled post cannot retain a scheduled publishing time' using errcode = '22023';
  end if;
  if target_post.status <> 'scheduled' then return; end if;
  if target_post.scheduled_at is null or target_post.scheduled_at <= now() then
    raise exception 'SCHEDULE_INVALID' using errcode = '22023';
  end if;
  select exists(select 1 from public.post_platforms where post_id = target_post.id) into has_platform;
  if not has_platform then raise exception 'A scheduled post must include at least one platform' using errcode = '22023'; end if;
  if not exists(select 1 from public.post_destinations where post_id = target_post.id) then
    raise exception 'NO_DESTINATION_SELECTED' using errcode = '22023';
  end if;
  select btrim(target_post.caption) <> ''
    or exists(select 1 from public.post_platforms where post_id = target_post.id and btrim(coalesce(platform_caption, '')) <> '')
    or exists(select 1 from public.post_media where post_id = target_post.id)
  into has_content;
  if not has_content then raise exception 'A scheduled post must include a caption or media' using errcode = '22023'; end if;
end;
$$;

create function private.publishing_operation_for(target_post_id uuid, target_platform public.social_platform)
returns public.publishing_operation language plpgsql stable security definer set search_path = '' as $$
declare
  media_count integer;
  asset public.media_assets%rowtype;
  final_caption text;
begin
  select count(*) into media_count from public.post_media where post_id = target_post_id;
  select coalesce(nullif(btrim(platform_row.platform_caption), ''), post.caption)
    into final_caption
  from public.posts as post join public.post_platforms as platform_row on platform_row.post_id = post.id
  where post.id = target_post_id and platform_row.platform = target_platform;
  if media_count = 0 then
    if target_platform <> 'facebook' or btrim(coalesce(final_caption, '')) = '' then
      raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023';
    end if;
    return 'facebook_text';
  end if;
  if media_count <> 1 then raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023'; end if;
  select asset_row.* into asset
  from public.post_media as link join public.media_assets as asset_row on asset_row.id = link.media_asset_id
  where link.post_id = target_post_id;
  if asset.media_type in ('image', 'graphic', 'logo') and asset.mime_type in ('image/jpeg', 'image/png', 'image/webp') then
    if target_platform = 'instagram' and (
      asset.mime_type <> 'image/jpeg'
      or asset.file_size is not null and asset.file_size > 8388608
      or asset.width is not null and asset.height is not null
         and (asset.width::numeric / asset.height < 0.8 or asset.width::numeric / asset.height > 1.91)
    ) then
      raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023';
    end if;
    return case when target_platform = 'facebook' then 'facebook_image'::public.publishing_operation else 'instagram_image'::public.publishing_operation end;
  end if;
  if asset.media_type = 'video' and asset.mime_type in ('video/mp4', 'video/quicktime') then
    if asset.duration_seconds is not null and (asset.duration_seconds < 4 or asset.duration_seconds > 60) then
      raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023';
    end if;
    if asset.width is not null and asset.height is not null and asset.height <= asset.width then
      raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023';
    end if;
    return case when target_platform = 'facebook' then 'facebook_reel'::public.publishing_operation else 'instagram_reel'::public.publishing_operation end;
  end if;
  raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023';
end;
$$;

create function private.validate_publishing_post(target_post_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare destination record;
begin
  if not exists(select 1 from public.post_destinations where post_id = target_post_id) then
    raise exception 'NO_DESTINATION_SELECTED' using errcode = '22023';
  end if;
  for destination in
    select destination_row.*, account.platform, account.connection_status, account.granted_scopes,
           credential.expires_at
    from public.post_destinations as destination_row
    join public.social_accounts as account on account.id = destination_row.social_account_id
    left join private.social_credentials as credential on credential.social_account_id = account.id
    where destination_row.post_id = target_post_id
  loop
    if destination.connection_status <> 'connected' or destination.expires_at is not null and destination.expires_at <= now() then
      raise exception 'ACCOUNT_DISCONNECTED' using errcode = '22023';
    end if;
    if destination.platform = 'facebook' and not destination.granted_scopes @> array['pages_show_list','pages_read_engagement','pages_manage_posts']::text[] then
      raise exception 'MISSING_PERMISSION' using errcode = '42501';
    end if;
    if destination.platform = 'instagram' and not destination.granted_scopes @> array['pages_show_list','pages_read_engagement','instagram_basic','instagram_content_publish']::text[] then
      raise exception 'MISSING_PERMISSION' using errcode = '42501';
    end if;
    perform private.publishing_operation_for(target_post_id, destination.platform);
  end loop;
end;
$$;

create function private.create_publishing_jobs(target_post_id uuid, target_scheduled_for timestamptz)
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare
  target_post public.posts%rowtype;
  destination record;
  created_id uuid;
  created_ids uuid[] := array[]::uuid[];
  snapshot jsonb;
  chosen_operation public.publishing_operation;
begin
  select * into target_post from public.posts where id = target_post_id for update;
  if not found then raise exception 'POST_NOT_FOUND' using errcode = 'P0002'; end if;
  perform private.validate_publishing_post(target_post.id);
  for destination in
    select destination_row.*, account.platform, account.id as account_id,
      platform_row.platform_caption, platform_row.platform_settings
    from public.post_destinations as destination_row
    join public.social_accounts as account on account.id = destination_row.social_account_id
    join public.post_platforms as platform_row on platform_row.id = destination_row.post_platform_id
    where destination_row.post_id = target_post.id
    order by destination_row.created_at, destination_row.id
  loop
    chosen_operation := private.publishing_operation_for(target_post.id, destination.platform);
    select jsonb_build_object(
      'version', 1,
      'postId', target_post.id,
      'postRevision', target_post.revision,
      'workspaceId', target_post.workspace_id,
      'platform', destination.platform,
      'socialAccountId', destination.account_id,
      'caption', coalesce(nullif(btrim(destination.platform_caption), ''), target_post.caption),
      'platformSettings', '{}'::jsonb,
      'scheduledFor', target_scheduled_for,
      'media', coalesce(jsonb_agg(jsonb_build_object(
        'mediaAssetId', asset.id, 'storageBucket', asset.storage_bucket,
        'storagePath', asset.storage_path, 'mimeType', asset.mime_type,
        'mediaType', asset.media_type, 'fileSize', asset.file_size,
        'width', asset.width, 'height', asset.height, 'durationSeconds', asset.duration_seconds
      ) order by link.sort_order) filter (where asset.id is not null), '[]'::jsonb)
    ) into snapshot
    from (select 1) as base
    left join public.post_media as link on link.post_id = target_post.id
    left join public.media_assets as asset on asset.id = link.media_asset_id;

    insert into public.publishing_jobs(
      workspace_id, post_id, post_revision, post_destination_id, social_account_id,
      platform, operation, scheduled_for, available_at, payload_snapshot
    ) values (
      target_post.workspace_id, target_post.id, target_post.revision, destination.id,
      destination.account_id, destination.platform, chosen_operation,
      target_scheduled_for, greatest(target_scheduled_for, now()), snapshot
    ) on conflict (post_id, post_revision, social_account_id) do nothing
    returning id into created_id;
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

create function private.recalculate_post_publishing_status(target_post_id uuid)
returns public.post_status language plpgsql security definer set search_path = '' as $$
declare next_status public.post_status; safe_message text; success_count integer; failure_count integer;
begin
  if exists(select 1 from public.publishing_jobs where post_id = target_post_id and status = 'reconciliation_required') then
    next_status := 'failed'; safe_message := 'Manual provider verification required for one or more destinations.';
  elsif exists(select 1 from public.publishing_jobs where post_id = target_post_id and status in ('queued','processing','waiting_provider','retry_wait')) then
    next_status := 'publishing'; safe_message := null;
  else
    select count(*) filter(where status='succeeded'), count(*) filter(where status='failed')
      into success_count, failure_count from public.publishing_jobs where post_id = target_post_id;
    if failure_count > 0 then next_status := 'failed';
      safe_message := case when success_count > 0 then 'Some destinations published; one or more destinations failed.' else 'Publishing failed for every destination.' end;
    elsif success_count > 0 then next_status := 'published'; safe_message := null;
    else next_status := 'cancelled'; safe_message := null;
    end if;
  end if;
  perform set_config('postflow.post_rpc_write', 'allowed', true);
  update public.posts set status = next_status, failure_message = safe_message,
    published_at = case when next_status='published' then coalesce(published_at, now()) else published_at end
  where id = target_post_id;
  perform set_config('postflow.post_rpc_write', '', true);
  return next_status;
end;
$$;

create function private.enqueue_due_publications(p_batch_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target record; ids uuid[]; post_count integer := 0; job_count integer := 0;
begin
  if p_batch_limit < 1 or p_batch_limit > 500 then raise exception 'INVALID_BATCH_LIMIT' using errcode='22023'; end if;
  for target in select id, scheduled_at from public.posts
    where status='scheduled' and scheduled_at <= now()
    order by scheduled_at for update skip locked limit p_batch_limit
  loop
    begin
      ids := private.create_publishing_jobs(target.id, target.scheduled_at);
      if cardinality(ids) > 0 then post_count := post_count + 1; job_count := job_count + cardinality(ids); end if;
    exception
      when sqlstate '22023' or sqlstate '42501' then
        perform set_config('postflow.post_rpc_write','allowed',true);
        update public.posts set status='failed',failure_message='Scheduled publishing validation failed. Review destinations, permissions and media.' where id=target.id;
        perform set_config('postflow.post_rpc_write','',true);
    end;
  end loop;
  return jsonb_build_object('postsEnqueued', post_count, 'jobsEnqueued', job_count);
end;
$$;

drop function public.create_post(uuid,text,public.post_status,timestamptz,text,boolean,uuid,jsonb,uuid[]);
drop function public.update_post(uuid,bigint,text,public.post_status,timestamptz,text,boolean,uuid,jsonb,uuid[]);

create function public.create_post(
  p_workspace_id uuid, p_caption text, p_status public.post_status,
  p_scheduled_at timestamptz, p_timezone text, p_approval_required boolean,
  p_assigned_to uuid, p_platforms jsonb, p_media_asset_ids uuid[],
  p_destination_account_ids uuid[]
) returns public.posts language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := auth.uid(); created_post public.posts%rowtype;
begin
  if caller_id is null then raise exception 'Authentication is required' using errcode='42501'; end if;
  if not private.is_workspace_member(p_workspace_id) or not private.can_create_content(p_workspace_id) then raise exception 'You cannot create posts in this workspace' using errcode='42501'; end if;
  if p_status is null or p_status not in ('draft','scheduled','cancelled') then raise exception 'This post status cannot be set by browser clients' using errcode='42501'; end if;
  if p_status <> 'draft' and not private.can_manage_content(p_workspace_id) then raise exception 'Your workspace role may create drafts only' using errcode='42501'; end if;
  if p_assigned_to is not null and not private.is_user_workspace_member(p_workspace_id,p_assigned_to) then raise exception 'The assigned user must be an active workspace member' using errcode='22023'; end if;
  if btrim(coalesce(p_timezone,''))='' or not exists(select 1 from pg_timezone_names where name=btrim(p_timezone)) then raise exception 'A valid time zone is required' using errcode='22023'; end if;
  perform set_config('postflow.post_rpc_write','allowed',true);
  insert into public.posts(workspace_id,created_by,assigned_to,caption,status,scheduled_at,timezone,approval_required,published_at,failure_message)
  values(p_workspace_id,caller_id,p_assigned_to,coalesce(p_caption,''),p_status,p_scheduled_at,btrim(p_timezone),coalesce(p_approval_required,false),null,null)
  returning * into created_post;
  perform private.replace_post_children(created_post.id,created_post.workspace_id,p_platforms,p_media_asset_ids);
  perform private.replace_post_destinations(created_post.id,created_post.workspace_id,p_destination_account_ids);
  perform private.validate_post_state(created_post.id);
  if p_status='scheduled' then perform private.validate_publishing_post(created_post.id); end if;
  select * into created_post from public.posts where id=created_post.id;
  perform set_config('postflow.post_rpc_write','',true);
  return created_post;
end;
$$;

create function public.update_post(
  p_post_id uuid, p_expected_revision bigint, p_caption text,
  p_status public.post_status, p_scheduled_at timestamptz, p_timezone text,
  p_approval_required boolean, p_assigned_to uuid, p_platforms jsonb,
  p_media_asset_ids uuid[], p_destination_account_ids uuid[]
) returns public.posts language plpgsql security definer set search_path = '' as $$
declare caller_id uuid:=auth.uid(); current_post public.posts%rowtype; updated_post public.posts%rowtype;
begin
  if caller_id is null then raise exception 'Authentication is required' using errcode='42501'; end if;
  select * into current_post from public.posts where id=p_post_id for update;
  if not found then raise exception 'Post not found' using errcode='P0002'; end if;
  if exists(select 1 from public.publishing_jobs where post_id=p_post_id) then raise exception 'POST_HAS_PUBLISHING_HISTORY' using errcode='55000'; end if;
  if not private.can_edit_post(current_post.id) then raise exception 'You cannot edit this post' using errcode='42501'; end if;
  if current_post.status not in ('draft','scheduled','cancelled') then raise exception 'Publishing posts are read-only' using errcode='42501'; end if;
  if p_expected_revision is null or p_expected_revision<>current_post.revision then raise exception 'POST_REVISION_CONFLICT' using errcode='40001'; end if;
  if p_status is null or p_status not in ('draft','scheduled','cancelled') then raise exception 'This post status cannot be set by browser clients' using errcode='42501'; end if;
  if not private.can_manage_content(current_post.workspace_id) and p_status<>'draft' then raise exception 'Designers may save drafts only' using errcode='42501'; end if;
  if p_assigned_to is not null and not private.is_user_workspace_member(current_post.workspace_id,p_assigned_to) then raise exception 'The assigned user must be an active workspace member' using errcode='22023'; end if;
  if btrim(coalesce(p_timezone,''))='' or not exists(select 1 from pg_timezone_names where name=btrim(p_timezone)) then raise exception 'A valid time zone is required' using errcode='22023'; end if;
  perform set_config('postflow.post_rpc_write','allowed',true);
  update public.posts set assigned_to=p_assigned_to,caption=coalesce(p_caption,''),status=p_status,
    scheduled_at=p_scheduled_at,timezone=btrim(p_timezone),approval_required=coalesce(p_approval_required,false)
  where id=current_post.id returning * into updated_post;
  perform private.replace_post_children(updated_post.id,updated_post.workspace_id,p_platforms,p_media_asset_ids);
  perform private.replace_post_destinations(updated_post.id,updated_post.workspace_id,p_destination_account_ids);
  perform private.validate_post_state(updated_post.id);
  if p_status='scheduled' then perform private.validate_publishing_post(updated_post.id); end if;
  select * into updated_post from public.posts where id=updated_post.id;
  perform set_config('postflow.post_rpc_write','',true);
  return updated_post;
end;
$$;

create function public.request_publish_now(p_post_id uuid,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.posts%rowtype; ids uuid[];
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into target from public.posts where id=p_post_id for update;
  if not found then raise exception 'POST_NOT_FOUND' using errcode='P0002'; end if;
  if not private.can_manage_content(target.workspace_id) then raise exception 'PERMISSION_DENIED' using errcode='42501'; end if;
  if target.revision<>p_expected_revision then raise exception 'POST_REVISION_CONFLICT' using errcode='40001'; end if;
  if target.status in ('publishing','published') then raise exception 'JOB_ALREADY_PROCESSING' using errcode='55000'; end if;
  ids:=private.create_publishing_jobs(target.id,now());
  if cardinality(ids)=0 then raise exception 'JOB_ALREADY_EXISTS' using errcode='23505'; end if;
  return jsonb_build_object('postId',target.id,'status','queued','jobIds',to_jsonb(ids));
end;
$$;

create function public.cancel_post_publication(p_post_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.posts%rowtype; guaranteed integer; uncertain integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into target from public.posts where id=p_post_id for update;
  if not found then raise exception 'POST_NOT_FOUND' using errcode='P0002'; end if;
  if not private.can_manage_content(target.workspace_id) then raise exception 'PERMISSION_DENIED' using errcode='42501'; end if;
  update public.publishing_jobs set status='cancelled',completed_at=now(),safe_error_code='CANCELLED_BY_USER',retryable=false
  where post_id=target.id and status in ('queued','retry_wait','waiting_provider') and provider_container_id is null;
  get diagnostics guaranteed=row_count;
  update public.publishing_jobs set status='reconciliation_required',completed_at=now(),ambiguous_result=true,
    safe_error_code='CANCELLATION_NOT_GUARANTEED',safe_error_message='Provider submission may already have started; verify the destination.'
  where post_id=target.id and status in ('processing','waiting_provider') and (provider_container_id is not null or started_at is not null);
  get diagnostics uncertain=row_count;
  if uncertain>0 then perform private.recalculate_post_publishing_status(target.id);
  else
    perform set_config('postflow.post_rpc_write','allowed',true);
    update public.posts set status='cancelled',scheduled_at=null where id=target.id;
    perform set_config('postflow.post_rpc_write','',true);
  end if;
  return jsonb_build_object('postId',target.id,'cancelledJobs',guaranteed,'reconciliationRequired',uncertain);
end;
$$;

create function public.retry_publishing_job(p_publishing_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.publishing_jobs%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into target from public.publishing_jobs where id=p_publishing_job_id for update;
  if not found then raise exception 'JOB_NOT_FOUND' using errcode='P0002'; end if;
  if not private.can_manage_content(target.workspace_id) then raise exception 'PERMISSION_DENIED' using errcode='42501'; end if;
  if target.status<>'failed' or target.retryable is not true or target.attempt_count>=target.max_attempts then raise exception 'RETRY_NOT_ALLOWED' using errcode='55000'; end if;
  update public.publishing_jobs set status='queued',available_at=now(),next_attempt_at=null,
    safe_error_code=null,safe_error_message=null,completed_at=null where id=target.id;
  perform pgmq.send('postflow-publishing',jsonb_build_object('version',1,'publishingJobId',target.id));
  perform private.recalculate_post_publishing_status(target.post_id);
  return jsonb_build_object('publishingJobId',target.id,'status','queued');
end;
$$;

create or replace function public.delete_post(p_post_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare target public.posts%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication is required' using errcode='42501'; end if;
  select * into target from public.posts where id=p_post_id for update;
  if not found then raise exception 'Post not found' using errcode='P0002'; end if;
  if exists(select 1 from public.publishing_jobs where post_id=target.id) then raise exception 'POST_HAS_PUBLISHING_HISTORY' using errcode='55000'; end if;
  if not private.can_delete_post(target.id) then raise exception 'You cannot delete this post' using errcode='42501'; end if;
  perform set_config('postflow.post_rpc_write','allowed',true); delete from public.posts where id=target.id;
  perform set_config('postflow.post_rpc_write','',true); return target.id;
end;
$$;

create function public.claim_publishing_queue_batch(p_batch_size integer default 5,p_visibility_seconds integer default 120)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare message_row record; target public.publishing_jobs%rowtype; items jsonb:='[]'::jsonb; attempt_no integer;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
  if p_batch_size<1 or p_batch_size>5 or p_visibility_seconds<30 or p_visibility_seconds>600 then raise exception 'INVALID_WORKER_LIMIT' using errcode='22023'; end if;
  for message_row in select * from pgmq.read('postflow-publishing',p_visibility_seconds,p_batch_size)
  loop
    if message_row.message->>'version'<>'1' or coalesce(message_row.message->>'publishingJobId','') !~ '^[0-9a-f-]{36}$' then
      perform pgmq.archive('postflow-publishing',message_row.msg_id); continue;
    end if;
    select * into target from public.publishing_jobs where id=(message_row.message->>'publishingJobId')::uuid for update;
    if not found or target.status in ('succeeded','failed','cancelled','reconciliation_required') then
      perform pgmq.archive('postflow-publishing',message_row.msg_id); continue;
    end if;
    if target.status='processing' and target.updated_at>now()-make_interval(secs=>p_visibility_seconds) then continue; end if;
    if target.available_at>now() then continue; end if;
    attempt_no:=target.attempt_count+1;
    if attempt_no>target.max_attempts then
      update public.publishing_jobs set status='failed',safe_error_code='RETRY_EXHAUSTED',safe_error_message='Publishing retry limit reached.',retryable=false,completed_at=now() where id=target.id;
      perform pgmq.archive('postflow-publishing',message_row.msg_id); perform private.recalculate_post_publishing_status(target.post_id); continue;
    end if;
    update public.publishing_jobs set status='processing',attempt_count=attempt_no,started_at=coalesce(started_at,now()),next_attempt_at=null where id=target.id returning * into target;
    insert into public.publishing_attempts(workspace_id,publishing_job_id,attempt_number,phase,outcome)
    values(target.workspace_id,target.id,attempt_no,'claimed','started');
    items:=items||jsonb_build_array(jsonb_build_object(
      'messageId',message_row.msg_id,'attemptNumber',attempt_no,'job',to_jsonb(target),
      'account',(select jsonb_build_object('id',a.id,'workspaceId',a.workspace_id,'platform',a.platform,'accountType',a.account_type,'platformAccountId',a.platform_account_id,'parentPageId',a.parent_platform_account_id,'connectionStatus',a.connection_status,'tokenExpiresAt',a.token_expires_at,'grantedScopes',a.granted_scopes) from public.social_accounts a where a.id=target.social_account_id),
      'credential',(select jsonb_build_object('encryptedAccessToken',c.encrypted_access_token,'accessTokenIv',c.access_token_iv,'expiresAt',c.expires_at,'grantedScopes',c.granted_scopes) from private.social_credentials c where c.social_account_id=target.social_account_id)
    ));
  end loop;
  return items;
end;
$$;

create function public.finish_publishing_step(p_publishing_job_id uuid,p_message_id bigint,p_attempt_number integer,p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.publishing_jobs%rowtype; next_status public.publishing_job_status; delay_seconds integer; terminal boolean; attempt_outcome public.publishing_attempt_outcome;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
  if jsonb_typeof(p_result)<>'object' then raise exception 'INVALID_WORKER_RESULT' using errcode='22023'; end if;
  select * into target from public.publishing_jobs where id=p_publishing_job_id for update;
  if not found then perform pgmq.archive('postflow-publishing',p_message_id); return jsonb_build_object('archived',true,'status','missing'); end if;
  if target.attempt_count<>p_attempt_number then raise exception 'STALE_WORKER_RESULT' using errcode='40001'; end if;
  next_status:=(p_result->>'status')::public.publishing_job_status;
  if next_status not in ('waiting_provider','retry_wait','succeeded','failed','reconciliation_required') then raise exception 'INVALID_WORKER_RESULT' using errcode='22023'; end if;
  delay_seconds:=least(1800,greatest(0,coalesce((p_result->>'delaySeconds')::integer,0)));
  terminal:=next_status in ('succeeded','failed','reconciliation_required');
  attempt_outcome:=case next_status when 'succeeded' then 'succeeded'::public.publishing_attempt_outcome when 'failed' then 'permanent_failure'::public.publishing_attempt_outcome when 'reconciliation_required' then 'ambiguous'::public.publishing_attempt_outcome else 'transient_failure'::public.publishing_attempt_outcome end;
  update public.publishing_attempts set phase=left(coalesce(p_result->>'phase','provider'),80),outcome=attempt_outcome,
    http_status=(p_result->>'httpStatus')::integer,provider_error_code=left(nullif(p_result->>'errorCode',''),80),
    safe_error_message=left(nullif(p_result->>'safeMessage',''),500),provider_request_id=left(nullif(p_result->>'requestId',''),160),
    retryable=coalesce((p_result->>'retryable')::boolean,false),ambiguous=next_status='reconciliation_required',finished_at=now()
  where publishing_job_id=target.id and attempt_number=p_attempt_number;
  update public.publishing_jobs set status=next_status,available_at=case when terminal then available_at else now()+make_interval(secs=>delay_seconds) end,
    next_attempt_at=case when terminal then null else now()+make_interval(secs=>delay_seconds) end,
    provider_container_id=coalesce(nullif(p_result->>'providerContainerId',''),provider_container_id),
    provider_post_id=coalesce(nullif(p_result->>'providerPostId',''),provider_post_id),provider_permalink=coalesce(nullif(p_result->>'providerPermalink',''),provider_permalink),
    safe_error_code=left(nullif(p_result->>'errorCode',''),80),safe_error_message=left(nullif(p_result->>'safeMessage',''),500),
    retryable=coalesce((p_result->>'retryable')::boolean,false),ambiguous_result=next_status='reconciliation_required',completed_at=case when terminal then now() else null end
  where id=target.id;
  perform pgmq.archive('postflow-publishing',p_message_id);
  if not terminal then perform pgmq.send('postflow-publishing',jsonb_build_object('version',1,'publishingJobId',target.id),delay_seconds); end if;
  perform private.recalculate_post_publishing_status(target.post_id);
  return jsonb_build_object('archived',true,'status',next_status,'requeued',not terminal);
end;
$$;

create function public.mark_publishing_account_unusable(p_social_account_id uuid,p_status public.social_connection_status,p_error_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
  if p_status not in ('expired','reconnect_required','error') then raise exception 'INVALID_CONNECTION_STATUS' using errcode='22023'; end if;
  update public.social_accounts set connection_status=p_status,last_error_code=left(p_error_code,80),last_error_message='Reconnect this account before publishing again.' where id=p_social_account_id;
end;
$$;

alter table public.post_destinations enable row level security;
alter table public.publishing_jobs enable row level security;
alter table public.publishing_attempts enable row level security;
create policy post_destinations_read_members on public.post_destinations for select to authenticated using(private.is_workspace_member(workspace_id));
create policy publishing_jobs_read_members on public.publishing_jobs for select to authenticated using(private.is_workspace_member(workspace_id));
create policy publishing_attempts_read_members on public.publishing_attempts for select to authenticated using(private.is_workspace_member(workspace_id));

revoke all on table public.post_destinations,public.publishing_jobs,public.publishing_attempts from public,anon,authenticated;
grant select on table public.post_destinations,public.publishing_jobs,public.publishing_attempts to authenticated;
grant select,insert,update,delete on table public.post_destinations,public.publishing_jobs,public.publishing_attempts to service_role;
revoke all on all tables in schema pgmq from public,anon,authenticated;
revoke usage on schema pgmq from public,anon,authenticated;

revoke all on function private.validate_post_destination(),private.prevent_publishing_history_delete(),private.replace_post_destinations(uuid,uuid,uuid[]),private.publishing_operation_for(uuid,public.social_platform),private.validate_publishing_post(uuid),private.create_publishing_jobs(uuid,timestamptz),private.recalculate_post_publishing_status(uuid),private.enqueue_due_publications(integer) from public,anon,authenticated;
revoke all on function public.create_post(uuid,text,public.post_status,timestamptz,text,boolean,uuid,jsonb,uuid[],uuid[]),public.update_post(uuid,bigint,text,public.post_status,timestamptz,text,boolean,uuid,jsonb,uuid[],uuid[]),public.request_publish_now(uuid,bigint),public.cancel_post_publication(uuid),public.retry_publishing_job(uuid) from public,anon,authenticated;
grant execute on function public.create_post(uuid,text,public.post_status,timestamptz,text,boolean,uuid,jsonb,uuid[],uuid[]),public.update_post(uuid,bigint,text,public.post_status,timestamptz,text,boolean,uuid,jsonb,uuid[],uuid[]),public.request_publish_now(uuid,bigint),public.cancel_post_publication(uuid),public.retry_publishing_job(uuid) to authenticated;
revoke all on function public.claim_publishing_queue_batch(integer,integer),public.finish_publishing_step(uuid,bigint,integer,jsonb),public.mark_publishing_account_unusable(uuid,public.social_connection_status,text) from public,anon,authenticated;
grant execute on function public.claim_publishing_queue_batch(integer,integer),public.finish_publishing_step(uuid,bigint,integer,jsonb),public.mark_publishing_account_unusable(uuid,public.social_connection_status,text) to service_role;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='postflow-enqueue-due-publications';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('postflow-enqueue-due-publications','* * * * *','select private.enqueue_due_publications(100);');
end;
$$;

commit;
