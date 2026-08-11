-- Towkn Stage 1D post CRUD verification
--
-- Run each numbered section separately. Sections 1-4 are read-only catalog
-- checks. Section 5 performs rollback-only behavior checks and must be run
-- only against a non-production project with an active owner membership.
-- Never replace the automatic test-account selection with credentials or
-- commit user IDs, emails, passwords, tokens, or keys to this file.

-- 1. Revision column, default, constraint, and validation trigger inventory.
select
  column_name,
  data_type,
  column_default,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'posts'
  and column_name = 'revision';

select
  constraint_row.conname,
  pg_catalog.pg_get_constraintdef(constraint_row.oid) as definition
from pg_catalog.pg_constraint as constraint_row
where constraint_row.conrelid = 'public.posts'::regclass
  and constraint_row.conname = 'posts_revision_positive';

select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name in (
    'posts_revision_increment',
    'posts_rpc_write_required',
    'post_platforms_rpc_write_required',
    'post_media_rpc_write_required',
    'posts_identity_immutable',
    'posts_browser_write_guard',
    'posts_validate_final_state',
    'post_platforms_validate_final_state',
    'post_media_validate_final_state'
  )
order by trigger_name, event_manipulation;

-- 2. RPC security inventory.
-- security_invoker must be true, safe_search_path must be true, anon false,
-- and authenticated true for every row.
select
  procedure_row.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(procedure_row.oid) as arguments,
  not procedure_row.prosecdef as security_invoker,
  coalesce(procedure_row.proconfig @> array['search_path='], false) as safe_search_path,
  has_function_privilege(
    'anon',
    procedure_row.oid,
    'EXECUTE'
  ) as anon_can_execute,
  has_function_privilege(
    'authenticated',
    procedure_row.oid,
    'EXECUTE'
  ) as authenticated_can_execute
from pg_catalog.pg_proc as procedure_row
join pg_catalog.pg_namespace as namespace_row
  on namespace_row.oid = procedure_row.pronamespace
where namespace_row.nspname = 'public'
  and procedure_row.proname in (
    'create_post',
    'update_post',
    'delete_post',
    'delete_posts',
    'duplicate_post'
  )
order by procedure_row.proname;

-- 3. Anonymous privilege verification.
-- Every value must be false. Do not grant table access to anon to make a
-- denied query return zero rows; table privileges and RLS are separate locks.
select
  table_name,
  has_table_privilege('anon', format('%I.%I', 'public', table_name), 'SELECT') as can_select,
  has_table_privilege('anon', format('%I.%I', 'public', table_name), 'INSERT') as can_insert,
  has_table_privilege('anon', format('%I.%I', 'public', table_name), 'UPDATE') as can_update,
  has_table_privilege('anon', format('%I.%I', 'public', table_name), 'DELETE') as can_delete
from (
  values ('posts'), ('post_platforms'), ('post_media'), ('media_assets')
) as protected_tables(table_name)
order by table_name;

-- 4. Test-data readiness without exposing account identifiers.
-- Use a non-production project. Owner must be at least 1. Additional roles and
-- two workspaces/media rows are needed for the full manual role/isolation pass.
select role, count(*) as active_memberships
from public.workspace_members
where status = 'active'::public.membership_status
group by role
order by role;

select
  count(distinct workspace_id) as workspace_count,
  count(*) as media_asset_count
from public.media_assets;

-- 5. Rollback-only owner behavior checks.
-- Run this whole section in one query. It automatically impersonates an active
-- owner through local JWT claims, changes no auth records, and rolls everything
-- back. If no owner exists, run ROLLBACK by itself after the expected error.
begin;

create temporary table stage_1d_test_context on commit drop as
select
  membership.user_id,
  membership.workspace_id,
  (
    select pg_catalog.array_agg(local_asset.id order by local_asset.created_at)
    from (
      select asset.id, asset.created_at
      from public.media_assets as asset
      where asset.workspace_id = membership.workspace_id
      order by asset.created_at
      limit 2
    ) as local_asset
  ) as local_media_ids,
  (
    select asset.id
    from public.media_assets as asset
    where asset.workspace_id <> membership.workspace_id
    order by asset.created_at
    limit 1
  ) as foreign_media_id,
  (
    select post.id
    from public.posts as post
    where post.workspace_id <> membership.workspace_id
    order by post.created_at
    limit 1
  ) as foreign_post_id
from public.workspace_members as membership
where membership.role = 'owner'::public.workspace_role
  and membership.status = 'active'::public.membership_status
order by membership.created_at
limit 1;

grant select on table pg_temp.stage_1d_test_context to authenticated;

do $$
declare
  test_user_id uuid;
