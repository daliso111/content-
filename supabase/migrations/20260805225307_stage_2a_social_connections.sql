begin;

create type public.social_connection_status as enum (
  'pending',
  'connected',
  'reconnect_required',
  'expired',
  'disconnected',
  'error'
);

create type public.social_account_type as enum (
  'facebook_page',
  'instagram_business',
  'instagram_creator'
);

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform public.social_platform not null,
  account_type public.social_account_type not null,
  platform_account_id text not null,
  account_name text not null,
  username text,
  profile_image_url text,
  parent_platform_account_id text,
  connection_status public.social_connection_status not null default 'pending',
  connected_by uuid not null references auth.users(id) on delete restrict,
  connected_at timestamptz,
  token_expires_at timestamptz,
  last_refreshed_at timestamptz,
  last_error_code text,
  last_error_message text,
  granted_scopes text[] not null default array[]::text[],
  metadata jsonb not null default '{}'::jsonb,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_accounts_workspace_platform_account_key
    unique (workspace_id, platform, platform_account_id),
  constraint social_accounts_supported_platform_check
    check (platform in ('facebook'::public.social_platform, 'instagram'::public.social_platform)),
  constraint social_accounts_platform_type_check check (
    (platform = 'facebook'::public.social_platform and account_type = 'facebook_page'::public.social_account_type)
    or
    (platform = 'instagram'::public.social_platform and account_type in (
      'instagram_business'::public.social_account_type,
      'instagram_creator'::public.social_account_type
    ))
  ),
  constraint social_accounts_platform_id_not_empty
    check (btrim(platform_account_id) <> ''),
  constraint social_accounts_name_not_empty check (btrim(account_name) <> ''),
  constraint social_accounts_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint social_accounts_scopes_no_nulls
    check (array_position(granted_scopes, null) is null),
  constraint social_accounts_error_code_length
    check (last_error_code is null or length(last_error_code) <= 80),
  constraint social_accounts_error_message_length
    check (last_error_message is null or length(last_error_message) <= 240)
);

create table private.social_credentials (
  id uuid primary key default gen_random_uuid(),
  social_account_id uuid not null unique
    references public.social_accounts(id) on delete cascade,
  encrypted_access_token text not null,
  access_token_iv text not null,
  encrypted_refresh_token text,
  refresh_token_iv text,
  token_type text,
  expires_at timestamptz,
  granted_scopes text[] not null default array[]::text[],
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_credentials_encrypted_token_not_empty
    check (btrim(encrypted_access_token) <> '' and btrim(access_token_iv) <> ''),
  constraint social_credentials_refresh_pair check (
    (encrypted_refresh_token is null and refresh_token_iv is null)
    or
    (encrypted_refresh_token is not null and refresh_token_iv is not null)
  ),
  constraint social_credentials_metadata_object
    check (jsonb_typeof(provider_metadata) = 'object'),
  constraint social_credentials_scopes_no_nulls
    check (array_position(granted_scopes, null) is null)
);

create table private.oauth_connection_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  initiated_by uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  return_path text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  pending_connection_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint oauth_connection_states_hash_format
    check (state_hash ~ '^[0-9a-f]{64}$'),
  constraint oauth_connection_states_provider_meta check (provider = 'meta'),
  constraint oauth_connection_states_return_path
    check (return_path in ('/dashboard/accounts')),
  constraint oauth_connection_states_short_lived
    check (expires_at > created_at and expires_at <= created_at + interval '10 minutes'),
  constraint oauth_connection_states_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create table private.social_connection_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  initiated_by uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  encrypted_user_token text not null,
  user_token_iv text not null,
  token_expires_at timestamptz,
  granted_scopes text[] not null default array[]::text[],
  discovered_accounts jsonb not null,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint social_connection_sessions_provider_meta check (provider = 'meta'),
  constraint social_connection_sessions_token_not_empty
    check (btrim(encrypted_user_token) <> '' and btrim(user_token_iv) <> ''),
  constraint social_connection_sessions_accounts_array
    check (jsonb_typeof(discovered_accounts) = 'array'),
  constraint social_connection_sessions_scopes_no_nulls
    check (array_position(granted_scopes, null) is null),
  constraint social_connection_sessions_short_lived
    check (expires_at > created_at and expires_at <= created_at + interval '15 minutes')
);

create index social_accounts_workspace_status_idx
  on public.social_accounts (workspace_id, connection_status);
