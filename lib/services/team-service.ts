import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE_META } from "@/lib/constants";
import { mapTeamError } from "@/lib/team-errors";
import { getSupabaseClient, getSupabaseConfigurationError } from "@/lib/supabase/client";
import type { Database, Json, Tables } from "@/types/database.generated";
import type {
  InvitationActionResult, InviteWorkspaceMemberInput, MembershipEvent,
  MembershipEventListOptions, MemberRoleChangeInput, OwnershipTransferInput,
  TeamRole, TeamRoleOption, WorkspaceInvitation, WorkspaceMember,
} from "@/types";

function client(): SupabaseClient<Database> {
  const value = getSupabaseClient();
  if (!value) throw mapTeamError(new Error(getSupabaseConfigurationError() ?? "Supabase is not configured."));
  return value;
}

function result(value: Json): InvitationActionResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw mapTeamError(new Error("INVALID_RESPONSE"));
  const row = value as Record<string, Json | undefined>;
  return {
    invitationId: typeof row.invitationId === "string" ? row.invitationId : typeof row.id === "string" ? row.id : undefined,
    workspaceId: typeof row.workspaceId === "string" ? row.workspaceId : undefined,
    workspaceName: typeof row.workspaceName === "string" ? row.workspaceName : undefined,
    membershipId: typeof row.membershipId === "string" ? row.membershipId : undefined,
    email: typeof row.email === "string" ? row.email : undefined,
    role: typeof row.role === "string" ? row.role as TeamRole : undefined,
    status: typeof row.status === "string" ? row.status : "completed",
    delivery: row.delivery === "email" || row.delivery === "in_app" ? row.delivery : undefined,
    expiresAt: typeof row.expiresAt === "string" ? row.expiresAt : undefined,
  };
}

export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  try {
    const supabase = client();
    const { data: members, error } = await supabase.from("workspace_members").select("*")
      .eq("workspace_id", workspaceId).order("created_at");
    if (error) throw error;
    const userIds = (members ?? []).map((member) => member.user_id);
    const profileResult = userIds.length
      ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds)
      : { data: [] as Array<Pick<Tables<"profiles">, "id" | "full_name" | "avatar_url">>, error: null };
    if (profileResult.error) throw profileResult.error;
    const profiles = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile]));
    return (members ?? []).map((member) => ({
      id: member.id, workspaceId: member.workspace_id, userId: member.user_id,
      fullName: profiles.get(member.user_id)?.full_name?.trim() || "Workspace member",
      email: null, avatarUrl: profiles.get(member.user_id)?.avatar_url ?? null,
      role: member.role, status: member.status, joinedAt: member.joined_at, lastActiveAt: null,
    }));
  } catch (error) { throw mapTeamError(error); }
}

export async function listWorkspaceInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
  try {
    const { data, error } = await client().rpc("list_workspace_invitations", { p_workspace_id: workspaceId });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id, workspaceId: row.workspace_id, email: row.email,
      invitedUserId: row.invited_user_id, role: row.role, status: row.status,
      invitedBy: row.invited_by, inviterName: row.inviter_name, expiresAt: row.expires_at,
      sentAt: row.sent_at, lastSentAt: row.last_sent_at, resendCount: row.resend_count,
      message: row.message, createdAt: row.created_at,
    }));
  } catch (error) { throw mapTeamError(error); }
}

export async function getInvitationDetails(invitationId: string, token?: string): Promise<InvitationActionResult & { message?: string; inviterName?: string }> {
  try {
    const { data, error } = await client().rpc("get_workspace_invitation_details", {
      p_invitation_id: invitationId,
      ...(token === undefined ? {} : { p_token: token }),
    });
    if (error) throw error;
    const parsed = result(data);
    const row = data && typeof data === "object" && !Array.isArray(data) ? data : {};
    return { ...parsed,
      message: typeof row.message === "string" ? row.message : undefined,
      inviterName: typeof row.inviterName === "string" ? row.inviterName : undefined,
    };
  } catch (error) { throw mapTeamError(error); }
}

export async function inviteMember(input: InviteWorkspaceMemberInput): Promise<InvitationActionResult> {
  try {
    const { data, error } = await client().functions.invoke("invite-workspace-member", { body: input });
    if (error) throw await edgeFunctionError(error);
    return result((data?.invitation ?? null) as Json);
  } catch (error) { throw mapTeamError(error); }
}

export async function resendInvitation(invitationId: string): Promise<InvitationActionResult> {
  try {
    const { data, error } = await client().functions.invoke("resend-workspace-invitation", { body: { invitationId } });
    if (error) throw await edgeFunctionError(error);
    return result((data?.invitation ?? null) as Json);
  } catch (error) { throw mapTeamError(error); }
}

