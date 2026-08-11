-- Normalize TikTok commercial-content flags at the immutable job boundary.
-- The operation validator still requires correctly typed, explicit booleans.

create or replace function private.publishing_operation_for(
  target_post_id uuid,
  target_platform public.social_platform
)
returns public.publishing_operation
language plpgsql stable security definer set search_path = '' as $$
declare
  media_count integer;
  asset public.media_assets%rowtype;
  final_caption text;
  platform_title text;
  settings jsonb;
  privacy_status text;
begin
  select count(*) into media_count from public.post_media where post_id = target_post_id;
  select coalesce(nullif(btrim(platform_row.platform_caption), ''), post.caption),
    platform_row.platform_title, coalesce(platform_row.platform_settings, '{}'::jsonb),
    coalesce(nullif(platform_row.platform_settings ->> 'privacyStatus', ''), 'private')
  into final_caption, platform_title, settings, privacy_status
  from public.posts as post
  join public.post_platforms as platform_row on platform_row.post_id = post.id
  where post.id = target_post_id and platform_row.platform = target_platform;

  if target_platform in ('youtube', 'tiktok') then
    if media_count <> 1 then
      raise exception '%', case when target_platform = 'youtube' then 'YOUTUBE_VIDEO_REQUIRED' else 'TIKTOK_VIDEO_REQUIRED' end using errcode = '22023';
    end if;
    select asset_row.* into asset from public.post_media as link
    join public.media_assets as asset_row on asset_row.id = link.media_asset_id
    where link.post_id = target_post_id;
    if asset.media_type <> 'video' or asset.mime_type not in ('video/mp4', 'video/quicktime', 'video/webm')
       or asset.file_size is null or asset.file_size <= 0 or asset.file_size > 52428800 then
      raise exception '%', case when target_platform = 'youtube' then 'YOUTUBE_VIDEO_REQUIRED' else 'TIKTOK_VIDEO_REQUIRED' end using errcode = '22023';
    end if;
    if target_platform = 'youtube' then
      if btrim(coalesce(platform_title, '')) = '' then raise exception 'YOUTUBE_TITLE_REQUIRED' using errcode = '22023'; end if;
      if length(btrim(platform_title)) > 100 then raise exception 'YOUTUBE_TITLE_TOO_LONG' using errcode = '22023'; end if;
      if length(coalesce(final_caption, '')) > 5000 then raise exception 'YOUTUBE_DESCRIPTION_TOO_LONG' using errcode = '22023'; end if;
      if privacy_status not in ('private', 'unlisted', 'public') then raise exception 'YOUTUBE_PRIVACY_INVALID' using errcode = '22023'; end if;
      return 'youtube_video'::public.publishing_operation;
    end if;
    if btrim(coalesce(settings ->> 'privacyLevel', '')) = '' then raise exception 'TIKTOK_PRIVACY_REQUIRED' using errcode = '22023'; end if;
    if coalesce((settings ->> 'publishConsent')::boolean, false) is not true then raise exception 'TIKTOK_CONSENT_REQUIRED' using errcode = '22023'; end if;
    if jsonb_typeof(settings -> 'disableComment') is distinct from 'boolean'
       or jsonb_typeof(settings -> 'disableDuet') is distinct from 'boolean'
       or jsonb_typeof(settings -> 'disableStitch') is distinct from 'boolean'
       or jsonb_typeof(settings -> 'brandContentToggle') is distinct from 'boolean'
       or jsonb_typeof(settings -> 'brandOrganicToggle') is distinct from 'boolean' then
      raise exception 'TIKTOK_SETTINGS_INVALID' using errcode = '22023';
    end if;
    if (settings ->> 'brandContentToggle')::boolean and settings ->> 'privacyLevel' = 'SELF_ONLY' then
      raise exception 'TIKTOK_BRANDED_CONTENT_PRIVATE' using errcode = '22023';
    end if;
    if asset.duration_seconds is not null and settings ? 'creatorMaxVideoPostDurationSec'
       and asset.duration_seconds > (settings ->> 'creatorMaxVideoPostDurationSec')::numeric then
      raise exception 'TIKTOK_VIDEO_TOO_LONG' using errcode = '22023';
    end if;
    if length(coalesce(final_caption, '')) > 2200 then raise exception 'TIKTOK_CAPTION_TOO_LONG' using errcode = '22023'; end if;
    return 'tiktok_video'::public.publishing_operation;
  end if;

  if target_platform not in ('facebook', 'instagram') then raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023'; end if;
  if media_count = 0 then
    if target_platform <> 'facebook' or btrim(coalesce(final_caption, '')) = '' then raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023'; end if;
    return 'facebook_text';
  end if;
  if media_count <> 1 then raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023'; end if;
  select asset_row.* into asset from public.post_media as link
  join public.media_assets as asset_row on asset_row.id = link.media_asset_id
  where link.post_id = target_post_id;
  if asset.media_type in ('image', 'graphic', 'logo') and asset.mime_type in ('image/jpeg', 'image/png', 'image/webp') then
    if target_platform = 'instagram' and (
      asset.mime_type <> 'image/jpeg' or asset.file_size is not null and asset.file_size > 8388608
      or asset.width is not null and asset.height is not null and
        (asset.width::numeric / asset.height < 0.8 or asset.width::numeric / asset.height > 1.91)
    ) then raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023'; end if;
    return case when target_platform = 'facebook' then 'facebook_image'::public.publishing_operation else 'instagram_image'::public.publishing_operation end;
  end if;
  if asset.media_type = 'video' and asset.mime_type in ('video/mp4', 'video/quicktime') then
    if asset.duration_seconds is not null and (asset.duration_seconds < 4 or asset.duration_seconds > 60) then raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023'; end if;
    if asset.width is not null and asset.height is not null and asset.height <= asset.width then raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023'; end if;
    return case when target_platform = 'facebook' then 'facebook_reel'::public.publishing_operation else 'instagram_reel'::public.publishing_operation end;
  end if;
  raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023';
