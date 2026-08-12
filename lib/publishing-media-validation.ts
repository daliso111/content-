import type { MediaAssetPresentation, SocialPlatform } from "../types";

export type PublishingMediaPlatform = Extract<
  SocialPlatform,
  "facebook" | "instagram" | "youtube" | "tiktok"
>;

export type PublishingMediaValidationCode =
  | "FACEBOOK_MEDIA_UNSUPPORTED"
  | "INSTAGRAM_MEDIA_REQUIRED"
  | "INSTAGRAM_MEDIA_UNSUPPORTED"
  | "YOUTUBE_VIDEO_REQUIRED"
  | "TIKTOK_VIDEO_REQUIRED"
  | "TIKTOK_SINGLE_VIDEO_REQUIRED"
  | "TIKTOK_MEDIA_UNSUPPORTED";

export type TikTokMediaValidationCode = Extract<
  PublishingMediaValidationCode,
  `TIKTOK_${string}`
>;

const META_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const META_REEL_MIME_TYPES = ["video/mp4", "video/quicktime"];
const YOUTUBE_VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const TIKTOK_VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const VALIDATION_ORDER: PublishingMediaPlatform[] = [
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
];

type Asset = MediaAssetPresentation["asset"];

function isImage(asset: Asset): boolean {
  return ["image", "graphic", "logo"].includes(asset.media_type) &&
    META_IMAGE_MIME_TYPES.includes(asset.mime_type ?? "");
}

function isPortraitMetaVideo(asset: Asset): boolean {
  if (asset.media_type !== "video" || !META_REEL_MIME_TYPES.includes(asset.mime_type ?? "")) {
    return false;
  }
  return !(
    asset.width !== null && asset.height !== null && asset.height <= asset.width
  );
}

function isFacebookReel(asset: Asset): boolean {
  if (!isPortraitMetaVideo(asset)) return false;
  return !(
    asset.duration_seconds !== null &&
    (asset.duration_seconds < 4 || asset.duration_seconds > 60)
  );
}

function isInstagramReel(asset: Asset): boolean {
  if (!isPortraitMetaVideo(asset)) return false;
  return !(
    asset.duration_seconds !== null &&
    (asset.duration_seconds < 3 || asset.duration_seconds > 900)
  );
}

function isInstagramImage(asset: Asset): boolean {
  if (!isImage(asset) || asset.mime_type !== "image/jpeg") return false;
  if (asset.file_size !== null && asset.file_size > 8_388_608) return false;
  if (asset.width !== null && asset.height !== null) {
    const ratio = asset.width / asset.height;
    if (ratio < 0.8 || ratio > 1.91) return false;
  }
  return true;
}

function isVideoWithMime(asset: Asset, mimeTypes: string[]): boolean {
  return asset.media_type === "video" && mimeTypes.includes(asset.mime_type ?? "");
}

export function validatePublishingMediaForPlatform(
  platform: "tiktok",
  media: MediaAssetPresentation[],
): TikTokMediaValidationCode | null;
export function validatePublishingMediaForPlatform(
  platform: "youtube",
  media: MediaAssetPresentation[],
): "YOUTUBE_VIDEO_REQUIRED" | null;
export function validatePublishingMediaForPlatform(
  platform: PublishingMediaPlatform,
  media: MediaAssetPresentation[],
): PublishingMediaValidationCode | null;
export function validatePublishingMediaForPlatform(
  platform: PublishingMediaPlatform,
  media: MediaAssetPresentation[],
): PublishingMediaValidationCode | null {
  if (platform === "facebook") {
    if (media.length === 0) return null;
    if (media.length !== 1) return "FACEBOOK_MEDIA_UNSUPPORTED";
    return isImage(media[0].asset) || isFacebookReel(media[0].asset)
      ? null
      : "FACEBOOK_MEDIA_UNSUPPORTED";
  }

  if (platform === "instagram") {
    if (media.length === 0) return "INSTAGRAM_MEDIA_REQUIRED";
    if (media.length !== 1) return "INSTAGRAM_MEDIA_UNSUPPORTED";
    return isInstagramImage(media[0].asset) || isInstagramReel(media[0].asset)
      ? null
      : "INSTAGRAM_MEDIA_UNSUPPORTED";
  }

  if (platform === "youtube") {
    if (
      media.length !== 1 ||
      !isVideoWithMime(media[0].asset, YOUTUBE_VIDEO_MIME_TYPES)
    ) {
      return "YOUTUBE_VIDEO_REQUIRED";
    }
    return null;
  }

  if (media.length === 0) return "TIKTOK_VIDEO_REQUIRED";
  if (media.length > 1) {
    return media.every(({ asset }) => isVideoWithMime(asset, TIKTOK_VIDEO_MIME_TYPES))
      ? "TIKTOK_SINGLE_VIDEO_REQUIRED"
      : "TIKTOK_MEDIA_UNSUPPORTED";
  }
  return isVideoWithMime(media[0].asset, TIKTOK_VIDEO_MIME_TYPES)
    ? null
    : "TIKTOK_MEDIA_UNSUPPORTED";
}

export function validatePublishingMediaForPlatforms(
  platforms: PublishingMediaPlatform[],
  media: MediaAssetPresentation[],
): PublishingMediaValidationCode | null {
  const selected = new Set(platforms);
  for (const platform of VALIDATION_ORDER) {
    if (!selected.has(platform)) continue;
    const error = validatePublishingMediaForPlatform(platform, media);
    if (error) return error;
  }
  return null;
}