begin
  select context_row.user_id into test_user_id
  from pg_temp.stage_1d_test_context as context_row;
  if test_user_id is null then
    raise exception 'A non-production active owner is required for Stage 1D behavior checks';
  end if;
  perform pg_catalog.set_config('request.jwt.claim.sub', test_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

set local role authenticated;

do $$
declare
  test_workspace_id uuid;
  local_media_ids uuid[];
  foreign_media_id uuid;
  foreign_post_id uuid;
  draft_post public.posts%rowtype;
  updated_post public.posts%rowtype;
  scheduled_post public.posts%rowtype;
  duplicate_id uuid;
  before_count bigint;
  relation_count bigint;
begin
  select
    context_row.workspace_id,
    coalesce(context_row.local_media_ids, array[]::uuid[]),
    context_row.foreign_media_id,
    context_row.foreign_post_id
  into test_workspace_id, local_media_ids, foreign_media_id, foreign_post_id
  from pg_temp.stage_1d_test_context as context_row;

  -- Valid empty draft, revision 1, and ordered optional media relationships.
  draft_post := public.create_post(
    test_workspace_id,
    '',
    'draft'::public.post_status,
    null,
    'UTC',
    false,
    null,
    '[{"platform":"facebook","platform_caption":"Stage 1D draft"}]'::jsonb,
    local_media_ids
  );
  if draft_post.revision <> 1 then
    raise exception 'New post revision should be 1';
  end if;
  if pg_catalog.cardinality(local_media_ids) > 0 and exists (
    select 1
    from public.post_media as relation
    where relation.post_id = draft_post.id
      and relation.sort_order <> pg_catalog.array_position(local_media_ids, relation.media_asset_id) - 1
  ) then
    raise exception 'Media sort order was not preserved';
  end if;

  -- Successful optimistic update increments to 2.
  updated_post := public.update_post(
    draft_post.id,
    1,
    'Updated once',
    'draft'::public.post_status,
    null,
    'UTC',
    false,
    null,
    '[{"platform":"linkedin"}]'::jsonb,
    local_media_ids
  );
  if updated_post.revision <> 2 then
    raise exception 'Successful update should increment revision to 2';
  end if;
  select count(*) into relation_count
  from public.post_platforms as platform_row
  where platform_row.post_id = draft_post.id;
  if relation_count <> 1 then
    raise exception 'Platform rows were not replaced atomically';
  end if;

  -- A stale revision must fail and preserve the successful value.
  begin
    perform public.update_post(
      draft_post.id, 1, 'Stale overwrite', 'draft'::public.post_status,
      null, 'UTC', false, null, '[]'::jsonb, array[]::uuid[]
    );
    raise exception 'Expected a revision conflict';
  exception when sqlstate '40001' then
    null;
  end;
  if not exists (
    select 1 from public.posts as post
    where post.id = draft_post.id and post.caption = 'Updated once' and post.revision = 2
  ) then
    raise exception 'Revision conflict changed the post';
  end if;

  -- Direct post and child mutations are denied outside the RPC write context.
  begin
    update public.posts set revision = 900 where id = draft_post.id;
    raise exception 'Expected direct post update rejection';
  exception when insufficient_privilege then null;
  end;
  if (select post.revision from public.posts as post where post.id = draft_post.id) <> 2 then
    raise exception 'Rejected direct update changed the revision';
  end if;
  begin
    insert into public.post_platforms (
      post_id, workspace_id, platform, platform_settings
    ) values (
      draft_post.id, test_workspace_id, 'x'::public.social_platform, '{}'::jsonb
    );
    raise exception 'Expected direct child insert rejection';
  exception when insufficient_privilege then null;
  end;

  -- Immutable identity changes must fail.
  begin
    update public.posts set created_by = pg_catalog.gen_random_uuid() where id = draft_post.id;
    raise exception 'Expected created_by immutability failure';
  exception when check_violation or insufficient_privilege then null;
  end;
  begin
    update public.posts set created_at = created_at - interval '1 day' where id = draft_post.id;
    raise exception 'Expected created_at immutability failure';
  exception when check_violation or insufficient_privilege then null;
  end;
  begin
    update public.posts set workspace_id = pg_catalog.gen_random_uuid() where id = draft_post.id;
    raise exception 'Expected workspace immutability failure';
  exception when check_violation or insufficient_privilege then null;
  end;

  -- Malformed and duplicate platform input must roll back its entire call.
  select count(*) into before_count from public.posts;
  begin
    perform public.create_post(
      test_workspace_id, 'Invalid platforms', 'draft'::public.post_status,
      null, 'UTC', false, null,
      '[{"platform":"facebook"},{"platform":"facebook"}]'::jsonb,
      array[]::uuid[]
    );
    raise exception 'Expected duplicate platform rejection';
  exception when invalid_parameter_value then null;
  end;
  if (select count(*) from public.posts) <> before_count then
    raise exception 'Invalid platform input left a partial post';
  end if;

  -- Missing and cross-workspace media must roll back the entire call.
  begin
    perform public.create_post(
      test_workspace_id, 'Missing media', 'draft'::public.post_status,
      null, 'UTC', false, null, '[]'::jsonb,
      array[pg_catalog.gen_random_uuid()]
    );
    raise exception 'Expected missing media rejection';
  exception when invalid_parameter_value then null;
  end;
  if foreign_media_id is not null then
    begin
      perform public.create_post(
        test_workspace_id, 'Cross-workspace media', 'draft'::public.post_status,
        null, 'UTC', false, null, '[]'::jsonb, array[foreign_media_id]
      );
      raise exception 'Expected cross-workspace media rejection';
    exception when invalid_parameter_value then null;
    end;
  else
    raise notice 'Cross-workspace media check skipped: no foreign media exists';
  end if;

  -- Invalid schedules: no platform, no content, and a past timestamp.
  begin
    perform public.create_post(
      test_workspace_id, 'No platform', 'scheduled'::public.post_status,
      pg_catalog.now() + interval '1 day', 'UTC', false, null,
      '[]'::jsonb, array[]::uuid[]
    );
    raise exception 'Expected missing platform rejection';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_post(
      test_workspace_id, '', 'scheduled'::public.post_status,
      pg_catalog.now() + interval '1 day', 'UTC', false, null,
      '[{"platform":"facebook"}]'::jsonb, array[]::uuid[]
    );
    raise exception 'Expected missing content rejection';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_post(
      test_workspace_id, 'Past schedule', 'scheduled'::public.post_status,
      pg_catalog.now() - interval '1 day', 'UTC', false, null,
      '[{"platform":"facebook"}]'::jsonb, array[]::uuid[]
    );
    raise exception 'Expected past schedule rejection';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_post(
      test_workspace_id, 'Cancelled with schedule', 'cancelled'::public.post_status,
      pg_catalog.now() + interval '1 day', 'UTC', false, null,
      '[{"platform":"facebook"}]'::jsonb, array[]::uuid[]
    );
    raise exception 'Expected cancelled schedule rejection';
  exception when invalid_parameter_value then null;
  end;

  -- Valid schedule and duplicate invariants.
  scheduled_post := public.create_post(
    test_workspace_id, 'Valid schedule', 'scheduled'::public.post_status,
    pg_catalog.now() + interval '1 day', 'UTC', false, null,
    '[{"platform":"facebook"}]'::jsonb, local_media_ids
  );
  duplicate_id := public.duplicate_post(scheduled_post.id);
  if not exists (
    select 1 from public.posts as post
    where post.id = duplicate_id
      and post.id <> scheduled_post.id
      and post.status = 'draft'::public.post_status
      and post.revision = 1
      and post.scheduled_at is null
      and post.published_at is null
      and post.failure_message is null
  ) then
    raise exception 'Duplicate post invariants failed';
  end if;
  if (select count(*) from public.post_platforms where post_id = duplicate_id)
     <> (select count(*) from public.post_platforms where post_id = scheduled_post.id) then
    raise exception 'Duplicate platform relationships do not match';
  end if;
  if (select count(*) from public.post_media where post_id = duplicate_id)
     <> (select count(*) from public.post_media where post_id = scheduled_post.id) then
    raise exception 'Duplicate media relationships do not match';
  end if;

  -- Delete cascades child rows but preserves referenced media assets.
  perform public.delete_post(duplicate_id);
  if exists (select 1 from public.post_platforms where post_id = duplicate_id)
     or exists (select 1 from public.post_media where post_id = duplicate_id) then
    raise exception 'Post deletion did not cascade child relationships';
  end if;
  if exists (
    select 1 from pg_catalog.unnest(local_media_ids) as expected(media_id)
    where not exists (
      select 1 from public.media_assets as asset where asset.id = expected.media_id
    )
  ) then
    raise exception 'Post deletion removed a media asset';
  end if;

  -- Bulk deletion must reject an inaccessible ID before deleting a valid ID.
  if foreign_post_id is not null then
    begin
      perform public.delete_posts(array[draft_post.id, foreign_post_id]);
      raise exception 'Expected atomic bulk delete rejection';
    exception
      when no_data_found or insufficient_privilege then null;
    end;
    if not exists (select 1 from public.posts where id = draft_post.id) then
      raise exception 'Bulk delete partially removed an authorized post';
    end if;
  else
    raise notice 'Unauthorized bulk-delete check skipped: no foreign post exists';
  end if;

  raise notice 'Stage 1D owner behavior checks passed; all changes will be rolled back';
end;
$$;

rollback;

-- 6. Role matrix and two-user isolation.
-- Run these separately with real non-production Auth sessions through the app
-- or Supabase client. Confirm the following database-enforced outcomes:
-- owner/administrator/content_manager: create, edit, schedule, duplicate, delete
-- designer: create drafts, edit/delete own drafts, duplicate to a draft; no schedule
-- approver/viewer: reads only; every mutation RPC denied
-- second workspace: its posts and media are absent from reads and rejected by RPCs
-- Keep every SQL mutation test in BEGIN/ROLLBACK and never use a linked db reset.
