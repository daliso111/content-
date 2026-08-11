-- Per-platform publishing-media validation regression coverage.
-- Run only against a disposable/local database. The transaction always rolls back.
begin;

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-00000000f001',
  'authenticated', 'authenticated', 'platform-media-regression@example.test', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

do $$
declare
  actor_id uuid := '00000000-0000-4000-8000-00000000f001';
  workspace_id uuid;
begin
  select membership.workspace_id into workspace_id
  from public.workspace_members as membership where membership.user_id = actor_id limit 1;

  insert into public.social_accounts(
    id, workspace_id, platform, account_type, platform_account_id, account_name,
    connection_status, connected_by, connected_at, token_expires_at, granted_scopes
  ) values
  (
    '00000000-0000-4000-8000-00000000f011', workspace_id, 'facebook', 'facebook_page',
    'platform-media-facebook', 'Platform Media Facebook', 'connected', actor_id, now(), null,
    array['pages_show_list','pages_read_engagement','pages_manage_posts']::text[]
  ),
  (
    '00000000-0000-4000-8000-00000000f012', workspace_id, 'instagram', 'instagram_business',
    'platform-media-instagram', 'Platform Media Instagram', 'connected', actor_id, now(), null,
    array['pages_show_list','pages_read_engagement','instagram_basic','instagram_content_publish']::text[]
  ),
  (
    '00000000-0000-4000-8000-00000000f013', workspace_id, 'youtube', 'youtube_channel',
    'platform-media-youtube', 'Platform Media YouTube', 'connected', actor_id, now(), now() + interval '1 hour',
    array['https://www.googleapis.com/auth/youtube.upload']::text[]
  ),
  (
    '00000000-0000-4000-8000-00000000f014', workspace_id, 'tiktok', 'tiktok_user',
    'platform-media-tiktok', 'Platform Media TikTok', 'connected', actor_id, now(), now() + interval '1 hour',
    array['user.info.basic','video.publish']::text[]
  );

  insert into private.social_credentials(
    social_account_id, encrypted_access_token, access_token_iv,
    encrypted_refresh_token, refresh_token_iv, token_type, expires_at,
    granted_scopes, provider_metadata
  ) values
  (
    '00000000-0000-4000-8000-00000000f011', 'facebook-access', 'facebook-iv',
    null, null, 'bearer', null,
    array['pages_show_list','pages_read_engagement','pages_manage_posts']::text[], '{}'
  ),
  (
    '00000000-0000-4000-8000-00000000f012', 'instagram-access', 'instagram-iv',
    null, null, 'bearer', null,
    array['pages_show_list','pages_read_engagement','instagram_basic','instagram_content_publish']::text[], '{}'
  ),
  (
    '00000000-0000-4000-8000-00000000f013', 'youtube-access', 'youtube-iv',
    'youtube-refresh', 'youtube-refresh-iv', 'Bearer', now() + interval '1 hour',
    array['https://www.googleapis.com/auth/youtube.upload']::text[], '{}'
  ),
  (
    '00000000-0000-4000-8000-00000000f014', 'tiktok-access', 'tiktok-iv',
    'tiktok-refresh', 'tiktok-refresh-iv', 'Bearer', now() + interval '1 hour',
    array['user.info.basic','video.publish']::text[], '{}'
  );

  insert into public.media_assets(
    id, workspace_id, uploaded_by, media_type, file_name, storage_bucket,
    storage_path, mime_type, file_size, width, height, duration_seconds
  ) values
  (
    '00000000-0000-4000-8000-00000000f021', workspace_id, actor_id, 'video',
    'platform-video-1.mp4', 'postflow-media', workspace_id::text || '/platform-video-1.mp4',
    'video/mp4', 1048576, 1080, 1920, 30
  ),
  (
    '00000000-0000-4000-8000-00000000f022', workspace_id, actor_id, 'video',
    'platform-video-2.mp4', 'postflow-media', workspace_id::text || '/platform-video-2.mp4',
    'video/mp4', 1048576, 1080, 1920, 30
  ),
  (
    '00000000-0000-4000-8000-00000000f023', workspace_id, actor_id, 'image',
    'platform-image.jpg', 'postflow-media', workspace_id::text || '/platform-image.jpg',
    'image/jpeg', 1048576, 1200, 1200, null
  );
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-4000-8000-00000000f001', 'role', 'authenticated'
)::text, true);

