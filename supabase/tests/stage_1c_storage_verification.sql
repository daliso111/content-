-- Towkn Stage 1C Storage verification
-- Run sections separately in the SQL Editor. Do not add real identifiers here.

-- 1. Bucket configuration. Expect one private row, 52428800 bytes, and all nine MIME types.
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id = 'postflow-media';

-- 2. Path-helper safety. Malformed values must return null/false rather than throw.
select
  private.storage_object_workspace_id('not-a-uuid/user/2026/08/file.jpg') is null
    as malformed_workspace_returns_null,
  private.storage_object_uploader_id('workspace/not-a-uuid/2026/08/file.jpg') is null
    as malformed_uploader_returns_null,
  private.storage_object_path_is_valid('../unsafe.jpg') is false
    as traversal_is_invalid;

-- 3. Bucket-scoped policy inventory. Expect SELECT, INSERT and DELETE only.
select
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'postflow_media_%'
order by cmd, policyname;

-- 4. Anonymous policy audit. Expect no rows for a dedicated Towkn project.
-- If the project has policies for other buckets, inspect every returned row and
-- confirm neither its USING nor WITH CHECK expression permits postflow-media.
select
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and roles && array['anon', 'public']::name[]
order by policyname;

-- Every value should be true: Towkn policies target authenticated only.
select
  policyname,
  roles = array['authenticated']::name[] as authenticated_only
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'postflow_media_%'
order by policyname;

-- 5. UPDATE audit. Expect no Towkn UPDATE policy.
select count(*) = 0 as no_postflow_update_policy
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'postflow_media_%'
  and cmd = 'UPDATE';

-- 6. Linked-media deletion guard inventory. Expect enabled = O.
select
  trigger_row.tgname,
  trigger_row.tgenabled
from pg_catalog.pg_trigger as trigger_row
where trigger_row.tgrelid = 'public.media_assets'::regclass
  and trigger_row.tgname = 'media_assets_prevent_linked_delete'
  and not trigger_row.tgisinternal;

-- 7. Two-user isolation and role checks (perform through the Storage API).
-- Create two non-production Auth test accounts and two workspaces. Use generated UUIDs
-- in the client or dashboard only; do not save them in this file.
--
-- User A checks:
--   owner: upload to A/<A user>/YYYY/MM/<uuid>-file.jpg; read/sign/delete it.
--   reject upload, read/sign and delete attempts against User B's workspace.
-- User B checks: repeat the corresponding isolation from User A.
--
-- In one shared test workspace, change active membership roles one at a time:
--   owner, administrator, content_manager: upload and delete any unused object.
--   designer: upload; delete own unused object; reject deletion of another uploader's.
--   approver, viewer: read/sign; reject upload and delete.
-- Always remove test objects through the Storage API, never with SQL against
-- storage.objects. Restore memberships and delete test data through normal app/API
-- workflows after verification.
