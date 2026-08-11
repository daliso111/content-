import type { Json } from "../types/database.generated";
import type { MediaAssetPresentation, TikTokCreatorInfoResult } from "../types";
import { validatePublishingMediaForPlatform } from "./publishing-media-validation";

export const TIKTOK_VIDEO_PUBLISH_SCOPE = "video.publish";
export const TIKTOK_MAX_VIDEO_BYTES = 52_428_800;

export interface TikTokPublishingSettings {
  privacyLevel: string;
  disableComment: boolean;
  disableDuet: boolean;
  disableStitch: boolean;
  brandContentToggle: boolean;
  brandOrganicToggle: boolean;
  publishConsent: boolean;
  creatorMaxVideoPostDurationSec: number | null;
}

export type TikTokPublishingValidationCode =
  | "TIKTOK_PERMISSION_REQUIRED"
  | "TIKTOK_CREATOR_INFO_REQUIRED"
  | "TIKTOK_PRIVACY_REQUIRED"
  | "TIKTOK_PRIVACY_INVALID"
  | "TIKTOK_VIDEO_REQUIRED"
  | "TIKTOK_SINGLE_VIDEO_REQUIRED"
  | "TIKTOK_MEDIA_UNSUPPORTED"
  | "TIKTOK_VIDEO_EMPTY"
  | "TIKTOK_VIDEO_TOO_LARGE"
  | "TIKTOK_VIDEO_TOO_LONG"
  | "TIKTOK_CONSENT_REQUIRED"
  | "TIKTOK_COMMERCIAL_DISCLOSURE_REQUIRED"
  | "TIKTOK_BRANDED_CONTENT_PRIVATE";

function object(value: Json | null | undefined): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : {};
}

export function readTikTokPublishingSettings(
  value: Json | null | undefined,
): TikTokPublishingSettings {
  const source = object(value);
  return {
    privacyLevel: typeof source.privacyLevel === "string" ? source.privacyLevel : "",
    disableComment: typeof source.disableComment === "boolean" ? source.disableComment : true,
    disableDuet: typeof source.disableDuet === "boolean" ? source.disableDuet : true,
    disableStitch: typeof source.disableStitch === "boolean" ? source.disableStitch : true,
    brandContentToggle: source.brandContentToggle === true,
    brandOrganicToggle: source.brandOrganicToggle === true,
    publishConsent: source.publishConsent === true,
    creatorMaxVideoPostDurationSec: typeof source.creatorMaxVideoPostDurationSec === "number"
      ? source.creatorMaxVideoPostDurationSec
      : null,
  };
}

export function normalizeTikTokPublishingSettings(
  value: Json | null | undefined,
): Json {
  const source = object(value);
  const settings = readTikTokPublishingSettings(value);
  return {
    ...source,
    privacyLevel: settings.privacyLevel,
    disableComment: settings.disableComment,
    disableDuet: settings.disableDuet,
    disableStitch: settings.disableStitch,
    brandContentToggle: settings.brandContentToggle,
    brandOrganicToggle: settings.brandOrganicToggle,
    publishConsent: settings.publishConsent,
    creatorMaxVideoPostDurationSec: settings.creatorMaxVideoPostDurationSec,
  };
}

export function validateTikTokPublishing(
  media: MediaAssetPresentation[],
  creator: TikTokCreatorInfoResult | null,
  settings: TikTokPublishingSettings,
  hasPermission: boolean,
): TikTokPublishingValidationCode | null {
  const mediaError = validatePublishingMediaForPlatform("tiktok", media);
  if (mediaError) return mediaError;
  if (!hasPermission) return "TIKTOK_PERMISSION_REQUIRED";
  if (!creator) return "TIKTOK_CREATOR_INFO_REQUIRED";
  if (!settings.privacyLevel) return "TIKTOK_PRIVACY_REQUIRED";
  if (!creator.privacyLevelOptions.includes(settings.privacyLevel)) return "TIKTOK_PRIVACY_INVALID";
  const bytes = media[0].asset.file_size;
  if (!bytes || bytes <= 0) return "TIKTOK_VIDEO_EMPTY";
  if (bytes > TIKTOK_MAX_VIDEO_BYTES) return "TIKTOK_VIDEO_TOO_LARGE";
  const duration = media[0].asset.duration_seconds;
  if (duration !== null && duration > creator.maxVideoPostDurationSec) return "TIKTOK_VIDEO_TOO_LONG";
  if (!settings.publishConsent) return "TIKTOK_CONSENT_REQUIRED";
  if (settings.brandContentToggle && settings.privacyLevel === "SELF_ONLY") {
    return "TIKTOK_BRANDED_CONTENT_PRIVATE";
  }
  return null;
}

export function tiktokValidationMessage(code: TikTokPublishingValidationCode): string {
  switch (code) {
    case "TIKTOK_PERMISSION_REQUIRED": return "Reconnect TikTok and enable publishing permission.";
    case "TIKTOK_CREATOR_INFO_REQUIRED": return "Wait for TikTok publishing settings to load, then try again.";
    case "TIKTOK_PRIVACY_REQUIRED": return "Choose a TikTok privacy option.";
    case "TIKTOK_PRIVACY_INVALID": return "Choose one of the current TikTok privacy options.";
    case "TIKTOK_VIDEO_REQUIRED": return "TikTok requires one video for this post.";
    case "TIKTOK_SINGLE_VIDEO_REQUIRED": return "TikTok currently supports one video per post.";
    case "TIKTOK_MEDIA_UNSUPPORTED": return "TikTok supports one MP4, MOV, or WebM video per post.";
    case "TIKTOK_VIDEO_EMPTY": return "The TikTok video must have a non-zero file size.";
    case "TIKTOK_VIDEO_TOO_LARGE": return "The TikTok video exceeds Towkn's 50 MiB upload limit.";
    case "TIKTOK_VIDEO_TOO_LONG": return "The video exceeds this TikTok creator's maximum duration.";
    case "TIKTOK_CONSENT_REQUIRED": return "Confirm TikTok's Music Usage terms before publishing.";
    case "TIKTOK_COMMERCIAL_DISCLOSURE_REQUIRED": return "Choose the applicable commercial content disclosure.";
    case "TIKTOK_BRANDED_CONTENT_PRIVATE": return "Branded content cannot use TikTok's private visibility option.";
  }
}
