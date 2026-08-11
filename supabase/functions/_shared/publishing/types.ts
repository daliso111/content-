export type PublishingOperation =
  | "facebook_text"
  | "facebook_image"
  | "facebook_reel"
  | "instagram_image"
  | "instagram_reel"
  | "youtube_video"
  | "tiktok_video";

export interface SnapshotMedia {
  mediaAssetId: string;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  mediaType: string;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

export interface PublishingSnapshot {
  version: number;
  postId: string;
  postRevision: number;
  workspaceId: string;
  platform: "facebook" | "instagram" | "youtube" | "tiktok";
  socialAccountId: string;
  caption: string;
  platformTitle?: string | null;
  platformSettings: Record<string, unknown>;
  scheduledFor: string;
  media: SnapshotMedia[];
}

export interface PublishingJob {
  id: string;
  workspace_id: string;
  post_id: string;
  post_revision: number;
  social_account_id: string;
  platform: "facebook" | "instagram" | "youtube" | "tiktok";
  operation: PublishingOperation;
  status: string;
  attempt_count: number;
  failure_count?: number;
  max_attempts: number;
  provider_container_id: string | null;
  provider_post_id: string | null;
  safe_error_code: string | null;
  payload_snapshot: PublishingSnapshot;
}

export interface PublishingAccount {
  id: string;
  workspaceId: string;
  platform: "facebook" | "instagram" | "youtube" | "tiktok";
  accountType:
    | "facebook_page"
    | "instagram_business"
    | "instagram_creator"
    | "youtube_channel"
    | "tiktok_user";
  platformAccountId: string;
  parentPageId: string | null;
  connectionStatus: string;
  tokenExpiresAt: string | null;
  grantedScopes: string[];
}

export interface PublishingCredential {
  encryptedAccessToken: string;
  accessTokenIv: string;
  encryptedRefreshToken: string | null;
  refreshTokenIv: string | null;
  tokenType: string | null;
  expiresAt: string | null;
  grantedScopes: string[];
}

export interface ClaimedPublishingMessage {
  messageId: number;
  attemptNumber: number;
  job: PublishingJob;
  account: PublishingAccount | null;
  credential: PublishingCredential | null;
  youtubeUploadSessionUrl: string | null;
  youtubeCompletedVideoId: string | null;
  tiktokPublishSession?: TikTokPublishSession | null;
}

export interface TikTokPublishSession {
  submissionStartedAt: string | null;
  publishId: string | null;
  providerStatus: string | null;
  statusCheckedAt: string | null;
  nextStatusCheckAt: string | null;
  pollCount: number;
}

export interface PublishingStepResult {
  status:
    | "waiting_provider"
    | "retry_wait"
    | "succeeded"
    | "failed"
    | "reconciliation_required";
  phase: string;
  delaySeconds?: number;
  providerContainerId?: string;
  providerPostId?: string;
  providerPermalink?: string;
  httpStatus?: number;
  errorCode?: string;
  safeMessage?: string;
  requestId?: string;
  retryable?: boolean;
}
