-- Stage 2D-B YouTube publishing regression coverage.
-- Run only against a disposable/local database. The transaction always rolls back.

begin;

create temporary table stage_2d_b_ids(
  scenario text primary key,
  post_id uuid not null
) on commit drop;
grant select, insert on stage_2d_b_ids to authenticated;

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000009101',
  'authenticated', 'authenticated', 'stage-2d-b-regression@example.test', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

do $$
declare
  actor_id uuid := '00000000-0000-0000-0000-000000009101';
  workspace_id uuid;
  youtube_id uuid := '00000000-0000-0000-0000-000000009102';
  facebook_id uuid := '00000000-0000-0000-0000-000000009103';
  media_id uuid := '00000000-0000-0000-0000-000000009104';
begin
  select membership.workspace_id into workspace_id
  from public.workspace_members as membership
  where membership.user_id = actor_id limit 1;

  insert into public.social_accounts(
    id, workspace_id, platform, account_type, platform_account_id, account_name,
    username, connection_status, connected_by, connected_at, token_expires_at,
    granted_scopes
  ) values (
    youtube_id, workspace_id, 'youtube', 'youtube_channel',
    'stage-2d-b-channel', 'Stage 2D-B Channel', 'stage2db', 'connected',
    actor_id, now(), now() - interval '1 minute',
    array[
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.upload'
    ]::text[]
  ), (
    facebook_id, workspace_id, 'facebook', 'facebook_page',
    'stage-2d-b-page', 'Stage 2D-B Page', null, 'connected', actor_id, now(), null,
    array['pages_show_list','pages_read_engagement','pages_manage_posts']::text[]
  );

  insert into private.social_credentials(
    social_account_id, encrypted_access_token, access_token_iv,
    encrypted_refresh_token, refresh_token_iv, token_type, expires_at,
    granted_scopes
  ) values (
    youtube_id, 'encrypted-youtube-access', 'youtube-access-iv',
    'encrypted-youtube-refresh', 'youtube-refresh-iv', 'Bearer',
    now() - interval '1 minute',
    array[
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.upload'
    ]::text[]
  ), (
    facebook_id, 'encrypted-facebook-access', 'facebook-access-iv',
    null, null, 'bearer', null,
    array['pages_show_list','pages_read_engagement','pages_manage_posts']::text[]
  );

  insert into public.media_assets(
    id, workspace_id, uploaded_by, media_type, file_name, storage_bucket,
    storage_path, mime_type, file_size, width, height, duration_seconds
  ) values (
    media_id, workspace_id, actor_id, 'video', 'stage-2d-b.mp4',
    'postflow-media', workspace_id::text || '/stage-2d-b.mp4', 'video/mp4',
    1048576, 1080, 1920, 30
  );
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000009101',
    'role', 'authenticated'
  )::text,
  true
);

do $$
declare
  workspace_id uuid;
  youtube_id uuid := '00000000-0000-0000-0000-000000009102';
  facebook_id uuid := '00000000-0000-0000-0000-000000009103';
  media_id uuid := '00000000-0000-0000-0000-000000009104';
  immediate_post public.posts%rowtype;
  scheduled_post public.posts%rowtype;
  mixed_post public.posts%rowtype;
  youtube_platform jsonb := '[{
    "platform":"youtube",
    "platform_caption":"YouTube description",
    "platform_title":"Stage 2D-B video",
    "platform_settings":{"privacyStatus":"private"}
  }]'::jsonb;
  mixed_platforms jsonb := '[{
    "platform":"facebook",
    "platform_caption":null,
    "platform_title":null,
    "platform_settings":{}
  },{
    "platform":"youtube",
    "platform_caption":"Mixed YouTube description",
    "platform_title":"Mixed destination video",
    "platform_settings":{"privacyStatus":"unlisted"}
  }]'::jsonb;
