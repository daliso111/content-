import type { SupabaseClient } from "@supabase/supabase-js";
import { mapApprovalError } from "@/lib/approval-errors";
import { getSupabaseClient, getSupabaseConfigurationError } from "@/lib/supabase/client";
import { getPostById } from "@/lib/services/post-service";
import type { Database, Json, Tables } from "@/types/database.generated";
import type {
  ApprovalActionResult,
  ApprovalCommentWithAuthor,
  ApprovalCounts,
  ApprovalEventWithActor,
  ApprovalListOptions,
  ApprovalListResult,
  ApprovalProfile,
  ApprovalRequest,
  ApprovalRequestStatus,
  ApprovalRequestWithRelations,
  EligibleApprover,
  SubmitApprovalInput,
} from "@/types";

function requireClient(): SupabaseClient<Database> {
  const client = getSupabaseClient();
  if (!client) throw new Error(getSupabaseConfigurationError() ?? "Supabase is not configured.");
  return client;
}

function profile(id: string, names: Map<string, Tables<"profiles">>): ApprovalProfile {
  const row = names.get(id);
  return { id, name: row?.full_name?.trim() || "Workspace member", avatarUrl: row?.avatar_url ?? null };
}

async function hydrateApprovalRequests(rows: ApprovalRequest[]): Promise<ApprovalRequestWithRelations[]> {
  if (!rows.length) return [];
  const client = requireClient();
  const requestIds = rows.map((row) => row.id);
  const postIds = [...new Set(rows.map((row) => row.post_id))];
  const [commentsResult, eventsResult, posts] = await Promise.all([
    client.from("approval_comments").select("*").in("approval_request_id", requestIds).order("created_at"),
    client.from("approval_events").select("*").in("approval_request_id", requestIds).order("created_at"),
    Promise.all(postIds.map(async (postId) => [postId, await getPostById(postId)] as const)),
  ]);
  if (commentsResult.error) throw mapApprovalError(commentsResult.error);
  if (eventsResult.error) throw mapApprovalError(eventsResult.error);
  const comments = commentsResult.data ?? [];
  const events = eventsResult.data ?? [];
  const profileIds = [...new Set([
    ...rows.flatMap((row) => [row.requested_by, row.assigned_approver_id, row.resolved_by]),
    ...comments.map((row) => row.author_id),
    ...events.map((row) => row.actor_id),
  ].filter((id): id is string => Boolean(id)))];
  const destinationIds = [...new Set(posts.flatMap(([, post]) =>
    post?.destinations.map((destination) => destination.social_account_id) ?? [],
  ))];
  const [profileResult, accountResult] = await Promise.all([
    profileIds.length
      ? client.from("profiles").select("*").in("id", profileIds)
      : Promise.resolve({ data: [] as Tables<"profiles">[], error: null }),
    destinationIds.length
      ? client.from("social_accounts").select("id, account_name, username, platform").in("id", destinationIds)
      : Promise.resolve({ data: [] as Array<{ id: string; account_name: string; username: string | null; platform: Tables<"social_accounts">["platform"] }>, error: null }),
  ]);
  if (profileResult.error) throw mapApprovalError(profileResult.error);
  if (accountResult.error) throw mapApprovalError(accountResult.error);
  const profileMap = new Map((profileResult.data ?? []).map((row) => [row.id, row]));
  const accountMap = new Map((accountResult.data ?? []).map((row) => [row.id, row]));
  const postMap = new Map(posts);
  const commentsByRequest = new Map<string, ApprovalCommentWithAuthor[]>();
  for (const comment of comments) {
    const group = commentsByRequest.get(comment.approval_request_id) ?? [];
    group.push({ ...comment, author: profile(comment.author_id, profileMap) });
    commentsByRequest.set(comment.approval_request_id, group);
  }
  const eventsByRequest = new Map<string, ApprovalEventWithActor[]>();
  for (const event of events) {
    const group = eventsByRequest.get(event.approval_request_id) ?? [];
    group.push({ ...event, actor: event.actor_id ? profile(event.actor_id, profileMap) : null });
    eventsByRequest.set(event.approval_request_id, group);
  }
  const now = Date.now();
  return rows.map((request) => {
    const post = postMap.get(request.post_id) ?? null;
    return {
      request,
      post,
      requester: profile(request.requested_by, profileMap),
      approver: request.assigned_approver_id ? profile(request.assigned_approver_id, profileMap) : null,
      resolver: request.resolved_by ? profile(request.resolved_by, profileMap) : null,
      comments: commentsByRequest.get(request.id) ?? [],
      events: eventsByRequest.get(request.id) ?? [],
      destinationAccounts: (post?.destinations ?? []).flatMap((destination) => {
        const account = accountMap.get(destination.social_account_id);
        return account ? [{ id: account.id, name: account.account_name, username: account.username, platform: account.platform }] : [];
      }),
      stale: !post || post.post.revision !== request.post_revision || request.status === "superseded",
      overdue: request.status === "pending" && Boolean(request.due_at && new Date(request.due_at).getTime() < now),
    };
  });
}

