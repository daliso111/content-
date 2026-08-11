import { requireUser } from "../_shared/auth.ts";
import { assertAllowedOrigin, handleOptions } from "../_shared/cors.ts";
import { createTrustedClient, trustedRpc } from "../_shared/database.ts";
import { errorResponse, jsonResponse } from "../_shared/responses.ts";
import { decryptToken } from "../_shared/token-crypto.ts";
import { revokeTikTokAuthorization } from "../_shared/tiktok-client.ts";
import { getTikTokConfig } from "../_shared/tiktok-config.ts";
import { readObject, requirePost, requireUuid } from "../_shared/validation.ts";

interface TikTokCredential {
  platform: string;
  encryptedAccessToken: string;
  accessTokenIv: string;
}

Deno.serve(async (request) => {
  try {
    const preflight = handleOptions(request);
    if (preflight) return preflight;
    assertAllowedOrigin(request);
    requirePost(request);
    const user = await requireUser(request);
    const body = await readObject(request);
    const accountId = requireUuid(body.socialAccountId);
    const trusted = createTrustedClient();
    const { data: account } = await trusted
      .from("social_accounts")
      .select("platform")
      .eq("id", accountId)
      .maybeSingle();
    let warning = "PROVIDER_REVOCATION_NOT_APPLICABLE";
    if (account?.platform === "tiktok") {
      warning = "TIKTOK_REVOCATION_FAILED";
      try {
        const credential = await trustedRpc<TikTokCredential>(
          trusted,
          "get_social_account_credential",
          { p_social_account_id: accountId, p_actor_id: user.id },
        );
        const token = await decryptToken(
          credential.encryptedAccessToken,
          credential.accessTokenIv,
        );
        await revokeTikTokAuthorization(getTikTokConfig(), token);
        warning = "";
      } catch {
        // Local deletion is intentionally attempted regardless of revoke outcome.
      }
    }
    const result = await trustedRpc<Record<string, unknown>>(
      trusted,
      "disconnect_social_account",
      {
        p_social_account_id: accountId,
        p_actor_id: user.id,
        p_warning_code: warning,
      },
    );
    return jsonResponse(request, result);
  } catch (error) {
    return errorResponse(request, error);
  }
});
