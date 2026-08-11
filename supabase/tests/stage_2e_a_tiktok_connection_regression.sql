-- Stage 2E-A TikTok connection regression coverage.
-- Run only against a disposable/local database. The transaction always rolls back.

begin;

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-00000000e001','authenticated','authenticated','tiktok-owner@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-00000000e002','authenticated','authenticated','tiktok-admin@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-00000000e003','authenticated','authenticated','tiktok-viewer@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-00000000e004','authenticated','authenticated','tiktok-outsider@example.test','',now(),'{}','{}',now(),now());

insert into public.workspaces(id, name, slug, created_by)
values
  ('00000000-0000-0000-0000-00000000e101','TikTok Workspace One','tiktok-stage-2e-one','00000000-0000-0000-0000-00000000e001'),
  ('00000000-0000-0000-0000-00000000e102','TikTok Workspace Two','tiktok-stage-2e-two','00000000-0000-0000-0000-00000000e004');

insert into public.workspace_members(workspace_id, user_id, role, status, joined_at)
values
  ('00000000-0000-0000-0000-00000000e101','00000000-0000-0000-0000-00000000e001','owner','active',now()),
  ('00000000-0000-0000-0000-00000000e101','00000000-0000-0000-0000-00000000e002','administrator','active',now()),
  ('00000000-0000-0000-0000-00000000e101','00000000-0000-0000-0000-00000000e003','viewer','active',now()),
  ('00000000-0000-0000-0000-00000000e102','00000000-0000-0000-0000-00000000e004','owner','active',now());

do $$
declare
  workspace_one uuid := '00000000-0000-0000-0000-00000000e101';
  workspace_two uuid := '00000000-0000-0000-0000-00000000e102';
  owner_id uuid := '00000000-0000-0000-0000-00000000e001';
  admin_id uuid := '00000000-0000-0000-0000-00000000e002';
  viewer_id uuid := '00000000-0000-0000-0000-00000000e003';
  outsider_id uuid := '00000000-0000-0000-0000-00000000e004';
  first_result jsonb;
  second_result jsonb;
  other_workspace_result jsonb;
  connect_state jsonb;
  upgrade_state jsonb;
  tiktok_id uuid;
