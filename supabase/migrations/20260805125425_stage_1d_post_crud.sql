begin;

alter table public.posts
add column if not exists revision bigint not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.posts'::regclass
      and constraint_row.conname = 'posts_revision_positive'
  ) then
    alter table public.posts
    add constraint posts_revision_positive check (revision > 0);
  end if;
end;
$$;

create or replace function private.increment_post_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
  else
    new.revision := old.revision + 1;
  end if;
  return new;
end;
$$;

create or replace function private.enforce_post_rpc_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.role()) = 'authenticated'
     and coalesce(
       pg_catalog.current_setting('postflow.post_rpc_write', true),
       ''
     ) <> 'allowed'
     and pg_catalog.pg_trigger_depth() <= 1 then
    raise exception 'Post mutations must use the Stage 1D RPC functions'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function private.prevent_post_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'Post identity and creation time cannot be changed'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.enforce_browser_post_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.role()) = 'authenticated' then
    if new.status not in (
      'draft'::public.post_status,
      'scheduled'::public.post_status,
      'cancelled'::public.post_status
    ) then
      raise exception 'This post status is reserved for a later workflow'
        using errcode = '42501';
    end if;

    if tg_op = 'INSERT' then
      if new.published_at is not null or new.failure_message is not null then
        raise exception 'Publishing result fields cannot be set by browser clients'
          using errcode = '42501';
      end if;
    elsif old.status not in (
      'draft'::public.post_status,
      'scheduled'::public.post_status,
      'cancelled'::public.post_status
    ) then
      raise exception 'Publishing and approval workflow posts are read-only in Stage 1D'
        using errcode = '42501';
    elsif new.published_at is distinct from old.published_at
       or new.failure_message is distinct from old.failure_message then
      raise exception 'Publishing result fields cannot be changed by browser clients'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_revision_increment on public.posts;
create trigger posts_revision_increment
before insert or update on public.posts
for each row execute function private.increment_post_revision();

drop trigger if exists posts_rpc_write_required on public.posts;
create trigger posts_rpc_write_required
before insert or update or delete on public.posts
for each row execute function private.enforce_post_rpc_write();

drop trigger if exists post_platforms_rpc_write_required on public.post_platforms;
create trigger post_platforms_rpc_write_required
before insert or update or delete on public.post_platforms
for each row execute function private.enforce_post_rpc_write();

drop trigger if exists post_media_rpc_write_required on public.post_media;
create trigger post_media_rpc_write_required
before insert or update or delete on public.post_media
for each row execute function private.enforce_post_rpc_write();

drop trigger if exists posts_identity_immutable on public.posts;
create trigger posts_identity_immutable
before update on public.posts
for each row execute function private.prevent_post_identity_change();

drop trigger if exists posts_browser_write_guard on public.posts;
create trigger posts_browser_write_guard
before insert or update on public.posts
for each row execute function private.enforce_browser_post_write();

create or replace function private.validate_post_state(target_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_post public.posts%rowtype;
  has_platform boolean;
  has_content boolean;
begin
  select post.*
  into target_post
  from public.posts as post
  where post.id = target_post_id;

  if not found then
    return;
  end if;

  if target_post.status = 'cancelled'::public.post_status
     and target_post.scheduled_at is not null then
    raise exception 'A cancelled post cannot retain a scheduled publishing time'
      using errcode = '22023';
  end if;

  if target_post.status <> 'scheduled'::public.post_status then
    return;
  end if;

  if target_post.scheduled_at is null
     or target_post.scheduled_at <= pg_catalog.now() then
    raise exception 'A scheduled post must have a future publishing time'
      using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.post_platforms as platform_row
    where platform_row.post_id = target_post.id
  ) into has_platform;

  if not has_platform then
    raise exception 'A scheduled post must include at least one platform'
      using errcode = '22023';
  end if;

  select
    pg_catalog.btrim(target_post.caption) <> ''
    or exists (
      select 1
      from public.post_platforms as platform_row
      where platform_row.post_id = target_post.id
        and pg_catalog.btrim(coalesce(platform_row.platform_caption, '')) <> ''
    )
    or exists (
      select 1
      from public.post_media as media_link
      where media_link.post_id = target_post.id
    )
  into has_content;

  if not has_content then
    raise exception 'A scheduled post must include a caption or media'
      using errcode = '22023';
  end if;
end;
$$;

