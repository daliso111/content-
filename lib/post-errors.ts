export type PostErrorCode =
  | "permission_denied"
  | "not_found"
  | "revision_conflict"
  | "invalid_schedule"
  | "invalid_platform"
  | "invalid_media"
  | "session_expired"
  | "network_error"
  | "unknown";

const MESSAGES: Record<PostErrorCode, string> = {
  permission_denied: "Your workspace role does not permit this post action.",
  not_found: "This post was not found or is no longer available.",
  revision_conflict: "Another workspace member saved changes first.",
  invalid_schedule: "Choose a valid future schedule with at least one platform and some content.",
  invalid_platform: "One or more platform settings are invalid.",
  invalid_media: "One or more media attachments are unavailable in this workspace.",
  session_expired: "Your session has expired. Sign in again and retry.",
  network_error: "The post operation was interrupted. Check your connection and retry.",
  unknown: "The post operation could not be completed.",
};

export class PostServiceError extends Error {
  constructor(public readonly code: PostErrorCode, message = MESSAGES[code]) {
    super(message);
    this.name = "PostServiceError";
  }
}

export class PostConflictError extends PostServiceError {
  constructor() {
    super("revision_conflict");
    this.name = "PostConflictError";
  }
}

function errorDetails(error: unknown): { code: string; message: string } {
  if (error instanceof Error) return { code: "", message: error.message.toLowerCase() };
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    return {
      code: typeof record.code === "string" ? record.code : "",
      message: typeof record.message === "string" ? record.message.toLowerCase() : "",
    };
  }
  return { code: "", message: "" };
}

export function mapPostError(error: unknown): PostServiceError {
  if (error instanceof PostServiceError) return error;
  const details = errorDetails(error);
  if (details.code === "40001" || details.message.includes("post_revision_conflict")) {
    return new PostConflictError();
  }
  if (details.code === "P0002" || details.message.includes("not found")) {
    return new PostServiceError("not_found");
  }
  if (details.code === "42501" || details.message.includes("permission") || details.message.includes("cannot")) {
    return new PostServiceError("permission_denied");
  }
  if (details.message.includes("scheduled") || details.message.includes("future publishing time")) {
    return new PostServiceError("invalid_schedule");
  }
  if (details.message.includes("platform")) return new PostServiceError("invalid_platform");
  if (details.message.includes("media asset") || details.message.includes("workspace")) {
    return new PostServiceError("invalid_media");
  }
  if (details.message.includes("jwt") || details.message.includes("session") || details.code === "401") {
    return new PostServiceError("session_expired");
  }
  if (details.message.includes("fetch") || details.message.includes("network")) {
    return new PostServiceError("network_error");
  }
  return new PostServiceError("unknown");
}

export function getPostErrorMessage(error: unknown): string {
  return mapPostError(error).message;
}
