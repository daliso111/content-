-- Stage 2E-C TikTok publishing regression coverage.
-- Run only against a disposable/local database. The transaction always rolls back.
begin;

create temporary table stage_2e_c_ids(scenario text primary key, post_id uuid not null) on commit drop;
grant select, insert on stage_2e_c_ids to authenticated;

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-00000000e201',
  'authenticated', 'authenticated', 'stage-2e-c-regression@example.test', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

do $$
declare
  actor_id uuid := '00000000-0000-4000-8000-00000000e201';
  workspace_id uuid;
begin
  select membership.workspace_id into workspace_id
  from public.workspace_members as membership where membership.user_id = actor_id limit 1;
  insert into public.social_accounts(
    id, workspace_id, platform, account_type, platform_account_id, account_name,
    connection_status, connected_by, connected_at, token_expires_at, granted_scopes
  ) values (
    '00000000-0000-4000-8000-00000000e202', workspace_id, 'tiktok', 'tiktok_user',
    'stage-2e-c-open-id', 'Stage 2E-C TikTok', 'connected', actor_id, now(),
    now() + interval '1 hour', array['user.info.basic','video.publish']::text[]
  ), (
    '00000000-0000-4000-8000-00000000e203', workspace_id, 'facebook', 'facebook_page',
    'stage-2e-c-page', 'Stage 2E-C Facebook', 'connected', actor_id, now(), null,
    array['pages_show_list','pages_read_engagement','pages_manage_posts']::text[]
  );
  insert into private.social_credentials(
    social_account_id, encrypted_access_token, access_token_iv,
    encrypted_refresh_token, refresh_token_iv, token_type, expires_at,
    granted_scopes, provider_metadata
  ) values (
    '00000000-0000-4000-8000-00000000e202', 'encrypted-tiktok-access', 'tiktok-access-iv',
    'encrypted-tiktok-refresh', 'tiktok-refresh-iv', 'Bearer', now() + interval '1 hour',
    array['user.info.basic','video.publish']::text[],
    jsonb_build_object('refreshTokenExpiresAt', now() + interval '30 days')
  ), (
    '00000000-0000-4000-8000-00000000e203', 'encrypted-facebook-access', 'facebook-access-iv',
    null, null, 'bearer', null,
    array['pages_show_list','pages_read_engagement','pages_manage_posts']::text[], '{}'
  );
  insert into public.media_assets(
    id, workspace_id, uploaded_by, media_type, file_name, storage_bucket,
    storage_path, mime_type, file_size, width, height, duration_seconds
  ) values (
    '00000000-0000-4000-8000-00000000e204', workspace_id, actor_id, 'video',
    'stage-2e-c.mp4', 'postflow-media', workspace_id::text || '/stage-2e-c.mp4',
    'video/mp4', 1048576, 1080, 1920, 30
  );
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-4000-8000-00000000e201', 'role', 'authenticated'
)::text, true);

do $$
declare
  workspace_id uuid;
  tiktok_id uuid := '00000000-0000-4000-8000-00000000e202';
  facebook_id uuid := '00000000-0000-4000-8000-00000000e203';
  media_id uuid := '00000000-0000-4000-8000-00000000e204';
  immediate_post public.posts%rowtype; scheduled_post public.posts%rowtype; mixed_post public.posts%rowtype;
  malformed_post public.posts%rowtype;
  tiktok_platform jsonb := '[{"platform":"tiktok","platform_caption":"TikTok caption","platform_title":null,"platform_settings":{"privacyLevel":"SELF_ONLY","disableComment":true,"disableDuet":true,"disableStitch":true,"brandContentToggle":false,"brandOrganicToggle":false,"publishConsent":true,"creatorMaxVideoPostDurationSec":180}}]'::jsonb;
  mixed_platforms jsonb := '[{"platform":"facebook","platform_caption":null,"platform_title":null,"platform_settings":{}},{"platform":"tiktok","platform_caption":"Mixed TikTok caption","platform_title":null,"platform_settings":{"privacyLevel":"SELF_ONLY","disableComment":true,"disableDuet":true,"disableStitch":true,"brandContentToggle":false,"brandOrganicToggle":false,"publishConsent":true,"creatorMaxVideoPostDurationSec":180}}]'::jsonb;