begin
  select membership.workspace_id into workspace_id
  from public.workspace_members as membership
  where membership.user_id = auth.uid() limit 1;

  immediate_post := public.create_post(
    workspace_id, 'Immediate YouTube description', 'draft', null, 'UTC',
    false, null, youtube_platform, array[media_id], array[youtube_id]
  );
  perform public.request_publish_now(immediate_post.id, immediate_post.revision);
  insert into stage_2d_b_ids values ('immediate', immediate_post.id);

  scheduled_post := public.create_post(
    workspace_id, 'Scheduled YouTube description', 'scheduled',
    clock_timestamp() + interval '100 milliseconds', 'UTC', false, null,
    youtube_platform, array[media_id], array[youtube_id]
  );
  insert into stage_2d_b_ids values ('scheduled', scheduled_post.id);

  mixed_post := public.create_post(
    workspace_id, 'Mixed destination description', 'draft', null, 'UTC',
    false, null, mixed_platforms, array[media_id], array[facebook_id, youtube_id]
  );
  perform public.request_publish_now(mixed_post.id, mixed_post.revision);
  insert into stage_2d_b_ids values ('mixed', mixed_post.id);
end;
$$;

reset role;

do $$
declare
  immediate_id uuid;
  scheduled_id uuid;
  mixed_id uuid;
  scheduled_result jsonb;
begin
  select post_id into immediate_id from stage_2d_b_ids where scenario = 'immediate';
  select post_id into scheduled_id from stage_2d_b_ids where scenario = 'scheduled';
  select post_id into mixed_id from stage_2d_b_ids where scenario = 'mixed';

  if (select count(*) from public.publishing_jobs where post_id = immediate_id) <> 1
     or (select operation from public.publishing_jobs where post_id = immediate_id)
       <> 'youtube_video'::public.publishing_operation
     or (select payload_snapshot ->> 'platformTitle'
         from public.publishing_jobs where post_id = immediate_id) <> 'Stage 2D-B video'
     or (select payload_snapshot #>> '{platformSettings,privacyStatus}'
         from public.publishing_jobs where post_id = immediate_id) <> 'private' then
    raise exception 'Immediate YouTube publication did not create the expected immutable job';
  end if;

  -- Repeated job creation remains idempotent for this post/revision/account.
  perform private.create_publishing_jobs(immediate_id, now());
  perform private.create_publishing_jobs(immediate_id, now());
  if (select count(*) from public.publishing_jobs where post_id = immediate_id) <> 1 then
    raise exception 'YouTube publishing job idempotency failed';
  end if;

  perform pg_sleep(0.15);
  scheduled_result := private.enqueue_due_publications(100);
  if (select count(*) from public.publishing_jobs where post_id = scheduled_id) <> 1
     or (select operation from public.publishing_jobs where post_id = scheduled_id)
       <> 'youtube_video'::public.publishing_operation then
    raise exception 'Scheduled YouTube publication did not enter the existing queue';
  end if;

  if (select count(*) from public.publishing_jobs where post_id = mixed_id) <> 2
     or (select count(distinct platform) from public.publishing_jobs where post_id = mixed_id) <> 2 then
    raise exception 'Mixed Meta and YouTube destinations did not create independent jobs';
  end if;

  update public.publishing_jobs
  set status = case when platform = 'facebook'
    then 'succeeded'::public.publishing_job_status
    else 'failed'::public.publishing_job_status end,
    completed_at = now()
  where post_id = mixed_id;
  if private.recalculate_post_publishing_status(mixed_id) <> 'failed'
     or not exists(
       select 1 from public.publishing_jobs
       where post_id = mixed_id and platform = 'facebook' and status = 'succeeded'
     ) then
    raise exception 'Mixed publishing-state aggregation erased a successful Meta result';
  end if;
end;
$$;

select
  has_table_privilege('authenticated', 'private.youtube_upload_sessions', 'SELECT')
    as browser_can_read_upload_sessions,
  has_function_privilege(
    'authenticated', 'public.store_youtube_upload_session(uuid,text)', 'EXECUTE'
  ) as browser_can_store_upload_session,
  has_function_privilege(
    'authenticated', 'public.complete_youtube_upload(uuid,text)', 'EXECUTE'
  ) as browser_can_complete_upload,
  has_function_privilege(
    'authenticated',
    'public.update_youtube_publishing_credential(uuid,text,text,text,text,text,timestamptz,text[])',
    'EXECUTE'
  ) as browser_can_update_youtube_credential,
  has_function_privilege(
    'service_role', 'public.store_youtube_upload_session(uuid,text)', 'EXECUTE'
  ) as service_role_can_store_upload_session;

rollback;