begin
  -- Owner and administrator may begin; lesser roles and outsiders may not.
  perform public.begin_tiktok_oauth(workspace_one, owner_id, repeat('a', 64), '/dashboard/accounts');
  perform public.begin_tiktok_oauth(workspace_one, admin_id, repeat('b', 64), '/dashboard/accounts');
  begin
    perform public.begin_tiktok_oauth(workspace_one, viewer_id, repeat('c', 64), '/dashboard/accounts');
    raise exception 'Stage 2E-A viewer OAuth start was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.begin_tiktok_oauth(workspace_one, outsider_id, repeat('d', 64), '/dashboard/accounts');
    raise exception 'Stage 2E-A cross-workspace OAuth start was accepted';
  exception when insufficient_privilege then null;
  end;

  connect_state := public.consume_tiktok_oauth_state(repeat('a', 64));
  if connect_state ->> 'intent' <> 'connect'
     or connect_state -> 'requestedScopes' <> '["user.info.basic"]'::jsonb
     or connect_state ->> 'pendingConnectionId' is not null
     or connect_state ->> 'expectedPlatformAccountId' is not null then
    raise exception 'Stage 2E-B compatibility OAuth state was not a basic connection';
  end if;
  begin
    perform public.consume_tiktok_oauth_state(repeat('a', 64));
    raise exception 'Stage 2E-A reused OAuth state was accepted';
  exception when others then
    if sqlerrm not like '%OAUTH_STATE_ALREADY_USED%' then raise; end if;
  end;
  begin
    perform public.consume_tiktok_oauth_state(repeat('f', 64));
    raise exception 'Stage 2E-A invalid OAuth state was accepted';
  exception when others then
    if sqlerrm not like '%INVALID_OAUTH_STATE%' then raise; end if;
  end;
  insert into private.oauth_connection_states(
    state_hash, workspace_id, initiated_by, provider, return_path,
    created_at, expires_at
  ) values (
    repeat('e', 64), workspace_one, owner_id, 'tiktok', '/dashboard/accounts',
    now() - interval '11 minutes', now() - interval '1 minute'
  );
  begin
    perform public.consume_tiktok_oauth_state(repeat('e', 64));
    raise exception 'Stage 2E-A expired OAuth state was accepted';
  exception when others then
    if sqlerrm not like '%OAUTH_STATE_EXPIRED%' then raise; end if;
  end;

  first_result := public.upsert_tiktok_connection(workspace_one, owner_id, '{
    "platform":"tiktok","accountType":"tiktok_user",
    "platformAccountId":"stage-2e-open-id","accountName":"Towkn Creator",
    "username":null,"profileImageUrl":"https://example.test/avatar.jpg",
    "tokenType":"Bearer","tokenExpiresAt":"2099-01-01T00:00:00Z",
    "refreshTokenExpiresAt":"2099-12-31T00:00:00Z",
    "grantedScopes":["user.info.basic"],
    "encryptedAccessToken":"encrypted-access-1","accessTokenIv":"access-iv-1",
    "encryptedRefreshToken":"encrypted-refresh-1","refreshTokenIv":"refresh-iv-1",
    "metadata":{}
  }'::jsonb);
  tiktok_id := (first_result ->> 'id')::uuid;

  perform public.begin_tiktok_oauth(
    workspace_one, owner_id, repeat('1', 64), '/dashboard/accounts',
    'enable_publishing', tiktok_id
  );
  upgrade_state := public.consume_tiktok_oauth_state(repeat('1', 64));
  if upgrade_state ->> 'intent' <> 'enable_publishing'
     or (upgrade_state ->> 'pendingConnectionId')::uuid <> tiktok_id
     or upgrade_state ->> 'expectedPlatformAccountId' <> 'stage-2e-open-id'
     or upgrade_state -> 'requestedScopes'
        <> '["user.info.basic","video.publish"]'::jsonb then
    raise exception 'Stage 2E-B publishing upgrade state was not bound to the TikTok account';
  end if;
  begin
    perform public.begin_tiktok_oauth(
      workspace_one, owner_id, repeat('2', 64), '/dashboard/accounts',
      'replace_account', tiktok_id
    );
    raise exception 'Stage 2E-B accepted an unknown OAuth intent';
  exception when others then
    if sqlerrm not like '%INVALID_TIKTOK_OAUTH_INTENT%' then raise; end if;
  end;
  begin
    perform public.begin_tiktok_oauth(
      workspace_one, owner_id, repeat('3', 64), '/dashboard/accounts',
      'enable_publishing', null
    );
    raise exception 'Stage 2E-B accepted an unbound publishing upgrade';
  exception when others then
    if sqlerrm not like '%INVALID_TIKTOK_OAUTH_STATE%' then raise; end if;
  end;

  second_result := public.upsert_tiktok_connection(workspace_one, admin_id, '{
    "platform":"tiktok","accountType":"tiktok_user",
    "platformAccountId":"stage-2e-open-id","accountName":"Towkn Creator Updated",
    "username":null,"profileImageUrl":null,
    "tokenType":"Bearer","tokenExpiresAt":"2099-01-02T00:00:00Z",
    "refreshTokenExpiresAt":"2099-12-30T00:00:00Z",
    "grantedScopes":["user.info.basic"],
    "encryptedAccessToken":"encrypted-access-2","accessTokenIv":"access-iv-2",
    "encryptedRefreshToken":"encrypted-refresh-2","refreshTokenIv":"refresh-iv-2",
    "metadata":{}
  }'::jsonb);

  if first_result ->> 'id' <> second_result ->> 'id'
     or (select count(*) from public.social_accounts where workspace_id = workspace_one
         and platform = 'tiktok' and platform_account_id = 'stage-2e-open-id') <> 1 then
    raise exception 'Stage 2E-A reconnect was not idempotent';
  end if;
  if second_result ? 'encryptedAccessToken' or second_result ? 'encryptedRefreshToken'
     or second_result ? 'accessTokenIv' or second_result ? 'refreshTokenIv' then
    raise exception 'Stage 2E-A returned credential material';
  end if;
  if exists(
    select 1 from public.social_accounts as account
    where account.id = tiktok_id and (
      to_jsonb(account)::text like '%encrypted-access-2%'
      or to_jsonb(account)::text like '%encrypted-refresh-2%'
    )
  ) then
    raise exception 'Stage 2E-A exposed plaintext credential material publicly';
  end if;

  other_workspace_result := public.upsert_tiktok_connection(workspace_two, outsider_id, '{
    "platform":"tiktok","accountType":"tiktok_user",
    "platformAccountId":"stage-2e-open-id","accountName":"Separate Workspace Creator",
    "username":null,"profileImageUrl":null,
    "tokenType":"Bearer","tokenExpiresAt":"2099-01-01T00:00:00Z",
    "refreshTokenExpiresAt":"2099-12-31T00:00:00Z",
    "grantedScopes":["user.info.basic"],
    "encryptedAccessToken":"encrypted-access-other","accessTokenIv":"access-iv-other",
    "encryptedRefreshToken":"encrypted-refresh-other","refreshTokenIv":"refresh-iv-other",
    "metadata":{}
  }'::jsonb);
  if other_workspace_result ->> 'id' = first_result ->> 'id' then
    raise exception 'Stage 2E-A did not isolate the same TikTok user by workspace';
  end if;

  perform public.update_tiktok_connection_tokens(
    tiktok_id, owner_id, 'encrypted-access-rotated', 'access-iv-rotated',
    'encrypted-refresh-rotated', 'refresh-iv-rotated', 'Bearer',
    '2099-02-01T00:00:00Z', '2099-11-30T00:00:00Z',
    array['user.info.basic', 'video.publish']::text[]
  );
  if (select encrypted_refresh_token from private.social_credentials
      where social_account_id = tiktok_id) <> 'encrypted-refresh-rotated' then
    raise exception 'Stage 2E-A did not persist the rotated refresh credential';
  end if;
  if (select provider_metadata ->> 'refreshTokenExpiresAt'
      from private.social_credentials where social_account_id = tiktok_id) is null then
    raise exception 'Stage 2E-A did not retain refresh-token expiry privately';
  end if;
  if not (
    (select 'video.publish' = any(granted_scopes) from public.social_accounts
      where id = tiktok_id)
    and
    (select 'video.publish' = any(granted_scopes) from private.social_credentials
      where social_account_id = tiktok_id)
  ) then
    raise exception 'Stage 2E-B did not persist publishing scope in both stores';
  end if;

  perform public.update_tiktok_connection_tokens(
    tiktok_id, owner_id, 'encrypted-access-downgraded', 'access-iv-downgraded',
    'encrypted-refresh-downgraded', 'refresh-iv-downgraded', 'Bearer',
    '2099-03-01T00:00:00Z', '2099-10-31T00:00:00Z',
    array['user.info.basic']::text[]
  );
  if
    (select 'video.publish' = any(granted_scopes) from public.social_accounts
      where id = tiktok_id)
    or
    (select 'video.publish' = any(granted_scopes) from private.social_credentials
      where social_account_id = tiktok_id)
  then
    raise exception 'Stage 2E-B retained stale publishing capability after scope downgrade';
  end if;

  perform public.disconnect_social_account(tiktok_id, owner_id, 'TIKTOK_REVOCATION_FAILED');
  if (select connection_status <> 'disconnected' from public.social_accounts where id = tiktok_id)
     or exists(select 1 from private.social_credentials where social_account_id = tiktok_id) then
    raise exception 'Stage 2E-A disconnect did not remove the local credential';
  end if;
