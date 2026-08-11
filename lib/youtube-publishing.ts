import type { MediaAssetPresentation, SocialAccountView } from "../types";
import { validatePublishingMediaForPlatform } from "./publishing-media-validation";

export const PUBLISHING_DESTINATION_PLATFORMS = [
  "facebook",
  "instagram",
  "youtube",
  "tiktok",
] as const;

export type YouTubePrivacyStatus = "private" | "unlisted" | "public";

export const DEFAULT_YOUTUBE_PRIVACY: YouTubePrivacyStatus = "private";

export type YouTubePublishingValidationCode =
  | "YOUTUBE_VIDEO_REQUIRED"
  | "YOUTUBE_TITLE_REQUIRED"
  | "YOUTUBE_TITLE_TOO_LONG"
  | "YOUTUBE_DESCRIPTION_TOO_LONG"
  | "YOUTUBE_PRIVACY_INVALID";

export function isPublishingDestinationPlatform(
  platform: string,
): platform is (typeof PUBLISHING_DESTINATION_PLATFORMS)[number] {
  return PUBLISHING_DESTINATION_PLATFORMS.includes(
    platform as (typeof PUBLISHING_DESTINATION_PLATFORMS)[number],
  );
}

export function selectableDestinationAccounts(
  accounts: SocialAccountView[],
  workspaceId: string,
): SocialAccountView[] {
  return accounts.filter(({ account }) =>
    account.workspace_id === workspaceId &&
    account.connection_status === "connected" &&
    isPublishingDestinationPlatform(account.platform)
  );
}

export function validateYouTubePublishing(
  media: MediaAssetPresentation[],
  title: string,
  description: string,
  privacyStatus: string,
): YouTubePublishingValidationCode | null {
  if (validatePublishingMediaForPlatform("youtube", media)) {
    return "YOUTUBE_VIDEO_REQUIRED";
  }
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return "YOUTUBE_TITLE_REQUIRED";
  if (trimmedTitle.length > 100) return "YOUTUBE_TITLE_TOO_LONG";
  if (description.length > 5_000) return "YOUTUBE_DESCRIPTION_TOO_LONG";
  if (!["private", "unlisted", "public"].includes(privacyStatus)) {
    return "YOUTUBE_PRIVACY_INVALID";
  }
  return null;
}

export function youtubeValidationMessage(
  code: YouTubePublishingValidationCode,
): string {
  switch (code) {
    case "YOUTUBE_VIDEO_REQUIRED":
      return "YouTube publishing requires exactly one video.";
    case "YOUTUBE_TITLE_REQUIRED":
      return "Add a YouTube title before publishing.";
    case "YOUTUBE_TITLE_TOO_LONG":
      return "YouTube titles must be 100 characters or fewer.";
    case "YOUTUBE_DESCRIPTION_TOO_LONG":
      return "YouTube descriptions must be 5,000 characters or fewer.";
    case "YOUTUBE_PRIVACY_INVALID":
      return "Choose a valid YouTube privacy status.";
  }
}
