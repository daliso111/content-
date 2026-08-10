-- PostFlow Stage 3A verification. Run each numbered section separately.
-- Mutation templates require disposable authenticated users and always roll back.

-- 1. Enum inventory. Expected: every value from the Stage 3A specification.
select type_row.typname, enum_row.enumlabel, enum_row.enumsortorder
from pg_type as type_row
join pg_enum as enum_row on enum_row.enumtypid = type_row.oid
where type_row.typname in (
  'approval_request_status', 'approval_event_type', 'approval_comment_type'
)
order by type_row.typname, enum_row.enumsortorder;

-- 2. Table, RLS, constraint and index inventory.
select table_row.relname as table_name, table_row.relrowsecurity as rls_enabled
from pg_class as table_row
join pg_namespace as schema_row on schema_row.oid = table_row.relnamespace
where schema_row.nspname = 'public'
  and table_row.relname in ('approval_requests','approval_comments','approval_events')
order by table_row.relname;

select constraint_row.conrelid::regclass as table_name,
  constraint_row.conname, constraint_row.contype,
  pg_get_constraintdef(constraint_row.oid) as definition
from pg_constraint as constraint_row
where constraint_row.conrelid in (
  'public.approval_requests'::regclass,
  'public.approval_comments'::regclass,
  'public.approval_events'::regclass
)
order by constraint_row.conrelid::regclass::text, constraint_row.conname;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('approval_requests','approval_comments','approval_events')
order by tablename, indexname;

-- Expected partial unique index predicate: status = 'pending'.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname = 'approval_requests_one_pending_post_idx';

-- 3. RLS policy inventory. Expected: SELECT-only member policies.
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('approval_requests','approval_comments','approval_events')
order by tablename, policyname;

-- 4. Anonymous and authenticated table grants.
-- Expected: every anon value false. Authenticated SELECT true and every write false.
select table_name,
  has_table_privilege('anon', format('%I.%I','public',table_name), 'SELECT') as anon_select,
  has_table_privilege('anon', format('%I.%I','public',table_name), 'INSERT') as anon_insert,
  has_table_privilege('authenticated', format('%I.%I','public',table_name), 'SELECT') as authenticated_select,
  has_table_privilege('authenticated', format('%I.%I','public',table_name), 'INSERT') as authenticated_insert,
  has_table_privilege('authenticated', format('%I.%I','public',table_name), 'UPDATE') as authenticated_update,
  has_table_privilege('authenticated', format('%I.%I','public',table_name), 'DELETE') as authenticated_delete
from (values ('approval_requests'),('approval_comments'),('approval_events')) as protected(table_name)
order by table_name;

