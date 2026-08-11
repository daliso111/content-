import { requireUser } from "../_shared/auth.ts";
import { assertAllowedOrigin, handleOptions } from "../_shared/cors.ts";
import {
  ConnectionError,
  safeConnectionError,
} from "../_shared/connection-errors.ts";
import { createTrustedClient, trustedRpc } from "../_shared/database.ts";
import { getMetaConfig, missingMetaScopes } from "../_shared/meta-config.ts";
import {
  discoverLinkedInstagramDestination,
  type MetaPlatform,
  refreshDestination,
} from "../_shared/meta-client.ts";
import { errorResponse, jsonResponse } from "../_shared/responses.ts";
import { decryptToken, encryptToken } from "../_shared/token-crypto.ts";
import { readObject, requirePost, requireUuid } from "../_shared/validation.ts";
import {
  discoverYouTubeChannel,
  refreshYouTubeAccessToken,
} from "../_shared/youtube-client.ts";
import { getYouTubeConfig } from "../_shared/youtube-config.ts";
import {
  discoverTikTokUser,
  refreshTikTokAccessToken,
} from "../_shared/tiktok-client.ts";
import { getTikTokConfig } from "../_shared/tiktok-config.ts";

interface CredentialRecord {
  id: string;
  platform: MetaPlatform | "youtube" | "tiktok";
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
  let userId: string | null = null;
  let accountId: string | null = null;
  try {
    const preflight = handleOptions(request);
    if (preflight) return preflight;
    assertAllowedOrigin(request);
    requirePost(request);
    const user = await requireUser(request);
    userId = user.id;
    const body = await readObject(request);
    accountId = requireUuid(body.socialAccountId);
    const trusted = createTrustedClient();
    const credential = await trustedRpc<CredentialRecord>(
      trusted,
      "get_social_account_credential",
      {
        p_social_account_id: accountId,
        p_actor_id: user.id,
      },
    );
    if (credential.platform === "youtube") {
      if (!credential.encryptedRefreshToken || !credential.refreshTokenIv) {
        throw new ConnectionError("YOUTUBE_REAUTHORIZATION_REQUIRED", 401);
      }
      const refreshToken = await decryptToken(
        credential.encryptedRefreshToken,
        credential.refreshTokenIv,
      );
      const refreshed = await refreshYouTubeAccessToken(
        getYouTubeConfig(),
        refreshToken,
      );
      const channel = await discoverYouTubeChannel(refreshed.accessToken);
      const encryptedAccess = await encryptToken(refreshed.accessToken);
      const rotatedRefresh = refreshed.refreshToken
        ? await encryptToken(refreshed.refreshToken)
        : null;
      const result = await trustedRpc<Record<string, unknown>>(
        trusted,
        "update_youtube_connection_refresh",
        {
          p_social_account_id: accountId,
          p_actor_id: user.id,
          p_account_name: channel.accountName,
          p_username: channel.username,
          p_profile_image_url: channel.profileImageUrl,
          p_encrypted_access_token: encryptedAccess.ciphertext,
          p_access_token_iv: encryptedAccess.iv,
          p_encrypted_refresh_token: rotatedRefresh?.ciphertext ?? null,
          p_refresh_token_iv: rotatedRefresh?.iv ?? null,
          p_token_type: refreshed.tokenType ?? credential.tokenType,
          p_token_expires_at: refreshed.expiresAt,
          p_granted_scopes: refreshed.grantedScopes.length > 0
            ? refreshed.grantedScopes
            : credential.grantedScopes,
        },
      );
      return jsonResponse(request, result);
    }

    if (credential.platform === "tiktok") {
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
      const encryptedAccess = await encryptToken(refreshed.accessToken);
      const encryptedRefresh = await encryptToken(refreshed.refreshToken);

      // TikTok refresh tokens may rotate. Persist both returned credentials
      // before any profile request that can fail independently.
      const persisted = await trustedRpc<Record<string, unknown>>(
        trusted,
        "update_tiktok_connection_tokens",
        {
          p_social_account_id: accountId,
          p_actor_id: user.id,
          p_encrypted_access_token: encryptedAccess.ciphertext,
          p_access_token_iv: encryptedAccess.iv,
          p_encrypted_refresh_token: encryptedRefresh.ciphertext,
          p_refresh_token_iv: encryptedRefresh.iv,
          p_token_type: refreshed.tokenType ?? credential.tokenType,
          p_token_expires_at: refreshed.expiresAt,
          p_refresh_token_expires_at: refreshed.refreshExpiresAt,
          p_granted_scopes: refreshed.grantedScopes,
        },
      );
      const profile = await discoverTikTokUser(
        refreshed.accessToken,
        credential.platformAccountId,
      );
      const metadata = await trustedRpc<Record<string, unknown>>(
        trusted,
        "update_social_account_refresh",
        {
          p_social_account_id: accountId,
          p_actor_id: user.id,
          p_account_name: profile.accountName,
          p_username: null,
          p_profile_image_url: profile.profileImageUrl,
          p_token_expires_at: refreshed.expiresAt,
          p_connection_status: "connected",
          p_error_code: null,
          p_error_message: null,
        },
      );
      return jsonResponse(request, { ...persisted, ...metadata });
    }

    if (
      credential.tokenExpiresAt &&
      new Date(credential.tokenExpiresAt).getTime() <= Date.now()
    ) {
      throw new ConnectionError("TOKEN_EXPIRED", 401);
    }
    const token = await decryptToken(
      credential.encryptedAccessToken,
      credential.accessTokenIv,
    );
    const config = getMetaConfig();
    const metadata = await refreshDestination(
      config,
      credential.platform,
      credential.platformAccountId,
      token,
    );
    const result = await trustedRpc<Record<string, unknown>>(
      trusted,
      "update_social_account_refresh",
      {
        p_social_account_id: accountId,
        p_actor_id: user.id,
        p_account_name: metadata.accountName,
        p_username: metadata.username,
        p_profile_image_url: metadata.profileImageUrl,
        p_token_expires_at: credential.tokenExpiresAt,
        p_connection_status: "connected",
        p_error_code: null,
        p_error_message: null,
      },
    );
    let linkedInstagramAccountId: string | null = null;
    if (credential.platform === "facebook") {
      const instagram = await discoverLinkedInstagramDestination(
        config,
        credential.platformAccountId,
        token,
      );
      if (
        instagram &&
        missingMetaScopes("instagram", credential.grantedScopes).length === 0
      ) {
        const encrypted = await encryptToken(token);
        const linked = await trustedRpc<{ id: string }>(
          trusted,
          "upsert_linked_instagram_connection",
          {
            p_parent_social_account_id: accountId,
            p_actor_id: user.id,
            p_connection: {
              platform: instagram.platform,
              platformAccountId: instagram.platformAccountId,
              accountName: instagram.accountName,
              username: instagram.username,
              profileImageUrl: instagram.profileImageUrl,
              accountType: instagram.accountType,
              parentPageId: instagram.parentPageId,
              tokenType: "bearer",
              tokenExpiresAt: credential.tokenExpiresAt,
              encryptedAccessToken: encrypted.ciphertext,
              accessTokenIv: encrypted.iv,
              metadata: {},
            },
          },
        );
        linkedInstagramAccountId = linked.id;
      }
    }
    return jsonResponse(request, { ...result, linkedInstagramAccountId });
  } catch (error) {
    const safe = safeConnectionError(error);
    if (
      userId && accountId && [
        "TOKEN_EXPIRED",
        "TOKEN_DECRYPTION_FAILED",
        "META_PROVIDER_UNAVAILABLE",
        "YOUTUBE_REAUTHORIZATION_REQUIRED",
        "YOUTUBE_PROVIDER_UNAVAILABLE",
        "TIKTOK_REAUTHORIZATION_REQUIRED",
        "TIKTOK_OPEN_ID_MISMATCH",
        "TIKTOK_REQUIRED_SCOPE_MISSING",
      ].includes(safe.code)
    ) {
      try {
        await trustedRpc(
          createTrustedClient(),
          "update_social_account_refresh",
          {
            p_social_account_id: accountId,
            p_actor_id: userId,
            p_account_name: null,
            p_username: null,
            p_profile_image_url: null,
            p_token_expires_at: null,
            p_connection_status: safe.code === "TOKEN_EXPIRED"
              ? "expired"
              : "reconnect_required",
            p_error_code: safe.code,
            p_error_message: safe.code === "TOKEN_EXPIRED"
              ? "Meta access has expired. Reconnect this account."
              : safe.code.startsWith("YOUTUBE_")
              ? "Towkn could not verify this YouTube connection. Reauthorize the channel."
              : safe.code.startsWith("TIKTOK_")
              ? "Towkn could not verify this TikTok connection. Reauthorize the account."
              : "Towkn could not verify this Meta connection.",
          },
        );
      } catch {
        // The original safe error remains the only browser-visible error.
      }
    }
    return errorResponse(request, safe);
  }
});
