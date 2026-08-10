import { missingMetaScopes } from "../meta-config.ts";
import { PublishingError } from "./errors.ts";
import type { ClaimedPublishingMessage } from "./types.ts";

export function validateClaim(claim: ClaimedPublishingMessage): void {
  const { job, account, credential } = claim;
  if (!account) {
    throw new PublishingError(
      "SOCIAL_ACCOUNT_NOT_FOUND",
      "The destination account no longer exists.",
    );
  }
  if (!credential) {
    throw new PublishingError(
      "ACCOUNT_DISCONNECTED",
      "Reconnect the destination account before publishing.",
    );
  }
  if (
    account.id !== job.social_account_id ||
    account.workspaceId !== job.workspace_id ||
    account.platform !== job.platform
  ) {
    throw new PublishingError(
      "DESTINATION_ACCOUNT_MISMATCH",
      "The publishing destination no longer matches the job.",
    );
  }
  if (account.connectionStatus !== "connected") {
    throw new PublishingError(
      "ACCOUNT_DISCONNECTED",
      "Reconnect the destination account before publishing.",
    );
  }
  if (account.platform === "youtube") {
    if (!credential.encryptedRefreshToken || !credential.refreshTokenIv) {
      throw new PublishingError(
        "YOUTUBE_ACCOUNT_REAUTH_REQUIRED",
        "Reconnect the YouTube channel before publishing.",
      );
    }
    if (!credential.grantedScopes.includes(
      "https://www.googleapis.com/auth/youtube.upload",
    )) {
      throw new PublishingError(
        "MISSING_PERMISSION",
        "Reconnect the YouTube channel and grant upload permission.",
      );
    }
  } else {
    const expiry = credential.expiresAt ?? account.tokenExpiresAt;
    if (expiry && new Date(expiry).getTime() <= Date.now()) {
      throw new PublishingError(
        "TOKEN_EXPIRED",
        "The destination credential has expired.",
      );
    }
    const missing = missingMetaScopes(account.platform, credential.grantedScopes);
    if (missing.length) {
      throw new PublishingError(
        "MISSING_PERMISSION",
        "Reconnect the account and grant the required publishing permissions.",
      );
    }
  }
  const snapshot = job.payload_snapshot;
  if (
    !snapshot || snapshot.version !== 1 ||
    snapshot.workspaceId !== job.workspace_id ||
    snapshot.postId !== job.post_id ||
    snapshot.postRevision !== job.post_revision ||
    snapshot.socialAccountId !== job.social_account_id ||
    snapshot.platform !== job.platform || !Array.isArray(snapshot.media)
  ) {
    throw new PublishingError(
      "INVALID_JOB_SNAPSHOT",
      "The immutable publishing snapshot is invalid.",
    );
  }
}
