-- Stage 2C Instagram connection regression coverage.
-- Run only against a disposable/local database. The transaction always rolls back.

begin;

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000008001',
  'authenticated', 'authenticated', 'stage-2c-regression@example.test', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

do $$
declare
  actor_id uuid := '00000000-0000-0000-0000-000000008001';
  target_workspace_id uuid;
  facebook_id uuid := '00000000-0000-0000-0000-000000008002';
  first_result jsonb;
  second_result jsonb;
begin
  select membership.workspace_id into target_workspace_id
  from public.workspace_members as membership
  where membership.user_id = actor_id
  limit 1;

  insert into public.social_accounts(
    id, workspace_id, platform, account_type, platform_account_id, account_name,
    connection_status, connected_by, connected_at, granted_scopes
  ) values (
    facebook_id, target_workspace_id, 'facebook', 'facebook_page', 'stage-2c-page',
    'Ithaca Digital Solutions', 'connected', actor_id, now(),
    array[
      'pages_show_list','pages_read_engagement','pages_manage_posts',
      'instagram_basic','instagram_content_publish'
    ]::text[]
  );

  insert into private.social_credentials(
    social_account_id, encrypted_access_token, access_token_iv, token_type,
    granted_scopes
  ) values (
    facebook_id, 'encrypted-page-token', 'test-iv', 'bearer',
    array[
      'pages_show_list','pages_read_engagement','pages_manage_posts',
      'instagram_basic','instagram_content_publish'
    ]::text[]
  );

  first_result := public.upsert_linked_instagram_connection(
    facebook_id, actor_id,
    '{
      "platform":"instagram",
      "platformAccountId":"stage-2c-instagram",
      "accountName":"ithacadigitalsolutions",
      "username":"ithacadigitalsolutions",
      "profileImageUrl":null,
      "accountType":"instagram_business",
      "parentPageId":"stage-2c-page",
      "tokenType":"bearer",
      "tokenExpiresAt":null,
      "encryptedAccessToken":"encrypted-page-token-copy-1",
      "accessTokenIv":"test-iv-1",
      "metadata":{}
    }'::jsonb
  );
  second_result := public.upsert_linked_instagram_connection(
    facebook_id, actor_id,
    '{
      "platform":"instagram",
      "platformAccountId":"stage-2c-instagram",
      "accountName":"ithacadigitalsolutions-updated",
      "username":"ithacadigitalsolutions",
      "profileImageUrl":null,
      "accountType":"instagram_business",
      "parentPageId":"stage-2c-page",
      "tokenType":"bearer",
      "tokenExpiresAt":null,
      "encryptedAccessToken":"encrypted-page-token-copy-2",
      "accessTokenIv":"test-iv-2",
      "metadata":{}
    }'::jsonb
  );

  if first_result ->> 'id' <> second_result ->> 'id'
     or (select count(*) from public.social_accounts
         where social_accounts.workspace_id = target_workspace_id and platform = 'instagram'
           and platform_account_id = 'stage-2c-instagram') <> 1
     or (select count(*) from public.social_accounts
         where id = facebook_id and platform = 'facebook') <> 1
     or (select count(*) from private.social_credentials as credential
         join public.social_accounts as account on account.id = credential.social_account_id
         where account.workspace_id = target_workspace_id
           and account.platform = 'instagram'
           and account.platform_account_id = 'stage-2c-instagram') <> 1 then
    raise exception 'Stage 2C reconnect was not idempotent';
  end if;
  if first_result ? 'encryptedAccessToken'
     or first_result ? 'accessTokenIv'
     or second_result ? 'encryptedAccessToken'
     or second_result ? 'accessTokenIv' then
    raise exception 'Stage 2C returned credential material';
  end if;
end;
$$;

rollback;
