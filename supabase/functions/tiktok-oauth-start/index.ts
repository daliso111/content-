import { requireUser } from "../_shared/auth.ts";
import { assertAllowedOrigin, handleOptions } from "../_shared/cors.ts";
import { ConnectionError } from "../_shared/connection-errors.ts";
import { createTrustedClient, trustedRpc } from "../_shared/database.ts";
import { errorResponse, jsonResponse } from "../_shared/responses.ts";
import {
  readObject,
  requirePost,
  requireUuid,
  sha256Hex,
  validateReturnPath,
} from "../_shared/validation.ts";
import {
  buildTikTokAuthorizationUrl,
  getTikTokConfig,
  isTikTokOAuthIntent,
  type TikTokOAuthIntent,
} from "../_shared/tiktok-config.ts";

Deno.serve(async (request) => {
  try {
    const preflight = handleOptions(request);
    if (preflight) return preflight;
    assertAllowedOrigin(request);
    requirePost(request);
    const user = await requireUser(request);
    const body = await readObject(request);
    const workspaceId = requireUuid(body.workspaceId);
    const returnPath = validateReturnPath(body.returnPath);
    const intent: TikTokOAuthIntent = body.intent === undefined
      ? "connect"
      : isTikTokOAuthIntent(body.intent)
      ? body.intent
      : (() => {
        throw new ConnectionError("INVALID_REQUEST", 400);
      })();
    if (
      "expectedPlatformAccountId" in body || "openId" in body ||
      "grantedScopes" in body || "accessToken" in body ||
      "refreshToken" in body
    ) {
      throw new ConnectionError("INVALID_REQUEST", 400);
    }
    const pendingConnectionId = intent === "enable_publishing"
      ? requireUuid(body.socialAccountId)
      : null;
    if (intent === "connect" && body.socialAccountId !== undefined) {
      throw new ConnectionError("INVALID_REQUEST", 400);
    }
    const config = getTikTokConfig();
    const stateBytes = crypto.getRandomValues(new Uint8Array(32));
    const state = Array.from(
      stateBytes,
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    const rpcArgs: Record<string, unknown> = {
      p_workspace_id: workspaceId,
      p_initiated_by: user.id,
      p_state_hash: await sha256Hex(state),
      p_return_path: returnPath,
    };
    if (intent === "enable_publishing") {
      rpcArgs.p_intent = intent;
      rpcArgs.p_pending_connection_id = pendingConnectionId;
    }
    const created = await trustedRpc<{ expiresAt: string }>(
      createTrustedClient(),
      "begin_tiktok_oauth",
      rpcArgs,
    );
    const authorizationUrl = buildTikTokAuthorizationUrl(
      config,
      state,
      intent,
    );
    const parsed = new URL(authorizationUrl);
    if (
      parsed.protocol !== "https:" || parsed.hostname !== "www.tiktok.com" ||
      parsed.pathname !== "/v2/auth/authorize/"
    ) {
      throw new Error("INVALID_TIKTOK_AUTHORIZATION_URL");
    }
    return jsonResponse(request, {
      authorizationUrl,
      expiresAt: created.expiresAt,
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});