create index social_accounts_connected_by_idx
  on public.social_accounts (connected_by);
create index social_credentials_expires_at_idx
  on private.social_credentials (expires_at) where expires_at is not null;
create index oauth_connection_states_expiry_idx
  on private.oauth_connection_states (expires_at)
  where consumed_at is null;
create index oauth_connection_states_user_created_idx
  on private.oauth_connection_states (initiated_by, created_at desc);
create index social_connection_sessions_user_expiry_idx
  on private.social_connection_sessions (initiated_by, expires_at)
  where completed_at is null;

create trigger social_accounts_set_updated_at
before update on public.social_accounts
for each row execute function private.set_updated_at();

create trigger social_credentials_set_updated_at
before update on private.social_credentials
for each row execute function private.set_updated_at();

create function private.is_social_connection_manager(
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
      and membership.role in (
        'owner'::public.workspace_role,
        'administrator'::public.workspace_role
      )
  );
$$;

create function public.begin_meta_oauth(
  p_workspace_id uuid,
  p_initiated_by uuid,
  p_state_hash text,
  p_return_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_state private.oauth_connection_states%rowtype;
begin
  if not private.is_social_connection_manager(p_workspace_id, p_initiated_by) then
    raise exception 'WORKSPACE_ROLE_DENIED' using errcode = '42501';
  end if;
  if p_state_hash is null or p_state_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_OAUTH_STATE' using errcode = '22023';
  end if;
  if p_return_path is null or p_return_path not in ('/dashboard/accounts') then
    raise exception 'UNSAFE_RETURN_PATH' using errcode = '22023';
  end if;
  if (
    select count(*)
    from private.oauth_connection_states as state_row
    where state_row.initiated_by = p_initiated_by
      and state_row.created_at > now() - interval '1 minute'
  ) >= 5 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  insert into private.oauth_connection_states (
    state_hash, workspace_id, initiated_by, provider, return_path, expires_at
  ) values (
    p_state_hash, p_workspace_id, p_initiated_by, 'meta', p_return_path,
    now() + interval '10 minutes'
  ) returning * into created_state;

  return jsonb_build_object(
    'id', created_state.id,
    'expiresAt', created_state.expires_at
  );
end;
$$;

create function public.consume_meta_oauth_state(p_state_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_row private.oauth_connection_states%rowtype;
begin
  update private.oauth_connection_states as candidate
  set consumed_at = now()
  where candidate.state_hash = p_state_hash
    and candidate.provider = 'meta'
    and candidate.consumed_at is null
    and candidate.expires_at > now()
  returning candidate.* into state_row;

  if found then
    return jsonb_build_object(
      'workspaceId', state_row.workspace_id,
      'initiatedBy', state_row.initiated_by,
      'returnPath', state_row.return_path
    );
  end if;

  select * into state_row
  from private.oauth_connection_states
  where state_hash = p_state_hash;

  if not found then
    raise exception 'INVALID_OAUTH_STATE' using errcode = 'P0002';
  elsif state_row.consumed_at is not null then
    raise exception 'OAUTH_STATE_ALREADY_USED' using errcode = 'P0001';
  else
    raise exception 'OAUTH_STATE_EXPIRED' using errcode = 'P0001';
  end if;
end;
$$;

create function public.create_meta_connection_session(
  p_workspace_id uuid,
  p_initiated_by uuid,
  p_encrypted_user_token text,
  p_user_token_iv text,
  p_token_expires_at timestamptz,
  p_granted_scopes text[],
  p_discovered_accounts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_session private.social_connection_sessions%rowtype;
begin
  if not private.is_social_connection_manager(p_workspace_id, p_initiated_by) then
    raise exception 'WORKSPACE_ROLE_DENIED' using errcode = '42501';
  end if;
  if p_discovered_accounts is null
     or jsonb_typeof(p_discovered_accounts) <> 'array' then
    raise exception 'INVALID_DISCOVERY_OPTIONS' using errcode = '22023';
  end if;

  insert into private.social_connection_sessions (
    workspace_id, initiated_by, provider, encrypted_user_token, user_token_iv,
    token_expires_at, granted_scopes, discovered_accounts, expires_at
  ) values (
    p_workspace_id, p_initiated_by, 'meta', p_encrypted_user_token,
    p_user_token_iv, p_token_expires_at, coalesce(p_granted_scopes, array[]::text[]),
    p_discovered_accounts, now() + interval '15 minutes'
  ) returning * into created_session;

  return jsonb_build_object(
    'id', created_session.id,
    'expiresAt', created_session.expires_at
  );
end;
$$;

create function public.get_meta_connection_session(
  p_session_id uuid,
  p_initiated_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row private.social_connection_sessions%rowtype;
begin
  select * into session_row
  from private.social_connection_sessions
  where id = p_session_id
  for update;

  if not found or session_row.initiated_by <> p_initiated_by then
    raise exception 'CONNECTION_SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if session_row.completed_at is not null then
    raise exception 'CONNECTION_SESSION_ALREADY_USED' using errcode = 'P0001';
  end if;
  if session_row.expires_at <= now() then
    raise exception 'CONNECTION_SESSION_EXPIRED' using errcode = 'P0001';
  end if;
  if not private.is_social_connection_manager(session_row.workspace_id, p_initiated_by) then
    raise exception 'WORKSPACE_ROLE_DENIED' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'id', session_row.id,
    'workspaceId', session_row.workspace_id,
    'initiatedBy', session_row.initiated_by,
    'encryptedUserToken', session_row.encrypted_user_token,
    'userTokenIv', session_row.user_token_iv,
    'tokenExpiresAt', session_row.token_expires_at,
    'grantedScopes', session_row.granted_scopes,
    'discoveredAccounts', session_row.discovered_accounts,
    'expiresAt', session_row.expires_at
  );
end;
$$;

create function public.complete_meta_connections(
  p_session_id uuid,
  p_initiated_by uuid,
  p_connections jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row private.social_connection_sessions%rowtype;
  connection jsonb;
  account_row public.social_accounts%rowtype;
  results jsonb := '[]'::jsonb;
begin
  select * into session_row
  from private.social_connection_sessions
  where id = p_session_id
  for update;

  if not found or session_row.initiated_by <> p_initiated_by then
    raise exception 'CONNECTION_SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if session_row.completed_at is not null or session_row.expires_at <= now() then
    raise exception 'CONNECTION_SESSION_EXPIRED' using errcode = 'P0001';
  end if;
  if not private.is_social_connection_manager(session_row.workspace_id, p_initiated_by) then
    raise exception 'WORKSPACE_ROLE_DENIED' using errcode = '42501';
  end if;
  if p_connections is null
     or jsonb_typeof(p_connections) <> 'array' then
    raise exception 'INVALID_CONNECTION_PAYLOAD' using errcode = '22023';
  end if;
  if jsonb_array_length(p_connections) = 0
     or jsonb_array_length(p_connections) > 100 then
    raise exception 'NO_ACCOUNTS_SELECTED' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_connections) as selected(item)
    where jsonb_typeof(selected.item) <> 'object'
  ) then
    raise exception 'INVALID_CONNECTION_PAYLOAD' using errcode = '22023';
  end if;
  if (
    select count(*) <> count(distinct item ->> 'platformAccountId')
    from jsonb_array_elements(p_connections) as selected(item)
  ) then
    raise exception 'DUPLICATE_ACCOUNT_SELECTION' using errcode = '22023';
  end if;

  for connection in select value from jsonb_array_elements(p_connections)
  loop
    if connection ->> 'platform' = 'facebook' then
      if not session_row.granted_scopes @> array[
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_posts'
      ]::text[] then
        raise exception 'META_PERMISSION_DENIED' using errcode = '42501';
      end if;
    elsif connection ->> 'platform' = 'instagram' then
      if not session_row.granted_scopes @> array[
        'pages_show_list',
        'pages_read_engagement',
        'instagram_basic',
        'instagram_content_publish'
      ]::text[] then
        raise exception 'META_PERMISSION_DENIED' using errcode = '42501';
      end if;
    else
      raise exception 'INVALID_ACCOUNT_SELECTION' using errcode = '22023';
    end if;

    if not exists (
      select 1
      from jsonb_array_elements(session_row.discovered_accounts) as option_row(option)
      where option_row.option ->> 'platform' = connection ->> 'platform'
        and option_row.option ->> 'platformAccountId' = connection ->> 'platformAccountId'
        and option_row.option ->> 'accountType' = connection ->> 'accountType'
    ) then
      raise exception 'INVALID_ACCOUNT_SELECTION' using errcode = '22023';
    end if;
    if jsonb_typeof(coalesce(connection -> 'metadata', '{}'::jsonb)) <> 'object'
       or coalesce(connection ->> 'encryptedAccessToken', '') = ''
       or coalesce(connection ->> 'accessTokenIv', '') = '' then
      raise exception 'INVALID_CONNECTION_PAYLOAD' using errcode = '22023';
    end if;

    insert into public.social_accounts (
      workspace_id, platform, account_type, platform_account_id, account_name,
      username, profile_image_url, parent_platform_account_id, connection_status,
      connected_by, connected_at, token_expires_at, last_refreshed_at,
      last_error_code, last_error_message, granted_scopes, metadata, disconnected_at
    ) values (
      session_row.workspace_id,
      (connection ->> 'platform')::public.social_platform,
      (connection ->> 'accountType')::public.social_account_type,
      connection ->> 'platformAccountId', connection ->> 'accountName',
      nullif(connection ->> 'username', ''), nullif(connection ->> 'profileImageUrl', ''),
      nullif(connection ->> 'parentPageId', ''), 'connected'::public.social_connection_status,
      p_initiated_by, now(), null,
      now(), null, null, session_row.granted_scopes,
      coalesce(connection -> 'metadata', '{}'::jsonb), null
    )
    on conflict on constraint social_accounts_workspace_platform_account_key
    do update set
      account_type = excluded.account_type,
      account_name = excluded.account_name,
      username = excluded.username,
      profile_image_url = excluded.profile_image_url,
      parent_platform_account_id = excluded.parent_platform_account_id,
      connection_status = 'connected'::public.social_connection_status,
      connected_by = excluded.connected_by,
      connected_at = excluded.connected_at,
      token_expires_at = excluded.token_expires_at,
      last_refreshed_at = excluded.last_refreshed_at,
      last_error_code = null,
      last_error_message = null,
      granted_scopes = excluded.granted_scopes,
      metadata = excluded.metadata,
      disconnected_at = null
    returning * into account_row;

    insert into private.social_credentials (
      social_account_id, encrypted_access_token, access_token_iv, token_type,
      expires_at, granted_scopes, provider_metadata
    ) values (
      account_row.id, connection ->> 'encryptedAccessToken',
      connection ->> 'accessTokenIv', nullif(connection ->> 'tokenType', ''),
      null, session_row.granted_scopes,
      jsonb_build_object('encryptionVersion', 1)
    )
    on conflict (social_account_id) do update set
      encrypted_access_token = excluded.encrypted_access_token,
      access_token_iv = excluded.access_token_iv,
      token_type = excluded.token_type,
      expires_at = excluded.expires_at,
      granted_scopes = excluded.granted_scopes,
      provider_metadata = excluded.provider_metadata;

    results := results || jsonb_build_array(jsonb_build_object(
      'id', account_row.id,
      'workspaceId', account_row.workspace_id,
      'platform', account_row.platform,
      'accountType', account_row.account_type,
      'platformAccountId', account_row.platform_account_id,
      'accountName', account_row.account_name,
      'username', account_row.username,
      'profileImageUrl', account_row.profile_image_url,
      'connectionStatus', account_row.connection_status,
      'tokenExpiresAt', account_row.token_expires_at
    ));
  end loop;

  update private.social_connection_sessions
  set completed_at = now()
  where id = session_row.id;
  delete from private.social_connection_sessions where id = session_row.id;

  return results;
end;
$$;

create function public.get_social_account_credential(
  p_social_account_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'id', account.id,
    'workspaceId', account.workspace_id,
    'platform', account.platform,
    'accountType', account.account_type,
    'platformAccountId', account.platform_account_id,
    'parentPageId', account.parent_platform_account_id,
    'encryptedAccessToken', credential.encrypted_access_token,
    'accessTokenIv', credential.access_token_iv,
    'tokenExpiresAt', credential.expires_at,
    'grantedScopes', credential.granted_scopes
  ) into result
  from public.social_accounts as account
  join private.social_credentials as credential
    on credential.social_account_id = account.id
  where account.id = p_social_account_id
    and private.is_social_connection_manager(account.workspace_id, p_actor_id);

  if result is null then
    raise exception 'SOCIAL_ACCOUNT_NOT_FOUND_OR_DENIED' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

create function public.update_social_account_refresh(
  p_social_account_id uuid,
  p_actor_id uuid,
  p_account_name text,
  p_username text,
  p_profile_image_url text,
  p_token_expires_at timestamptz,
  p_connection_status public.social_connection_status,
  p_error_code text,
  p_error_message text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_row public.social_accounts%rowtype;
begin
  select * into account_row from public.social_accounts where id = p_social_account_id;
  if not found or not private.is_social_connection_manager(account_row.workspace_id, p_actor_id) then
    raise exception 'SOCIAL_ACCOUNT_NOT_FOUND_OR_DENIED' using errcode = 'P0002';
  end if;

  update public.social_accounts
  set account_name = coalesce(nullif(btrim(p_account_name), ''), account_name),
      username = coalesce(p_username, username),
      profile_image_url = coalesce(p_profile_image_url, profile_image_url),
      token_expires_at = coalesce(p_token_expires_at, token_expires_at),
      last_refreshed_at = now(),
      connection_status = p_connection_status,
      last_error_code = nullif(left(p_error_code, 80), ''),
      last_error_message = nullif(left(p_error_message, 240), '')
  where id = p_social_account_id
  returning * into account_row;

  update private.social_credentials
  set expires_at = coalesce(p_token_expires_at, expires_at)
  where social_account_id = p_social_account_id;

  return jsonb_build_object(
    'id', account_row.id,
    'connectionStatus', account_row.connection_status,
    'lastRefreshedAt', account_row.last_refreshed_at,
    'warning', account_row.last_error_code
  );
end;
$$;

create function public.disconnect_social_account(
  p_social_account_id uuid,
  p_actor_id uuid,
  p_warning_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_row public.social_accounts%rowtype;
begin
  select * into account_row from public.social_accounts where id = p_social_account_id for update;
  if not found or not private.is_social_connection_manager(account_row.workspace_id, p_actor_id) then
    raise exception 'SOCIAL_ACCOUNT_NOT_FOUND_OR_DENIED' using errcode = 'P0002';
  end if;

  delete from private.social_credentials where social_account_id = p_social_account_id;
  update public.social_accounts
  set connection_status = 'disconnected'::public.social_connection_status,
      disconnected_at = now(),
      token_expires_at = null,
      last_error_code = nullif(left(p_warning_code, 80), ''),
      last_error_message = null
  where id = p_social_account_id
  returning * into account_row;

  return jsonb_build_object(
    'id', account_row.id,
    'connectionStatus', account_row.connection_status,
    'warning', account_row.last_error_code
  );
end;
$$;

alter table public.social_accounts enable row level security;

create policy social_accounts_select_active_members
on public.social_accounts
for select
to authenticated
using (private.is_workspace_member(workspace_id));

revoke all on table public.social_accounts from public, anon, authenticated;
grant select on table public.social_accounts to authenticated;
grant select, insert, update, delete on table public.social_accounts to service_role;

revoke all on schema private from public, anon;
revoke all on table
  private.social_credentials,
  private.oauth_connection_states,
  private.social_connection_sessions
from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on table
  private.social_credentials,
  private.oauth_connection_states,
  private.social_connection_sessions
to service_role;

revoke all on function private.is_social_connection_manager(uuid, uuid)
from public, anon, authenticated;

revoke all on function public.begin_meta_oauth(uuid, uuid, text, text)
from public, anon, authenticated;
revoke all on function public.consume_meta_oauth_state(text)
from public, anon, authenticated;
revoke all on function public.create_meta_connection_session(uuid, uuid, text, text, timestamptz, text[], jsonb)
from public, anon, authenticated;
revoke all on function public.get_meta_connection_session(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.complete_meta_connections(uuid, uuid, jsonb)
from public, anon, authenticated;
revoke all on function public.get_social_account_credential(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.update_social_account_refresh(uuid, uuid, text, text, text, timestamptz, public.social_connection_status, text, text)
from public, anon, authenticated;
revoke all on function public.disconnect_social_account(uuid, uuid, text)
from public, anon, authenticated;

grant execute on function public.begin_meta_oauth(uuid, uuid, text, text) to service_role;
grant execute on function public.consume_meta_oauth_state(text) to service_role;
grant execute on function public.create_meta_connection_session(uuid, uuid, text, text, timestamptz, text[], jsonb) to service_role;
grant execute on function public.get_meta_connection_session(uuid, uuid) to service_role;
grant execute on function public.complete_meta_connections(uuid, uuid, jsonb) to service_role;
grant execute on function public.get_social_account_credential(uuid, uuid) to service_role;
grant execute on function public.update_social_account_refresh(uuid, uuid, text, text, text, timestamptz, public.social_connection_status, text, text) to service_role;
grant execute on function public.disconnect_social_account(uuid, uuid, text) to service_role;

commit;
