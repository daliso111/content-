-- PostFlow Stage 2A verification.
-- Run each numbered section separately after applying all migrations in order.
-- This file contains no project identifiers or credentials.

-- 1. Schema and enum inventory.
select
  to_regclass('public.social_accounts') is not null as social_accounts_exists,
  to_regclass('private.social_credentials') is not null as social_credentials_exists,
  to_regclass('private.oauth_connection_states') is not null as oauth_states_exists,
  to_regclass('private.social_connection_sessions') is not null as connection_sessions_exists;

select type_name, enum_value
from (
  select type_row.typname as type_name, enum_row.enumlabel as enum_value,
         enum_row.enumsortorder
  from pg_catalog.pg_type as type_row
  join pg_catalog.pg_namespace as namespace_row on namespace_row.oid = type_row.typnamespace
  join pg_catalog.pg_enum as enum_row on enum_row.enumtypid = type_row.oid
  where namespace_row.nspname = 'public'
    and type_row.typname in ('social_connection_status', 'social_account_type')
) as enum_inventory
order by type_name, enumsortorder;

-- 2. Foreign keys, uniqueness, checks and indexes.
select constraint_row.conname, constraint_row.contype
from pg_catalog.pg_constraint as constraint_row
where constraint_row.conrelid in (
  'public.social_accounts'::regclass,
  'private.social_credentials'::regclass,
  'private.oauth_connection_states'::regclass,
  'private.social_connection_sessions'::regclass
)
order by constraint_row.conrelid::regclass::text, constraint_row.conname;

select schemaname, tablename, indexname
from pg_catalog.pg_indexes
where (schemaname, tablename) in (
  ('public', 'social_accounts'),
  ('private', 'social_credentials'),
  ('private', 'oauth_connection_states'),
  ('private', 'social_connection_sessions')
)
order by schemaname, tablename, indexname;

-- 3. RLS and policy inventory. social_accounts must have RLS enabled and only
-- the authenticated SELECT policy should exist.
select namespace_row.nspname as schema_name, class_row.relname as table_name,
       class_row.relrowsecurity as rls_enabled
from pg_catalog.pg_class as class_row
join pg_catalog.pg_namespace as namespace_row on namespace_row.oid = class_row.relnamespace
where namespace_row.nspname = 'public' and class_row.relname = 'social_accounts';

select policyname, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public' and tablename = 'social_accounts'
order by policyname;

-- 4. Browser privilege verification. Every anon value and every authenticated
-- mutation value must be false. authenticated_can_select must be true.
select
  has_table_privilege('anon', 'public.social_accounts', 'SELECT') as anon_can_select,
  has_table_privilege('anon', 'public.social_accounts', 'INSERT') as anon_can_insert,
  has_table_privilege('authenticated', 'public.social_accounts', 'SELECT')
    as authenticated_can_select,
  has_table_privilege('authenticated', 'public.social_accounts', 'INSERT')
    as authenticated_can_insert,
  has_table_privilege('authenticated', 'public.social_accounts', 'UPDATE')
    as authenticated_can_update,
  has_table_privilege('authenticated', 'public.social_accounts', 'DELETE')
    as authenticated_can_delete;

-- 5. Private data denial. Every value must be false.
select
  table_name,
  has_table_privilege('anon', format('%I.%I', 'private', table_name), 'SELECT')
    as anon_can_select,
  has_table_privilege('authenticated', format('%I.%I', 'private', table_name), 'SELECT')
    as authenticated_can_select,
  has_table_privilege('authenticated', format('%I.%I', 'private', table_name), 'INSERT')
    as authenticated_can_insert,
  has_table_privilege('authenticated', format('%I.%I', 'private', table_name), 'UPDATE')
    as authenticated_can_update,
  has_table_privilege('authenticated', format('%I.%I', 'private', table_name), 'DELETE')
    as authenticated_can_delete
from (values
  ('social_credentials'),
  ('oauth_connection_states'),
  ('social_connection_sessions')
) as private_tables(table_name)
order by table_name;

-- 6. Trusted RPC inventory. anon and authenticated must not have EXECUTE;
-- service_role must have EXECUTE. All helpers are SECURITY DEFINER with an
-- explicitly empty search_path.
select
  procedure_row.proname,
  procedure_row.prosecdef as security_definer,
  procedure_row.proconfig,
  has_function_privilege('anon', procedure_row.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE')
    as authenticated_execute,
  has_function_privilege('service_role', procedure_row.oid, 'EXECUTE')
    as service_role_execute
from pg_catalog.pg_proc as procedure_row
join pg_catalog.pg_namespace as namespace_row on namespace_row.oid = procedure_row.pronamespace
where namespace_row.nspname = 'public'
  and procedure_row.proname in (
    'begin_meta_oauth',
    'consume_meta_oauth_state',
    'create_meta_connection_session',
    'get_meta_connection_session',
    'complete_meta_connections',
    'get_social_account_credential',
    'update_social_account_refresh',
    'disconnect_social_account'
  )
order by procedure_row.proname;

-- 7. Completion hardening inventory. Every value must be true.
select
  position(
    'p_connections is null'
    in pg_catalog.pg_get_functiondef(
      'public.complete_meta_connections(uuid,uuid,jsonb)'::regprocedure
    )
  ) > 0 as rejects_null_connections,
  position(
    'META_PERMISSION_DENIED'
    in pg_catalog.pg_get_functiondef(
      'public.complete_meta_connections(uuid,uuid,jsonb)'::regprocedure
    )
  ) > 0 as validates_required_scopes,
  position(
    '(connection ->> ''tokenExpiresAt'')'
    in pg_catalog.pg_get_functiondef(
      'public.complete_meta_connections(uuid,uuid,jsonb)'::regprocedure
    )
  ) = 0 as does_not_guess_destination_expiry;

-- 8. Two-user browser verification (manual, non-production).
-- Use real Auth sessions through the Supabase client or PostFlow UI; do not put
-- JWTs or user IDs in this file. Confirm:
-- * User A sees only social_accounts from User A's active workspaces.
-- * User B cannot see User A's workspace accounts.
-- * owner/administrator can start, complete, refresh and disconnect.
-- * content_manager/designer/approver/viewer can read but every function denies management.
-- * an administrator in Workspace A cannot manage an account in Workspace B.
-- * direct authenticated INSERT, UPDATE and DELETE calls fail before changing a row.
-- Keep all database mutation probes in BEGIN/ROLLBACK transactions.