create or replace function private.validate_post_state_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_argv[0] = 'post' then
    if tg_op <> 'DELETE' then
      perform private.validate_post_state(new.id);
    end if;
  else
    if tg_op = 'DELETE' then
      perform private.validate_post_state(old.post_id);
    elsif tg_op = 'INSERT' then
      perform private.validate_post_state(new.post_id);
    else
      perform private.validate_post_state(old.post_id);
      if new.post_id is distinct from old.post_id then
        perform private.validate_post_state(new.post_id);
      end if;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists posts_validate_final_state on public.posts;
create constraint trigger posts_validate_final_state
after insert or update on public.posts
deferrable initially deferred
for each row execute function private.validate_post_state_trigger('post');

drop trigger if exists post_platforms_validate_final_state on public.post_platforms;
create constraint trigger post_platforms_validate_final_state
after insert or update or delete on public.post_platforms
deferrable initially deferred
for each row execute function private.validate_post_state_trigger('child');

drop trigger if exists post_media_validate_final_state on public.post_media;
create constraint trigger post_media_validate_final_state
after insert or update or delete on public.post_media
deferrable initially deferred
for each row execute function private.validate_post_state_trigger('child');

create or replace function private.replace_post_children(
  target_post_id uuid,
  target_workspace_id uuid,
  platform_input jsonb,
  media_input uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  safe_platforms jsonb := coalesce(platform_input, '[]'::jsonb);
  safe_media_ids uuid[] := coalesce(media_input, array[]::uuid[]);
  platform_count integer;
  unique_platform_count integer;
  media_count integer;
  unique_media_count integer;
  visible_media_count integer;
begin
  if pg_catalog.jsonb_typeof(safe_platforms) <> 'array' then
    raise exception 'Platforms must be a JSON array' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(safe_platforms) as item(value)
    where pg_catalog.jsonb_typeof(item.value) <> 'object'
  ) then
    raise exception 'Every platform entry must be an object' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(safe_platforms) as item(value)
    cross join lateral pg_catalog.jsonb_object_keys(item.value) as object_key(key)
    where object_key.key not in (
      'platform',
      'platform_caption',
      'platform_title',
      'platform_settings'
    )
  ) then
    raise exception 'A platform entry contains an unsupported field'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(safe_platforms) as item(value)
    where (
      item.value ? 'platform_caption'
      and pg_catalog.jsonb_typeof(item.value -> 'platform_caption')
        not in ('string', 'null')
    ) or (
      item.value ? 'platform_title'
      and pg_catalog.jsonb_typeof(item.value -> 'platform_title')
        not in ('string', 'null')
    )
  ) then
    raise exception 'Platform captions and titles must be strings or null'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(safe_platforms) as item(value)
    where item.value ->> 'platform' is null
       or item.value ->> 'platform' not in (
         'facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'x'
       )
  ) then
    raise exception 'A platform value is invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(safe_platforms) as item(value)
    where item.value ? 'platform_settings'
      and pg_catalog.jsonb_typeof(item.value -> 'platform_settings') <> 'object'
  ) then
    raise exception 'platform_settings must be a JSON object'
      using errcode = '22023';
  end if;

  select
    count(*),
    count(distinct item.value ->> 'platform')
  into platform_count, unique_platform_count
  from pg_catalog.jsonb_array_elements(safe_platforms) as item(value);

  if platform_count <> unique_platform_count then
    raise exception 'Each platform may appear only once' using errcode = '22023';
  end if;

  media_count := pg_catalog.cardinality(safe_media_ids);
  if media_count > 10 then
    raise exception 'A post may include no more than 10 media assets'
      using errcode = '22023';
  end if;
  if pg_catalog.array_position(safe_media_ids, null) is not null then
    raise exception 'Media asset IDs cannot contain null values'
      using errcode = '22023';
  end if;

  select count(distinct media_id)
  into unique_media_count
  from pg_catalog.unnest(safe_media_ids) as media_id;
  if media_count <> unique_media_count then
    raise exception 'Media assets cannot be attached more than once'
      using errcode = '22023';
  end if;

  select count(*)
  into visible_media_count
  from public.media_assets as asset
  where asset.id = any (safe_media_ids)
    and asset.workspace_id = target_workspace_id;
  if visible_media_count <> media_count then
    raise exception 'A media asset is missing, inaccessible, or belongs to another workspace'
      using errcode = '22023';
  end if;

  delete from public.post_platforms
  where post_id = target_post_id;

  delete from public.post_media
  where post_id = target_post_id;

  insert into public.post_platforms (
    post_id,
    workspace_id,
    platform,
    platform_caption,
    platform_title,
    platform_settings
  )
  select
    target_post_id,
    target_workspace_id,
    (item.value ->> 'platform')::public.social_platform,
    nullif(pg_catalog.btrim(item.value ->> 'platform_caption'), ''),
    nullif(pg_catalog.btrim(item.value ->> 'platform_title'), ''),
    coalesce(item.value -> 'platform_settings', '{}'::jsonb)
  from pg_catalog.jsonb_array_elements(safe_platforms) as item(value);

  insert into public.post_media (
    post_id,
    workspace_id,
    media_asset_id,
    sort_order
  )
  select
    target_post_id,
    target_workspace_id,
    media_id,
    (ordinality - 1)::integer
  from pg_catalog.unnest(safe_media_ids) with ordinality as media(media_id, ordinality);
