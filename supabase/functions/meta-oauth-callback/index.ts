import { safeConnectionError, ConnectionError } from "../_shared/connection-errors.ts";
import { createTrustedClient, trustedRpc } from "../_shared/database.ts";
import { appRedirect, getMetaConfig } from "../_shared/meta-config.ts";
import { discoverMetaDestinations, exchangeAuthorizationCode, getGrantedScopes, sanitizeDestinations } from "../_shared/meta-client.ts";
import { encryptToken } from "../_shared/token-crypto.ts";
import { sha256Hex } from "../_shared/validation.ts";

interface StateRecord {
  workspaceId: string;
  initiatedBy: string;
  returnPath: string;
}

Deno.serve(async (request) => {
  let config;
  try {
    config = getMetaConfig();
    if (request.method !== "GET") throw new ConnectionError("METHOD_NOT_ALLOWED", 405);
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    if (!state || !/^[0-9a-f]{64}$/i.test(state)) {
      throw new ConnectionError("INVALID_OAUTH_STATE", 400);
    }
    const stateRecord = await trustedRpc<StateRecord>(
      createTrustedClient(),
      "consume_meta_oauth_state",
      { p_state_hash: await sha256Hex(state) },
    );
    if (url.searchParams.has("error")) {
      throw new ConnectionError("META_AUTHORIZATION_CANCELLED", 400);
    }
    const code = url.searchParams.get("code");
    if (!code) throw new ConnectionError("INVALID_REQUEST", 400);

    const token = await exchangeAuthorizationCode(config, code);
    const [destinations, grantedScopes] = await Promise.all([
      discoverMetaDestinations(config, token.accessToken),
      getGrantedScopes(config, token.accessToken),
    ]);
    const encrypted = await encryptToken(token.accessToken);
    const session = await trustedRpc<{ id: string }>(
      createTrustedClient(),
      "create_meta_connection_session",
      {
        p_workspace_id: stateRecord.workspaceId,
        p_initiated_by: stateRecord.initiatedBy,
        p_encrypted_user_token: encrypted.ciphertext,
        p_user_token_iv: encrypted.iv,
        p_token_expires_at: token.expiresAt,
        p_granted_scopes: grantedScopes,
        p_discovered_accounts: sanitizeDestinations(destinations),
      },
    );
    return Response.redirect(
      appRedirect(config, stateRecord.returnPath, "meta_session", session.id),
      302,
    );
  } catch (error) {
    const safe = safeConnectionError(error);
    if (config) {
      return Response.redirect(
        appRedirect(config, "/dashboard/accounts", "connection_error", safe.code.toLowerCase()),
        302,
      );
    }
    return Response.json({ error: { code: safe.code } }, { status: safe.status });
  }
});