do $$
declare
  workspace_id uuid;
  facebook_id uuid := '00000000-0000-4000-8000-00000000f011';
  instagram_id uuid := '00000000-0000-4000-8000-00000000f012';
  youtube_id uuid := '00000000-0000-4000-8000-00000000f013';
  tiktok_id uuid := '00000000-0000-4000-8000-00000000f014';
  video_1 uuid := '00000000-0000-4000-8000-00000000f021';
  video_2 uuid := '00000000-0000-4000-8000-00000000f022';
  image_1 uuid := '00000000-0000-4000-8000-00000000f023';
  target_post public.posts%rowtype;
  facebook_platform jsonb := '[{"platform":"facebook","platform_caption":null,"platform_title":null,"platform_settings":{}}]'::jsonb;
  instagram_platform jsonb := '[{"platform":"instagram","platform_caption":null,"platform_title":null,"platform_settings":{}}]'::jsonb;
  youtube_platform jsonb := '[{"platform":"youtube","platform_caption":"Description","platform_title":"Video title","platform_settings":{"privacyStatus":"private"}}]'::jsonb;
  tiktok_platform jsonb := '[{"platform":"tiktok","platform_caption":"TikTok caption","platform_title":null,"platform_settings":{"privacyLevel":"SELF_ONLY","disableComment":true,"disableDuet":true,"disableStitch":true,"brandContentToggle":false,"brandOrganicToggle":false,"publishConsent":true,"creatorMaxVideoPostDurationSec":180}}]'::jsonb;
  facebook_instagram_platforms jsonb := '[{"platform":"facebook","platform_caption":null,"platform_title":null,"platform_settings":{}},{"platform":"instagram","platform_caption":null,"platform_title":null,"platform_settings":{}}]'::jsonb;
  facebook_tiktok_platforms jsonb := '[{"platform":"facebook","platform_caption":null,"platform_title":null,"platform_settings":{}},{"platform":"tiktok","platform_caption":"TikTok caption","platform_title":null,"platform_settings":{"privacyLevel":"SELF_ONLY","disableComment":true,"disableDuet":true,"disableStitch":true,"brandContentToggle":false,"brandOrganicToggle":false,"publishConsent":true,"creatorMaxVideoPostDurationSec":180}}]'::jsonb;
