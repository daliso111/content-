import { requireUser } from "../_shared/auth.ts";
import { assertAllowedOrigin, handleOptions } from "../_shared/cors.ts";
import { ConnectionError } from "../_shared/connection-errors.ts";
import { createTrustedClient, trustedRpc } from "../_shared/database.ts";
import { errorResponse, jsonResponse } from "../_shared/responses.ts";
import { decryptToken, encryptToken } from "../_shared/token-crypto.ts";
import { refreshTikTokAccessToken } from "../_shared/tiktok-client.ts";
import { getTikTokConfig } from "../_shared/tiktok-config.ts";
import { allowedTikTokPrivacyLevels } from "../_shared/tiktok-direct-post-capabilities.ts";
import { queryCreatorInfo } from "../_shared/tiktok-posting-client.ts";
import { PublishingError } from "../_shared/publishing/errors.ts";
import { readObject, requirePost, requireUuid } from "../_shared/validation.ts";

interface CreatorCredential {
  id: string;
  workspaceId: string;
  platformAccountId: string;
  encryptedAccessToken: string;
  accessTokenIv: string;
  encryptedRefreshToken: string | null;
  refreshTokenIv: string | null;
  tokenType: string | null;
  tokenExpiresAt: string | null;
  grantedScopes: string[];
}

Deno.serve(async (request) => {
  try {
    const preflight = handleOptions(request);
    if (preflight) return preflight;
    assertAllowedOrigin(request);
    requirePost(request);
    const user = await requireUser(request);
    const body = await readObject(request);
    const workspaceId = requireUuid(body.workspaceId);
    const accountId = requireUuid(body.socialAccountId);
    const trusted = createTrustedClient();
    const credential = await trustedRpc<CreatorCredential>(
      trusted,
      "get_tiktok_creator_credential",
      {
        p_workspace_id: workspaceId,
        p_social_account_id: accountId,
        p_actor_id: user.id,
      },
    );
    if (!credential.grantedScopes.includes("video.publish")) {
      throw new ConnectionError("TIKTOK_PUBLISHING_PERMISSION_REQUIRED", 403);
    }

    let accessToken: string;
    const needsRefresh = !credential.tokenExpiresAt ||
      new Date(credential.tokenExpiresAt).getTime() <= Date.now() + 120_000;
    if (needsRefresh) {
      if (!credential.encryptedRefreshToken || !credential.refreshTokenIv) {
        throw new ConnectionError("TIKTOK_REAUTHORIZATION_REQUIRED", 401);
      }
      const refreshToken = await decryptToken(
        credential.encryptedRefreshToken,
        credential.refreshTokenIv,
      );
      const refreshed = await refreshTikTokAccessToken(
        getTikTokConfig(),
        refreshToken,
      );
      if (refreshed.openId !== credential.platformAccountId) {
        throw new ConnectionError("TIKTOK_OPEN_ID_MISMATCH", 409);
      }
      if (!refreshed.grantedScopes.includes("video.publish")) {
        throw new ConnectionError("TIKTOK_PUBLISHING_PERMISSION_REQUIRED", 403);
      }
      const encryptedAccess = await encryptToken(refreshed.accessToken);
      const encryptedRefresh = await encryptToken(refreshed.refreshToken);
      await trustedRpc(trusted, "update_tiktok_publishing_credential", {
        p_social_account_id: accountId,
        p_encrypted_access_token: encryptedAccess.ciphertext,
        p_access_token_iv: encryptedAccess.iv,
        p_encrypted_refresh_token: encryptedRefresh.ciphertext,
        p_refresh_token_iv: encryptedRefresh.iv,
        p_token_type: refreshed.tokenType ?? credential.tokenType,
        p_token_expires_at: refreshed.expiresAt,
        p_refresh_token_expires_at: refreshed.refreshExpiresAt,
        p_granted_scopes: refreshed.grantedScopes,
      });
      accessToken = refreshed.accessToken;
    } else {
      accessToken = await decryptToken(
        credential.encryptedAccessToken,
        credential.accessTokenIv,
      );
    }

    const creator = await queryCreatorInfo(accessToken);
    return jsonResponse(request, {
      accountId,
      ...creator,
      privacyLevelOptions: allowedTikTokPrivacyLevels(
        creator.privacyLevelOptions,
      ),
    });
  } catch (error) {
    if (error instanceof PublishingError) {
      const safe = error.code === "TIKTOK_ACCOUNT_REAUTH_REQUIRED"
        ? new ConnectionError("TIKTOK_REAUTHORIZATION_REQUIRED", 401)
        : error.code === "TIKTOK_PUBLISHING_PERMISSION_REQUIRED"
        ? new ConnectionError("TIKTOK_PUBLISHING_PERMISSION_REQUIRED", 403)
        : error.code === "TIKTOK_RATE_LIMITED"
        ? new ConnectionError("RATE_LIMITED", 429)
        : new ConnectionError(
          "TIKTOK_PROVIDER_UNAVAILABLE",
          error.retryable ? 503 : 502,
        );
      return errorResponse(request, safe);
    }
    return errorResponse(request, error);
  }
});
