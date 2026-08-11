export type ConnectionErrorCode =
  | "AUTH_REQUIRED"
  | "INVALID_REQUEST"
  | "METHOD_NOT_ALLOWED"
  | "CORS_DENIED"
  | "WORKSPACE_ROLE_DENIED"
  | "META_AUTHORIZATION_CANCELLED"
  | "INVALID_OAUTH_STATE"
  | "OAUTH_STATE_EXPIRED"
  | "OAUTH_STATE_ALREADY_USED"
  | "META_CONFIGURATION_MISSING"
  | "META_TOKEN_EXCHANGE_FAILED"
  | "META_PERMISSION_DENIED"
  | "META_NO_MANAGED_PAGES"
  | "META_NO_ELIGIBLE_INSTAGRAM"
  | "META_PROVIDER_UNAVAILABLE"
  | "YOUTUBE_AUTHORIZATION_CANCELLED"
  | "YOUTUBE_CONFIGURATION_MISSING"
  | "YOUTUBE_TOKEN_EXCHANGE_FAILED"
  | "YOUTUBE_REFRESH_TOKEN_REQUIRED"
  | "YOUTUBE_REAUTHORIZATION_REQUIRED"
  | "YOUTUBE_NO_CHANNEL"
  | "YOUTUBE_PROVIDER_UNAVAILABLE"
  | "TIKTOK_AUTHORIZATION_CANCELLED"
  | "TIKTOK_CONFIGURATION_MISSING"
  | "TIKTOK_TOKEN_EXCHANGE_FAILED"
  | "TIKTOK_REFRESH_TOKEN_REQUIRED"
  | "TIKTOK_TOKEN_RESPONSE_INVALID"
  | "TIKTOK_REQUIRED_SCOPE_MISSING"
  | "TIKTOK_PUBLISHING_PERMISSION_REQUIRED"
  | "TIKTOK_PROFILE_DISCOVERY_FAILED"
  | "TIKTOK_OPEN_ID_MISMATCH"
  | "TIKTOK_CONNECTION_NO_LONGER_VALID"
  | "TIKTOK_REAUTHORIZATION_REQUIRED"
  | "TIKTOK_PROVIDER_UNAVAILABLE"
  | "TIKTOK_REVOCATION_FAILED"
  | "CONNECTION_SESSION_EXPIRED"
  | "CONNECTION_SESSION_NOT_FOUND"
  | "INVALID_ACCOUNT_SELECTION"
  | "ACCOUNT_ALREADY_CONNECTED"
  | "UNSUPPORTED_ACCOUNT_TYPE"
  | "TOKEN_DECRYPTION_FAILED"
  | "TOKEN_ENCRYPTION_FAILED"
  | "SOCIAL_ACCOUNT_NOT_FOUND"
  | "TOKEN_EXPIRED"
  | "RECONNECTION_REQUIRED"
  | "RATE_LIMITED"
  | "UNSAFE_RETURN_PATH"
  | "TEAM_PERMISSION_DENIED"
  | "ROLE_ASSIGNMENT_DENIED"
  | "INVALID_EMAIL"
  | "INVITATION_ALREADY_PENDING"
  | "USER_ALREADY_MEMBER"
  | "MEMBER_REACTIVATION_REQUIRED"
  | "INVITATION_NOT_FOUND"
  | "INVITATION_NOT_PENDING"
  | "INVITATION_RATE_LIMITED"
  | "EMAIL_INVITATION_FAILED"
  | "UNSAFE_INVITATION_REDIRECT"
  | "INTERNAL_ERROR";

export interface SafeConnectionDiagnostics {
  providerHttpStatus?: number | null;
  providerErrorName?: string | null;
  discoveredChannels?: number | null;
}

export class ConnectionError extends Error {
  constructor(
    public readonly code: ConnectionErrorCode,
    public readonly status: number,
    message = code,
    public readonly diagnostics: SafeConnectionDiagnostics = {},
  ) {
    super(message);
    this.name = "ConnectionError";
  }
}

export type YouTubeCallbackStage =
  | "CALLBACK_RECEIVED"
  | "STATE_CONSUME_STARTED"
  | "STATE_CONSUMED"
  | "TOKEN_EXCHANGE_STARTED"
  | "TOKEN_EXCHANGE_SUCCEEDED"
  | "TOKEN_EXCHANGE_FAILED"
  | "CHANNEL_DISCOVERY_STARTED"
  | "CHANNEL_DISCOVERY_SUCCEEDED"
  | "CHANNEL_DISCOVERY_FAILED"
  | "TOKEN_ENCRYPTION_STARTED"
  | "TOKEN_ENCRYPTION_SUCCEEDED"
  | "UPSERT_STARTED"
  | "UPSERT_SUCCEEDED"
  | "UPSERT_FAILED"
  | "CALLBACK_COMPLETED";

export type YouTubeCallbackDiagnosticCode =
  | "AUTHORIZATION_CANCELLED"
  | "STATE_INVALID"
  | "STATE_EXPIRED"
  | "STATE_ALREADY_USED"
  | "TOKEN_EXCHANGE_FAILED"
  | "CHANNEL_DISCOVERY_FAILED"
  | "NO_CHANNEL"
  | "ENCRYPTION_FAILED"
  | "REFRESH_TOKEN_MISSING"
  | "UPSERT_FAILED"
  | "CONFIGURATION_FAILED"
  | "CALLBACK_FAILED";