end;
$$;

drop policy if exists posts_insert_content_creators on public.posts;
create policy posts_insert_content_creators
on public.posts
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (
    private.can_manage_content(workspace_id)
    or (
      private.has_workspace_role(
        workspace_id,
        array['designer'::public.workspace_role]
      )
      and status = 'draft'::public.post_status
    )
  )
  and (
    assigned_to is null
    or private.is_user_workspace_member(workspace_id, assigned_to)
  )
);

create or replace function public.create_post(
  p_workspace_id uuid,
  p_caption text,
  p_status public.post_status,
  p_scheduled_at timestamptz,
  p_timezone text,
  p_approval_required boolean,
  p_assigned_to uuid,
  p_platforms jsonb,
  p_media_asset_ids uuid[]
)
returns public.posts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  created_post public.posts%rowtype;
begin
  if caller_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if not private.is_workspace_member(p_workspace_id)
     or not private.can_create_content(p_workspace_id) then
    raise exception 'You cannot create posts in this workspace'
      using errcode = '42501';
  end if;
  if p_status is null or p_status not in (
    'draft'::public.post_status,
    'scheduled'::public.post_status,
    'cancelled'::public.post_status
  ) then
    raise exception 'This post status cannot be set by browser clients'
      using errcode = '42501';
  end if;
  if p_status <> 'draft'::public.post_status
     and not private.can_manage_content(p_workspace_id) then
    raise exception 'Your workspace role may create drafts only'
      using errcode = '42501';
  end if;
  if p_assigned_to is not null
     and not private.is_user_workspace_member(p_workspace_id, p_assigned_to) then
    raise exception 'The assigned user must be an active workspace member'
      using errcode = '22023';
  end if;
  if pg_catalog.btrim(coalesce(p_timezone, '')) = ''
     or not exists (
       select 1
       from pg_catalog.pg_timezone_names as zone
       where zone.name = pg_catalog.btrim(p_timezone)
     ) then
    raise exception 'A valid time zone is required' using errcode = '22023';
  end if;

  perform pg_catalog.set_config(
    'postflow.post_rpc_write',
    'allowed',
    true
  );

  insert into public.posts (
    workspace_id,
    created_by,
    assigned_to,
    caption,
    status,
    scheduled_at,
    timezone,
    approval_required,
    published_at,
    failure_message
  )
  values (
    p_workspace_id,
    caller_id,
    p_assigned_to,
    coalesce(p_caption, ''),
    p_status,
    p_scheduled_at,
    pg_catalog.btrim(p_timezone),
    coalesce(p_approval_required, false),
    null,
    null
  )
  returning * into created_post;

  perform private.replace_post_children(
    created_post.id,
    created_post.workspace_id,
    p_platforms,
    p_media_asset_ids
  );
  perform private.validate_post_state(created_post.id);

  select post.* into created_post
  from public.posts as post
  where post.id = created_post.id;
  perform pg_catalog.set_config('postflow.post_rpc_write', '', true);
  return created_post;
end;
$$;

create or replace function public.update_post(
  p_post_id uuid,
  p_expected_revision bigint,
  p_caption text,
  p_status public.post_status,
  p_scheduled_at timestamptz,
  p_timezone text,
  p_approval_required boolean,
  p_assigned_to uuid,
  p_platforms jsonb,
  p_media_asset_ids uuid[]
)
returns public.posts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  current_post public.posts%rowtype;
  updated_post public.posts%rowtype;
