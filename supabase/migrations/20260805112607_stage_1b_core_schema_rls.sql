begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create type public.workspace_role as enum (
  'owner',
  'administrator',
  'content_manager',
  'designer',
  'approver',
  'viewer'
);

create type public.membership_status as enum (
  'invited',
  'active',
  'suspended'
);

create type public.social_platform as enum (
  'facebook',
  'instagram',
  'linkedin',
  'tiktok',
  'youtube',
  'x'
);

create type public.post_status as enum (
  'draft',
  'pending_approval',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'cancelled'
);

create type public.media_type as enum (
  'image',
  'video',
  'graphic',
  'logo',
  'document'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  business_name text,
  avatar_url text,
  phone text,
  country text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  industry text,
  country text,
  timezone text not null default 'UTC',
  default_language text not null default 'en',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_name_not_empty check (btrim(name) <> ''),
  constraint workspaces_slug_not_empty check (btrim(slug) <> '')
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.workspace_role not null,
  status public.membership_status not null default 'active',
  invited_by uuid references auth.users (id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_members_workspace_user_key unique (workspace_id, user_id)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete restrict,
  assigned_to uuid references auth.users (id) on delete set null,
  caption text not null default '',
  status public.post_status not null default 'draft',
  scheduled_at timestamptz,
  timezone text not null default 'UTC',
  approval_required boolean not null default false,
  published_at timestamptz,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_id_workspace_key unique (id, workspace_id),
  constraint posts_scheduled_time_required check (
    status <> 'scheduled'::public.post_status or scheduled_at is not null
  )
);

create table public.post_platforms (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  workspace_id uuid not null,
  platform public.social_platform not null,
  platform_caption text,
  platform_title text,
  platform_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_platforms_post_workspace_fkey
    foreign key (post_id, workspace_id)
    references public.posts (id, workspace_id)
    on delete cascade,
  constraint post_platforms_post_platform_key unique (post_id, platform),
  constraint post_platforms_settings_object check (
    jsonb_typeof(platform_settings) = 'object'
  )
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  uploaded_by uuid not null references auth.users (id) on delete restrict,
  media_type public.media_type not null,
  file_name text not null,
  storage_bucket text not null default 'postflow-media',
  storage_path text not null,
  mime_type text,
  file_size bigint,
  width integer,
  height integer,
  duration_seconds numeric,
  alt_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_assets_id_workspace_key unique (id, workspace_id),
  constraint media_assets_workspace_path_key unique (workspace_id, storage_path),
  constraint media_assets_file_name_not_empty check (btrim(file_name) <> ''),
  constraint media_assets_storage_path_not_empty check (btrim(storage_path) <> ''),
  constraint media_assets_file_size_valid check (file_size is null or file_size >= 0),
  constraint media_assets_width_valid check (width is null or width > 0),
  constraint media_assets_height_valid check (height is null or height > 0),
  constraint media_assets_duration_valid check (
    duration_seconds is null or duration_seconds >= 0
  ),
  constraint media_assets_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  post_id uuid not null,
  media_asset_id uuid not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint post_media_post_workspace_fkey
    foreign key (post_id, workspace_id)
    references public.posts (id, workspace_id)
    on delete cascade,
  constraint post_media_asset_workspace_fkey
    foreign key (media_asset_id, workspace_id)
    references public.media_assets (id, workspace_id)
    on delete cascade,
  constraint post_media_post_asset_key unique (post_id, media_asset_id),
  constraint post_media_sort_order_valid check (sort_order >= 0)
);

create index workspaces_created_by_idx on public.workspaces (created_by);
create index workspace_members_workspace_id_idx on public.workspace_members (workspace_id);
create index workspace_members_user_id_idx on public.workspace_members (user_id);
create index workspace_members_invited_by_idx on public.workspace_members (invited_by);
create index workspace_members_workspace_user_status_idx
  on public.workspace_members (workspace_id, user_id, status);
create index posts_workspace_id_idx on public.posts (workspace_id);
create index posts_created_by_idx on public.posts (created_by);
create index posts_assigned_to_idx on public.posts (assigned_to);
create index posts_status_idx on public.posts (status);
create index posts_scheduled_at_idx on public.posts (scheduled_at);
create index posts_workspace_status_scheduled_idx
  on public.posts (workspace_id, status, scheduled_at);
create index post_platforms_post_id_idx on public.post_platforms (post_id);
create index post_platforms_workspace_id_idx on public.post_platforms (workspace_id);
create index media_assets_workspace_id_idx on public.media_assets (workspace_id);
create index media_assets_uploaded_by_idx on public.media_assets (uploaded_by);
create index post_media_post_id_idx on public.post_media (post_id);
create index post_media_asset_id_idx on public.post_media (media_asset_id);
create index post_media_workspace_id_idx on public.post_media (workspace_id);

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function private.set_updated_at();

create trigger workspace_members_set_updated_at
before update on public.workspace_members
for each row execute function private.set_updated_at();

create trigger posts_set_updated_at
before update on public.posts
for each row execute function private.set_updated_at();

create trigger post_platforms_set_updated_at
before update on public.post_platforms
for each row execute function private.set_updated_at();

create trigger media_assets_set_updated_at
before update on public.media_assets
for each row execute function private.set_updated_at();

create function private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members as membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'::public.membership_status
  );
