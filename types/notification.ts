import type { Json } from "./database.generated";

export type NotificationType =
  | "workspace_invitation" | "invitation_accepted" | "invitation_declined" | "invitation_revoked"
  | "role_changed" | "member_suspended" | "member_reactivated" | "member_removed"
  | "ownership_transferred" | "approval_submitted" | "approval_assigned" | "approval_reassigned"
  | "approval_approved" | "approval_changes_requested" | "approval_rejected" | "approval_comment"
  | "publishing_succeeded" | "publishing_failed" | "publishing_reconciliation_required"
  | "social_account_reconnect_required" | "system";

export interface Notification {
  id: string; userId: string; workspaceId: string | null; type: NotificationType;
  title: string; body: string | null; entityType: string | null; entityId: string | null;
  actionPath: string | null; metadata: Json; readAt: string | null; archivedAt: string | null; createdAt: string;
}
export interface NotificationPreferences {
  workspaceInvitations: boolean; teamChanges: boolean; approvals: boolean;
  publishing: boolean; socialConnections: boolean;
}
export interface NotificationListOptions {
  page?: number; pageSize?: number; unreadOnly?: boolean; archived?: boolean;
  workspaceId?: string; category?: "team" | "approvals" | "publishing" | "social";
  search?: string;
}
export interface NotificationListResult { items: Notification[]; page: number; pageSize: number; total: number }
export interface UnreadNotificationCount { count: number }
export class NotificationServiceError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "NotificationServiceError"; }
}