async function edgeFunctionError(error: unknown): Promise<Error> {
  if (error && typeof error === "object" && "context" in error && error.context instanceof Response) {
    try {
      const payload: unknown = await error.context.clone().json();
      if (payload && typeof payload === "object" && "error" in payload) {
        const detail = payload.error;
        if (detail && typeof detail === "object" && "code" in detail && typeof detail.code === "string") {
          return new Error(detail.code);
        }
      }
    } catch { /* The generic safe message below is intentional. */ }
  }
  return error instanceof Error ? error : new Error("EDGE_FUNCTION_FAILED");
}

async function rpcAction(name: keyof Database["public"]["Functions"], args: Record<string, unknown>): Promise<InvitationActionResult> {
  const { data, error } = await client().rpc(name, args as never);
  if (error) throw error;
  return result(data as Json);
}

export async function revokeInvitation(invitationId: string, message?: string) { try { return await rpcAction("revoke_workspace_invitation", { p_invitation_id: invitationId, p_message: message ?? null }); } catch (error) { throw mapTeamError(error); } }
export async function acceptInvitation(invitationId: string, token?: string) { try { return await rpcAction("accept_workspace_invitation", { p_invitation_id: invitationId, p_token: token ?? null }); } catch (error) { throw mapTeamError(error); } }
export async function declineInvitation(invitationId: string, token?: string) { try { return await rpcAction("decline_workspace_invitation", { p_invitation_id: invitationId, p_token: token ?? null }); } catch (error) { throw mapTeamError(error); } }
export async function updateMemberRole(input: MemberRoleChangeInput) { try { return await rpcAction("update_workspace_member_role", { p_member_id: input.memberId, p_new_role: input.newRole, p_message: input.message ?? null }); } catch (error) { throw mapTeamError(error); } }
export async function transferOwnership(input: OwnershipTransferInput) { try { return await rpcAction("transfer_workspace_ownership", { p_workspace_id: input.workspaceId, p_new_owner_member_id: input.newOwnerMemberId, p_current_owner_new_role: input.currentOwnerNewRole ?? "administrator", p_message: input.message ?? null }); } catch (error) { throw mapTeamError(error); } }
export async function suspendMember(memberId: string, message?: string) { try { return await rpcAction("suspend_workspace_member", { p_member_id: memberId, p_message: message ?? null }); } catch (error) { throw mapTeamError(error); } }
export async function reactivateMember(memberId: string, role?: TeamRole, message?: string) { try { return await rpcAction("reactivate_workspace_member", { p_member_id: memberId, p_role: role ?? null, p_message: message ?? null }); } catch (error) { throw mapTeamError(error); } }
export async function removeMember(memberId: string, message?: string) { try { return await rpcAction("remove_workspace_member", { p_member_id: memberId, p_message: message ?? null }); } catch (error) { throw mapTeamError(error); } }
export async function leaveWorkspace(workspaceId: string) { try { return await rpcAction("leave_workspace", { p_workspace_id: workspaceId }); } catch (error) { throw mapTeamError(error); } }

export async function listMembershipEvents(workspaceId: string, options: MembershipEventListOptions = {}): Promise<{ items: MembershipEvent[]; total: number }> {
  try {
    const page = Math.max(1, options.page ?? 1); const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 20));
    const from = (page - 1) * pageSize;
    const { data, error, count } = await client().from("membership_events").select("*", { count: "exact" })
      .eq("workspace_id", workspaceId).order("created_at", { ascending: false }).range(from, from + pageSize - 1);
    if (error) throw error;
    const ids = [...new Set((data ?? []).flatMap((event) => [event.actor_id, event.affected_user_id]).filter((id): id is string => Boolean(id)))];
    const profileResult = ids.length ? await client().from("profiles").select("id, full_name").in("id", ids) : { data: [], error: null };
    if (profileResult.error) throw profileResult.error;
    const names = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile.full_name]));
    return { total: count ?? 0, items: (data ?? []).map((event) => ({
      id: event.id, workspaceId: event.workspace_id, memberId: event.workspace_member_id,
      invitationId: event.invitation_id, eventType: event.event_type, actorId: event.actor_id,
      affectedUserId: event.affected_user_id, actorName: event.actor_id ? names.get(event.actor_id) ?? null : null,
      affectedUserName: event.affected_user_id ? names.get(event.affected_user_id) ?? null : null,
      previousRole: event.previous_role, newRole: event.new_role, previousStatus: event.previous_status,
      newStatus: event.new_status, message: event.message, createdAt: event.created_at,
    })) };
  } catch (error) { throw mapTeamError(error); }
}

export async function listEligibleRolesForCurrentUser(workspaceId: string): Promise<TeamRoleOption[]> {
  try {
    const { data, error } = await client().rpc("list_eligible_workspace_roles", { p_workspace_id: workspaceId });
    if (error) throw error;
    return (data ?? []).map((role) => ({ value: role, label: ROLE_META[role].label, description: ROLE_META[role].description }));
  } catch (error) { throw mapTeamError(error); }
}