$$;

create function private.is_user_workspace_member(
  target_workspace_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members as membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = target_user_id
      and membership.status = 'active'::public.membership_status
  );
$$;

create function private.has_workspace_role(
  target_workspace_id uuid,
  allowed_roles public.workspace_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members as membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'::public.membership_status
      and membership.role = any (allowed_roles)
  );
$$;

create function private.users_share_workspace(other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    other_user_id = (select auth.uid())
    or exists (
      select 1
      from public.workspace_members as mine
      join public.workspace_members as theirs
        on theirs.workspace_id = mine.workspace_id
      where mine.user_id = (select auth.uid())
        and mine.status = 'active'::public.membership_status
        and theirs.user_id = other_user_id
        and theirs.status = 'active'::public.membership_status
    );
$$;

create function private.can_create_content(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_workspace_role(
    target_workspace_id,
    array[
      'owner'::public.workspace_role,
      'administrator'::public.workspace_role,
      'content_manager'::public.workspace_role,
      'designer'::public.workspace_role
    ]
  );
$$;

create function private.can_manage_content(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_workspace_role(
    target_workspace_id,
    array[
      'owner'::public.workspace_role,
      'administrator'::public.workspace_role,
      'content_manager'::public.workspace_role
    ]
  );
$$;

create function private.can_edit_post(target_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.posts as post
    join public.workspace_members as membership
      on membership.workspace_id = post.workspace_id
    where post.id = target_post_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'::public.membership_status
      and (
        membership.role in (
          'owner'::public.workspace_role,
          'administrator'::public.workspace_role,
          'content_manager'::public.workspace_role
        )
        or (
          membership.role = 'designer'::public.workspace_role
          and post.created_by = (select auth.uid())
          and post.status = 'draft'::public.post_status
        )
      )
  );
$$;

create function private.can_delete_post(target_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_edit_post(target_post_id);
$$;

create function private.generate_workspace_slug(workspace_name text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  base_slug text;
begin
  base_slug := lower(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(coalesce(workspace_name, '')),
      '[^a-zA-Z0-9]+',
      '-',
      'g'
    )
  );
  base_slug := pg_catalog.btrim(base_slug, '-');

  if base_slug = '' then
    base_slug := 'workspace';
  end if;

  return pg_catalog.left(base_slug, 48)
    || '-'
    || pg_catalog.substr(
      pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
      1,
      12
    );
end;
$$;

create function private.bootstrap_auth_user(
  target_user_id uuid,
  raw_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_metadata jsonb;
  profile_name text;
  supplied_business_name text;
  initial_workspace_name text;
  new_workspace_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_user_id::text, 0)
  );

  safe_metadata := case
    when pg_catalog.jsonb_typeof(raw_metadata) = 'object' then raw_metadata
    else '{}'::jsonb
  end;
  profile_name := nullif(
    pg_catalog.btrim(coalesce(safe_metadata ->> 'full_name', '')),
    ''
  );
  supplied_business_name := nullif(
    pg_catalog.btrim(coalesce(safe_metadata ->> 'business_name', '')),
    ''
  );
  initial_workspace_name := coalesce(
    supplied_business_name,
    'My Workspace'
  );

  insert into public.profiles (id, full_name, business_name)
  values (target_user_id, profile_name, supplied_business_name)
  on conflict (id) do nothing;

  if not exists (
    select 1
    from public.workspace_members as membership
    where membership.user_id = target_user_id
  ) then
    insert into public.workspaces (name, slug, created_by)
    values (
      initial_workspace_name,
      private.generate_workspace_slug(initial_workspace_name),
      target_user_id
    )
    returning id into new_workspace_id;

    insert into public.workspace_members (
      workspace_id,
      user_id,
      role,
      status,
      joined_at
    )
    values (
      new_workspace_id,
      target_user_id,
      'owner'::public.workspace_role,
      'active'::public.membership_status,
      now()
    )
    on conflict (workspace_id, user_id) do nothing;
  end if;
end;
$$;

create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.bootstrap_auth_user(
    new.id,
    coalesce(new.raw_user_meta_data, '{}'::jsonb)
  );
  return new;
end;
$$;

do $$
declare
  existing_definition text;
begin
  select pg_catalog.pg_get_triggerdef(trigger_row.oid)
  into existing_definition
  from pg_catalog.pg_trigger as trigger_row
  where trigger_row.tgrelid = 'auth.users'::regclass
    and trigger_row.tgname = 'on_auth_user_created'
    and not trigger_row.tgisinternal;

  if existing_definition is not null
     and existing_definition not like '%private.handle_new_auth_user%' then
    raise exception
      'Trigger on_auth_user_created already exists with a different function; inspect it before applying Stage 1B';
  end if;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

do $$
declare
  auth_user record;
begin
  for auth_user in
    select users.id, users.raw_user_meta_data
    from auth.users as users
  loop
    perform private.bootstrap_auth_user(
      auth_user.id,
      coalesce(auth_user.raw_user_meta_data, '{}'::jsonb)
    );
  end loop;
end;
$$;

create function public.create_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  clean_name text;
  new_workspace_id uuid;
begin
  caller_id := (select auth.uid());
  if caller_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  clean_name := pg_catalog.btrim(coalesce(workspace_name, ''));
  if clean_name = '' then
    raise exception 'Workspace name must not be empty' using errcode = '22023';
  end if;

  insert into public.workspaces (name, slug, created_by)
  values (
    clean_name,
    private.generate_workspace_slug(clean_name),
    caller_id
  )
  returning id into new_workspace_id;

  insert into public.workspace_members (
    workspace_id,
    user_id,
    role,
    status,
    joined_at
  )
  values (
    new_workspace_id,
    caller_id,
    'owner'::public.workspace_role,
    'active'::public.membership_status,
    now()
  );

  return new_workspace_id;
end;
$$;

create function private.prevent_workspace_move()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'workspace_id cannot be changed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.prevent_post_creator_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by cannot be changed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.prevent_media_uploader_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.uploaded_by is distinct from old.uploaded_by then
    raise exception 'uploaded_by cannot be changed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.prevent_membership_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id
     or new.user_id is distinct from old.user_id then
    raise exception 'Membership workspace and user cannot be changed'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.protect_last_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  removes_active_owner boolean;
  other_active_owners integer;
begin
  if tg_op = 'DELETE' and pg_catalog.pg_trigger_depth() > 1 then
    return old;
  end if;

  removes_active_owner :=
    old.role = 'owner'::public.workspace_role
    and old.status = 'active'::public.membership_status
    and (
      tg_op = 'DELETE'
      or new.role is distinct from 'owner'::public.workspace_role
      or new.status is distinct from 'active'::public.membership_status
    );

  if removes_active_owner then
    select count(*)
    into other_active_owners
    from public.workspace_members as membership
    where membership.workspace_id = old.workspace_id
      and membership.id <> old.id
      and membership.role = 'owner'::public.workspace_role
      and membership.status = 'active'::public.membership_status;

    if other_active_owners = 0 then
      raise exception 'A workspace must retain at least one active owner'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger workspace_members_identity_immutable
before update on public.workspace_members
for each row execute function private.prevent_membership_identity_change();

create trigger workspace_members_protect_last_owner
before update or delete on public.workspace_members
for each row execute function private.protect_last_workspace_owner();

create trigger posts_workspace_immutable
before update on public.posts
for each row execute function private.prevent_workspace_move();

create trigger posts_creator_immutable
before update on public.posts
for each row execute function private.prevent_post_creator_change();

create trigger post_platforms_workspace_immutable
before update on public.post_platforms
for each row execute function private.prevent_workspace_move();

create trigger media_assets_workspace_immutable
before update on public.media_assets
for each row execute function private.prevent_workspace_move();

create trigger media_assets_uploader_immutable
before update on public.media_assets
for each row execute function private.prevent_media_uploader_change();

create trigger post_media_workspace_immutable
before update on public.post_media
for each row execute function private.prevent_workspace_move();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.posts enable row level security;
alter table public.post_platforms enable row level security;
alter table public.media_assets enable row level security;
alter table public.post_media enable row level security;

create policy profiles_select_shared_workspace
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or private.users_share_workspace(id)
);

create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (id = (select auth.uid()));

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy profiles_delete_denied
on public.profiles
for delete
to authenticated
using (false);

create policy workspaces_select_active_members
on public.workspaces
for select
to authenticated
using (private.is_workspace_member(id));

create policy workspaces_insert_via_rpc_only
on public.workspaces
for insert
to authenticated
with check (false);

create policy workspaces_update_owner_admin
on public.workspaces
for update
to authenticated
using (
  private.has_workspace_role(
    id,
    array[
      'owner'::public.workspace_role,
      'administrator'::public.workspace_role
    ]
  )
)
with check (
  private.has_workspace_role(
    id,
    array[
      'owner'::public.workspace_role,
      'administrator'::public.workspace_role
    ]
  )
);

create policy workspaces_delete_owner
on public.workspaces
for delete
to authenticated
using (
  private.has_workspace_role(
    id,
    array['owner'::public.workspace_role]
  )
);

create policy workspace_members_select_active_members
on public.workspace_members
for select
to authenticated
using (private.is_workspace_member(workspace_id));

create policy workspace_members_insert_denied
on public.workspace_members
for insert
to authenticated
with check (false);

create policy workspace_members_update_denied
on public.workspace_members
for update
to authenticated
using (false)
with check (false);

create policy workspace_members_delete_denied
on public.workspace_members
for delete
to authenticated
using (false);

create policy posts_select_active_members
on public.posts
for select
to authenticated
using (private.is_workspace_member(workspace_id));

create policy posts_insert_content_creators
on public.posts
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and private.can_create_content(workspace_id)
  and (
    assigned_to is null
    or private.is_user_workspace_member(workspace_id, assigned_to)
  )
);

create policy posts_update_authorized_editors
on public.posts
for update
to authenticated
using (private.can_edit_post(id))
with check (
  (
    private.can_manage_content(workspace_id)
    or (
      private.has_workspace_role(
        workspace_id,
        array['designer'::public.workspace_role]
      )
      and created_by = (select auth.uid())
      and status = 'draft'::public.post_status
    )
  )
  and (
    assigned_to is null
    or private.is_user_workspace_member(workspace_id, assigned_to)
  )
);

create policy posts_delete_authorized_editors
on public.posts
for delete
to authenticated
using (private.can_delete_post(id));

create policy post_platforms_select_active_members
on public.post_platforms
for select
to authenticated
using (private.is_workspace_member(workspace_id));

create policy post_platforms_insert_post_editors
on public.post_platforms
for insert
to authenticated
with check (private.can_edit_post(post_id));

create policy post_platforms_update_post_editors
on public.post_platforms
for update
to authenticated
using (private.can_edit_post(post_id))
with check (private.can_edit_post(post_id));

create policy post_platforms_delete_post_editors
on public.post_platforms
for delete
to authenticated
using (private.can_edit_post(post_id));

create policy media_assets_select_active_members
on public.media_assets
for select
to authenticated
using (private.is_workspace_member(workspace_id));

create policy media_assets_insert_content_creators
on public.media_assets
for insert
to authenticated
with check (
  uploaded_by = (select auth.uid())
  and private.can_create_content(workspace_id)
);

create policy media_assets_update_authorized_editors
on public.media_assets
for update
to authenticated
using (
  private.can_manage_content(workspace_id)
  or (
    private.has_workspace_role(
      workspace_id,
      array['designer'::public.workspace_role]
    )
    and uploaded_by = (select auth.uid())
  )
)
with check (
  private.can_manage_content(workspace_id)
  or (
    private.has_workspace_role(
      workspace_id,
      array['designer'::public.workspace_role]
    )
    and uploaded_by = (select auth.uid())
  )
);

create policy media_assets_delete_authorized_editors
on public.media_assets
for delete
to authenticated
using (
  private.can_manage_content(workspace_id)
  or (
    private.has_workspace_role(
      workspace_id,
      array['designer'::public.workspace_role]
    )
    and uploaded_by = (select auth.uid())
  )
);

create policy post_media_select_active_members
on public.post_media
for select
to authenticated
using (private.is_workspace_member(workspace_id));

create policy post_media_insert_post_editors
on public.post_media
for insert
to authenticated
with check (private.can_edit_post(post_id));

create policy post_media_update_post_editors
on public.post_media
for update
to authenticated
using (private.can_edit_post(post_id))
with check (private.can_edit_post(post_id));

create policy post_media_delete_post_editors
on public.post_media
for delete
to authenticated
using (private.can_edit_post(post_id));

revoke all on table
  public.profiles,
  public.workspaces,
  public.workspace_members,
  public.posts,
  public.post_platforms,
  public.media_assets,
  public.post_media
from public, anon;

grant select, insert, update, delete on table
  public.profiles,
  public.workspaces,
  public.workspace_members,
  public.posts,
  public.post_platforms,
  public.media_assets,
  public.post_media
to authenticated;

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.is_workspace_member(uuid) from public, anon, authenticated;
revoke all on function private.is_user_workspace_member(uuid, uuid) from public, anon, authenticated;
revoke all on function private.has_workspace_role(uuid, public.workspace_role[]) from public, anon, authenticated;
revoke all on function private.users_share_workspace(uuid) from public, anon, authenticated;
revoke all on function private.can_create_content(uuid) from public, anon, authenticated;
revoke all on function private.can_manage_content(uuid) from public, anon, authenticated;
revoke all on function private.can_edit_post(uuid) from public, anon, authenticated;
revoke all on function private.can_delete_post(uuid) from public, anon, authenticated;
revoke all on function private.generate_workspace_slug(text) from public, anon, authenticated;
revoke all on function private.bootstrap_auth_user(uuid, jsonb) from public, anon, authenticated;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
revoke all on function private.prevent_workspace_move() from public, anon, authenticated;
revoke all on function private.prevent_post_creator_change() from public, anon, authenticated;
revoke all on function private.prevent_media_uploader_change() from public, anon, authenticated;
revoke all on function private.prevent_membership_identity_change() from public, anon, authenticated;
revoke all on function private.protect_last_workspace_owner() from public, anon, authenticated;

grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.is_user_workspace_member(uuid, uuid) to authenticated;
grant execute on function private.has_workspace_role(uuid, public.workspace_role[]) to authenticated;
grant execute on function private.users_share_workspace(uuid) to authenticated;
grant execute on function private.can_create_content(uuid) to authenticated;
grant execute on function private.can_manage_content(uuid) to authenticated;
grant execute on function private.can_edit_post(uuid) to authenticated;
grant execute on function private.can_delete_post(uuid) to authenticated;

revoke all on function public.create_workspace(text) from public, anon, authenticated;
grant execute on function public.create_workspace(text) to authenticated;

revoke create on schema public from public, anon, authenticated;

commit;
