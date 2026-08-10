import type { SocialAccount } from "../types/account";

export interface SocialAccountIdentity {
  platformLabel: "Facebook" | "Instagram" | "YouTube";
  primary: string;
  secondary: string | null;
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
  return {
    platformLabel: "Facebook",
    primary: account.account_name,
    secondary: username ? `@${username}` : account.platform_account_id,
  };
}
