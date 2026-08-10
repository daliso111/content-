import { requireUser } from "../_shared/auth.ts";
import { assertAllowedOrigin, handleOptions } from "../_shared/cors.ts";
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
  buildYouTubeAuthorizationUrl,
  getYouTubeConfig,
} from "../_shared/youtube-config.ts";

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
    const config = getYouTubeConfig();
    const stateBytes = crypto.getRandomValues(new Uint8Array(32));
    const state = Array.from(
      stateBytes,
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    const created = await trustedRpc<{ expiresAt: string }>(
      createTrustedClient(),
      "begin_youtube_oauth",
      {
        p_workspace_id: workspaceId,
        p_initiated_by: user.id,
        p_state_hash: await sha256Hex(state),
        p_return_path: returnPath,
      },
    );
    return jsonResponse(request, {
      authorizationUrl: buildYouTubeAuthorizationUrl(config, state),
      expiresAt: created.expiresAt,
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});
