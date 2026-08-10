import type { SocialPlatform } from "./common";
import type { MediaAssetPresentation, MediaItem } from "./media";
import type { TeamMember } from "./team";
import type { Enums, Json, Tables } from "./database.generated";

export type PostStatus = Enums<"post_status">;
export type PostRecord = Tables<"posts">;
export type PostPlatformRecord = Tables<"post_platforms">;
export type PostMediaRecord = Tables<"post_media">;

export interface PostPlatformInput {
  platform: SocialPlatform;
  platform_caption?: string | null;
  platform_title?: string | null;
  platform_settings?: Json;
}

export interface PostWriteInput {
  workspaceId: string;
  caption: string;
  status: Extract<PostStatus, "draft" | "scheduled" | "cancelled">;
  scheduledAt: string | null;
  timezone: string;
  approvalRequired: boolean;
  assignedTo: string | null;
  platforms: PostPlatformInput[];
  mediaAssetIds: string[];
  destinationAccountIds: string[];
}

export interface PostWithRelations {
  post: PostRecord;
  platforms: PostPlatformRecord[];
  mediaLinks: PostMediaRecord[];
  media: MediaAssetPresentation[];
  creatorName: string | null;
  assignedName: string | null;
  destinations: import("./publishing").PostDestination[];
}

export type PostSort = "newest" | "oldest" | "scheduled_asc" | "scheduled_desc" | "caption_asc";

export interface PostListOptions {
  workspaceId: string;
  page?: number;
  pageSize?: number;
  status?: PostStatus | "all";
  platform?: SocialPlatform | "all";
  search?: string;
  createdFrom?: string | null;
  createdTo?: string | null;
  scheduledFrom?: string | null;
  scheduledTo?: string | null;
  creatorId?: string | null;
  assignedTo?: string | null;
  sort?: PostSort;
}

export interface PostListResult {
  items: PostWithRelations[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PostMutationResult {
  postId: string;
  revision: number;
}

export interface PostCounts {
  all: number;
  draft: number;
  pending_approval: number;
  approved: number;
  scheduled: number;
  publishing: number;
  published: number;
  failed: number;
  cancelled: number;
  publishedThisMonth: number;
}

export interface CalendarPost extends PostWithRelations {
  displayDate: string | null;
  publishingState?: "reconciliation_required" | null;
  approval?: import("./approval").ApprovalRequest | null;
  approvalStale?: boolean;
  approvalOverdue?: boolean;
  scheduleNeedsUpdating?: boolean;
}

export interface SocialPost {
  id: string;
  caption: string;
  /** Optional platform-specific caption overrides keyed by platform. */
  platformCaptions?: Partial<Record<SocialPlatform, string>>;
  platforms: SocialPlatform[];
  media: MediaItem[];
  status: PostStatus;
  scheduledAt?: string; // ISO date-time
  publishedAt?: string; // ISO date-time
  createdAt: string; // ISO date-time
  updatedAt: string; // ISO date-time
  createdBy: TeamMember;
  campaign?: string;
  /** Present when status === "failed". */
  failureReason?: string;
  /** Lightweight engagement snapshot for published posts. */
  metrics?: PostMetrics;
}

export interface PostMetrics {
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
}

export type ApprovalDecision = "approved" | "changes_requested" | "rejected";

export interface MockApprovalComment {
  id: string;
  author: TeamMember;
  message: string;
  createdAt: string;
  decision?: ApprovalDecision;
}

export type ApprovalState =
  | "awaiting"
  | "approved"
  | "changes_requested"
  | "rejected";

export interface MockApprovalRequest {
  id: string;
  post: SocialPost;
  submittedBy: TeamMember;
  submittedAt: string;
  /** The reviewer this request is assigned to. */
  assignedTo: TeamMember;
  state: ApprovalState;
  comments: MockApprovalComment[];
}
