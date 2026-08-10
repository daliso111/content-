-- Stage 1B RLS verification
--
-- Run the catalog checks and anonymous section directly in the Supabase SQL
-- Editor. Use two real accounts created through Supabase Auth for the user and
-- role sections. Never place passwords, access tokens, or production user IDs
-- in this file. Keep every mutation test inside a transaction and roll it back.

-- 1. Schema inventory: expect seven rows, all with RLS enabled.
select
  namespace.nspname as schema_name,
  relation.relname as table_name,
  relation.relrowsecurity as rls_enabled
from pg_catalog.pg_class as relation
join pg_catalog.pg_namespace as namespace
  on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relname in (
    'profiles',
    'workspaces',
    'workspace_members',
    'posts',
    'post_platforms',
    'media_assets',
    'post_media'
  )
order by relation.relname;

-- 2. Enum inventory: expect all five enum names and their required values.
select
  type_namespace.nspname as schema_name,
  enum_type.typname as enum_name,
  enum_value.enumlabel as enum_value
from pg_catalog.pg_type as enum_type
join pg_catalog.pg_namespace as type_namespace
  on type_namespace.oid = enum_type.typnamespace
join pg_catalog.pg_enum as enum_value
  on enum_value.enumtypid = enum_type.oid
where type_namespace.nspname = 'public'
  and enum_type.typname in (
    'workspace_role',
    'membership_status',
    'social_platform',
    'post_status',
    'media_type'
  )
order by enum_type.typname, enum_value.enumsortorder;

-- 3. Policy inventory: expect SELECT, INSERT, UPDATE and DELETE coverage for
-- each table. Denied membership writes and profile deletion deliberately use
-- false policy expressions.
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles',
    'workspaces',
    'workspace_members',
    'posts',
    'post_platforms',
    'media_assets',
    'post_media'
  )
order by tablename, cmd, policyname;

-- 4. Security-definer audit: every definer function must show search_path="".
select
  namespace.nspname as schema_name,
  procedure.proname as function_name,
  procedure.prosecdef as security_definer,
  procedure.proconfig as function_config
from pg_catalog.pg_proc as procedure
join pg_catalog.pg_namespace as namespace
  on namespace.oid = procedure.pronamespace
where namespace.nspname in ('private', 'public')
  and procedure.proname in (
    'is_workspace_member',
    'is_user_workspace_member',
    'has_workspace_role',
    'users_share_workspace',
    'can_create_content',
    'can_manage_content',
    'can_edit_post',
    'can_delete_post',
    'generate_workspace_slug',
    'bootstrap_auth_user',
    'handle_new_auth_user',
    'protect_last_workspace_owner',
    'create_workspace'
  )
order by namespace.nspname, procedure.proname;

-- 5. Bootstrap audit. Run as a trusted SQL Editor administrator. Expect every
-- auth user to have a profile; users without prior memberships should have one
-- active owner membership after the migration.
select
  auth_user.id as user_id,
  (profile.id is not null) as profile_exists,
  count(membership.id) filter (
    where membership.status = 'active'::public.membership_status
  ) as active_memberships,
  count(membership.id) filter (
    where membership.status = 'active'::public.membership_status
      and membership.role = 'owner'::public.workspace_role
  ) as active_owner_memberships
from auth.users as auth_user
left join public.profiles as profile on profile.id = auth_user.id
left join public.workspace_members as membership
  on membership.user_id = auth_user.id
group by auth_user.id, profile.id
order by auth_user.id;

-- 6. Anonymous privilege verification.
-- Every value should be false. The anon role must not have direct table access.

select
  table_name,
  has_table_privilege(
    'anon',
    format('%I.%I', 'public', table_name),
    'SELECT'
  ) as can_select,
  has_table_privilege(
    'anon',
    format('%I.%I', 'public', table_name),
    'INSERT'
  ) as can_insert,
  has_table_privilege(
    'anon',
    format('%I.%I', 'public', table_name),
    'UPDATE'
  ) as can_update,
  has_table_privilege(
    'anon',
    format('%I.%I', 'public', table_name),
    'DELETE'
  ) as can_delete
from (
  values
    ('profiles'),
    ('workspaces'),
    ('workspace_members'),
    ('posts'),
    ('post_platforms'),
    ('media_assets'),
    ('post_media')
) as protected_tables(table_name)
order by table_name;

-- 7. Two-user isolation template.
--
-- In one SQL Editor execution, set session-only values using two real Auth user
-- UUIDs and their unrelated workspace UUIDs. Do not save those values here:
--
-- select set_config('stage1b.user_a_id', '<USER_A_UUID>', false);
-- select set_config('stage1b.user_b_id', '<USER_B_UUID>', false);
-- select set_config('stage1b.workspace_a_id', '<WORKSPACE_A_UUID>', false);
-- select set_config('stage1b.workspace_b_id', '<WORKSPACE_B_UUID>', false);
--
-- Then run User A's checks in the same session:
--
-- begin;
-- set local role authenticated;
-- select set_config(
--   'request.jwt.claim.sub',
--   current_setting('stage1b.user_a_id'),
--   true
-- );
-- select * from public.profiles
--   where id = current_setting('stage1b.user_a_id')::uuid;
-- select * from public.workspaces;
-- select * from public.workspace_members;
-- select count(*) as unrelated_workspace_visible
--   from public.workspaces
--   where id = current_setting('stage1b.workspace_b_id')::uuid;
-- select count(*) as unrelated_posts_visible
--   from public.posts
--   where workspace_id = current_setting('stage1b.workspace_b_id')::uuid;
-- select count(*) as unrelated_media_visible
--   from public.media_assets
--   where workspace_id = current_setting('stage1b.workspace_b_id')::uuid;
-- rollback;
--
-- Repeat with request.jwt.claim.sub set to User B. Each unrelated count must be
-- zero. Attempting to insert a post with the other workspace ID must fail RLS.

-- 8. Role matrix, using real test memberships configured by a trusted SQL
-- Editor administrator. Restore the original membership roles afterward.
--
-- owner: update their workspace name; deletion is permitted but should only be
-- tested on a disposable workspace created by public.create_workspace().
-- administrator: update workspace settings; direct membership writes remain denied.
-- content_manager: insert and update posts in their workspace.
-- designer: insert a draft, update/delete that draft, then verify another
-- designer's post and every non-draft post cannot be changed.
-- approver: SELECT succeeds; post INSERT and UPDATE fail.
-- viewer: SELECT succeeds; all post and media writes fail.
-- every role: changing posts.workspace_id, posts.created_by,
-- media_assets.workspace_id, or media_assets.uploaded_by must fail.

-- 9. Last-owner protection, tested only in a rollback transaction with at least
-- one disposable workspace. Updating, suspending, or deleting its sole active
-- owner membership must raise an error. Add a second active owner and repeat to
-- confirm a future ownership transfer remains possible.