end;
$$;

create or replace function private.create_publishing_jobs(target_post_id uuid, target_scheduled_for timestamptz)
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare
  target_post public.posts%rowtype; destination record; created_id uuid;
  created_ids uuid[] := array[]::uuid[]; snapshot jsonb;
  chosen_operation public.publishing_operation; safe_platform_settings jsonb;
begin
  select * into target_post from public.posts where id = target_post_id for update;
  if not found then raise exception 'POST_NOT_FOUND' using errcode = 'P0002'; end if;
  perform private.validate_publishing_post(target_post.id);
  for destination in
    select destination_row.*, account.platform, account.id as account_id,
      platform_row.platform_caption, platform_row.platform_title, platform_row.platform_settings
    from public.post_destinations as destination_row
    join public.social_accounts as account on account.id = destination_row.social_account_id
    join public.post_platforms as platform_row on platform_row.id = destination_row.post_platform_id
    where destination_row.post_id = target_post.id order by destination_row.created_at, destination_row.id
  loop
    chosen_operation := private.publishing_operation_for(target_post.id, destination.platform);
    safe_platform_settings := case
      when destination.platform = 'youtube' then jsonb_build_object(
        'privacyStatus', coalesce(nullif(destination.platform_settings ->> 'privacyStatus', ''), 'private'))
      when destination.platform = 'tiktok' then jsonb_build_object(
        'privacyLevel', destination.platform_settings ->> 'privacyLevel',
        'disableComment', (destination.platform_settings ->> 'disableComment')::boolean,
        'disableDuet', (destination.platform_settings ->> 'disableDuet')::boolean,
        'disableStitch', (destination.platform_settings ->> 'disableStitch')::boolean,
        'brandContentToggle', coalesce((destination.platform_settings ->> 'brandContentToggle')::boolean, false),
        'brandOrganicToggle', coalesce((destination.platform_settings ->> 'brandOrganicToggle')::boolean, false),
        'publishConsent', (destination.platform_settings ->> 'publishConsent')::boolean,
        'creatorMaxVideoPostDurationSec', (destination.platform_settings ->> 'creatorMaxVideoPostDurationSec')::numeric)
      else '{}'::jsonb end;
    select jsonb_build_object(
      'version', 1, 'postId', target_post.id, 'postRevision', target_post.revision,
      'workspaceId', target_post.workspace_id, 'platform', destination.platform,
      'socialAccountId', destination.account_id,
      'caption', coalesce(nullif(btrim(destination.platform_caption), ''), target_post.caption),
      'platformTitle', nullif(btrim(destination.platform_title), ''),
      'platformSettings', safe_platform_settings, 'scheduledFor', target_scheduled_for,
      'media', coalesce(jsonb_agg(jsonb_build_object(
        'mediaAssetId', asset.id, 'storageBucket', asset.storage_bucket,
        'storagePath', asset.storage_path, 'mimeType', asset.mime_type,
        'mediaType', asset.media_type, 'fileSize', asset.file_size,
        'width', asset.width, 'height', asset.height, 'durationSeconds', asset.duration_seconds
      ) order by link.sort_order) filter (where asset.id is not null), '[]'::jsonb)
    ) into snapshot from (select 1) as base
    left join public.post_media as link on link.post_id = target_post.id
    left join public.media_assets as asset on asset.id = link.media_asset_id;
    insert into public.publishing_jobs(
      workspace_id, post_id, post_revision, post_destination_id, social_account_id,
      platform, operation, scheduled_for, available_at, payload_snapshot
    ) values (
      target_post.workspace_id, target_post.id, target_post.revision, destination.id,
      destination.account_id, destination.platform, chosen_operation,
      target_scheduled_for, greatest(target_scheduled_for, now()), snapshot
    ) on conflict (post_id, post_revision, social_account_id) do nothing returning id into created_id;
    if created_id is not null then
      perform pgmq.send('postflow-publishing', jsonb_build_object('version', 1, 'publishingJobId', created_id));
      created_ids := array_append(created_ids, created_id);
    end if;
    created_id := null;
  end loop;
  if cardinality(created_ids) > 0 then
    perform set_config('postflow.post_rpc_write', 'allowed', true);
    update public.posts set status = 'publishing', failure_message = null where id = target_post.id;
    perform set_config('postflow.post_rpc_write', '', true);
  end if;
  return created_ids;
end;
$$;
