import type { Enums, Tables } from "./database.generated";
import type { PostWithRelations } from "./post";
import type { TeamRole } from "./team";

export type ApprovalRequestStatus = Enums<"approval_request_status">;
export type ApprovalEventType = Enums<"approval_event_type">;
export type ApprovalCommentType = Enums<"approval_comment_type">;
export type ApprovalRequest = Tables<"approval_requests">;
export type ApprovalEvent = Tables<"approval_events">;
export type ApprovalComment = Tables<"approval_comments">;

export interface ApprovalProfile {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface ApprovalCommentWithAuthor extends ApprovalComment {
  author: ApprovalProfile;
}

export interface ApprovalEventWithActor extends ApprovalEvent {
  actor: ApprovalProfile | null;
}

export interface ApprovalRequestWithRelations {
  request: ApprovalRequest;
  post: PostWithRelations | null;
  requester: ApprovalProfile;
  approver: ApprovalProfile | null;
  resolver: ApprovalProfile | null;
  comments: ApprovalCommentWithAuthor[];
  events: ApprovalEventWithActor[];
  destinationAccounts: Array<{
    id: string;
    name: string;
    username: string | null;
    platform: Enums<"social_platform">;
  }>;
  stale: boolean;
  overdue: boolean;
}

export type ApprovalTab =
  | "awaiting"
  | "submitted"
  | "pending"
  | "approved"
  | "changes_requested"
  | "rejected"
  | "history";

export interface ApprovalListOptions {
  workspaceId: string;
  tab?: ApprovalTab;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: ApprovalRequestStatus | "all";
  requesterId?: string | null;
  approverId?: string | null;
  due?: "all" | "overdue" | "today" | "week" | "none";
  sort?: "newest" | "oldest" | "due_asc" | "due_desc";
}

export interface ApprovalListResult {
  items: ApprovalRequestWithRelations[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ApprovalCounts {
  pending: number;
  awaitingMine: number;
  submittedByMe: number;
  approved: number;
  recentlyApproved: number;
  changesRequested: number;
  rejected: number;
  overdue: number;
}

export interface EligibleApprover {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: Extract<TeamRole, "owner" | "administrator" | "approver">;
}

export interface SubmitApprovalInput {
  postId: string;
  expectedRevision: number;
  assignedApproverId: string;
  submissionMessage?: string | null;
  dueAt?: string | null;
}

export interface ApprovalActionResult {
  requestId: string;
  requestStatus: ApprovalRequestStatus;
  postId: string;
  postRevision: number;
  postStatus?: string;
  assignedApproverId?: string;
  dueAt?: string | null;
}

export class ApprovalError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApprovalError";
  }
}
