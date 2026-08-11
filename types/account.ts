import type { Enums, Tables } from "./database.generated";
import type { SocialPlatform } from "./common";

export type SocialAccount = Tables<"social_accounts">;
export type SocialConnectionStatus = Enums<"social_connection_status">;
export type SocialAccountType = Enums<"social_account_type">;
export type ConnectedSocialAccountType = SocialAccountType | "tiktok_user";
export type ConnectionStatus = SocialConnectionStatus;

export interface DemoSocialAccount {
  id: string;
  platform: SocialPlatform;
  /** Display name of the connected page / profile. */
  accountName: string;
  handle: string;
  status: SocialConnectionStatus;
  followers?: number;
  lastSyncedAt?: string; // ISO date
}

export interface SocialAccountView {
  account: SocialAccount;
  connectedByName: string | null;
}

export interface MetaConnectionOption {
  platform: "facebook" | "instagram";
  platformAccountId: string;
  accountName: string;
  username: string | null;
  profileImageUrl: string | null;
  accountType: SocialAccountType;
  parentPageId: string | null;
  alreadyConnected: boolean;
}

export interface MetaConnectionSession {
  id: string;
  workspaceId: string;
  expiresAt: string;
}

export interface MetaConnectionOptionsResult {
  session: MetaConnectionSession;
  options: MetaConnectionOption[];
}

export interface ConnectedAccountResult {
  id: string;
  workspaceId: string;
  platform: "facebook" | "instagram" | "youtube" | "tiktok";
  accountType: ConnectedSocialAccountType;
  platformAccountId: string;
  accountName: string;
  username: string | null;
  profileImageUrl: string | null;
  connectionStatus: SocialConnectionStatus;
  tokenExpiresAt: string | null;
}

export interface SocialAccountActionResult {
  id: string;
  connectionStatus: SocialConnectionStatus;
  lastRefreshedAt?: string;
  warning?: string | null;
  linkedInstagramAccountId?: string | null;
}

export interface TikTokCreatorInfoResult {
  accountId: string;
  creatorUsername: string | null;
  creatorNickname: string | null;
  creatorAvatarUrl: string | null;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
}
