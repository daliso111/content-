import { TeamServiceError } from "@/types";

const TEAM_ERRORS: Array<[string, string, string]> = [
  ["TEAM_PERMISSION_DENIED", "permission_denied", "You do not have permission to manage this team."],
  ["ROLE_ASSIGNMENT_DENIED", "role_assignment_denied", "That role change is not allowed for your workspace role."],
  ["INVITATION_ALREADY_PENDING", "invitation_pending", "An invitation is already pending for this email."],
  ["USER_ALREADY_MEMBER", "already_member", "This user is already a workspace member."],
  ["MEMBER_REACTIVATION_REQUIRED", "reactivation_required", "This member is suspended. Reactivate the existing membership instead."],
  ["INVALID_EMAIL", "invalid_email", "Enter a valid email address."],
  ["INVITATION_EXPIRED", "invitation_expired", "This invitation has expired."],
  ["INVITATION_REVOKED", "invitation_revoked", "This invitation has been revoked."],
  ["INVITATION_ALREADY_ACCEPTED", "invitation_accepted", "This invitation has already been accepted."],
  ["INVITATION_EMAIL_MISMATCH", "email_mismatch", "Sign in with the email address that received this invitation."],
  ["INVALID_INVITATION_TOKEN", "invalid_token", "This invitation link is invalid."],
  ["MEMBER_NOT_FOUND", "member_not_found", "The workspace member could not be found."],
  ["MEMBER_ALREADY_SUSPENDED", "already_suspended", "This member is already suspended."],
  ["MEMBER_NOT_SUSPENDED", "not_suspended", "This member is not suspended."],
  ["CANNOT_MANAGE_SELF", "cannot_manage_self", "Use Leave workspace to remove your own access."],
  ["A workspace must retain at least one active owner", "last_owner", "Add or transfer ownership to another active owner first."],
  ["INVITATION_RATE_LIMITED", "rate_limited", "Please wait before resending this invitation."],
  ["EMAIL_INVITATION_FAILED", "email_failed", "The invitation email could not be requested. You can retry from Pending invitations."],
  ["AUTH_REQUIRED", "session_expired", "Your session has expired. Sign in and try again."],
];

export function mapTeamError(error: unknown): TeamServiceError {
  if (error instanceof TeamServiceError) return error;
  const message = error instanceof Error ? error.message : String(error ?? "");
  for (const [marker, code, safeMessage] of TEAM_ERRORS) {
    if (message.includes(marker)) return new TeamServiceError(code, safeMessage);
  }
  if (/fetch|network|failed to fetch/i.test(message)) {
    return new TeamServiceError("network", "The team service could not be reached. Check your connection and try again.");
  }
  return new TeamServiceError("unknown", "The team action could not be completed safely.");
}
