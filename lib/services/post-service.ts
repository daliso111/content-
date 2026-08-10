import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient, getSupabaseConfigurationError } from "@/lib/supabase/client";
import { mapPostError } from "@/lib/post-errors";
import { presentMediaAssets, toMediaItem } from "@/lib/services/storage-service";
import type { Database, Json, Tables } from "@/types/database.generated";
import type {
  CalendarPost,
  PostCounts,
  PostListOptions,
  PostListResult,
  PostMutationResult,
  PostRecord,
  PostWithRelations,
  PostWriteInput,
  SocialPlatform,
  SocialPost,
} from "@/types";

function requireClient(): SupabaseClient<Database> {
  const client = getSupabaseClient();
  if (!client) throw new Error(getSupabaseConfigurationError() ?? "Supabase is not configured.");
  return client;
}

function platformJson(input: PostWriteInput): Json {
  return input.platforms.map((platform) => ({
    platform: platform.platform,
    platform_caption: platform.platform_caption ?? null,
    platform_title: platform.platform_title ?? null,
    platform_settings: platform.platform_settings ?? {},
  }));
}

// PostgreSQL function arguments can accept NULL; generated RPC types do not encode that.
function nullableRpcString(value: string | null): string {
  return value as string;
}

async function hydratePosts(rows: PostRecord[]): Promise<PostWithRelations[]> {
  if (!rows.length) return [];
  const client = requireClient();
  const postIds = rows.map((post) => post.id);
  const [platformResult, mediaLinkResult, destinationResult] = await Promise.all([
    client.from("post_platforms").select("*").in("post_id", postIds).order("created_at", { ascending: true }),
    client.from("post_media").select("*").in("post_id", postIds).order("sort_order", { ascending: true }),
    client.from("post_destinations").select("*").in("post_id", postIds).order("created_at", { ascending: true }),
  ]);
  if (platformResult.error) throw mapPostError(platformResult.error);
  if (mediaLinkResult.error) throw mapPostError(mediaLinkResult.error);
  if (destinationResult.error) throw mapPostError(destinationResult.error);

  const mediaLinks = mediaLinkResult.data ?? [];
  const mediaIds = [...new Set(mediaLinks.map((link) => link.media_asset_id))];
  const profileIds = [
    ...new Set(
      rows.flatMap((post) => [post.created_by, post.assigned_to].filter((id): id is string => !!id)),
    ),
  ];
  const [mediaResult, profileResult] = await Promise.all([
    mediaIds.length
      ? client.from("media_assets").select("*").in("id", mediaIds)
      : Promise.resolve({ data: [] as Tables<"media_assets">[], error: null }),
    profileIds.length
      ? client.from("profiles").select("id, full_name").in("id", profileIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }>, error: null }),
  ]);
  if (mediaResult.error) throw mapPostError(mediaResult.error);
  if (profileResult.error) throw mapPostError(profileResult.error);

  const presentedMedia = await presentMediaAssets(mediaResult.data ?? []);
  const mediaById = new Map(presentedMedia.map((media) => [media.asset.id, media]));
  const profileById = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile.full_name]));
  const platformsByPost = new Map<string, Tables<"post_platforms">[]>();
  for (const platform of platformResult.data ?? []) {
    const group = platformsByPost.get(platform.post_id) ?? [];
    group.push(platform);
    platformsByPost.set(platform.post_id, group);
  }
  const linksByPost = new Map<string, Tables<"post_media">[]>();
  for (const link of mediaLinks) {
    const group = linksByPost.get(link.post_id) ?? [];
    group.push(link);
    linksByPost.set(link.post_id, group);
  }
  const destinationsByPost = new Map<string, Tables<"post_destinations">[]>();
  for (const destination of destinationResult.data ?? []) {
    const group = destinationsByPost.get(destination.post_id) ?? [];
    group.push(destination);
    destinationsByPost.set(destination.post_id, group);
  }

  return rows.map((post) => {
    const links = linksByPost.get(post.id) ?? [];
    return {
      post,
      platforms: platformsByPost.get(post.id) ?? [],
      mediaLinks: links,
      media: links.flatMap((link) => {
        const media = mediaById.get(link.media_asset_id);
        return media ? [media] : [];
      }),
      creatorName: profileById.get(post.created_by) ?? null,
      assignedName: post.assigned_to ? profileById.get(post.assigned_to) ?? null : null,
      destinations: destinationsByPost.get(post.id) ?? [],
    };
  });
}

