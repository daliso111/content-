import { ApprovalError } from "@/types";

interface SafeErrorShape {
  code?: string;
  message?: string;
}

const APPROVAL_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "Your session has expired. Sign in again.",
  PERMISSION_DENIED: "You do not have permission to perform this approval action.",
  POST_NOT_FOUND: "This post could not be found.",
  APPROVAL_REQUEST_NOT_FOUND: "This approval request could not be found.",
  POST_REVISION_CONFLICT: "The post changed in another session. Refresh before continuing.",
  POST_NOT_DRAFT: "Only a draft can be submitted for approval.",
  APPROVAL_ALREADY_RESOLVED: "This approval request has already been resolved.",
  APPROVAL_REQUEST_STALE: "This request is stale because the post has changed.",
  SELF_APPROVAL_DENIED: "A different owner, administrator, or approver must review this post.",
  NO_ELIGIBLE_APPROVER: "Add another active owner, administrator, or approver before submitting.",
  APPROVER_WRONG_WORKSPACE: "The selected approver is not active in this workspace.",
  APPROVER_ROLE_INVALID: "The selected member does not have approval permission.",
  DEADLINE_IN_PAST: "Choose a future approval deadline.",
  COMMENT_EMPTY: "Enter a comment before sending it.",
  SUBMISSION_ALREADY_PENDING: "This revision already has a pending approval request.",
  PUBLISHING_BLOCKED_APPROVAL_REQUIRED: "This revision needs approval before it can be published.",
  APPROVAL_INVALIDATED_BY_EDIT: "Editing this post invalidates its current approval. Return it to draft first.",
  POST_CONTENT_REQUIRED: "Add a caption or media before submitting for approval.",
  APPROVAL_MESSAGE_REQUIRED: "A reason or change instruction is required.",
};

export function mapApprovalError(error: unknown): ApprovalError {
  if (error instanceof ApprovalError) return error;
  const safe = typeof error === "object" && error !== null ? (error as SafeErrorShape) : {};
  const rawMessage = safe.message ?? "";
  const knownCode = Object.keys(APPROVAL_MESSAGES).find((code) => rawMessage.includes(code));
  if (knownCode) return new ApprovalError(APPROVAL_MESSAGES[knownCode], knownCode);
  if (safe.code === "PGRST301" || safe.code === "401") {
    return new ApprovalError(APPROVAL_MESSAGES.AUTH_REQUIRED, "SESSION_EXPIRED");
  }
  if (safe.code === "42501") {
    return new ApprovalError(APPROVAL_MESSAGES.PERMISSION_DENIED, "PERMISSION_DENIED");
  }
  if (safe.code === "PGRST116") {
    return new ApprovalError(APPROVAL_MESSAGES.APPROVAL_REQUEST_NOT_FOUND, "APPROVAL_REQUEST_NOT_FOUND");
  }
  return new ApprovalError(
    "The approval action could not be completed. Check your connection and try again.",
    "APPROVAL_NETWORK_ERROR",
  );
}