begin
  select wm.workspace_id into workspace_id from public.workspace_members wm where wm.user_id = auth.uid() limit 1;
  immediate_post := public.create_post(workspace_id, 'Immediate TikTok', 'draft', null, 'UTC', false, null, tiktok_platform, array[media_id], array[tiktok_id]);
  perform public.request_publish_now(immediate_post.id, immediate_post.revision);
  insert into stage_2e_c_ids values ('immediate', immediate_post.id);

  scheduled_post := public.create_post(workspace_id, 'Scheduled TikTok', 'scheduled', clock_timestamp() + interval '100 milliseconds', 'UTC', false, null, tiktok_platform, array[media_id], array[tiktok_id]);
  insert into stage_2e_c_ids values ('scheduled', scheduled_post.id);

  mixed_post := public.create_post(workspace_id, 'Mixed TikTok and Facebook', 'draft', null, 'UTC', false, null, mixed_platforms, array[media_id], array[facebook_id,tiktok_id]);
  perform public.request_publish_now(mixed_post.id, mixed_post.revision);
  insert into stage_2e_c_ids values ('mixed', mixed_post.id);

  malformed_post := public.create_post(
    workspace_id, 'Missing brand content flag', 'draft', null, 'UTC', false, null,
    jsonb_set(tiktok_platform, '{0,platform_settings}', (tiktok_platform #> '{0,platform_settings}') - 'brandContentToggle'),
    array[media_id], array[tiktok_id]
  );
  insert into stage_2e_c_ids values ('missing-brand-content', malformed_post.id);

  malformed_post := public.create_post(
    workspace_id, 'Null brand content flag', 'draft', null, 'UTC', false, null,
    jsonb_set(tiktok_platform, '{0,platform_settings,brandContentToggle}', 'null'::jsonb),
    array[media_id], array[tiktok_id]
  );
  insert into stage_2e_c_ids values ('null-brand-content', malformed_post.id);

  malformed_post := public.create_post(
    workspace_id, 'Missing brand organic flag', 'draft', null, 'UTC', false, null,
    jsonb_set(tiktok_platform, '{0,platform_settings}', (tiktok_platform #> '{0,platform_settings}') - 'brandOrganicToggle'),
    array[media_id], array[tiktok_id]
  );
  insert into stage_2e_c_ids values ('missing-brand-organic', malformed_post.id);

  malformed_post := public.create_post(
    workspace_id, 'Null brand organic flag', 'draft', null, 'UTC', false, null,
    jsonb_set(tiktok_platform, '{0,platform_settings,brandOrganicToggle}', 'null'::jsonb),
    array[media_id], array[tiktok_id]
  );
  insert into stage_2e_c_ids values ('null-brand-organic', malformed_post.id);
end;
$$;
reset role;

do $$
declare immediate_id uuid; scheduled_id uuid; mixed_id uuid; malformed record;
begin
  select post_id into immediate_id from stage_2e_c_ids where scenario = 'immediate';
  select post_id into scheduled_id from stage_2e_c_ids where scenario = 'scheduled';
  select post_id into mixed_id from stage_2e_c_ids where scenario = 'mixed';
  if (select count(*) from public.publishing_jobs where post_id = immediate_id) <> 1
     or (select operation from public.publishing_jobs where post_id = immediate_id) <> 'tiktok_video'::public.publishing_operation
     or (select payload_snapshot #>> '{platformSettings,privacyLevel}' from public.publishing_jobs where post_id = immediate_id) <> 'SELF_ONLY'
     or (select (payload_snapshot #>> '{platformSettings,publishConsent}')::boolean from public.publishing_jobs where post_id = immediate_id) is not true
     or (select jsonb_typeof(payload_snapshot #> '{platformSettings,brandContentToggle}') from public.publishing_jobs where post_id = immediate_id) <> 'boolean'
     or (select jsonb_typeof(payload_snapshot #> '{platformSettings,brandOrganicToggle}') from public.publishing_jobs where post_id = immediate_id) <> 'boolean' then
    raise exception 'TikTok job/snapshot creation failed';
  end if;

  if private.publishing_operation_for(immediate_id, 'tiktok') <> 'tiktok_video'::public.publishing_operation then
    raise exception 'Explicit false TikTok commercial flag was rejected';
  end if;

  if (select platform_settings ? 'brandContentToggle' from public.post_platforms
      where post_id = (select post_id from stage_2e_c_ids where scenario = 'missing-brand-content'))
     or (select jsonb_typeof(platform_settings -> 'brandContentToggle') from public.post_platforms
         where post_id = (select post_id from stage_2e_c_ids where scenario = 'null-brand-content')) <> 'null'
     or (select platform_settings ? 'brandOrganicToggle' from public.post_platforms
         where post_id = (select post_id from stage_2e_c_ids where scenario = 'missing-brand-organic'))
     or (select jsonb_typeof(platform_settings -> 'brandOrganicToggle') from public.post_platforms
         where post_id = (select post_id from stage_2e_c_ids where scenario = 'null-brand-organic')) <> 'null' then
    raise exception 'Stage 1D malformed TikTok fixture shape was not preserved';
  end if;

  for malformed in
    select scenario, post_id from stage_2e_c_ids
    where scenario in ('missing-brand-content','null-brand-content','missing-brand-organic','null-brand-organic')
    order by scenario
  loop
    begin
      perform private.publishing_operation_for(malformed.post_id, 'tiktok');
      raise exception 'Malformed TikTok settings were accepted for %', malformed.scenario;
    exception when sqlstate '22023' then
      if sqlerrm <> 'TIKTOK_SETTINGS_INVALID' then raise; end if;
    end;
  end loop;

  perform private.create_publishing_jobs(immediate_id, now());
  if (select count(*) from public.publishing_jobs where post_id = immediate_id) <> 1 then raise exception 'TikTok job idempotency failed'; end if;
  -- now() is fixed for this rollback-only transaction, so a future scheduled_at
  -- cannot become due here. Exercise scheduled job construction deterministically.
  perform private.create_publishing_jobs(
    scheduled_id,
    (select scheduled_at from public.posts where id = scheduled_id)
  );
  if not exists(select 1 from public.publishing_jobs where post_id = scheduled_id and operation = 'tiktok_video') then raise exception 'Scheduled TikTok job failed'; end if;
  if (select count(*) from public.publishing_jobs where post_id = mixed_id) <> 2
     or (select count(distinct platform) from public.publishing_jobs where post_id = mixed_id) <> 2 then raise exception 'Mixed TikTok/Facebook job isolation failed'; end if;
  update public.publishing_jobs set status = case when platform = 'facebook' then 'succeeded'::public.publishing_job_status else 'failed'::public.publishing_job_status end, completed_at = now() where post_id = mixed_id;
  if not exists(select 1 from public.publishing_jobs where post_id = mixed_id and platform = 'facebook' and status = 'succeeded') then raise exception 'TikTok failure erased Facebook success'; end if;
end;
$$;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

do $$
declare
  target_job_id uuid;
  documented_publish_id text := 'p_pub_url~v2.123456789';
begin
  select job.id into target_job_id
  from public.publishing_jobs as job
  where job.post_id = (
    select post_id from stage_2e_c_ids where scenario = 'immediate'
  ) and job.platform = 'tiktok';

  perform public.start_tiktok_publish_submission(target_job_id);
  perform public.store_tiktok_publish_id(target_job_id, documented_publish_id);

  if (select session.publish_id from private.tiktok_publish_sessions as session
      where session.publishing_job_id = target_job_id)
     is distinct from documented_publish_id then
    raise exception 'Opaque TikTok publish_id was not persisted exactly';
  end if;
end;
$$;

reset role;

select
  has_table_privilege('authenticated', 'private.tiktok_publish_sessions', 'SELECT') as browser_can_read_tiktok_sessions,
  has_function_privilege('authenticated', 'public.store_tiktok_publish_id(uuid,text)', 'EXECUTE') as browser_can_store_publish_id,
  has_function_privilege('service_role', 'public.store_tiktok_publish_id(uuid,text)', 'EXECUTE') as service_role_can_store_publish_id;

rollback;