export async function listPosts(options: PostListOptions): Promise<PostListResult> {
  const client = requireClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 12));
  let platformPostIds: string[] | null = null;
  if (options.platform && options.platform !== "all") {
    const platformResult = await client
      .from("post_platforms")
      .select("post_id")
      .eq("workspace_id", options.workspaceId)
      .eq("platform", options.platform);
    if (platformResult.error) throw mapPostError(platformResult.error);
    platformPostIds = [...new Set((platformResult.data ?? []).map((row) => row.post_id))];
    if (!platformPostIds.length) return { items: [], page, pageSize, total: 0 };
  }

  const from = (page - 1) * pageSize;
  let query = client
    .from("posts")
    .select("*", { count: "exact" })
    .eq("workspace_id", options.workspaceId)
    .range(from, from + pageSize - 1);
  if (options.status && options.status !== "all") query = query.eq("status", options.status);
  if (options.search?.trim()) query = query.ilike("caption", `%${options.search.trim()}%`);
  if (options.createdFrom) query = query.gte("created_at", options.createdFrom);
  if (options.createdTo) query = query.lte("created_at", options.createdTo);
  if (options.scheduledFrom) query = query.gte("scheduled_at", options.scheduledFrom);
  if (options.scheduledTo) query = query.lte("scheduled_at", options.scheduledTo);
  if (options.creatorId) query = query.eq("created_by", options.creatorId);
  if (options.assignedTo) query = query.eq("assigned_to", options.assignedTo);
  if (platformPostIds) query = query.in("id", platformPostIds);

  switch (options.sort) {
    case "oldest": query = query.order("created_at", { ascending: true }); break;
    case "scheduled_asc": query = query.order("scheduled_at", { ascending: true, nullsFirst: false }); break;
    case "scheduled_desc": query = query.order("scheduled_at", { ascending: false, nullsFirst: false }); break;
    case "caption_asc": query = query.order("caption", { ascending: true }); break;
    default: query = query.order("created_at", { ascending: false });
  }

  const { data, error, count } = await query;
  if (error) throw mapPostError(error);
  return { items: await hydratePosts(data ?? []), page, pageSize, total: count ?? 0 };
}

export async function getPostById(postId: string): Promise<PostWithRelations | null> {
  const client = requireClient();
  const { data, error } = await client.from("posts").select("*").eq("id", postId).maybeSingle();
  if (error) throw mapPostError(error);
  return data ? (await hydratePosts([data]))[0] : null;
}

export async function createPost(input: PostWriteInput): Promise<PostMutationResult> {
  const { data, error } = await requireClient().rpc("create_post", {
    p_workspace_id: input.workspaceId,
    p_caption: input.caption,
    p_status: input.status,
    p_scheduled_at: nullableRpcString(input.scheduledAt),
    p_timezone: input.timezone,
    p_approval_required: input.approvalRequired,
    p_assigned_to: nullableRpcString(input.assignedTo),
    p_platforms: platformJson(input),
    p_media_asset_ids: input.mediaAssetIds,
    p_destination_account_ids: input.destinationAccountIds,
  });
  if (error || !data) throw mapPostError(error);
  return { postId: data.id, revision: data.revision };
}

export async function updatePost(
  postId: string,
  expectedRevision: number,
  input: PostWriteInput,
): Promise<PostMutationResult> {
  const { data, error } = await requireClient().rpc("update_post", {
    p_post_id: postId,
    p_expected_revision: expectedRevision,
    p_caption: input.caption,
    p_status: input.status,
    p_scheduled_at: nullableRpcString(input.scheduledAt),
    p_timezone: input.timezone,
    p_approval_required: input.approvalRequired,
    p_assigned_to: nullableRpcString(input.assignedTo),
    p_platforms: platformJson(input),
    p_media_asset_ids: input.mediaAssetIds,
    p_destination_account_ids: input.destinationAccountIds,
  });
  if (error || !data) throw mapPostError(error);
  return { postId: data.id, revision: data.revision };
}

export async function deletePost(postId: string): Promise<string> {
  const { data, error } = await requireClient().rpc("delete_post", { p_post_id: postId });
  if (error || !data) throw mapPostError(error);
  return data;
}

export async function deletePosts(postIds: string[]): Promise<string[]> {
  const { data, error } = await requireClient().rpc("delete_posts", { p_post_ids: postIds });
  if (error || !data) throw mapPostError(error);
  return data;
}

export async function duplicatePost(postId: string): Promise<string> {
  const { data, error } = await requireClient().rpc("duplicate_post", { p_post_id: postId });
  if (error || !data) throw mapPostError(error);
  return data;
}

