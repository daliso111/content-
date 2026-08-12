-- Align database pre-queue validation with the current platform publishing limits.
-- Instagram Reels: 3 seconds to 15 minutes.
-- Facebook Reels remain limited to 4 to 60 seconds in the current publisher.

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
  select count(*) into media_count
  from public.post_media where post_id = target_post_id;

  select coalesce(nullif(btrim(platform_row.platform_caption), ''), post.caption),
    platform_row.platform_title, coalesce(platform_row.platform_settings, '{}'::jsonb),
    coalesce(nullif(platform_row.platform_settings ->> 'privacyStatus', ''), 'private')
  into final_caption, platform_title, settings, privacy_status
  from public.posts as post
  join public.post_platforms as platform_row on platform_row.post_id = post.id
  where post.id = target_post_id and platform_row.platform = target_platform;

  if target_platform = 'facebook' then
    if media_count = 0 then
      if btrim(coalesce(final_caption, '')) = '' then
        raise exception 'FACEBOOK_MEDIA_UNSUPPORTED' using errcode = '22023';
      end if;
      return 'facebook_text'::public.publishing_operation;
    end if;
    if media_count <> 1 then
      raise exception 'FACEBOOK_MEDIA_UNSUPPORTED' using errcode = '22023';
    end if;
    select asset_row.* into asset
    from public.post_media as link
    join public.media_assets as asset_row on asset_row.id = link.media_asset_id
    where link.post_id = target_post_id;
    if asset.media_type in ('image', 'graphic', 'logo')
       and asset.mime_type in ('image/jpeg', 'image/png', 'image/webp') then
      return 'facebook_image'::public.publishing_operation;
    end if;
    if asset.media_type = 'video'
       and asset.mime_type in ('video/mp4', 'video/quicktime')
       and (asset.duration_seconds is null or asset.duration_seconds between 4 and 60)
       and (asset.width is null or asset.height is null or asset.height > asset.width) then
      return 'facebook_reel'::public.publishing_operation;
    end if;
    raise exception 'FACEBOOK_MEDIA_UNSUPPORTED' using errcode = '22023';
  end if;

  if target_platform = 'instagram' then
    if media_count = 0 then
      raise exception 'INSTAGRAM_MEDIA_REQUIRED' using errcode = '22023';
    end if;
    if media_count <> 1 then
      raise exception 'INSTAGRAM_MEDIA_UNSUPPORTED' using errcode = '22023';
    end if;
    select asset_row.* into asset
    from public.post_media as link
    join public.media_assets as asset_row on asset_row.id = link.media_asset_id
    where link.post_id = target_post_id;
    if asset.media_type in ('image', 'graphic', 'logo')
       and asset.mime_type = 'image/jpeg'
       and (asset.file_size is null or asset.file_size <= 8388608)
       and (asset.width is null or asset.height is null
         or asset.width::numeric / asset.height between 0.8 and 1.91) then
      return 'instagram_image'::public.publishing_operation;
    end if;
    if asset.media_type = 'video'
       and asset.mime_type in ('video/mp4', 'video/quicktime')
       and (asset.duration_seconds is null or asset.duration_seconds between 3 and 900)
       and (asset.width is null or asset.height is null or asset.height > asset.width) then
      return 'instagram_reel'::public.publishing_operation;
    end if;
    raise exception 'INSTAGRAM_MEDIA_UNSUPPORTED' using errcode = '22023';
  end if;

  if target_platform = 'youtube' then
    if media_count <> 1 then
      raise exception 'YOUTUBE_VIDEO_REQUIRED' using errcode = '22023';
    end if;
    select asset_row.* into asset
    from public.post_media as link
    join public.media_assets as asset_row on asset_row.id = link.media_asset_id
    where link.post_id = target_post_id;
    if asset.media_type <> 'video'
       or asset.mime_type not in ('video/mp4', 'video/quicktime', 'video/webm') then
      raise exception 'YOUTUBE_VIDEO_REQUIRED' using errcode = '22023';
    end if;
    if btrim(coalesce(platform_title, '')) = '' then
      raise exception 'YOUTUBE_TITLE_REQUIRED' using errcode = '22023';
    end if;
    if length(btrim(platform_title)) > 100 then
      raise exception 'YOUTUBE_TITLE_TOO_LONG' using errcode = '22023';
    end if;
    if length(coalesce(final_caption, '')) > 5000 then
      raise exception 'YOUTUBE_DESCRIPTION_TOO_LONG' using errcode = '22023';
    end if;
    if privacy_status not in ('private', 'unlisted', 'public') then
      raise exception 'YOUTUBE_PRIVACY_INVALID' using errcode = '22023';
    end if;
    return 'youtube_video'::public.publishing_operation;
  end if;

  if target_platform = 'tiktok' then
    if media_count = 0 then
      raise exception 'TIKTOK_VIDEO_REQUIRED' using errcode = '22023';
    end if;
    if media_count > 1 then
      if exists(
        select 1
        from public.post_media as link
        join public.media_assets as media_asset on media_asset.id = link.media_asset_id
        where link.post_id = target_post_id
          and (media_asset.media_type <> 'video'
            or media_asset.mime_type not in ('video/mp4', 'video/quicktime', 'video/webm'))
      ) then
        raise exception 'TIKTOK_MEDIA_UNSUPPORTED' using errcode = '22023';
      end if;
      raise exception 'TIKTOK_SINGLE_VIDEO_REQUIRED' using errcode = '22023';
    end if;
    select asset_row.* into asset
    from public.post_media as link
    join public.media_assets as asset_row on asset_row.id = link.media_asset_id
    where link.post_id = target_post_id;
    if asset.media_type <> 'video'
       or asset.mime_type not in ('video/mp4', 'video/quicktime', 'video/webm') then
      raise exception 'TIKTOK_MEDIA_UNSUPPORTED' using errcode = '22023';
    end if;
    if asset.file_size is null or asset.file_size <= 0 then
      raise exception 'TIKTOK_VIDEO_EMPTY' using errcode = '22023';
    end if;
    if asset.file_size > 52428800 then
      raise exception 'TIKTOK_VIDEO_TOO_LARGE' using errcode = '22023';
    end if;
    if btrim(coalesce(settings ->> 'privacyLevel', '')) = '' then
      raise exception 'TIKTOK_PRIVACY_REQUIRED' using errcode = '22023';
    end if;
    if coalesce((settings ->> 'publishConsent')::boolean, false) is not true then
      raise exception 'TIKTOK_CONSENT_REQUIRED' using errcode = '22023';
    end if;
    if jsonb_typeof(settings -> 'disableComment') is distinct from 'boolean'
       or jsonb_typeof(settings -> 'disableDuet') is distinct from 'boolean'
       or jsonb_typeof(settings -> 'disableStitch') is distinct from 'boolean'
       or jsonb_typeof(settings -> 'brandContentToggle') is distinct from 'boolean'
       or jsonb_typeof(settings -> 'brandOrganicToggle') is distinct from 'boolean' then
      raise exception 'TIKTOK_SETTINGS_INVALID' using errcode = '22023';
    end if;
    if (settings ->> 'brandContentToggle')::boolean
       and settings ->> 'privacyLevel' = 'SELF_ONLY' then
      raise exception 'TIKTOK_BRANDED_CONTENT_PRIVATE' using errcode = '22023';
    end if;
    if asset.duration_seconds is not null
       and settings ? 'creatorMaxVideoPostDurationSec'
       and asset.duration_seconds > (settings ->> 'creatorMaxVideoPostDurationSec')::numeric then
      raise exception 'TIKTOK_VIDEO_TOO_LONG' using errcode = '22023';
    end if;
    if length(coalesce(final_caption, '')) > 2200 then
      raise exception 'TIKTOK_CAPTION_TOO_LONG' using errcode = '22023';
    end if;
    return 'tiktok_video'::public.publishing_operation;
  end if;

  raise exception 'UNSUPPORTED_MEDIA_COMBINATION' using errcode = '22023';
end;
$$;
