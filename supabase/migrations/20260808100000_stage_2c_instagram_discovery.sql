begin;

-- Refreshing a connected Facebook Page may discover a linked Instagram
-- Professional account after the original OAuth. Only the trusted Edge
-- Function can call this RPC; browser roles cannot supply credentials.
create function public.upsert_linked_instagram_connection(
  p_parent_social_account_id uuid,
  p_actor_id uuid,
  p_connection jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_account public.social_accounts%rowtype;
  account_row public.social_accounts%rowtype;
  token_expiry timestamptz;
begin
  select * into parent_account
  from public.social_accounts
  where id = p_parent_social_account_id
  for update;

  if not found
     or parent_account.platform <> 'facebook'::public.social_platform
     or not private.is_social_connection_manager(parent_account.workspace_id, p_actor_id) then
    raise exception 'SOCIAL_ACCOUNT_NOT_FOUND_OR_DENIED' using errcode = 'P0002';
  end if;
  if p_connection is null
     or jsonb_typeof(p_connection) <> 'object'
     or p_connection ->> 'platform' <> 'instagram'
     or p_connection ->> 'parentPageId' <> parent_account.platform_account_id
     or coalesce(p_connection ->> 'accountType', '') not in ('instagram_business', 'instagram_creator')
     or coalesce(btrim(p_connection ->> 'platformAccountId'), '') = ''
     or coalesce(btrim(p_connection ->> 'accountName'), '') = ''
     or coalesce(btrim(p_connection ->> 'encryptedAccessToken'), '') = ''
     or coalesce(btrim(p_connection ->> 'accessTokenIv'), '') = ''
     or jsonb_typeof(coalesce(p_connection -> 'metadata', '{}'::jsonb)) <> 'object' then
    raise exception 'INVALID_CONNECTION_PAYLOAD' using errcode = '22023';
  end if;
  if not parent_account.granted_scopes @> array[
    'pages_show_list',
    'pages_read_engagement',
    'instagram_basic',
    'instagram_content_publish'
  ]::text[] then
    raise exception 'META_PERMISSION_DENIED' using errcode = '42501';
  end if;

  token_expiry := nullif(p_connection ->> 'tokenExpiresAt', '')::timestamptz;

  insert into public.social_accounts (
    workspace_id, platform, account_type, platform_account_id, account_name,
    username, profile_image_url, parent_platform_account_id, connection_status,
    connected_by, connected_at, token_expires_at, last_refreshed_at,
    last_error_code, last_error_message, granted_scopes, metadata, disconnected_at
  ) values (
    parent_account.workspace_id,
    'instagram'::public.social_platform,
    (p_connection ->> 'accountType')::public.social_account_type,
    p_connection ->> 'platformAccountId',
    p_connection ->> 'accountName',
    nullif(p_connection ->> 'username', ''),
    nullif(p_connection ->> 'profileImageUrl', ''),
    parent_account.platform_account_id,
    'connected'::public.social_connection_status,
    p_actor_id, now(), token_expiry, now(), null, null,
    parent_account.granted_scopes,
    coalesce(p_connection -> 'metadata', '{}'::jsonb)
      || jsonb_build_object(
        'credentialSource', 'facebook_page',
        'parentSocialAccountId', parent_account.id
      ),
    null
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
    account_row.id,
    p_connection ->> 'encryptedAccessToken',
    p_connection ->> 'accessTokenIv',
    nullif(p_connection ->> 'tokenType', ''),
    token_expiry,
    parent_account.granted_scopes,
    jsonb_build_object(
      'encryptionVersion', 1,
      'credentialSource', 'facebook_page',
      'parentSocialAccountId', parent_account.id
    )
  )
  on conflict (social_account_id) do update set
    encrypted_access_token = excluded.encrypted_access_token,
    access_token_iv = excluded.access_token_iv,
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
    'parentPageId', account_row.parent_platform_account_id,
    'connectionStatus', account_row.connection_status,
    'tokenExpiresAt', account_row.token_expires_at
  );
end;
$$;

revoke all on function public.upsert_linked_instagram_connection(uuid, uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.upsert_linked_instagram_connection(uuid, uuid, jsonb)
to service_role;

commit;
