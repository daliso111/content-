-- Stage 2D-A: YouTube channel connections (connection and metadata only).
-- The enum value must commit before it can be referenced by constraints/functions.
alter type public.social_account_type add value if not exists 'youtube_channel';

begin;

alter table public.social_accounts
  drop constraint social_accounts_supported_platform_check,
  add constraint social_accounts_supported_platform_check
    check (platform in (
      'facebook'::public.social_platform,
      'instagram'::public.social_platform,
      'youtube'::public.social_platform
    )),
  drop constraint social_accounts_platform_type_check,
  add constraint social_accounts_platform_type_check check (
    (platform = 'facebook'::public.social_platform
      and account_type = 'facebook_page'::public.social_account_type)
    or
    (platform = 'instagram'::public.social_platform and account_type in (
      'instagram_business'::public.social_account_type,
      'instagram_creator'::public.social_account_type
    ))
    or
    (platform = 'youtube'::public.social_platform
      and account_type = 'youtube_channel'::public.social_account_type)
  );

alter table private.oauth_connection_states
  drop constraint oauth_connection_states_provider_meta,
  add constraint oauth_connection_states_provider_supported
    check (provider in ('meta', 'youtube'));

create function public.begin_youtube_oauth(
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
    p_state_hash, p_workspace_id, p_initiated_by, 'youtube', p_return_path,
    now() + interval '10 minutes'
  ) returning * into created_state;

  return jsonb_build_object(
    'id', created_state.id,
    'expiresAt', created_state.expires_at
  );
end;
$$;

create function public.consume_youtube_oauth_state(p_state_hash text)
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
    and candidate.provider = 'youtube'
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
  where state_hash = p_state_hash and provider = 'youtube';

  if not found then
    raise exception 'INVALID_OAUTH_STATE' using errcode = 'P0002';
  elsif state_row.consumed_at is not null then
    raise exception 'OAUTH_STATE_ALREADY_USED' using errcode = 'P0001';
  else
    raise exception 'OAUTH_STATE_EXPIRED' using errcode = 'P0001';
  end if;
end;
$$;

create function public.upsert_youtube_connection(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_connection jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_row public.social_accounts%rowtype;
  existing_refresh_token text;
  existing_refresh_iv text;
  encrypted_refresh_token text := nullif(p_connection ->> 'encryptedRefreshToken', '');
  refresh_token_iv text := nullif(p_connection ->> 'refreshTokenIv', '');
begin
  if not private.is_social_connection_manager(p_workspace_id, p_actor_id) then
    raise exception 'WORKSPACE_ROLE_DENIED' using errcode = '42501';
  end if;
  if p_connection is null or jsonb_typeof(p_connection) <> 'object'
     or p_connection ->> 'platform' <> 'youtube'
     or p_connection ->> 'accountType' <> 'youtube_channel'
     or coalesce(btrim(p_connection ->> 'platformAccountId'), '') = ''
     or coalesce(btrim(p_connection ->> 'accountName'), '') = ''
     or coalesce(p_connection ->> 'encryptedAccessToken', '') = ''
     or coalesce(p_connection ->> 'accessTokenIv', '') = ''
     or jsonb_typeof(coalesce(p_connection -> 'metadata', '{}'::jsonb)) <> 'object'
     or (encrypted_refresh_token is null) <> (refresh_token_iv is null) then
    raise exception 'INVALID_CONNECTION_PAYLOAD' using errcode = '22023';
  end if;

  select credential.encrypted_refresh_token, credential.refresh_token_iv
    into existing_refresh_token, existing_refresh_iv
  from public.social_accounts as account
  join private.social_credentials as credential on credential.social_account_id = account.id
  where account.workspace_id = p_workspace_id
    and account.platform = 'youtube'::public.social_platform
    and account.platform_account_id = p_connection ->> 'platformAccountId'
  for update of credential;

  encrypted_refresh_token := coalesce(encrypted_refresh_token, existing_refresh_token);
  refresh_token_iv := coalesce(refresh_token_iv, existing_refresh_iv);
  if encrypted_refresh_token is null or refresh_token_iv is null then
    raise exception 'YOUTUBE_REFRESH_TOKEN_REQUIRED' using errcode = 'P0001';
  end if;

  insert into public.social_accounts (
    workspace_id, platform, account_type, platform_account_id, account_name,
    username, profile_image_url, connection_status, connected_by, connected_at,
    token_expires_at, last_refreshed_at, last_error_code, last_error_message,
    granted_scopes, metadata, disconnected_at
  ) values (
    p_workspace_id, 'youtube'::public.social_platform,
    'youtube_channel'::public.social_account_type,
    p_connection ->> 'platformAccountId', btrim(p_connection ->> 'accountName'),
    nullif(btrim(p_connection ->> 'username'), ''),
    nullif(p_connection ->> 'profileImageUrl', ''),
    'connected'::public.social_connection_status, p_actor_id, now(),
    nullif(p_connection ->> 'tokenExpiresAt', '')::timestamptz, now(), null, null,
    coalesce(array(select jsonb_array_elements_text(
      coalesce(p_connection -> 'grantedScopes', '[]'::jsonb)
    )), array[]::text[]),
    coalesce(p_connection -> 'metadata', '{}'::jsonb), null
  )
  on conflict on constraint social_accounts_workspace_platform_account_key
  do update set
    account_type = excluded.account_type,
    account_name = excluded.account_name,
    username = excluded.username,
    profile_image_url = excluded.profile_image_url,
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
    social_account_id, encrypted_access_token, access_token_iv,
    encrypted_refresh_token, refresh_token_iv, token_type, expires_at,
    granted_scopes, provider_metadata
  ) values (
    account_row.id, p_connection ->> 'encryptedAccessToken',
    p_connection ->> 'accessTokenIv', encrypted_refresh_token, refresh_token_iv,
    nullif(p_connection ->> 'tokenType', ''), account_row.token_expires_at,
    account_row.granted_scopes, jsonb_build_object('encryptionVersion', 1)
  )
  on conflict (social_account_id) do update set
    encrypted_access_token = excluded.encrypted_access_token,
    access_token_iv = excluded.access_token_iv,
    encrypted_refresh_token = excluded.encrypted_refresh_token,
    refresh_token_iv = excluded.refresh_token_iv,
    token_type = excluded.token_type,
    expires_at = excluded.expires_at,
    granted_scopes = excluded.granted_scopes,
    provider_metadata = excluded.provider_metadata;

  return jsonb_build_object(
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
  );