begin
  if caller_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select post.*
  into current_post
  from public.posts as post
  where post.id = p_post_id
  for update;
  if not found then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;
  if not private.can_edit_post(current_post.id) then
    raise exception 'You cannot edit this post' using errcode = '42501';
  end if;
  if current_post.status not in (
    'draft'::public.post_status,
    'scheduled'::public.post_status,
    'cancelled'::public.post_status
  ) then
    raise exception 'Publishing and approval workflow posts are read-only in Stage 1D'
      using errcode = '42501';
  end if;
  if p_expected_revision is null
     or p_expected_revision <> current_post.revision then
    raise exception 'POST_REVISION_CONFLICT'
      using errcode = '40001';
  end if;
  if p_status is null or p_status not in (
    'draft'::public.post_status,
    'scheduled'::public.post_status,
    'cancelled'::public.post_status
  ) then
    raise exception 'This post status cannot be set by browser clients'
      using errcode = '42501';
  end if;
  if not private.can_manage_content(current_post.workspace_id)
     and p_status <> 'draft'::public.post_status then
    raise exception 'Designers may save drafts only' using errcode = '42501';
  end if;
  if p_assigned_to is not null
     and not private.is_user_workspace_member(
       current_post.workspace_id,
       p_assigned_to
     ) then
    raise exception 'The assigned user must be an active workspace member'
      using errcode = '22023';
  end if;
  if pg_catalog.btrim(coalesce(p_timezone, '')) = ''
     or not exists (
       select 1
       from pg_catalog.pg_timezone_names as zone
       where zone.name = pg_catalog.btrim(p_timezone)
     ) then
    raise exception 'A valid time zone is required' using errcode = '22023';
  end if;

  perform pg_catalog.set_config(
    'postflow.post_rpc_write',
    'allowed',
    true
  );

  update public.posts
  set
    assigned_to = p_assigned_to,
    caption = coalesce(p_caption, ''),
    status = p_status,
    scheduled_at = p_scheduled_at,
    timezone = pg_catalog.btrim(p_timezone),
    approval_required = coalesce(p_approval_required, false)
  where id = current_post.id
  returning * into updated_post;

  perform private.replace_post_children(
    updated_post.id,
    updated_post.workspace_id,
    p_platforms,
    p_media_asset_ids
  );
  perform private.validate_post_state(updated_post.id);

  select post.* into updated_post
  from public.posts as post
  where post.id = updated_post.id;
  perform pg_catalog.set_config('postflow.post_rpc_write', '', true);
  return updated_post;
end;
$$;

create or replace function public.delete_post(p_post_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_post public.posts%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  select post.* into target_post
  from public.posts as post
  where post.id = p_post_id
  for update;
  if not found then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;
  if not private.can_delete_post(target_post.id) then
    raise exception 'You cannot delete this post' using errcode = '42501';
  end if;
  perform pg_catalog.set_config(
    'postflow.post_rpc_write',
    'allowed',
    true
  );
  delete from public.posts where id = target_post.id;
  perform pg_catalog.set_config('postflow.post_rpc_write', '', true);
  return target_post.id;
end;
$$;

create or replace function public.delete_posts(p_post_ids uuid[])
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  unique_post_ids uuid[];
  input_count integer;
  visible_count integer;
  deleted_ids uuid[];
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  input_count := pg_catalog.cardinality(coalesce(p_post_ids, array[]::uuid[]));
  if input_count = 0 then
    raise exception 'Choose at least one post to delete' using errcode = '22023';
  end if;
  if input_count > 100 then
    raise exception 'Bulk deletion is limited to 100 posts' using errcode = '22023';
  end if;
  if pg_catalog.array_position(p_post_ids, null) is not null then
    raise exception 'Post IDs cannot contain null values' using errcode = '22023';
  end if;

  select pg_catalog.array_agg(post_id order by post_id)
  into unique_post_ids
  from (
    select distinct post_id
    from pg_catalog.unnest(p_post_ids) as post_id
  ) as unique_ids;

  perform 1
  from public.posts as post
  where post.id = any (unique_post_ids)
  order by post.id
  for update;

  select count(*) into visible_count
  from public.posts as post
  where post.id = any (unique_post_ids);
  if visible_count <> pg_catalog.cardinality(unique_post_ids) then
    raise exception 'One or more posts were not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1
    from public.posts as post
    where post.id = any (unique_post_ids)
      and not private.can_delete_post(post.id)
  ) then
    raise exception 'You cannot delete one or more selected posts'
      using errcode = '42501';
  end if;

  perform pg_catalog.set_config(
    'postflow.post_rpc_write',
    'allowed',
    true
  );

  with deleted as (
    delete from public.posts
    where id = any (unique_post_ids)
    returning id
  )
  select coalesce(
    pg_catalog.array_agg(deleted.id order by deleted.id),
    array[]::uuid[]
  )
  into deleted_ids
  from deleted;
  perform pg_catalog.set_config('postflow.post_rpc_write', '', true);
  return deleted_ids;
