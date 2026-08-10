import { requireUser } from "../_shared/auth.ts";
import { assertAllowedOrigin, handleOptions } from "../_shared/cors.ts";
import { createTrustedClient, trustedRpc } from "../_shared/database.ts";
import { ConnectionError } from "../_shared/connection-errors.ts";
import { errorResponse, jsonResponse } from "../_shared/responses.ts";
import {
  assertResendWindow, findAuthUserByEmail, invitationRedirect, isEstablishedAuthUser,
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
    const { invitationId: rawInvitationId } = await readObject(request);
    const invitationId = requireUuid(rawInvitationId);
    const trusted = createTrustedClient();
    const { data: invitation, error: invitationError } = await trusted
      .from("workspace_invitations")
      .select("email, workspace_id, role, last_sent_at")
      .eq("id", invitationId)
      .maybeSingle();
    if (invitationError) throw invitationError;
    if (!invitation) throw new ConnectionError("INVITATION_NOT_FOUND", 404);
    const email = normalizeEmail(invitation.email);
    const role = requireWorkspaceRole(invitation.role);
    await requireInvitationManager(trusted, invitation.workspace_id, user.id, role);
    assertResendWindow(invitation.last_sent_at);
    const foundUser = await findAuthUserByEmail(trusted, email);
    const invitedUser = isEstablishedAuthUser(foundUser) ? foundUser : null;
    const rawToken = randomInvitationToken();
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const prepared = await trustedRpc<Record<string, unknown>>(trusted, "prepare_workspace_invitation_resend", {
      p_invitation_id: invitationId,
      p_actor_id: user.id,
      p_token_hash: tokenHash,
      p_invited_user_id: invitedUser?.id ?? null,
      p_expires_at: expiresAt,
    });
    const safe = safeInvitationResult(prepared);
    if (!invitedUser) {
      try {
        const redirectTo = invitationRedirect(invitationId, rawToken);
        const { error } = await trusted.auth.admin.inviteUserByEmail(email, { redirectTo });
        if (error) throw error;
      } catch (error) {
        if (error instanceof ConnectionError) throw error;
        throw new ConnectionError("EMAIL_INVITATION_FAILED", 502);
      }
    }
    await trustedRpc(trusted, "mark_workspace_invitation_sent", {
      p_invitation_id: invitationId,
      p_actor_id: user.id,
    });
    return jsonResponse(request, { invitation: safe });
  } catch (error) {
    return errorResponse(request, error);
  }
});
