-- Towkn Stage 3B verification
-- Run one numbered section at a time in Supabase SQL Editor.
-- Sections 1-8 are read-only. Section 9 is a documented rollback-test template.

-- 1. Required enum inventory. Each required value should return one row.
select enum_type, enum_value
from (
  select type_row.typname as enum_type, enum_row.enumlabel as enum_value,
    enum_row.enumsortorder
  from pg_catalog.pg_type type_row
  join pg_catalog.pg_enum enum_row on enum_row.enumtypid = type_row.oid
  join pg_catalog.pg_namespace namespace_row on namespace_row.oid = type_row.typnamespace
  where namespace_row.nspname = 'public'
    and type_row.typname in (
      'workspace_invitation_status', 'membership_event_type', 'notification_type'
    )
) inventory
order by enum_type, enumsortorder;

-- 2. Table and RLS inventory. All four rows should exist and row_security should be true.
select table_row.relname as table_name, table_row.relrowsecurity as row_security
from pg_catalog.pg_class table_row
join pg_catalog.pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
where namespace_row.nspname = 'public'
  and table_row.relname in (
    'workspace_invitations', 'membership_events', 'notifications', 'notification_preferences'
  )
order by table_name;

-- 3. Required indexes and foreign keys.
select schemaname, tablename, indexname
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename in ('workspace_invitations', 'membership_events', 'notifications')
order by tablename, indexname;

select source_table.relname as table_name, constraint_row.conname as foreign_key,
  pg_catalog.pg_get_constraintdef(constraint_row.oid) as definition
from pg_catalog.pg_constraint constraint_row
join pg_catalog.pg_class source_table on source_table.oid = constraint_row.conrelid
join pg_catalog.pg_namespace namespace_row on namespace_row.oid = source_table.relnamespace
where namespace_row.nspname = 'public'
  and source_table.relname in (
    'workspace_invitations', 'membership_events', 'notifications', 'notification_preferences'
  )
  and constraint_row.contype = 'f'
order by table_name, foreign_key;

-- 4. Direct table privileges.
-- anon must be false for every value.
-- authenticated must be false for all invitation/event/notification writes.
-- notification_preferences select/insert/update are intentionally true for authenticated;
-- RLS restricts those operations to auth.uid().
select role_name, table_name,
  has_table_privilege(role_name, format('%I.%I', 'public', table_name), 'SELECT') as can_select,
  has_table_privilege(role_name, format('%I.%I', 'public', table_name), 'INSERT') as can_insert,
  has_table_privilege(role_name, format('%I.%I', 'public', table_name), 'UPDATE') as can_update,
  has_table_privilege(role_name, format('%I.%I', 'public', table_name), 'DELETE') as can_delete
from (values ('anon'), ('authenticated')) roles(role_name)
cross join (values
  ('workspace_invitations'), ('membership_events'), ('notifications'), ('notification_preferences')
) tables(table_name)
order by role_name, table_name;

-- 5. RLS policy inventory.
-- workspace_invitations intentionally has no browser policy because token_hash is private.
select tablename, policyname, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in (
    'workspace_invitations', 'membership_events', 'notifications', 'notification_preferences'
  )
order by tablename, policyname;

