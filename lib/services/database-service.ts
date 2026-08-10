import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient, getSupabaseConfigurationError } from "@/lib/supabase/client";
import type { Database, Tables } from "@/types/database.generated";

export type ProfileRow = Tables<"profiles">;
export type WorkspaceRow = Tables<"workspaces">;
export type MembershipRow = Tables<"workspace_members">;

export interface WorkspaceAccess {
  workspace: WorkspaceRow;
  membership: MembershipRow;
}

export interface BootstrapVerification {
  profileExists: boolean;
  membershipExists: boolean;
  workspaceExists: boolean;
  initialMembershipIsOwner: boolean;
  ready: boolean;
  workspaceId: string | null;
}

function requireClient(): SupabaseClient<Database> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(
      getSupabaseConfigurationError() ?? "Supabase is not configured.",
    );
  }
  return client;
}

async function getAuthenticatedUserId(
  client: SupabaseClient<Database>,
): Promise<string> {
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error) throw new Error(error.message);
  if (!user) throw new Error("An authenticated user is required.");
  return user.id;
}

export async function getCurrentProfile(): Promise<ProfileRow | null> {
  const client = requireClient();
  const userId = await getAuthenticatedUserId(client);
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getCurrentMembership(
  workspaceId?: string,
): Promise<MembershipRow | null> {
  const client = requireClient();
  const userId = await getAuthenticatedUserId(client);
  let query = client
    .from("workspace_members")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1);

  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getCurrentWorkspace(): Promise<WorkspaceRow | null> {
  const membership = await getCurrentMembership();
  if (!membership) return null;

  const client = requireClient();
  const { data, error } = await client
    .from("workspaces")
    .select("*")
    .eq("id", membership.workspace_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listCurrentUserWorkspaces(): Promise<WorkspaceRow[]> {
  const client = requireClient();
  const userId = await getAuthenticatedUserId(client);
  const { data: memberships, error: membershipError } = await client
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .eq("status", "active");
  if (membershipError) throw new Error(membershipError.message);
  if (!memberships || memberships.length === 0) return [];

  const workspaceIds = memberships.map((membership) => membership.workspace_id);
  const { data, error } = await client
    .from("workspaces")
    .select("*")
    .in("id", workspaceIds)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listCurrentUserWorkspaceAccess(): Promise<WorkspaceAccess[]> {
  const client = requireClient();
  const userId = await getAuthenticatedUserId(client);
  const { data: memberships, error: membershipError } = await client
    .from("workspace_members")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (membershipError) throw new Error(membershipError.message);
  if (!memberships?.length) return [];

  const { data: workspaces, error: workspaceError } = await client
    .from("workspaces")
    .select("*")
    .in("id", memberships.map((membership) => membership.workspace_id));
  if (workspaceError) throw new Error(workspaceError.message);

  const workspaceById = new Map(
    (workspaces ?? []).map((workspace) => [workspace.id, workspace]),
  );
  return memberships.flatMap((membership) => {
    const workspace = workspaceById.get(membership.workspace_id);
    return workspace ? [{ workspace, membership }] : [];
  });
}

/** Development helper for verifying the Stage 1B bootstrap records. */
export async function verifyCurrentUserBootstrap(): Promise<BootstrapVerification> {
  const [profile, membership] = await Promise.all([
    getCurrentProfile(),
    getCurrentMembership(),
  ]);
  const client = requireClient();
  let workspace: WorkspaceRow | null = null;

  if (membership) {
    const result = await client
      .from("workspaces")
      .select("*")
      .eq("id", membership.workspace_id)
      .maybeSingle();
    if (result.error) throw new Error(result.error.message);
    workspace = result.data;
  }

  const verification: BootstrapVerification = {
    profileExists: profile !== null,
    membershipExists: membership !== null,
    workspaceExists: workspace !== null,
    initialMembershipIsOwner:
      membership?.role === "owner" && membership.status === "active",
    ready: false,
    workspaceId: workspace?.id ?? null,
  };
  verification.ready =
    verification.profileExists &&
    verification.membershipExists &&
    verification.workspaceExists &&
    verification.initialMembershipIsOwner;
  return verification;
}
