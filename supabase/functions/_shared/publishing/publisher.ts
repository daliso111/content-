import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { decryptToken, encryptToken } from "../token-crypto.ts";
import { refreshYouTubeAccessToken } from "../youtube-client.ts";
import { getYouTubeConfig } from "../youtube-config.ts";
import { ConnectionError } from "../connection-errors.ts";
import { publishFacebookStep } from "./facebook-publisher.ts";
import { publishInstagramStep } from "./instagram-publisher.ts";
import { signedMediaUrl } from "./media.ts";
import { validateClaim } from "./job-state.ts";
import { PublishingError } from "./errors.ts";
import { publishYouTubeStep } from "./youtube-publisher.ts";
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
            "YouTube created the video, but PostFlow could not record the result.",
            false,
            true,
          );
        }
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
  return claim.job.platform === "facebook"
    ? publishFacebookStep(claim.job, account, token, mediaUrl, fetcher)
    : publishInstagramStep(claim.job, account, token, mediaUrl, fetcher);
}

export async function youtubeAccessToken(
  client: SupabaseClient,
  claim: ClaimedPublishingMessage,
  fetcher: typeof fetch,
): Promise<string> {
  const credential = claim.credential!;
  const expiry = credential.expiresAt ?? claim.account!.tokenExpiresAt;
  if (!expiry || new Date(expiry).getTime() > Date.now() + 120_000) {
    return decryptToken(credential.encryptedAccessToken, credential.accessTokenIv);
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