export async function listApprovalRequests(options: ApprovalListOptions): Promise<ApprovalListResult> {
  const client = requireClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 12));
  const userResult = await client.auth.getUser();
  if (userResult.error || !userResult.data.user) throw mapApprovalError(userResult.error);
  const userId = userResult.data.user.id;
  let matchingPostIds: string[] | null = null;
  if (options.search?.trim()) {
    const postResult = await client
      .from("posts")
      .select("id")
      .eq("workspace_id", options.workspaceId)
      .ilike("caption", `%${options.search.trim()}%`);
    if (postResult.error) throw mapApprovalError(postResult.error);
    matchingPostIds = (postResult.data ?? []).map((row) => row.id);
    if (!matchingPostIds.length) return { items: [], page, pageSize, total: 0 };
  }
  let query = client
    .from("approval_requests")
    .select("*", { count: "exact" })
    .eq("workspace_id", options.workspaceId);
  if (matchingPostIds) query = query.in("post_id", matchingPostIds);
  if (options.status && options.status !== "all") query = query.eq("status", options.status);
  if (options.requesterId) query = query.eq("requested_by", options.requesterId);
  if (options.approverId) query = query.eq("assigned_approver_id", options.approverId);
  switch (options.tab) {
    case "awaiting": query = query.eq("status", "pending").eq("assigned_approver_id", userId); break;
    case "submitted": query = query.eq("requested_by", userId); break;
    case "pending": query = query.eq("status", "pending"); break;
    case "approved": query = query.eq("status", "approved"); break;
    case "changes_requested": query = query.eq("status", "changes_requested"); break;
    case "rejected": query = query.eq("status", "rejected"); break;
    case "history": query = query.neq("status", "pending"); break;
  }
  const now = new Date();
  if (options.due === "overdue") query = query.eq("status", "pending").lt("due_at", now.toISOString());
  if (options.due === "none") query = query.is("due_at", null);
  if (options.due === "today" || options.due === "week") {
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    if (options.due === "week") end.setDate(end.getDate() + 7);
    query = query.gte("due_at", now.toISOString()).lte("due_at", end.toISOString());
  }
  switch (options.sort) {
    case "oldest": query = query.order("requested_at", { ascending: true }); break;
    case "due_asc": query = query.order("due_at", { ascending: true, nullsFirst: false }); break;
    case "due_desc": query = query.order("due_at", { ascending: false, nullsFirst: false }); break;
    default: query = query.order("requested_at", { ascending: false });
  }
  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw mapApprovalError(error);
  return { items: await hydrateApprovalRequests(data ?? []), page, pageSize, total: count ?? 0 };
}

export async function getApprovalRequest(requestId: string): Promise<ApprovalRequestWithRelations | null> {
  const { data, error } = await requireClient().from("approval_requests").select("*").eq("id", requestId).maybeSingle();
  if (error) throw mapApprovalError(error);
  return data ? (await hydrateApprovalRequests([data]))[0] : null;
}

export async function getPostApprovalHistory(postId: string): Promise<ApprovalRequestWithRelations[]> {
  const { data, error } = await requireClient()
    .from("approval_requests")
    .select("*")
    .eq("post_id", postId)
    .order("requested_at", { ascending: false });
  if (error) throw mapApprovalError(error);
  return hydrateApprovalRequests(data ?? []);
}

function actionResult(data: Json): ApprovalActionResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw mapApprovalError(new Error("APPROVAL_RESPONSE_INVALID"));
  }
  const requestId = data.requestId;
  const postId = data.postId;
  const postRevision = data.postRevision;
  const requestStatus = data.requestStatus ?? data.status;
  if (typeof requestId !== "string" || typeof postId !== "string"
      || typeof postRevision !== "number" || typeof requestStatus !== "string") {
    throw mapApprovalError(new Error("APPROVAL_RESPONSE_INVALID"));
  }
  return {
    requestId,
    postId,
    postRevision,
    requestStatus: requestStatus as ApprovalRequestStatus,
    postStatus: typeof data.postStatus === "string" ? data.postStatus : undefined,
    assignedApproverId: typeof data.assignedApproverId === "string" ? data.assignedApproverId : undefined,
    dueAt: typeof data.dueAt === "string" || data.dueAt === null ? data.dueAt : undefined,
  };
}

function finishAction(data: Json | null, error: unknown): ApprovalActionResult {
  if (error || !data) throw mapApprovalError(error);
  return actionResult(data);
}

export async function submitForApproval(input: SubmitApprovalInput): Promise<ApprovalActionResult> {
  const { data, error } = await requireClient().rpc("submit_post_for_approval", {
    p_post_id: input.postId,
    p_expected_revision: input.expectedRevision,
    p_assigned_approver_id: input.assignedApproverId,
    ...(input.submissionMessage == null ? {} : { p_submission_message: input.submissionMessage }),
    ...(input.dueAt == null ? {} : { p_due_at: input.dueAt }),
  });
  if (error || !data) throw mapApprovalError(error);
  return actionResult(data);
}