end;
$$;

create or replace function public.duplicate_post(p_post_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  source_post public.posts%rowtype;
  new_post public.posts%rowtype;
begin
  if caller_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  select post.* into source_post
  from public.posts as post
  where post.id = p_post_id
  for share;
  if not found then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;
  if not private.can_create_content(source_post.workspace_id) then
    raise exception 'You cannot duplicate posts in this workspace'
      using errcode = '42501';
  end if;
  if (
    select count(*)
    from public.post_media as source_media
    where source_media.post_id = source_post.id
  ) > 10 then
    raise exception 'The source post exceeds the 10-media attachment limit'
      using errcode = '22023';
  end if;

  perform pg_catalog.set_config(
    'postflow.post_rpc_write',
    'allowed',
    true
  );

  insert into public.posts (
    workspace_id,
    created_by,
    assigned_to,
    caption,
    status,
    scheduled_at,
    timezone,
    approval_required,
    published_at,
    failure_message
  )
  values (
    source_post.workspace_id,
    caller_id,
    null,
    source_post.caption,
    'draft'::public.post_status,
    null,
    source_post.timezone,
    false,
    null,
    null
  )
  returning * into new_post;

  insert into public.post_platforms (
    post_id,
    workspace_id,
    platform,
    platform_caption,
    platform_title,
    platform_settings
  )
  select
    new_post.id,
    new_post.workspace_id,
    source.platform,
    source.platform_caption,
    source.platform_title,
    source.platform_settings
  from public.post_platforms as source
  where source.post_id = source_post.id;

  insert into public.post_media (
    post_id,
    workspace_id,
    media_asset_id,
    sort_order
  )
  select
    new_post.id,
    new_post.workspace_id,
    source.media_asset_id,
    source.sort_order
  from public.post_media as source
  where source.post_id = source_post.id
  order by source.sort_order;

  perform pg_catalog.set_config('postflow.post_rpc_write', '', true);
  return new_post.id;
end;
$$;

revoke all on function private.increment_post_revision()
from public, anon, authenticated;
revoke all on function private.enforce_post_rpc_write()
from public, anon, authenticated;
revoke all on function private.prevent_post_identity_change()
from public, anon, authenticated;
revoke all on function private.enforce_browser_post_write()
from public, anon, authenticated;
revoke all on function private.validate_post_state(uuid)
from public, anon, authenticated;
revoke all on function private.validate_post_state_trigger()
from public, anon, authenticated;
revoke all on function private.replace_post_children(uuid, uuid, jsonb, uuid[])
from public, anon, authenticated;

grant execute on function private.validate_post_state(uuid) to authenticated;
grant execute on function private.replace_post_children(uuid, uuid, jsonb, uuid[])
to authenticated;

revoke all on function public.create_post(
  uuid, text, public.post_status, timestamptz, text, boolean, uuid, jsonb, uuid[]
) from public, anon, authenticated;
revoke all on function public.update_post(
  uuid, bigint, text, public.post_status, timestamptz, text, boolean, uuid, jsonb, uuid[]
) from public, anon, authenticated;
revoke all on function public.delete_post(uuid)
from public, anon, authenticated;
revoke all on function public.delete_posts(uuid[])
from public, anon, authenticated;
revoke all on function public.duplicate_post(uuid)
from public, anon, authenticated;

grant execute on function public.create_post(
  uuid, text, public.post_status, timestamptz, text, boolean, uuid, jsonb, uuid[]
) to authenticated;
grant execute on function public.update_post(
  uuid, bigint, text, public.post_status, timestamptz, text, boolean, uuid, jsonb, uuid[]
) to authenticated;
grant execute on function public.delete_post(uuid) to authenticated;
grant execute on function public.delete_posts(uuid[]) to authenticated;
grant execute on function public.duplicate_post(uuid) to authenticated;

commit;
