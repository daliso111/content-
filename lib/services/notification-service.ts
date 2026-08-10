import type { SupabaseClient } from "@supabase/supabase-js";
import { mapNotificationError } from "@/lib/notification-errors";
import { getSupabaseClient, getSupabaseConfigurationError } from "@/lib/supabase/client";
import type { Database, Tables } from "@/types/database.generated";
import type {
  Notification, NotificationListOptions, NotificationListResult,
  NotificationPreferences, UnreadNotificationCount,
} from "@/types";

const TEAM_TYPES = ["workspace_invitation", "invitation_accepted", "invitation_declined", "invitation_revoked", "role_changed", "member_suspended", "member_reactivated", "member_removed", "ownership_transferred"] as const;
const APPROVAL_TYPES = ["approval_submitted", "approval_assigned", "approval_reassigned", "approval_approved", "approval_changes_requested", "approval_rejected", "approval_comment"] as const;
const PUBLISHING_TYPES = ["publishing_succeeded", "publishing_failed", "publishing_reconciliation_required"] as const;
const SOCIAL_TYPES = ["social_account_reconnect_required"] as const;

function client(): SupabaseClient<Database> {
  const value = getSupabaseClient();
  if (!value) throw mapNotificationError(new Error(getSupabaseConfigurationError() ?? "Supabase is not configured."));
  return value;
}
export function mapNotification(row: Tables<"notifications">): Notification {
  return { id: row.id, userId: row.user_id, workspaceId: row.workspace_id, type: row.notification_type,
    title: row.title, body: row.body, entityType: row.entity_type, entityId: row.entity_id,
    actionPath: row.action_path, metadata: row.metadata, readAt: row.read_at,
    archivedAt: row.archived_at, createdAt: row.created_at };
}
export function isSafeNotificationPath(path: string | null): path is string {
  return Boolean(path && path.startsWith("/") && !path.startsWith("//") && !/[\u0000-\u001f]/.test(path));
}

export async function listNotifications(options: NotificationListOptions = {}): Promise<NotificationListResult> {
  try {
    const page = Math.max(1, options.page ?? 1); const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 20));
    let query = client().from("notifications").select("*", { count: "exact" });
    query = options.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
    if (options.unreadOnly) query = query.is("read_at", null);
    if (options.workspaceId) query = query.eq("workspace_id", options.workspaceId);
    const safeSearch = options.search?.trim().replace(/[%_,().]/g, " ").replace(/\s+/g, " ");
    if (safeSearch) query = query.or(`title.ilike.%${safeSearch}%,body.ilike.%${safeSearch}%`);
    const categories = options.category === "team" ? TEAM_TYPES : options.category === "approvals" ? APPROVAL_TYPES : options.category === "publishing" ? PUBLISHING_TYPES : options.category === "social" ? SOCIAL_TYPES : null;
    if (categories) query = query.in("notification_type", [...categories]);
    const from = (page - 1) * pageSize;
    const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, from + pageSize - 1);
    if (error) throw error;
    return { items: (data ?? []).map(mapNotification), page, pageSize, total: count ?? 0 };
  } catch (error) { throw mapNotificationError(error); }
}

export async function getUnreadCount(): Promise<UnreadNotificationCount> {
  try {
    const { count, error } = await client().from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).is("archived_at", null);
    if (error) throw error; return { count: count ?? 0 };
  } catch (error) { throw mapNotificationError(error); }
}
async function mutation(name: "mark_notification_read" | "mark_notifications_read" | "mark_all_notifications_read" | "archive_notification" | "unarchive_notification", args: Record<string, unknown>): Promise<number> {
  const { data, error } = await client().rpc(name, args as never); if (error) throw error; return data ?? 0;
}
export async function markRead(notificationId: string) { try { return await mutation("mark_notification_read", { p_notification_id: notificationId }); } catch (error) { throw mapNotificationError(error); } }
export async function markManyRead(notificationIds: string[]) { try { return await mutation("mark_notifications_read", { p_notification_ids: notificationIds }); } catch (error) { throw mapNotificationError(error); } }
export async function markAllRead(workspaceId?: string) { try { return await mutation("mark_all_notifications_read", { p_workspace_id: workspaceId ?? null }); } catch (error) { throw mapNotificationError(error); } }
export async function archive(notificationId: string) { try { return await mutation("archive_notification", { p_notification_id: notificationId }); } catch (error) { throw mapNotificationError(error); } }
export async function unarchive(notificationId: string) { try { return await mutation("unarchive_notification", { p_notification_id: notificationId }); } catch (error) { throw mapNotificationError(error); } }

const DEFAULTS: NotificationPreferences = { workspaceInvitations: true, teamChanges: true, approvals: true, publishing: true, socialConnections: true };
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const supabase = client(); const user = await supabase.auth.getUser();
    if (user.error || !user.data.user) throw user.error ?? new Error("AUTH_REQUIRED");
    const { data, error } = await supabase.from("notification_preferences").select("*").eq("user_id", user.data.user.id).maybeSingle();
    if (error) throw error; if (!data) return DEFAULTS;
    return { workspaceInvitations: data.workspace_invitations, teamChanges: data.team_changes, approvals: data.approvals, publishing: data.publishing, socialConnections: data.social_connections };
  } catch (error) { throw mapNotificationError(error); }
}
export async function updateNotificationPreferences(input: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
  try {
    const supabase = client(); const user = await supabase.auth.getUser();
    if (user.error || !user.data.user) throw user.error ?? new Error("AUTH_REQUIRED");
    const current = await getNotificationPreferences(); const next = { ...current, ...input };
    const { error } = await supabase.from("notification_preferences").upsert({ user_id: user.data.user.id,
      workspace_invitations: next.workspaceInvitations, team_changes: next.teamChanges,
      approvals: next.approvals, publishing: next.publishing, social_connections: next.socialConnections }, { onConflict: "user_id" });
    if (error) throw error; return next;
  } catch (error) { throw mapNotificationError(error); }
}
