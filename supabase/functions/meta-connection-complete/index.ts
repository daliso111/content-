import { requireUser } from "../_shared/auth.ts";
import { assertAllowedOrigin, handleOptions } from "../_shared/cors.ts";
import { ConnectionError } from "../_shared/connection-errors.ts";
import { createTrustedClient, trustedRpc } from "../_shared/database.ts";
import { getMetaConfig, missingMetaScopes } from "../_shared/meta-config.ts";
import { expandSelectedMetaDestinations } from "../_shared/meta-connections.ts";
import { discoverMetaDestinations, type MetaConnectionOption } from "../_shared/meta-client.ts";
import { errorResponse, jsonResponse } from "../_shared/responses.ts";
import { decryptToken, encryptToken } from "../_shared/token-crypto.ts";
import { readObject, requirePost, requireUniqueIds, requireUuid } from "../_shared/validation.ts";

interface PendingSession {
  workspaceId: string;
  encryptedUserToken: string;
  userTokenIv: string;
  tokenExpiresAt: string | null;
  grantedScopes: string[];
  discoveredAccounts: MetaConnectionOption[];
}

Deno.serve(async (request) => {
  try {
    const preflight = handleOptions(request);
    if (preflight) return preflight;
    assertAllowedOrigin(request);
    requirePost(request);
    const user = await requireUser(request);
    const body = await readObject(request);
    const sessionId = requireUuid(body.connectionSessionId);
    const selectedIds = requireUniqueIds(body.selectedAccountIds);
    const trusted = createTrustedClient();
    const session = await trustedRpc<PendingSession>(trusted, "get_meta_connection_session", {
      p_session_id: sessionId,
      p_initiated_by: user.id,
    });
    const allowed = new Set(session.discoveredAccounts.map((option) => option.platformAccountId));
    if (selectedIds.some((id) => !allowed.has(id))) {
      throw new ConnectionError("INVALID_ACCOUNT_SELECTION", 400);
    }
    if (session.tokenExpiresAt && new Date(session.tokenExpiresAt).getTime() <= Date.now()) {
      throw new ConnectionError("TOKEN_EXPIRED", 401);
    }

    const userToken = await decryptToken(session.encryptedUserToken, session.userTokenIv);
    const destinations = await discoverMetaDestinations(getMetaConfig(), userToken);
    const selectedDestinations = expandSelectedMetaDestinations(destinations, selectedIds);
    if (selectedDestinations.length < selectedIds.length) {
      throw new ConnectionError("INVALID_ACCOUNT_SELECTION", 409);
    }
    const connections = await Promise.all(selectedDestinations.map(async (destination) => {
      if (missingMetaScopes(destination.platform, session.grantedScopes).length > 0) {
        throw new ConnectionError("META_PERMISSION_DENIED", 403);
      }
      const encrypted = await encryptToken(destination.accessToken);
      return {
        platform: destination.platform,
        platformAccountId: destination.platformAccountId,
        accountName: destination.accountName,
        username: destination.username,
        profileImageUrl: destination.profileImageUrl,
        accountType: destination.accountType,
        parentPageId: destination.parentPageId,
        tokenType: "bearer",
        encryptedAccessToken: encrypted.ciphertext,
        accessTokenIv: encrypted.iv,
        metadata: {},
      };
    }));
    const accounts = await trustedRpc<unknown[]>(trusted, "complete_meta_connections", {
      p_session_id: sessionId,
      p_initiated_by: user.id,
      p_connections: connections,
    });
    return jsonResponse(request, { accounts });
  } catch (error) {
    return errorResponse(request, error);
  }
});