end;
$$;

select
  has_function_privilege('authenticated', 'public.begin_tiktok_oauth(uuid,uuid,text,text)', 'EXECUTE')
    as browser_can_begin,
  has_function_privilege('authenticated', 'public.begin_tiktok_oauth(uuid,uuid,text,text,text,uuid)', 'EXECUTE')
    as browser_can_begin_publishing_upgrade,
  has_function_privilege('authenticated', 'public.consume_tiktok_oauth_state(text)', 'EXECUTE')
    as browser_can_consume,
  has_function_privilege('authenticated', 'public.upsert_tiktok_connection(uuid,uuid,jsonb)', 'EXECUTE')
    as browser_can_upsert,
  has_function_privilege('authenticated', 'public.update_tiktok_connection_tokens(uuid,uuid,text,text,text,text,text,timestamptz,timestamptz,text[])', 'EXECUTE')
    as browser_can_update_tokens,
  has_function_privilege('service_role', 'public.upsert_tiktok_connection(uuid,uuid,jsonb)', 'EXECUTE')
    as service_role_can_upsert,
  has_function_privilege('service_role', 'public.begin_tiktok_oauth(uuid,uuid,text,text,text,uuid)', 'EXECUTE')
    as service_role_can_begin_publishing_upgrade,
  has_table_privilege('authenticated', 'private.social_credentials', 'SELECT')
    as browser_can_read_credentials;

rollback;
