import { requireUser } from "../_shared/auth.ts";
import { assertAllowedOrigin, handleOptions } from "../_shared/cors.ts";
import { createTrustedClient, createUserClient, trustedRpc } from "../_shared/database.ts";
import type { MetaConnectionOption } from "../_shared/meta-client.ts";
import { errorResponse, jsonResponse } from "../_shared/responses.ts";
import { readObject, requirePost, requireUuid } from "../_shared/validation.ts";

interface PendingSession {
  id: string;
  workspaceId: string;
  discoveredAccounts: MetaConnectionOption[];
  expiresAt: string;
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
    const session = await trustedRpc<PendingSession>(createTrustedClient(), "get_meta_connection_session", {
      p_session_id: sessionId,
      p_initiated_by: user.id,
    });
    const { data, error } = await createUserClient(request)
      .from("social_accounts")
      .select("platform, platform_account_id, connection_status")
      .eq("workspace_id", session.workspaceId);
    if (error) throw error;
    const active = new Set((data ?? [])
      .filter((row) => row.connection_status !== "disconnected")
      .map((row) => `${row.platform}:${row.platform_account_id}`));
    const options = session.discoveredAccounts.map((option) => ({
      ...option,
      alreadyConnected: active.has(`${option.platform}:${option.platformAccountId}`),
    }));
    return jsonResponse(request, {
      session: { id: session.id, workspaceId: session.workspaceId, expiresAt: session.expiresAt },
      options,
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});
