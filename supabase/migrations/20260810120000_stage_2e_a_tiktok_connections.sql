-- Stage 2E-A: TikTok user connections (connection and metadata only).
-- The enum value must commit before it can be referenced by constraints/functions.
alter type public.social_account_type add value if not exists 'tiktok_user';

begin;

alter table public.social_accounts
  drop constraint social_accounts_supported_platform_check,
  add constraint social_accounts_supported_platform_check
    check (platform in (
      'facebook'::public.social_platform,
      'instagram'::public.social_platform,
      'youtube'::public.social_platform,
      'tiktok'::public.social_platform
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
    or
    (platform = 'tiktok'::public.social_platform
      and account_type = 'tiktok_user'::public.social_account_type)
  );

alter table private.oauth_connection_states
  drop constraint oauth_connection_states_provider_supported,
  add constraint oauth_connection_states_provider_supported
    check (provider in ('meta', 'youtube', 'tiktok'));

create function public.begin_tiktok_oauth(
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
    p_state_hash, p_workspace_id, p_initiated_by, 'tiktok', p_return_path,
    now() + interval '10 minutes'
  ) returning * into created_state;

  return jsonb_build_object(
    'id', created_state.id,
    'expiresAt', created_state.expires_at
  );
end;
$$;

create function public.consume_tiktok_oauth_state(p_state_hash text)
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
    and candidate.provider = 'tiktok'
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
  where state_hash = p_state_hash and provider = 'tiktok';

  if not found then
    raise exception 'INVALID_OAUTH_STATE' using errcode = 'P0002';
  elsif state_row.consumed_at is not null then
    raise exception 'OAUTH_STATE_ALREADY_USED' using errcode = 'P0001';
  else
    raise exception 'OAUTH_STATE_EXPIRED' using errcode = 'P0001';
  end if;
end;
$$;

create function public.upsert_tiktok_connection(
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
  scopes text[];
begin
  if not private.is_social_connection_manager(p_workspace_id, p_actor_id) then
    raise exception 'WORKSPACE_ROLE_DENIED' using errcode = '42501';
  end if;
  if p_connection is null or jsonb_typeof(p_connection) <> 'object'
     or p_connection ->> 'platform' <> 'tiktok'
     or p_connection ->> 'accountType' <> 'tiktok_user'
     or coalesce(btrim(p_connection ->> 'platformAccountId'), '') = ''
     or coalesce(btrim(p_connection ->> 'accountName'), '') = ''
     or coalesce(p_connection ->> 'encryptedAccessToken', '') = ''
     or coalesce(p_connection ->> 'accessTokenIv', '') = ''
     or coalesce(p_connection ->> 'encryptedRefreshToken', '') = ''
     or coalesce(p_connection ->> 'refreshTokenIv', '') = ''
     or nullif(p_connection ->> 'tokenExpiresAt', '') is null
     or nullif(p_connection ->> 'refreshTokenExpiresAt', '') is null
     or jsonb_typeof(coalesce(p_connection -> 'grantedScopes', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_connection -> 'metadata', '{}'::jsonb)) <> 'object' then
    raise exception 'INVALID_CONNECTION_PAYLOAD' using errcode = '22023';
  end if;
  scopes := array(select jsonb_array_elements_text(p_connection -> 'grantedScopes'));
  if not ('user.info.basic' = any(scopes)) then
    raise exception 'TIKTOK_REQUIRED_SCOPE_MISSING' using errcode = '42501';
  end if;

  insert into public.social_accounts (
    workspace_id, platform, account_type, platform_account_id, account_name,
    username, profile_image_url, connection_status, connected_by, connected_at,
    token_expires_at, last_refreshed_at, last_error_code, last_error_message,
    granted_scopes, metadata, disconnected_at
  ) values (
    p_workspace_id, 'tiktok'::public.social_platform,
    'tiktok_user'::public.social_account_type,
    btrim(p_connection ->> 'platformAccountId'), btrim(p_connection ->> 'accountName'),
    null, nullif(p_connection ->> 'profileImageUrl', ''),
    'connected'::public.social_connection_status, p_actor_id, now(),
    (p_connection ->> 'tokenExpiresAt')::timestamptz, now(), null, null,
    scopes, coalesce(p_connection -> 'metadata', '{}'::jsonb), null
  )
  on conflict on constraint social_accounts_workspace_platform_account_key
  do update set
    account_type = excluded.account_type,
    account_name = excluded.account_name,
    username = null,
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
    p_connection ->> 'accessTokenIv', p_connection ->> 'encryptedRefreshToken',
    p_connection ->> 'refreshTokenIv', nullif(p_connection ->> 'tokenType', ''),
    account_row.token_expires_at, account_row.granted_scopes,
    jsonb_build_object(
      'encryptionVersion', 1,
      'refreshTokenExpiresAt', p_connection ->> 'refreshTokenExpiresAt'
    )
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

create function public.update_tiktok_connection_tokens(
  p_social_account_id uuid,
  p_actor_id uuid,
  p_encrypted_access_token text,
  p_access_token_iv text,
  p_encrypted_refresh_token text,
  p_refresh_token_iv text,
  p_token_type text,
  p_token_expires_at timestamptz,
  p_refresh_token_expires_at timestamptz,
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
  where id = p_social_account_id and platform = 'tiktok'::public.social_platform
  for update;
  if not found or not private.is_social_connection_manager(account_row.workspace_id, p_actor_id) then
    raise exception 'SOCIAL_ACCOUNT_NOT_FOUND_OR_DENIED' using errcode = 'P0002';
  end if;
  if coalesce(p_encrypted_access_token, '') = ''
     or coalesce(p_access_token_iv, '') = ''
     or coalesce(p_encrypted_refresh_token, '') = ''
     or coalesce(p_refresh_token_iv, '') = ''
     or p_token_expires_at is null
     or p_refresh_token_expires_at is null
     or p_granted_scopes is null
     or not ('user.info.basic' = any(p_granted_scopes)) then
    raise exception 'INVALID_CONNECTION_PAYLOAD' using errcode = '22023';
  end if;

  update private.social_credentials
  set encrypted_access_token = p_encrypted_access_token,
      access_token_iv = p_access_token_iv,
      encrypted_refresh_token = p_encrypted_refresh_token,
      refresh_token_iv = p_refresh_token_iv,
      token_type = nullif(p_token_type, ''),
      expires_at = p_token_expires_at,
      granted_scopes = p_granted_scopes,
      provider_metadata = coalesce(provider_metadata, '{}'::jsonb) || jsonb_build_object(
        'encryptionVersion', 1,
        'refreshTokenExpiresAt', p_refresh_token_expires_at
      )
  where social_account_id = p_social_account_id;
  if not found then
    raise exception 'SOCIAL_ACCOUNT_NOT_FOUND_OR_DENIED' using errcode = 'P0002';
  end if;

  update public.social_accounts
  set token_expires_at = p_token_expires_at,
      granted_scopes = p_granted_scopes,
      last_refreshed_at = now(),
      connection_status = 'connected'::public.social_connection_status,
      last_error_code = null,
      last_error_message = null,
      disconnected_at = null
  where id = p_social_account_id
  returning * into account_row;

  return jsonb_build_object(
    'id', account_row.id,
    'connectionStatus', account_row.connection_status,
    'lastRefreshedAt', account_row.last_refreshed_at,
    'warning', null
  );
end;
$$;

revoke all on function public.begin_tiktok_oauth(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.consume_tiktok_oauth_state(text)
  from public, anon, authenticated;
revoke all on function public.upsert_tiktok_connection(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.update_tiktok_connection_tokens(
  uuid, uuid, text, text, text, text, text, timestamptz, timestamptz, text[]
) from public, anon, authenticated;

grant execute on function public.begin_tiktok_oauth(uuid, uuid, text, text) to service_role;
grant execute on function public.consume_tiktok_oauth_state(text) to service_role;
grant execute on function public.upsert_tiktok_connection(uuid, uuid, jsonb) to service_role;
grant execute on function public.update_tiktok_connection_tokens(
  uuid, uuid, text, text, text, text, text, timestamptz, timestamptz, text[]
) to service_role;

commit;