export function youtubeCallbackDiagnosticCode(
  stage: YouTubeCallbackStage,
  error: unknown,
): YouTubeCallbackDiagnosticCode {
  const safe = safeConnectionError(error);
  if (safe.code === "YOUTUBE_AUTHORIZATION_CANCELLED") {
    return "AUTHORIZATION_CANCELLED";
  }
  if (safe.code === "OAUTH_STATE_EXPIRED") return "STATE_EXPIRED";
  if (safe.code === "OAUTH_STATE_ALREADY_USED") return "STATE_ALREADY_USED";
  if (safe.code === "INVALID_OAUTH_STATE") return "STATE_INVALID";
  if (safe.code === "YOUTUBE_CONFIGURATION_MISSING") {
    return "CONFIGURATION_FAILED";
  }
  if (stage.startsWith("TOKEN_EXCHANGE_")) return "TOKEN_EXCHANGE_FAILED";
  if (stage.startsWith("CHANNEL_DISCOVERY_")) {
    return safe.code === "YOUTUBE_NO_CHANNEL"
      ? "NO_CHANNEL"
      : "CHANNEL_DISCOVERY_FAILED";
  }
  if (stage.startsWith("TOKEN_ENCRYPTION_")) return "ENCRYPTION_FAILED";
  if (stage.startsWith("UPSERT_")) {
    return safe.code === "YOUTUBE_REFRESH_TOKEN_REQUIRED"
      ? "REFRESH_TOKEN_MISSING"
      : "UPSERT_FAILED";
  }
  return "CALLBACK_FAILED";
}

export function safeConnectionError(error: unknown): ConnectionError {
  if (error instanceof ConnectionError) return error;
  const message = error instanceof Error ? error.message : "";
  if (message.includes("WORKSPACE_ROLE_DENIED")) {
    return new ConnectionError("WORKSPACE_ROLE_DENIED", 403);
  }
  if (message.includes("META_PERMISSION_DENIED")) {
    return new ConnectionError("META_PERMISSION_DENIED", 403);
  }
  if (message.includes("YOUTUBE_REFRESH_TOKEN_REQUIRED")) {
    return new ConnectionError("YOUTUBE_REFRESH_TOKEN_REQUIRED", 409);
  }
  if (message.includes("TIKTOK_REFRESH_TOKEN_REQUIRED")) {
    return new ConnectionError("TIKTOK_REFRESH_TOKEN_REQUIRED", 409);
  }
  if (message.includes("OAUTH_STATE_ALREADY_USED")) {
    return new ConnectionError("OAUTH_STATE_ALREADY_USED", 400);
  }
  if (message.includes("OAUTH_STATE_EXPIRED")) {
    return new ConnectionError("OAUTH_STATE_EXPIRED", 400);
  }
  if (message.includes("INVALID_OAUTH_STATE")) {
    return new ConnectionError("INVALID_OAUTH_STATE", 400);
  }
  if (
    message.includes("CONNECTION_SESSION_EXPIRED") ||
    message.includes("ALREADY_USED")
  ) {
    return new ConnectionError("CONNECTION_SESSION_EXPIRED", 410);
  }
  if (message.includes("CONNECTION_SESSION_NOT_FOUND")) {
    return new ConnectionError("CONNECTION_SESSION_NOT_FOUND", 404);
  }
  if (message.includes("SOCIAL_ACCOUNT_NOT_FOUND_OR_DENIED")) {
    return new ConnectionError("SOCIAL_ACCOUNT_NOT_FOUND", 404);
  }
  if (message.includes("RATE_LIMITED")) {
    return new ConnectionError("RATE_LIMITED", 429);
  }
  if (message.includes("UNSAFE_RETURN_PATH")) {
    return new ConnectionError("UNSAFE_RETURN_PATH", 400);
  }
  const mappings: Array<[string, ConnectionErrorCode, number]> = [
    [
      "YOUTUBE_REAUTHORIZATION_REQUIRED",
      "YOUTUBE_REAUTHORIZATION_REQUIRED",
      401,
    ],
    ["YOUTUBE_NO_CHANNEL", "YOUTUBE_NO_CHANNEL", 422],
    ["TIKTOK_REAUTHORIZATION_REQUIRED", "TIKTOK_REAUTHORIZATION_REQUIRED", 401],
    ["TIKTOK_REQUIRED_SCOPE_MISSING", "TIKTOK_REQUIRED_SCOPE_MISSING", 403],
    ["TIKTOK_OPEN_ID_MISMATCH", "TIKTOK_OPEN_ID_MISMATCH", 409],
    [
      "TIKTOK_CONNECTION_NO_LONGER_VALID",
      "TIKTOK_CONNECTION_NO_LONGER_VALID",
      409,
    ],
    ["TEAM_PERMISSION_DENIED", "TEAM_PERMISSION_DENIED", 403],
    ["ROLE_ASSIGNMENT_DENIED", "ROLE_ASSIGNMENT_DENIED", 403],
    ["INVALID_EMAIL", "INVALID_EMAIL", 400],
    ["INVITATION_ALREADY_PENDING", "INVITATION_ALREADY_PENDING", 409],
    ["USER_ALREADY_MEMBER", "USER_ALREADY_MEMBER", 409],
    ["MEMBER_REACTIVATION_REQUIRED", "MEMBER_REACTIVATION_REQUIRED", 409],
    ["INVITATION_NOT_FOUND", "INVITATION_NOT_FOUND", 404],
    ["INVITATION_NOT_PENDING", "INVITATION_NOT_PENDING", 409],
    ["INVITATION_RATE_LIMITED", "INVITATION_RATE_LIMITED", 429],
    ["EMAIL_INVITATION_FAILED", "EMAIL_INVITATION_FAILED", 502],
    ["UNSAFE_INVITATION_REDIRECT", "UNSAFE_INVITATION_REDIRECT", 500],
  ];
  for (const [marker, code, status] of mappings) {
    if (message.includes(marker)) return new ConnectionError(code, status);
  }
  return new ConnectionError("INTERNAL_ERROR", 500);
}
