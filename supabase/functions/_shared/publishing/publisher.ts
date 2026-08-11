import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { decryptToken, encryptToken } from "../token-crypto.ts";
import { refreshYouTubeAccessToken } from "../youtube-client.ts";
import { getYouTubeConfig } from "../youtube-config.ts";
import { refreshTikTokAccessToken } from "../tiktok-client.ts";
import { getTikTokConfig } from "../tiktok-config.ts";
import { generateTikTokMediaRelayUrl } from "../tiktok-media-token.ts";
import { ConnectionError } from "../connection-errors.ts";
import { publishFacebookStep } from "./facebook-publisher.ts";
import { publishInstagramStep } from "./instagram-publisher.ts";
import { signedMediaUrl } from "./media.ts";
import { validateClaim } from "./job-state.ts";
import { PublishingError } from "./errors.ts";
import { publishYouTubeStep } from "./youtube-publisher.ts";
import { publishTikTokStep } from "./tiktok-publisher.ts";
import type {
  ClaimedPublishingMessage,
  PublishingStepResult,
} from "./types.ts";

export async function processClaim(
  client: SupabaseClient,
  claim: ClaimedPublishingMessage,
  fetcher: typeof fetch = fetch,
): Promise<PublishingStepResult> {
  validateClaim(claim);
  const account = claim.account!;
  const credential = claim.credential!;
  if (claim.job.platform === "youtube") {
    const token = await youtubeAccessToken(client, claim, fetcher);
    const media = claim.job.payload_snapshot.media[0];
    const mediaUrl = media
      ? await signedMediaUrl(client, media, claim.job.workspace_id)
      : undefined;
    return publishYouTubeStep(
      claim.job,
      account,
      token,
      mediaUrl,
      claim.youtubeUploadSessionUrl,
      claim.youtubeCompletedVideoId,
      async (sessionUrl) => {
        const { error } = await client.rpc("store_youtube_upload_session", {
          p_publishing_job_id: claim.job.id,
          p_session_url: sessionUrl,
        });
        if (error) {
          throw new PublishingError(
            "YOUTUBE_UPLOAD_FAILED",
            "The resumable YouTube upload could not be saved.",
            true,
          );
        }
      },
      async (providerVideoId) => {
        const { error } = await client.rpc("complete_youtube_upload", {
          p_publishing_job_id: claim.job.id,
          p_provider_video_id: providerVideoId,
        });
        if (error) {
          throw new PublishingError(
            "AMBIGUOUS_PROVIDER_OUTCOME",
            "YouTube created the video, but Towkn could not record the result.",
            false,
            true,
          );
        }
      },
      fetcher,
    );
  }
  if (claim.job.platform === "tiktok") {
    const token = await tiktokAccessToken(client, claim, fetcher);
    const needsMediaUrl = !claim.tiktokPublishSession?.publishId &&
      !claim.tiktokPublishSession?.submissionStartedAt;
    const media = claim.job.payload_snapshot.media[0];
    let mediaUrl: string | undefined;
    if (needsMediaUrl && media) {
      try {
        mediaUrl = await generateTikTokMediaRelayUrl(
          claim.job.workspace_id,
          media.mediaAssetId,
        );
      } catch {
        throw new PublishingError(
          "TIKTOK_MEDIA_URL_CREATION_FAILED",
          "A secure TikTok media URL could not be created.",
        );
      }
    }
    return publishTikTokStep(
      claim.job,
      account,
      token,
      mediaUrl,
      claim.tiktokPublishSession ?? null,
      {
        startSubmission: async () => {
          const { error } = await client.rpc(
            "start_tiktok_publish_submission",
            {
              p_publishing_job_id: claim.job.id,
            },
          );
          if (error) {
            throw new PublishingError(
              "TIKTOK_SESSION_WRITE_FAILED",
              "TikTok submission state could not be saved.",
              true,
            );
          }
        },
        clearSubmissionStart: async () => {
          const { error } = await client.rpc("clear_tiktok_submission_start", {
            p_publishing_job_id: claim.job.id,
          });
          if (error) {
            throw new PublishingError(
              "TIKTOK_SESSION_WRITE_FAILED",
              "TikTok submission state could not be reset.",
              true,
            );
          }
        },
        storePublishId: async (publishId) => {
          const { error } = await client.rpc("store_tiktok_publish_id", {
            p_publishing_job_id: claim.job.id,
            p_publish_id: publishId,
          });
          if (error) throw error;
        },
        recordStatus: async (status, failReason) => {
          const { error } = await client.rpc("record_tiktok_publish_status", {
            p_publishing_job_id: claim.job.id,
            p_provider_status: status,
            p_fail_reason: failReason,
          });
          if (error) {
            throw new PublishingError(
              "TIKTOK_SESSION_WRITE_FAILED",
              "TikTok processing state could not be saved.",
              true,
            );
          }
        },
      },
      fetcher,
    );
  }
  const token = await decryptToken(
    credential.encryptedAccessToken,
    credential.accessTokenIv,
  );
  const media = claim.job.payload_snapshot.media[0];
  const mediaUrl = media
    ? await signedMediaUrl(client, media, claim.job.workspace_id)
    : undefined;
  switch (claim.job.platform) {
    case "facebook":
      return publishFacebookStep(claim.job, account, token, mediaUrl, fetcher);
    case "instagram":
      return publishInstagramStep(claim.job, account, token, mediaUrl, fetcher);
    default:
      throw new PublishingError(
        "UNSUPPORTED_PLATFORM",
        "The publishing destination platform is unsupported.",
      );
  }
}