begin
  select membership.workspace_id into workspace_id
  from public.workspace_members as membership where membership.user_id = auth.uid() limit 1;

  -- Facebook text-only is a real operation and queues one job.
  target_post := public.create_post(workspace_id, 'Facebook text only', 'draft', null, 'UTC', false, null, facebook_platform, array[]::uuid[], array[facebook_id]);
  perform public.request_publish_now(target_post.id, target_post.revision);
  if (select count(*) from public.publishing_jobs where post_id = target_post.id) <> 1
     or (select operation from public.publishing_jobs where post_id = target_post.id) <> 'facebook_text'::public.publishing_operation then
    raise exception 'Facebook text-only publishing did not queue correctly';
  end if;

  -- Instagram missing media is explicit and creates no jobs.
  target_post := public.create_post(workspace_id, 'Instagram missing media', 'draft', null, 'UTC', false, null, instagram_platform, array[]::uuid[], array[instagram_id]);
  begin
    perform public.request_publish_now(target_post.id, target_post.revision);
    raise exception 'Instagram missing media was accepted';
  exception when sqlstate '22023' then
    if sqlerrm <> 'INSTAGRAM_MEDIA_REQUIRED' then raise; end if;
  end;
  if exists(select 1 from public.publishing_jobs where post_id = target_post.id) then raise exception 'Instagram validation created a publishing job'; end if;

  -- TikTok zero, one and multiple-video behavior.
  target_post := public.create_post(workspace_id, 'TikTok missing video', 'draft', null, 'UTC', false, null, tiktok_platform, array[]::uuid[], array[tiktok_id]);
  begin
    perform public.request_publish_now(target_post.id, target_post.revision);
    raise exception 'TikTok missing video was accepted';
  exception when sqlstate '22023' then
    if sqlerrm <> 'TIKTOK_VIDEO_REQUIRED' then raise; end if;
  end;
  if exists(select 1 from public.publishing_jobs where post_id = target_post.id) then raise exception 'TikTok missing-video validation created a publishing job'; end if;

  target_post := public.create_post(workspace_id, 'TikTok one video', 'draft', null, 'UTC', false, null, tiktok_platform, array[video_1], array[tiktok_id]);
  perform public.request_publish_now(target_post.id, target_post.revision);
  if (select count(*) from public.publishing_jobs where post_id = target_post.id) <> 1 then raise exception 'Valid TikTok video did not queue'; end if;

  target_post := public.create_post(workspace_id, 'TikTok multiple videos', 'draft', null, 'UTC', false, null, tiktok_platform, array[video_1,video_2], array[tiktok_id]);
  begin
    perform public.request_publish_now(target_post.id, target_post.revision);
    raise exception 'TikTok multiple videos were accepted';
  exception when sqlstate '22023' then
    if sqlerrm <> 'TIKTOK_SINGLE_VIDEO_REQUIRED' then raise; end if;
  end;
  if exists(select 1 from public.publishing_jobs where post_id = target_post.id) then raise exception 'TikTok multi-video validation created a publishing job'; end if;

  -- YouTube rejects image-only media before a job exists.
  target_post := public.create_post(workspace_id, 'YouTube invalid media', 'draft', null, 'UTC', false, null, youtube_platform, array[image_1], array[youtube_id]);
  begin
    perform public.request_publish_now(target_post.id, target_post.revision);
    raise exception 'YouTube image-only media was accepted';
  exception when sqlstate '22023' then
    if sqlerrm <> 'YOUTUBE_VIDEO_REQUIRED' then raise; end if;
  end;
  if exists(select 1 from public.publishing_jobs where post_id = target_post.id) then raise exception 'YouTube validation created a publishing job'; end if;

  -- Mixed posts report the destination that requires media, not a Meta outage.
  target_post := public.create_post(workspace_id, 'Facebook and Instagram no media', 'draft', null, 'UTC', false, null, facebook_instagram_platforms, array[]::uuid[], array[facebook_id,instagram_id]);
  begin
    perform public.request_publish_now(target_post.id, target_post.revision);
    raise exception 'Facebook and Instagram without media was accepted';
  exception when sqlstate '22023' then
    if sqlerrm <> 'INSTAGRAM_MEDIA_REQUIRED' then raise; end if;
  end;
  if exists(select 1 from public.publishing_jobs where post_id = target_post.id) then raise exception 'Mixed Instagram validation created publishing jobs'; end if;

  target_post := public.create_post(workspace_id, 'Facebook and TikTok no video', 'draft', null, 'UTC', false, null, facebook_tiktok_platforms, array[]::uuid[], array[facebook_id,tiktok_id]);
  begin
    perform public.request_publish_now(target_post.id, target_post.revision);
    raise exception 'Facebook and TikTok without video was accepted';
  exception when sqlstate '22023' then
    if sqlerrm <> 'TIKTOK_VIDEO_REQUIRED' then raise; end if;
  end;
  if exists(select 1 from public.publishing_jobs where post_id = target_post.id) then raise exception 'Mixed TikTok validation created publishing jobs'; end if;
end;
$$;

rollback;
