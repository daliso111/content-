import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { ConnectionError } from "./connection-errors.ts";
import { allowedOrigins } from "./cors.ts";

export const WORKSPACE_ROLES = [
  "owner", "administrator", "content_manager", "designer", "approver", "viewer",
] as const;
export type WorkspaceRole = typeof WORKSPACE_ROLES[number];
const LOWER_ROLES: WorkspaceRole[] = ["content_manager", "designer", "approver", "viewer"];

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") throw new ConnectionError("INVALID_EMAIL", 400);
  const email = value.trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ConnectionError("INVALID_EMAIL", 400);
  }
  return email;
}

export function requireWorkspaceRole(value: unknown): WorkspaceRole {
  if (typeof value !== "string" || !WORKSPACE_ROLES.includes(value as WorkspaceRole)) {
    throw new ConnectionError("INVALID_REQUEST", 400);
  }
  return value as WorkspaceRole;
}

export function cleanMessage(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ConnectionError("INVALID_REQUEST", 400);
  const message = value.trim();
  if (!message) return null;
  if (message.length > 1000) throw new ConnectionError("INVALID_REQUEST", 400);
  return message;
}

export function randomInvitationToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function assertAssignableRole(actorRole: WorkspaceRole | null, requestedRole: WorkspaceRole): void {
  if (actorRole !== "owner" && actorRole !== "administrator") {
    throw new ConnectionError("TEAM_PERMISSION_DENIED", 403);
  }
  if (actorRole === "administrator" && !LOWER_ROLES.includes(requestedRole)) {
    throw new ConnectionError("ROLE_ASSIGNMENT_DENIED", 403);
  }
}

export async function requireInvitationManager(
  client: SupabaseClient,
  workspaceId: string,
  userId: string,
  requestedRole: WorkspaceRole,
): Promise<WorkspaceRole> {
  const { data, error } = await client.from("workspace_members").select("role, status")
    .eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  const role = data?.status === "active" ? requireWorkspaceRole(data.role) : null;
  assertAssignableRole(role, requestedRole);
  return role!;
}

export function assertResendWindow(lastSentAt: string | null): void {
  if (lastSentAt && Date.parse(lastSentAt) > Date.now() - 60_000) {
    throw new ConnectionError("INVITATION_RATE_LIMITED", 429);
  }
}

export function isEstablishedAuthUser(user: User | null): user is User {
  return Boolean(user && (user.email_confirmed_at || user.last_sign_in_at));
}

export function invitationRedirect(invitationId: string, rawToken: string): string {
  const configured = Deno.env.get("POSTFLOW_APP_URL")?.trim();
  if (!configured) throw new ConnectionError("UNSAFE_INVITATION_REDIRECT", 500);
  let base: URL;
  try {
    base = new URL(configured);
  } catch {
    throw new ConnectionError("UNSAFE_INVITATION_REDIRECT", 500);
  }
  const localhost = base.hostname === "localhost" || base.hostname === "127.0.0.1";
  if ((base.protocol !== "https:" && !(localhost && base.protocol === "http:")) || base.username || base.password) {
    throw new ConnectionError("UNSAFE_INVITATION_REDIRECT", 500);
  }
  if (!allowedOrigins().has(base.origin)) {
    throw new ConnectionError("UNSAFE_INVITATION_REDIRECT", 500);
  }
  const redirect = new URL("/accept-invite", base.origin);
  redirect.searchParams.set("invitation", invitationId);
  redirect.searchParams.set("token", rawToken);
  return redirect.toString();
}

export async function findAuthUserByEmail(client: SupabaseClient, email: string): Promise<User | null> {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.trim().toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
  throw new ConnectionError("INTERNAL_ERROR", 500);
}

export function safeInvitationResult(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConnectionError("INTERNAL_ERROR", 500);
  }
  const row = value as Record<string, unknown>;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    email: row.email,
    role: row.role,
    status: row.status,
    expiresAt: row.expiresAt,
    resendCount: row.resendCount,
    delivery: row.delivery,
  };
}