export async function tiktokAccessToken(
  client: SupabaseClient,
  claim: ClaimedPublishingMessage,
  fetcher: typeof fetch,
): Promise<string> {
  const credential = claim.credential!;
  const expiry = credential.expiresAt ?? claim.account!.tokenExpiresAt;
  if (!expiry || new Date(expiry).getTime() > Date.now() + 120_000) {
    return decryptToken(
      credential.encryptedAccessToken,
      credential.accessTokenIv,
    );
  }
  if (!credential.encryptedRefreshToken || !credential.refreshTokenIv) {
    throw new PublishingError(
      "TIKTOK_ACCOUNT_REAUTH_REQUIRED",
      "Reconnect TikTok before publishing.",
    );
  }
  let refreshed;
  try {
    const refreshToken = await decryptToken(
      credential.encryptedRefreshToken,
      credential.refreshTokenIv,
    );
    refreshed = await refreshTikTokAccessToken(
      getTikTokConfig(),
      refreshToken,
      fetcher,
    );
  } catch (error) {
    if (
      error instanceof ConnectionError &&
      error.code === "TIKTOK_REAUTHORIZATION_REQUIRED"
    ) {
      throw new PublishingError(
        "TIKTOK_ACCOUNT_REAUTH_REQUIRED",
        "Reconnect TikTok before publishing.",
      );
    }
    throw new PublishingError(
      "TIKTOK_TOKEN_REFRESH_FAILED",
      "The TikTok access token could not be refreshed.",
      true,
    );
  }
  if (refreshed.openId !== claim.account!.platformAccountId) {
    throw new PublishingError(
      "TIKTOK_ACCOUNT_REAUTH_REQUIRED",
      "Reconnect TikTok before publishing.",
    );
  }
  if (!refreshed.grantedScopes.includes("video.publish")) {
    throw new PublishingError(
      "TIKTOK_PUBLISHING_PERMISSION_REQUIRED",
      "Reconnect TikTok and grant publishing permission.",
    );
  }
  const encryptedAccess = await encryptToken(refreshed.accessToken);
  const encryptedRefresh = await encryptToken(refreshed.refreshToken);
  const { error } = await client.rpc("update_tiktok_publishing_credential", {
    p_social_account_id: claim.account!.id,
    p_encrypted_access_token: encryptedAccess.ciphertext,
    p_access_token_iv: encryptedAccess.iv,
    p_encrypted_refresh_token: encryptedRefresh.ciphertext,
    p_refresh_token_iv: encryptedRefresh.iv,
    p_token_type: refreshed.tokenType,
    p_token_expires_at: refreshed.expiresAt,
    p_refresh_token_expires_at: refreshed.refreshExpiresAt,
    p_granted_scopes: refreshed.grantedScopes,
  });
  if (error) {
    throw new PublishingError(
      "TIKTOK_TOKEN_REFRESH_FAILED",
      "The refreshed TikTok credential could not be stored.",
      true,
    );
  }
  return refreshed.accessToken;
}

export async function youtubeAccessToken(
  client: SupabaseClient,
  claim: ClaimedPublishingMessage,
  fetcher: typeof fetch,
): Promise<string> {
  const credential = claim.credential!;
  const expiry = credential.expiresAt ?? claim.account!.tokenExpiresAt;
  if (!expiry || new Date(expiry).getTime() > Date.now() + 120_000) {
    return decryptToken(
      credential.encryptedAccessToken,
      credential.accessTokenIv,
    );
  }
  if (!credential.encryptedRefreshToken || !credential.refreshTokenIv) {
    throw new PublishingError(
      "YOUTUBE_ACCOUNT_REAUTH_REQUIRED",
      "Reconnect the YouTube channel before publishing.",
    );
  }
  let refreshed;
  try {
    const refreshToken = await decryptToken(
      credential.encryptedRefreshToken,
      credential.refreshTokenIv,
    );
    refreshed = await refreshYouTubeAccessToken(
      getYouTubeConfig(),
      refreshToken,
      fetcher,
    );
  } catch (error) {
    if (
      error instanceof ConnectionError &&
      error.code === "YOUTUBE_REAUTHORIZATION_REQUIRED"
    ) {
      throw new PublishingError(
        "YOUTUBE_ACCOUNT_REAUTH_REQUIRED",
        "Reconnect the YouTube channel before publishing.",
      );
    }
    throw new PublishingError(
      "YOUTUBE_TOKEN_REFRESH_FAILED",
      "The YouTube access token could not be refreshed.",
      true,
    );
  }
  const encryptedAccess = await encryptToken(refreshed.accessToken);
  const encryptedRefresh = refreshed.refreshToken
    ? await encryptToken(refreshed.refreshToken)
    : null;
  const { error } = await client.rpc("update_youtube_publishing_credential", {
    p_social_account_id: claim.account!.id,
    p_encrypted_access_token: encryptedAccess.ciphertext,
    p_access_token_iv: encryptedAccess.iv,
    p_encrypted_refresh_token: encryptedRefresh?.ciphertext ?? null,
    p_refresh_token_iv: encryptedRefresh?.iv ?? null,
    p_token_type: refreshed.tokenType,
    p_token_expires_at: refreshed.expiresAt,
    p_granted_scopes: refreshed.grantedScopes,
  });
  if (error) {
    throw new PublishingError(
      "YOUTUBE_TOKEN_REFRESH_FAILED",
      "The refreshed YouTube credential could not be stored.",
      true,
    );
  }
  return refreshed.accessToken;
}
