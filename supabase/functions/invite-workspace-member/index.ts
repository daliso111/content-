import { requireUser } from "../_shared/auth.ts";
import { assertAllowedOrigin, handleOptions } from "../_shared/cors.ts";
import { createTrustedClient, trustedRpc } from "../_shared/database.ts";
import { ConnectionError } from "../_shared/connection-errors.ts";
import { errorResponse, jsonResponse } from "../_shared/responses.ts";
import {
  cleanMessage, findAuthUserByEmail, invitationRedirect, isEstablishedAuthUser,
  normalizeEmail, randomInvitationToken, requireInvitationManager,
  requireWorkspaceRole, safeInvitationResult,
} from "../_shared/team-invitations.ts";
import { readObject, requirePost, requireUuid, sha256Hex } from "../_shared/validation.ts";

Deno.serve(async (request) => {
  try {
    const preflight = handleOptions(request);
    if (preflight) return preflight;
    assertAllowedOrigin(request);
    requirePost(request);
    const user = await requireUser(request);
    const body = await readObject(request);
    const workspaceId = requireUuid(body.workspaceId);
    const email = normalizeEmail(body.email);
    const role = requireWorkspaceRole(body.role);
    const message = cleanMessage(body.message);
    const trusted = createTrustedClient();
    await requireInvitationManager(trusted, workspaceId, user.id, role);
    const foundUser = await findAuthUserByEmail(trusted, email);
    const invitedUser = isEstablishedAuthUser(foundUser) ? foundUser : null;
    const rawToken = randomInvitationToken();
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const created = await trustedRpc<Record<string, unknown>>(trusted, "create_workspace_invitation", {
      p_workspace_id: workspaceId,
      p_email: email,
      p_role: role,
      p_invited_by: user.id,
      p_invited_user_id: invitedUser?.id ?? null,
      p_token_hash: tokenHash,
      p_message: message,
      p_expires_at: expiresAt,
    });
    const safe = safeInvitationResult(created);
    if (!invitedUser) {
      try {
        const redirectTo = invitationRedirect(String(safe.id), rawToken);
        const { error } = await trusted.auth.admin.inviteUserByEmail(email, { redirectTo });
        if (error) throw error;
        await trustedRpc(trusted, "mark_workspace_invitation_sent", {
          p_invitation_id: safe.id,
          p_actor_id: user.id,
        });
      } catch (error) {
        if (error instanceof ConnectionError) throw error;
        throw new ConnectionError("EMAIL_INVITATION_FAILED", 502);
      }
    }
    return jsonResponse(request, { invitation: safe }, 201);
  } catch (error) {
    return errorResponse(request, error);
  }
});
