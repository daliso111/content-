export class PublishingClientError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message ?? code);
  }
}

const MESSAGES: Record<string, string> = {
  NO_DESTINATION_SELECTED: "Choose at least one connected destination.",
  ACCOUNT_DISCONNECTED: "Reconnect the destination account before publishing.",
  ACCOUNT_DISCONNECTED_OR_DENIED: "A destination is disconnected or unavailable.",
  TOKEN_EXPIRED: "A destination token has expired. Reconnect the account.",
  MISSING_PERMISSION: "Reconnect the account and grant the required publishing permissions.",
  UNSUPPORTED_MEDIA_COMBINATION: "Use Facebook text, one supported image, or one supported vertical Reel video.",
  MEDIA_NOT_FOUND: "The selected media is no longer available.",
  MEDIA_URL_CREATION_FAILED: "A temporary media URL could not be created.",
  SCHEDULE_INVALID: "Choose a valid future publishing time.",
  JOB_ALREADY_EXISTS: "Publishing is already queued for this revision.",
  JOB_ALREADY_PROCESSING: "This post is already publishing.",
  RETRY_NOT_ALLOWED: "This publishing job cannot be retried.",
  CANCELLATION_NOT_GUARANTEED: "Provider submission may have started. Verify the destination manually.",
  PROVIDER_RATE_LIMIT: "Meta is rate limiting requests. PostFlow will retry safely.",
  PROVIDER_TEMPORARY_ERROR: "Meta is temporarily unavailable. PostFlow will retry safely.",
  PROVIDER_PERMANENT_REJECTION: "Meta rejected this publication.",
  AMBIGUOUS_PROVIDER_OUTCOME: "The provider result is uncertain. Verify the destination before retrying.",
  RECONCILIATION_REQUIRED: "Manual provider verification is required.",
  PERMISSION_DENIED: "Your workspace role cannot perform this publishing action.",
  AUTH_REQUIRED: "Your session has expired. Sign in again.",
  POST_HAS_PUBLISHING_HISTORY: "Posts with publishing history cannot be deleted or edited.",
  YOUTUBE_VIDEO_REQUIRED: "YouTube publishing requires exactly one supported video.",
  YOUTUBE_TITLE_REQUIRED: "Add a YouTube title before publishing.",
  YOUTUBE_TITLE_TOO_LONG: "YouTube titles must be 100 characters or fewer.",
  YOUTUBE_DESCRIPTION_TOO_LONG: "YouTube descriptions must be 5,000 characters or fewer.",
  YOUTUBE_PRIVACY_INVALID: "Choose a valid YouTube privacy status.",
  YOUTUBE_ACCOUNT_REAUTH_REQUIRED: "Reconnect the YouTube channel before publishing.",
  YOUTUBE_UPLOAD_FAILED: "The YouTube video upload failed. PostFlow will retry safely when possible.",
  YOUTUBE_TOKEN_REFRESH_FAILED: "The YouTube connection could not be refreshed. Try again shortly.",
  YOUTUBE_PROVIDER_REJECTED: "YouTube rejected this video publication.",
};

export function mapPublishingError(error: unknown): PublishingClientError {
  const message = error instanceof Error ? error.message : "";
  const code = Object.keys(MESSAGES).find((candidate) => message.includes(candidate))
    ?? (message.includes("JWT") || message.includes("session") ? "AUTH_REQUIRED" : "PROVIDER_TEMPORARY_ERROR");
  return new PublishingClientError(code, MESSAGES[code]);
}

export function getPublishingErrorMessage(error: unknown): string {
  return error instanceof PublishingClientError ? error.message : mapPublishingError(error).message;
}
