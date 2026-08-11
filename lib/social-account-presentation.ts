import type { SocialAccount } from "../types/account";

export interface SocialAccountIdentity {
  platformLabel: "Facebook" | "Instagram" | "YouTube" | "TikTok";
  primary: string;
  secondary: string | null;
}

export type TikTokPublishingCapability =
  | "permission_required"
  | "authorized"
  | "reconnect_required";

export function tiktokPublishingCapability(
  account: Pick<
    SocialAccount,
    "platform" | "connection_status" | "granted_scopes"
  >,
): TikTokPublishingCapability | null {
  if (account.platform !== "tiktok") return null;
  if (account.connection_status !== "connected") return "reconnect_required";
  return account.granted_scopes.includes("video.publish")
    ? "authorized"
    : "permission_required";
}

export function socialAccountIdentity(
  account: Pick<SocialAccount, "platform" | "account_name" | "username" | "platform_account_id">,
): SocialAccountIdentity {
  const username = account.username?.trim() || null;
  if (account.platform === "instagram") {
    return {
      platformLabel: "Instagram",
      primary: username ? `@${username}` : account.account_name,
      secondary: username && account.account_name !== username ? account.account_name : null,
    };
  }
  if (account.platform === "youtube") {
    return {
      platformLabel: "YouTube",
      primary: account.account_name,
      secondary: username ? `@${username}` : account.platform_account_id,
    };
  }
  if (account.platform === "tiktok") {
    return {
      platformLabel: "TikTok",
      primary: account.account_name,
      secondary: null,
    };
  }
  return {
    platformLabel: "Facebook",
    primary: account.account_name,
    secondary: username ? `@${username}` : account.platform_account_id,
  };
}

export function connectionProviderForPlatform(
  platform: string,
): "meta" | "youtube" | "tiktok" {
  if (platform === "youtube") return "youtube";
  if (platform === "tiktok") return "tiktok";
  return "meta";
}