export async function approveRequest(requestId: string, message?: string) {
  const result = await requireClient().rpc("approve_post", {
    p_approval_request_id: requestId,
    ...(message === undefined ? {} : { p_message: message }),
  });
  return finishAction(result.data, result.error);
}
export async function requestChanges(requestId: string, message: string) {
  const result = await requireClient().rpc("request_post_changes", { p_approval_request_id: requestId, p_message: message });
  return finishAction(result.data, result.error);
}
export async function rejectRequest(requestId: string, message: string) {
  const result = await requireClient().rpc("reject_post", { p_approval_request_id: requestId, p_message: message });
  return finishAction(result.data, result.error);
}
export async function withdrawRequest(requestId: string, message?: string) {
  const result = await requireClient().rpc("withdraw_approval_request", {
    p_approval_request_id: requestId,
    ...(message === undefined ? {} : { p_message: message }),
  });
  return finishAction(result.data, result.error);
}
export async function reassignRequest(requestId: string, approverId: string, message?: string) {
  const result = await requireClient().rpc("reassign_approval_request", {
    p_approval_request_id: requestId,
    p_new_approver_id: approverId,
    ...(message === undefined ? {} : { p_message: message }),
  });
  return finishAction(result.data, result.error);
}
export async function changeDeadline(requestId: string, dueAt: string | null, message?: string) {
  const result = await requireClient().rpc("change_approval_deadline", {
    p_approval_request_id: requestId,
    // PostgreSQL function arguments can accept NULL; generated RPC types do not encode that.
    p_due_at: dueAt as string,
    ...(message === undefined ? {} : { p_message: message }),
  });
  return finishAction(result.data, result.error);
}

export async function addComment(requestId: string, body: string): Promise<Tables<"approval_comments">> {
  const { data, error } = await requireClient().rpc("add_approval_comment", {
    p_approval_request_id: requestId,
    p_body: body,
  });
  if (error || !data) throw mapApprovalError(error);
  return data;
}

export async function getApprovalCounts(workspaceId: string): Promise<ApprovalCounts> {
  const client = requireClient();
  const userResult = await client.auth.getUser();
  if (userResult.error || !userResult.data.user) throw mapApprovalError(userResult.error);
  const { data, error } = await client
    .from("approval_requests")
    .select("status, requested_by, assigned_approver_id, due_at, resolved_at")
    .eq("workspace_id", workspaceId);
  if (error) throw mapApprovalError(error);
  const userId = userResult.data.user.id;
  const now = Date.now();
  const rows = data ?? [];
  return {
    pending: rows.filter((row) => row.status === "pending").length,
    awaitingMine: rows.filter((row) => row.status === "pending" && row.assigned_approver_id === userId).length,
    submittedByMe: rows.filter((row) => row.requested_by === userId).length,
    approved: rows.filter((row) => row.status === "approved").length,
    recentlyApproved: rows.filter((row) => row.status === "approved" && row.resolved_at && new Date(row.resolved_at).getTime() >= now - 7 * 86400000).length,
    changesRequested: rows.filter((row) => row.status === "changes_requested").length,
    rejected: rows.filter((row) => row.status === "rejected").length,
    overdue: rows.filter((row) => row.status === "pending" && row.due_at && new Date(row.due_at).getTime() < now).length,
  };
}

export async function listEligibleApprovers(workspaceId: string): Promise<EligibleApprover[]> {
  const client = requireClient();
  const { data, error } = await client
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .in("role", ["owner", "administrator", "approver"])
    .order("role");
  if (error) throw mapApprovalError(error);
  const members = data ?? [];
  const ids = members.map((member) => member.user_id);
  const profilesResult = ids.length
    ? await client.from("profiles").select("id, full_name, avatar_url").in("id", ids)
    : { data: [] as Array<{ id: string; full_name: string | null; avatar_url: string | null }>, error: null };
  if (profilesResult.error) throw mapApprovalError(profilesResult.error);
  const profiles = new Map((profilesResult.data ?? []).map((row) => [row.id, row]));
  return members.map((member) => ({
    userId: member.user_id,
    name: profiles.get(member.user_id)?.full_name?.trim() || "Workspace member",
    avatarUrl: profiles.get(member.user_id)?.avatar_url ?? null,
    role: member.role as EligibleApprover["role"],
  }));
}

export async function getLatestPostApproval(postId: string): Promise<ApprovalRequestWithRelations | null> {
  const { data, error } = await requireClient()
    .from("approval_requests")
    .select("*")
    .eq("post_id", postId)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw mapApprovalError(error);
  return data ? (await hydrateApprovalRequests([data]))[0] : null;
}
