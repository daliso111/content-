import { isPublishingDestinationPlatform } from "./youtube-publishing";
import type { Json } from "../types/database.generated";
import type { SocialAccountView } from "../types";

export const COMPOSER_DESTINATION_PLATFORMS = [
  "facebook",
  "instagram",
  "tiktok",
  "youtube",
] as const;

export type ComposerDestinationPlatform =
  (typeof COMPOSER_DESTINATION_PLATFORMS)[number];

const TIKTOK_COMPOSER_DESTINATION_IDS_KEY =
  "composerDestinationAccountIds";

export function isComposerDestinationPlatform(
  platform: string,
): platform is ComposerDestinationPlatform {
  return COMPOSER_DESTINATION_PLATFORMS.includes(
    platform as ComposerDestinationPlatform,
  );
}

export function selectableComposerDestinationAccounts(
  accounts: SocialAccountView[],
  workspaceId: string,
): SocialAccountView[] {
  return accounts.filter(({ account }) =>
    account.workspace_id === workspaceId &&
    account.connection_status === "connected" &&
    isComposerDestinationPlatform(account.platform)
  );
}

export function partitionComposerDestinationIds(
  accounts: SocialAccountView[],
  selectedDestinationIds: string[],
): { publishableIds: string[]; composerOnlyIds: string[] } {
  const byId = new Map(accounts.map(({ account }) => [account.id, account]));
  const publishableIds: string[] = [];
  const composerOnlyIds: string[] = [];

  for (const id of selectedDestinationIds) {
    const account = byId.get(id);
    if (!account) continue;
    if (isPublishingDestinationPlatform(account.platform)) {
      publishableIds.push(id);
    } else if (isComposerDestinationPlatform(account.platform)) {
      composerOnlyIds.push(id);
    }
  }

  return { publishableIds, composerOnlyIds };
}

export function readTikTokComposerDestinationIds(
  settings: Json | null | undefined,
): string[] {
  if (!settings || Array.isArray(settings) || typeof settings !== "object") {
    return [];
  }
  const value = settings[TIKTOK_COMPOSER_DESTINATION_IDS_KEY];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

export function withTikTokComposerDestinationIds(
  settings: Json | null | undefined,
  destinationIds: string[],
): Json {
  const current =
    settings && !Array.isArray(settings) && typeof settings === "object"
      ? settings
      : {};
  return {
    ...current,
    [TIKTOK_COMPOSER_DESTINATION_IDS_KEY]: destinationIds,
  };
}