-- 6. RPC execution grants.
-- authenticated should be true only for browser RPCs.
-- The three trusted invitation-delivery RPCs should be false for authenticated and true for service_role.
with functions(signature, browser_rpc) as (values
  ('public.list_workspace_invitations(uuid)', true),
  ('public.get_workspace_invitation_details(uuid,text)', true),
  ('public.accept_workspace_invitation(uuid,text)', true),
  ('public.decline_workspace_invitation(uuid,text)', true),
  ('public.revoke_workspace_invitation(uuid,text)', true),
  ('public.update_workspace_member_role(uuid,public.workspace_role,text)', true),
  ('public.transfer_workspace_ownership(uuid,uuid,public.workspace_role,text)', true),
  ('public.suspend_workspace_member(uuid,text)', true),
  ('public.reactivate_workspace_member(uuid,public.workspace_role,text)', true),
  ('public.remove_workspace_member(uuid,text)', true),
  ('public.leave_workspace(uuid)', true),
  ('public.list_eligible_workspace_roles(uuid)', true),
  ('public.mark_notification_read(uuid)', true),
  ('public.mark_notifications_read(uuid[])', true),
  ('public.mark_all_notifications_read(uuid)', true),
  ('public.archive_notification(uuid)', true),
  ('public.unarchive_notification(uuid)', true),
  ('public.create_workspace_invitation(uuid,text,public.workspace_role,uuid,uuid,text,text,timestamp with time zone)', false),
  ('public.mark_workspace_invitation_sent(uuid,uuid)', false),
  ('public.prepare_workspace_invitation_resend(uuid,uuid,text,uuid,timestamp with time zone)', false)
)
select signature, browser_rpc,
  has_function_privilege('anon', signature, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', signature, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', signature, 'EXECUTE') as service_role_execute
from functions
order by browser_rpc desc, signature;

-- 7. Security-definer and fixed search_path audit.
-- Every exposed mutation RPC should be security_definer=true and config should contain search_path="".
select procedure_row.proname,
  procedure_row.prosecdef as security_definer,
  procedure_row.proconfig as configuration
from pg_catalog.pg_proc procedure_row
join pg_catalog.pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
where namespace_row.nspname in ('public', 'private')
  and procedure_row.proname in (
    'create_workspace_invitation', 'prepare_workspace_invitation_resend',
    'accept_workspace_invitation', 'decline_workspace_invitation',
    'revoke_workspace_invitation', 'update_workspace_member_role',
    'transfer_workspace_ownership', 'suspend_workspace_member',
    'reactivate_workspace_member', 'remove_workspace_member', 'leave_workspace',
    'mark_notification_read', 'mark_notifications_read',
    'mark_all_notifications_read', 'archive_notification', 'unarchive_notification',
    'create_notification', 'notify_approval_event', 'notify_publishing_job',
    'notify_social_account_status'
  )
order by namespace_row.nspname, procedure_row.proname;

-- 8. Realtime and immutable audit checks.
select exists(
  select 1 from pg_catalog.pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'notifications'
) as notifications_in_realtime;

select
  has_table_privilege('authenticated', 'public.membership_events', 'INSERT') as browser_can_insert_events,
  has_table_privilege('authenticated', 'public.membership_events', 'UPDATE') as browser_can_update_events,
  has_table_privilege('authenticated', 'public.membership_events', 'DELETE') as browser_can_delete_events,
  has_table_privilege('authenticated', 'public.notifications', 'INSERT') as browser_can_insert_notifications,
  has_table_privilege('authenticated', 'public.notifications', 'UPDATE') as browser_can_update_notifications;

-- 9. Two-user rollback verification template.
-- Use disposable, real auth user/workspace/invitation IDs. Never paste passwords,
-- raw invitation tokens, service keys or production-only identities into this file.
-- Run each scenario in its own BEGIN ... ROLLBACK block after setting request.jwt.claims.
-- Verify:
--   owner can invite all roles;
--   administrator can invite only content_manager/designer/approver/viewer;
--   viewer invite and cross-workspace mutations fail;
--   active-member and duplicate-pending invitations fail;
--   suspended membership requires reactivation;
--   expired, revoked, mismatched-email and invalid-token acceptance fail;
--   acceptance creates one membership plus invitation_accepted/member_added events;
--   repeated acceptance is idempotent;
--   last-owner demotion, suspension, removal and leave fail;
--   ownership transfer promotes target before demoting caller;
--   suspension removes workspace RLS access and reactivation restores it;
--   removal preserves posts/media/Auth user rows;
--   each user sees and mutates only their own notifications;
--   action_path and sensitive metadata constraints reject unsafe inserts through trusted helpers.
--
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims', jsonb_build_object(
--   'sub', '<DISPOSABLE_AUTH_USER_UUID>', 'role', 'authenticated',
--   'email', '<DISPOSABLE_USER_EMAIL>'
-- )::text, true);
-- -- Run one controlled RPC assertion here.
-- rollback;