-- 5. RPC grants. Expected: anon_execute false, authenticated_execute true.
select function_name,
  has_function_privilege('anon', function_signature, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', function_signature, 'EXECUTE') as authenticated_execute
from (values
  ('submit_post_for_approval', 'public.submit_post_for_approval(uuid,bigint,uuid,text,timestamptz)'),
  ('approve_post', 'public.approve_post(uuid,text)'),
  ('request_post_changes', 'public.request_post_changes(uuid,text)'),
  ('reject_post', 'public.reject_post(uuid,text)'),
  ('withdraw_approval_request', 'public.withdraw_approval_request(uuid,text)'),
  ('reassign_approval_request', 'public.reassign_approval_request(uuid,uuid,text)'),
  ('add_approval_comment', 'public.add_approval_comment(uuid,text)'),
  ('change_approval_deadline', 'public.change_approval_deadline(uuid,timestamptz,text)')
) as rpc(function_name, function_signature)
order by function_name;

-- 6. Function security audit. Expected: fixed empty search_path and SECURITY DEFINER.
select namespace_row.nspname as schema_name, function_row.proname,
  pg_get_function_identity_arguments(function_row.oid) as arguments,
  function_row.prosecdef as security_definer,
  function_row.proconfig
from pg_proc as function_row
join pg_namespace as namespace_row on namespace_row.oid = function_row.pronamespace
where namespace_row.nspname in ('public','private')
  and function_row.proname in (
    'submit_post_for_approval','approve_post','request_post_changes','reject_post',
    'withdraw_approval_request','reassign_approval_request','add_approval_comment',
    'change_approval_deadline','has_valid_post_approval',
    'invalidate_post_approval_for_edit'
  )
order by schema_name, function_row.proname;

-- 7. Safe event metadata audit. Expected: all values zero.
select
  count(*) filter(where jsonb_typeof(metadata) <> 'object') as invalid_metadata,
  count(*) filter(where metadata::text ~* 'access.?token|authorization|service.?role|refresh.?token|jwt') as sensitive_metadata,
  count(*) filter(where char_length(coalesce(message,'')) > 5000) as oversized_messages
from public.approval_events;

-- 8. Revision consistency audit.
-- stale_pending should be zero because edits supersede pending requests transactionally.
select
  count(*) filter(where request.status = 'pending' and request.post_revision <> post.revision) as stale_pending,
  count(*) filter(where request.status = 'pending' and post.status <> 'pending_approval') as pending_status_mismatch,
  count(*) filter(where request.status = 'approved' and request.post_revision = post.revision) as currently_valid_approvals
from public.approval_requests as request
join public.posts as post on post.id = request.post_id and post.workspace_id = request.workspace_id;

-- 9. Publishing protection audit.
-- invalid_approval_required_jobs must be zero.
select count(*) as invalid_approval_required_jobs
from public.publishing_jobs as job
join public.posts as post on post.id = job.post_id
where post.approval_required
  and not exists(
    select 1 from public.approval_requests as request
    where request.post_id = job.post_id
      and request.post_revision = job.post_revision
      and request.status = 'approved'
  );

-- 10. Two-user submission/role matrix template (rollback only).
-- Replace placeholders only in a private SQL session with disposable IDs.
-- Run one role scenario at a time so an intentional error does not hide later checks.
--
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims',
--   jsonb_build_object('sub','DISPOSABLE-CREATOR-UUID','role','authenticated')::text,
--   true
-- );
-- select public.submit_post_for_approval(
--   'DISPOSABLE-DRAFT-POST-UUID', 1, 'DISPOSABLE-APPROVER-UUID',
--   'Please review this revision.', now() + interval '2 days'
-- );
-- select status, revision from public.posts where id = 'DISPOSABLE-DRAFT-POST-UUID';
-- select post_revision, status, requested_by, assigned_approver_id
-- from public.approval_requests where post_id = 'DISPOSABLE-DRAFT-POST-UUID';
-- rollback;

-- 11. Self-approval, wrong-workspace, inactive-member and invalid-role templates.
-- Each call must fail and its transaction must be rolled back independently:
-- * requester assigned as approver -> SELF_APPROVAL_DENIED
-- * post creator assigned as approver -> SELF_APPROVAL_DENIED
-- * other-workspace member -> APPROVER_WRONG_WORKSPACE
-- * suspended member -> APPROVER_WRONG_WORKSPACE
-- * content_manager/designer/viewer -> APPROVER_ROLE_INVALID

-- 12. Decision templates.
-- As the assigned disposable approver, approve a pending request and verify:
-- request.status = approved, resolved_by/resolved_at are populated, the approved
-- event exists, post revision is unchanged, and post status is approved or scheduled.
-- Repeating approve_post must fail with APPROVAL_ALREADY_RESOLVED.
-- Repeat with new disposable requests for request_post_changes and reject_post;
-- verify required messages, typed comments/events, draft status, and unchanged media.
-- Always rollback each scenario.

-- 13. Stale approval template.
-- Submit revision 1, call update_post with expected revision 1, then verify the
-- request is superseded, the post is draft revision 2, and the superseded event
-- exists. request_publish_now for revision 2 must fail with
-- PUBLISHING_BLOCKED_APPROVAL_REQUIRED until revision 2 is approved. Roll back.

-- 14. Comment immutability template.
-- add_approval_comment as a Workspace A member must use auth.uid() as author_id.
-- Empty and Workspace B requests must fail. Direct INSERT/UPDATE/DELETE against
-- approval_comments and all writes against approval_events must be denied.

-- 15. Deletion protection template.
-- In a disposable transaction, create an approval request and call delete_post.
-- Expected: "This post has approval history and cannot be permanently deleted."
-- The request, comments, events, post and media must remain. Always rollback.
