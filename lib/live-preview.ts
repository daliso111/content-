import {
  COMPOSER_DESTINATION_PLATFORMS,
  type ComposerDestinationPlatform,
} from "./composer-platforms";
import type { SocialAccount, SocialPlatform } from "../types";

export type LivePreviewPlatform = Extract<
  SocialPlatform,
  ComposerDestinationPlatform
>;

export type LivePreviewAccount = Pick<
  SocialAccount,
  | "id"
  | "platform"
  | "account_name"
  | "username"
  | "profile_image_url"
  | "connection_status"
>;

export interface LivePreviewDestination {
  id: string;
  platform: LivePreviewPlatform;
  accountName: string;
  handle: string | null;
  avatarUrl: string | null;
  connectionStatus: SocialAccount["connection_status"];
}

export const LIVE_PREVIEW_EMPTY_MESSAGE =
  "Select a destination to preview your post.";
export const YOUTUBE_VIDEO_PREVIEW_MESSAGE =
  "Add a video to preview your YouTube post.";

interface LivePreviewContentInput<TMedia> {
  platform: LivePreviewPlatform;
  caption: string;
  customiseCaptions: boolean;
  platformCaptions: Partial<Record<SocialPlatform, string>>;
  media: TMedia[];
  youtubeTitle: string;
  youtubePrivacyStatus: string;
}

export interface LivePreviewContent<TMedia> {
  caption: string;
  media: TMedia[];
  title?: string;
  privacyStatus?: string;
}

const PREVIEW_PLATFORM_ORDER: LivePreviewPlatform[] = [
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
];

/**
 * Builds preview tabs from destination account selections rather than the
 * editor's platform toggles. Keeping the account id as the tab id means two
 * Pages or channels on the same provider remain distinct.
 */
export function buildLivePreviewDestinations(
  accounts: LivePreviewAccount[],
  selectedDestinationIds: string[],
): LivePreviewDestination[] {
  const selectedOrder = new Map(
    selectedDestinationIds.map((id, index) => [id, index]),
  );

  return accounts
    .filter(
      (account): account is LivePreviewAccount & { platform: LivePreviewPlatform } =>
        selectedOrder.has(account.id) &&
        COMPOSER_DESTINATION_PLATFORMS.includes(
          account.platform as LivePreviewPlatform,
        ),
    )
    .sort((left, right) => {
      const platformDifference =
        PREVIEW_PLATFORM_ORDER.indexOf(left.platform) -
        PREVIEW_PLATFORM_ORDER.indexOf(right.platform);
      return platformDifference ||
        (selectedOrder.get(left.id) ?? 0) - (selectedOrder.get(right.id) ?? 0);
    })
    .map((account) => ({
      id: account.id,
      platform: account.platform,
      accountName: account.account_name.trim(),
      handle: normaliseHandle(account.username),
      avatarUrl: account.profile_image_url,
      connectionStatus: account.connection_status,
    }));
}

export function normaliseHandle(handle: string | null | undefined): string | null {
  const value = handle?.trim().replace(/^@+/, "");
  return value || null;
}

/** Pure binding used by the React preview so every editor change is reflected. */
export function resolveLivePreviewContent<TMedia>({
  platform,
  caption,
  customiseCaptions,
  platformCaptions,
  media,
  youtubeTitle,
  youtubePrivacyStatus,
}: LivePreviewContentInput<TMedia>): LivePreviewContent<TMedia> {
  return {
    caption:
      customiseCaptions && platformCaptions[platform] !== undefined
        ? platformCaptions[platform]!
        : caption,
    media,
    title: platform === "youtube" ? youtubeTitle : undefined,
    privacyStatus: platform === "youtube" ? youtubePrivacyStatus : undefined,
  };
}

export function findYouTubePreviewVideo<TMedia extends { type: string }>(
  media: TMedia[],
): TMedia | undefined {
  return media.find((item) => item.type === "video");
}

export function formatPrivacyStatus(value: string): string {
  if (!value) return "Private";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
