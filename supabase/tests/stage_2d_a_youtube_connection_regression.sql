-- Stage 2D-A YouTube connection regression coverage.
-- Run only against a disposable/local database. The transaction always rolls back.

begin;

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000009001',
  'authenticated', 'authenticated', 'stage-2d-a-regression@example.test', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
), (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000009002',
  'authenticated', 'authenticated', 'stage-2d-a-outsider@example.test', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

do $$
declare
  actor_id uuid := '00000000-0000-0000-0000-000000009001';
  outsider_id uuid := '00000000-0000-0000-0000-000000009002';
  target_workspace_id uuid;
  first_result jsonb;
  second_result jsonb;
  youtube_id uuid;
begin
  select membership.workspace_id into target_workspace_id
  from public.workspace_members as membership
  where membership.user_id = actor_id
  limit 1;

  perform public.begin_youtube_oauth(
    target_workspace_id, actor_id, repeat('a', 64), '/dashboard/accounts'
  );
  perform public.consume_youtube_oauth_state(repeat('a', 64));
  begin
    perform public.consume_youtube_oauth_state(repeat('a', 64));
    raise exception 'Stage 2D-A reused OAuth state was accepted';
  exception when others then
    if sqlerrm not like '%OAUTH_STATE_ALREADY_USED%' then raise; end if;
  end;

  begin
    perform public.begin_youtube_oauth(
      target_workspace_id, outsider_id, repeat('b', 64), '/dashboard/accounts'
    );
    raise exception 'Stage 2D-A cross-workspace OAuth start was accepted';
  exception when insufficient_privilege then
    null;
  end;

  first_result := public.upsert_youtube_connection(
    target_workspace_id, actor_id,
    '{
      "platform":"youtube",
      "accountType":"youtube_channel",
      "platformAccountId":"stage-2d-a-channel",
      "accountName":"Towkn Channel",
      "username":"towkn",
      "profileImageUrl":"https://example.test/avatar.jpg",
      "tokenType":"Bearer",
      "tokenExpiresAt":"2099-01-01T00:00:00Z",
      "grantedScopes":[
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube.upload"
      ],
      "encryptedAccessToken":"encrypted-access-1",
      "accessTokenIv":"access-iv-1",
      "encryptedRefreshToken":"encrypted-refresh-1",
      "refreshTokenIv":"refresh-iv-1",
      "metadata":{}
    }'::jsonb
  );
  youtube_id := (first_result ->> 'id')::uuid;

  second_result := public.upsert_youtube_connection(
    target_workspace_id, actor_id,
    '{
      "platform":"youtube",
      "accountType":"youtube_channel",
      "platformAccountId":"stage-2d-a-channel",
      "accountName":"Towkn Channel Updated",
      "username":"towkn-updated",
      "profileImageUrl":null,
      "tokenType":"Bearer",
      "tokenExpiresAt":"2099-01-02T00:00:00Z",
      "grantedScopes":["https://www.googleapis.com/auth/youtube.readonly"],
      "encryptedAccessToken":"encrypted-access-2",
      "accessTokenIv":"access-iv-2",
      "encryptedRefreshToken":null,
      "refreshTokenIv":null,
      "metadata":{}
    }'::jsonb
  );

  if first_result ->> 'id' <> second_result ->> 'id'
     or (select count(*) from public.social_accounts
         where workspace_id = target_workspace_id and platform = 'youtube'
           and platform_account_id = 'stage-2d-a-channel') <> 1 then
    raise exception 'Stage 2D-A reconnect was not idempotent';
  end if;
  if second_result ->> 'accountName' <> 'Towkn Channel Updated'
     or second_result ? 'encryptedAccessToken'
     or second_result ? 'encryptedRefreshToken'
     or second_result ? 'accessTokenIv'
     or second_result ? 'refreshTokenIv' then
    raise exception 'Stage 2D-A returned credential material or failed metadata update';
  end if;
  if (select encrypted_refresh_token from private.social_credentials
      where social_account_id = youtube_id) <> 'encrypted-refresh-1' then
    raise exception 'Stage 2D-A reconnect did not preserve the stored refresh credential';
  end if;

  perform public.update_youtube_connection_refresh(
    youtube_id, actor_id, 'Refreshed Channel', 'refreshed', null,
    'encrypted-access-3', 'access-iv-3', null, null, 'Bearer',
    '2099-01-03T00:00:00Z',
    array['https://www.googleapis.com/auth/youtube.readonly']::text[]
  );
  if (select connection_status <> 'connected' or account_name <> 'Refreshed Channel'
      from public.social_accounts where id = youtube_id) then
    raise exception 'Stage 2D-A refresh did not update the channel safely';
  end if;

  perform public.disconnect_social_account(youtube_id, actor_id, null);
  if (select connection_status <> 'disconnected' from public.social_accounts where id = youtube_id)
     or exists(select 1 from private.social_credentials where social_account_id = youtube_id) then
    raise exception 'Stage 2D-A disconnect did not isolate and remove the selected credential';
  end if;
end;
$$;

select
  has_function_privilege('authenticated', 'public.begin_youtube_oauth(uuid,uuid,text,text)', 'EXECUTE')
    as browser_can_begin,
  has_function_privilege('authenticated', 'public.upsert_youtube_connection(uuid,uuid,jsonb)', 'EXECUTE')
    as browser_can_upsert,
  has_function_privilege('service_role', 'public.upsert_youtube_connection(uuid,uuid,jsonb)', 'EXECUTE')
    as service_role_can_upsert,
  has_table_privilege('authenticated', 'private.social_credentials', 'SELECT')
    as browser_can_read_credentials;

rollback;
