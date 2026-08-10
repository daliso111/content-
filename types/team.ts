export type TeamRole =
  | "owner"
  | "administrator"
  | "content_manager"
  | "designer"
  | "approver"
  | "viewer";

export type MemberStatus = "active" | "invited" | "suspended";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  /** Initials-based avatar colour token; real avatars come later from storage. */
  avatarColor: string;
  avatarUrl?: string;
  role: TeamRole;
  status: MemberStatus;
  lastActive: string; // ISO date
  joinedAt: string; // ISO date
}

export type WorkspaceInvitationStatus =
  | "pending" | "accepted" | "declined" | "revoked" | "expired";
export type MembershipEventType =
  | "invited" | "invitation_resent" | "invitation_accepted" | "invitation_declined"
  | "invitation_revoked" | "member_added" | "role_changed" | "member_suspended"
  | "member_reactivated" | "member_removed" | "member_left" | "ownership_transferred";

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  fullName: string;
  email: string | null;
  avatarUrl: string | null;
  role: TeamRole;
  status: MemberStatus;
  joinedAt: string | null;
  lastActiveAt: string | null;
}

export interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  email: string;
  invitedUserId: string | null;
  role: TeamRole;
  status: WorkspaceInvitationStatus;
  invitedBy: string;
  inviterName: string | null;
  expiresAt: string;
  sentAt: string | null;
  lastSentAt: string | null;
  resendCount: number;
  message: string | null;
  createdAt: string;
}

export interface MembershipEvent {
  id: string;
  workspaceId: string;
  memberId: string | null;
  invitationId: string | null;
  eventType: MembershipEventType;
  actorId: string | null;
  affectedUserId: string | null;
  actorName: string | null;
  affectedUserName: string | null;
  previousRole: TeamRole | null;
  newRole: TeamRole | null;
  previousStatus: MemberStatus | null;
  newStatus: MemberStatus | null;
  message: string | null;
  createdAt: string;
}

export interface TeamRoleOption { value: TeamRole; label: string; description: string }
export interface InviteWorkspaceMemberInput { workspaceId: string; email: string; role: TeamRole; message?: string }
export interface InvitationActionResult {
  invitationId?: string; workspaceId?: string; workspaceName?: string; membershipId?: string;
  email?: string; role?: TeamRole; status: string; delivery?: "email" | "in_app"; expiresAt?: string;
}
export interface MemberRoleChangeInput { memberId: string; newRole: TeamRole; message?: string }
export interface OwnershipTransferInput {
  workspaceId: string; newOwnerMemberId: string; currentOwnerNewRole?: Exclude<TeamRole, "owner">; message?: string;
}
export interface MembershipEventListOptions { page?: number; pageSize?: number }
export class TeamServiceError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "TeamServiceError"; }
}
