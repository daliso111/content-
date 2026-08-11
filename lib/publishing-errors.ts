export class PublishingClientError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

const MESSAGES: Record<string, string> = {
  NO_DESTINATION_SELECTED: "Choose at least one connected destination.",
  ACCOUNT_DISCONNECTED: "Reconnect the destination account before publishing.",
  ACCOUNT_DISCONNECTED_OR_DENIED: "A destination is disconnected or unavailable.",
  TOKEN_EXPIRED: "A destination token has expired. Reconnect the account.",
  MISSING_PERMISSION: "Reconnect the account and grant the required publishing permissions.",
  UNSUPPORTED_MEDIA_COMBINATION: "The selected platforms do not support this media combination.",
  FACEBOOK_MEDIA_UNSUPPORTED: "Facebook supports text-only posts, one supported image, or one supported vertical Reel video.",
  INSTAGRAM_MEDIA_REQUIRED: "Add supported media before publishing to Instagram.",
  INSTAGRAM_MEDIA_UNSUPPORTED: "Instagram supports one JPEG image or one supported vertical Reel video.",
  MEDIA_NOT_FOUND: "The selected media is no longer available.",
  MEDIA_URL_CREATION_FAILED: "A temporary media URL could not be created.",
  SCHEDULE_INVALID: "Choose a valid future publishing time.",
  JOB_ALREADY_EXISTS: "Publishing is already queued for this revision.",
  JOB_ALREADY_PROCESSING: "This post is already publishing.",
  RETRY_NOT_ALLOWED: "This publishing job cannot be retried.",
  CANCELLATION_NOT_GUARANTEED: "Provider submission may have started. Verify the destination manually.",
  PROVIDER_RATE_LIMIT: "Meta is rate limiting requests. Towkn will retry safely.",
  PROVIDER_TEMPORARY_ERROR: "Meta is temporarily unavailable. Towkn will retry safely.",
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
  YOUTUBE_UPLOAD_FAILED: "The YouTube video upload failed. Towkn will retry safely when possible.",
  YOUTUBE_TOKEN_REFRESH_FAILED: "The YouTube connection could not be refreshed. Try again shortly.",
  YOUTUBE_PROVIDER_REJECTED: "YouTube rejected this video publication.",
  TIKTOK_VIDEO_REQUIRED: "TikTok requires one video for this post.",
  TIKTOK_SINGLE_VIDEO_REQUIRED: "TikTok currently supports one video per post.",
  TIKTOK_MEDIA_UNSUPPORTED: "TikTok supports one MP4, MOV, or WebM video per post.",
  TIKTOK_VIDEO_EMPTY: "The TikTok video must have a non-zero file size.",
  TIKTOK_VIDEO_TOO_LARGE: "The TikTok video exceeds Towkn's 50 MiB upload limit.",
  TIKTOK_VIDEO_TOO_LONG: "The video exceeds this TikTok creator's maximum duration.",
  PUBLISH_REQUEST_FAILED: "Publishing could not be queued. Review the post settings and try again.",
  PUBLISHING_ACTION_FAILED: "The publishing action could not be completed. Please try again.",
};

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return [value.code, value.message, value.details, value.hint]
      .filter((part): part is string => typeof part === "string")
      .join(" ");
  }
  return typeof error === "string" ? error : "";
}

function knownCode(message: string): string | null {
  return Object.keys(MESSAGES).find((candidate) => message.includes(candidate)) ?? null;
}

export function mapPublishingError(error: unknown): PublishingClientError {
  const message = errorText(error);
  const code = knownCode(message)
    ?? (message.includes("JWT") || message.includes("session") ? "AUTH_REQUIRED" : "PUBLISHING_ACTION_FAILED");
  return new PublishingClientError(code, MESSAGES[code]);
}

export function mapPublishingRequestError(error: unknown): PublishingClientError {
  const message = errorText(error);
  const code = knownCode(message)
    ?? (message.includes("JWT") || message.includes("session") ? "AUTH_REQUIRED" : "PUBLISH_REQUEST_FAILED");
  return new PublishingClientError(code, MESSAGES[code]);
}

export function publishingErrorMessage(code: string): string {
  return MESSAGES[code] ?? MESSAGES.PUBLISH_REQUEST_FAILED;
}

export function getPublishingErrorMessage(error: unknown): string {
  return error instanceof PublishingClientError ? error.message : mapPublishingError(error).message;
}
