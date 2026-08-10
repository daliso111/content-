import { requireUser } from "../_shared/auth.ts";
import { assertAllowedOrigin, handleOptions } from "../_shared/cors.ts";
import { createTrustedClient, trustedRpc } from "../_shared/database.ts";
import { errorResponse, jsonResponse } from "../_shared/responses.ts";
import { readObject, requirePost, requireUuid } from "../_shared/validation.ts";

Deno.serve(async (request) => {
  try {
    const preflight = handleOptions(request);
    if (preflight) return preflight;
    assertAllowedOrigin(request);
    requirePost(request);
    const user = await requireUser(request);
    const body = await readObject(request);
    const accountId = requireUuid(body.socialAccountId);
    const result = await trustedRpc<Record<string, unknown>>(
      createTrustedClient(),
      "disconnect_social_account",
      {
        p_social_account_id: accountId,
        p_actor_id: user.id,
        p_warning_code: "PROVIDER_REVOCATION_NOT_APPLICABLE",
      },
    );
    return jsonResponse(request, result);
  } catch (error) {
    return errorResponse(request, error);
  }
});