end;
$$;

create or replace function public.get_social_account_credential(
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
    'encryptedRefreshToken', credential.encrypted_refresh_token,
    'refreshTokenIv', credential.refresh_token_iv,
    'tokenType', credential.token_type,
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

create function public.update_youtube_connection_refresh(
  p_social_account_id uuid,
  p_actor_id uuid,
  p_account_name text,
  p_username text,
  p_profile_image_url text,
  p_encrypted_access_token text,
  p_access_token_iv text,
  p_encrypted_refresh_token text,
  p_refresh_token_iv text,
  p_token_type text,
  p_token_expires_at timestamptz,
  p_granted_scopes text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_row public.social_accounts%rowtype;
begin
  select * into account_row
  from public.social_accounts
  where id = p_social_account_id
    and platform = 'youtube'::public.social_platform
  for update;
  if not found or not private.is_social_connection_manager(account_row.workspace_id, p_actor_id) then
    raise exception 'SOCIAL_ACCOUNT_NOT_FOUND_OR_DENIED' using errcode = 'P0002';
  end if;
  if coalesce(p_encrypted_access_token, '') = '' or coalesce(p_access_token_iv, '') = ''
     or (p_encrypted_refresh_token is null) <> (p_refresh_token_iv is null) then
    raise exception 'INVALID_CONNECTION_PAYLOAD' using errcode = '22023';
  end if;

  update public.social_accounts
  set account_name = coalesce(nullif(btrim(p_account_name), ''), account_name),
      username = coalesce(p_username, username),
      profile_image_url = coalesce(p_profile_image_url, profile_image_url),
      token_expires_at = p_token_expires_at,
      last_refreshed_at = now(),
      connection_status = 'connected'::public.social_connection_status,
      last_error_code = null,
      last_error_message = null,
      granted_scopes = coalesce(p_granted_scopes, granted_scopes),
      disconnected_at = null
  where id = p_social_account_id
  returning * into account_row;

  update private.social_credentials
  set encrypted_access_token = p_encrypted_access_token,
      access_token_iv = p_access_token_iv,
      encrypted_refresh_token = coalesce(p_encrypted_refresh_token, encrypted_refresh_token),
      refresh_token_iv = coalesce(p_refresh_token_iv, refresh_token_iv),
      token_type = coalesce(nullif(p_token_type, ''), token_type),
      expires_at = p_token_expires_at,
      granted_scopes = coalesce(p_granted_scopes, granted_scopes)
  where social_account_id = p_social_account_id;

  return jsonb_build_object(
    'id', account_row.id,
    'connectionStatus', account_row.connection_status,
    'lastRefreshedAt', account_row.last_refreshed_at,
    'warning', null
  );
end;
$$;

revoke all on function public.begin_youtube_oauth(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.consume_youtube_oauth_state(text)
  from public, anon, authenticated;
revoke all on function public.upsert_youtube_connection(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.update_youtube_connection_refresh(
  uuid, uuid, text, text, text, text, text, text, text, text, timestamptz, text[]
) from public, anon, authenticated;

grant execute on function public.begin_youtube_oauth(uuid, uuid, text, text) to service_role;
grant execute on function public.consume_youtube_oauth_state(text) to service_role;
grant execute on function public.upsert_youtube_connection(uuid, uuid, jsonb) to service_role;
grant execute on function public.update_youtube_connection_refresh(
  uuid, uuid, text, text, text, text, text, text, text, text, timestamptz, text[]
) to service_role;

commit;