export async function listCalendarPosts(
  workspaceId: string,
  dateFrom: string,
  dateTo: string,
): Promise<CalendarPost[]> {
  const result = await listPosts({
    workspaceId,
    page: 1,
    pageSize: 100,
    scheduledFrom: dateFrom,
    scheduledTo: dateTo,
    sort: "scheduled_asc",
  });
  const postIds = result.items.map((item) => item.post.id);
  const reconciliation = new Set<string>();
  const latestApproval = new Map<string, Tables<"approval_requests">>();
  if (postIds.length) {
    const [publishingResult, approvalResult] = await Promise.all([
      requireClient().from("publishing_jobs").select("post_id").in("post_id", postIds).eq("status", "reconciliation_required"),
      requireClient().from("approval_requests").select("*").in("post_id", postIds).order("requested_at", { ascending: false }),
    ]);
    if (publishingResult.error) throw mapPostError(publishingResult.error);
    if (approvalResult.error) throw mapPostError(approvalResult.error);
    for (const row of publishingResult.data ?? []) reconciliation.add(row.post_id);
    for (const row of approvalResult.data ?? []) if (!latestApproval.has(row.post_id)) latestApproval.set(row.post_id, row);
  }
  const now = Date.now();
  return result.items
    .filter((item) => item.post.status !== "cancelled")
    .map((item) => {
      const approval = latestApproval.get(item.post.id) ?? null;
      return {
        ...item,
        displayDate: item.post.scheduled_at,
        publishingState: reconciliation.has(item.post.id) ? "reconciliation_required" as const : null,
        approval,
        approvalStale: Boolean(approval && (approval.post_revision !== item.post.revision || approval.status === "superseded")),
        approvalOverdue: Boolean(approval?.status === "pending" && approval.due_at && new Date(approval.due_at).getTime() < now),
        scheduleNeedsUpdating: Boolean(approval?.status === "pending" && item.post.scheduled_at && new Date(item.post.scheduled_at).getTime() <= now),
      };
    });
}

async function countStatus(workspaceId: string, status?: PostRecord["status"]) {
  let query = requireClient().from("posts").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
  if (status) query = query.eq("status", status);
  const { count, error } = await query;
  if (error) throw mapPostError(error);
  return count ?? 0;
}

export async function getPostCounts(workspaceId: string): Promise<PostCounts> {
  const statuses: PostRecord["status"][] = [
    "draft", "pending_approval", "approved", "scheduled", "publishing", "published", "failed", "cancelled",
  ];
  const [all, ...counts] = await Promise.all([
    countStatus(workspaceId),
    ...statuses.map((status) => countStatus(workspaceId, status)),
  ]);
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const publishedResult = await requireClient()
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "published")
    .gte("published_at", startOfMonth.toISOString());
  if (publishedResult.error) throw mapPostError(publishedResult.error);
  const byStatus = Object.fromEntries(statuses.map((status, index) => [status, counts[index]])) as Record<PostRecord["status"], number>;
  return { all, ...byStatus, publishedThisMonth: publishedResult.count ?? 0 };
}

export async function getUpcomingPosts(workspaceId: string, limit = 5): Promise<PostWithRelations[]> {
  const client = requireClient();
  const { data, error } = await client
    .from("posts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "scheduled")
    .gt("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(Math.min(20, Math.max(1, limit)));
  if (error) throw mapPostError(error);
  return hydratePosts(data ?? []);
}

export async function getRecentPosts(workspaceId: string, limit = 5): Promise<PostWithRelations[]> {
  const client = requireClient();
  const { data, error } = await client
    .from("posts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(Math.min(20, Math.max(1, limit)));
  if (error) throw mapPostError(error);
  return hydratePosts(data ?? []);
}

export async function getPlatformDistribution(workspaceId: string): Promise<Record<SocialPlatform, number>> {
  const { data, error } = await requireClient()
    .from("post_platforms")
    .select("platform")
    .eq("workspace_id", workspaceId);
  if (error) throw mapPostError(error);
  const counts: Record<SocialPlatform, number> = { facebook: 0, instagram: 0, linkedin: 0, tiktok: 0, youtube: 0, x: 0 };
  for (const row of data ?? []) counts[row.platform] += 1;
  return counts;
}

export function toSocialPost(item: PostWithRelations): SocialPost {
  const platformCaptions = Object.fromEntries(
    item.platforms.flatMap((platform) =>
      platform.platform_caption ? [[platform.platform, platform.platform_caption]] : [],
    ),
  );
  return {
    id: item.post.id,
    caption: item.post.caption,
    platformCaptions,
    platforms: item.platforms.map((platform) => platform.platform),
    media: item.media.map(toMediaItem),
    status: item.post.status,
    scheduledAt: item.post.scheduled_at ?? undefined,
    publishedAt: item.post.published_at ?? undefined,
    createdAt: item.post.created_at,
    updatedAt: item.post.updated_at,
    createdBy: {
      id: item.post.created_by,
      name: item.creatorName ?? "Workspace member",
      email: "",
      avatarColor: "#475569",
      role: "content_manager",
      status: "active",
      lastActive: item.post.updated_at,
      joinedAt: item.post.created_at,
    },
    failureReason: item.post.failure_message ?? undefined,
  };
}
