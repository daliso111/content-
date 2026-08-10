export type StorageErrorCode =
  | "unsupported_type"
  | "file_too_large"
  | "batch_too_large"
  | "bucket_missing"
  | "permission_denied"
  | "invalid_path"
  | "duplicate_object"
  | "session_expired"
  | "network_error"
  | "metadata_failed"
  | "signed_url_failed"
  | "delete_denied"
  | "media_in_use"
  | "upload_cancelled"
  | "unknown";

const MESSAGES: Record<StorageErrorCode, string> = {
  unsupported_type: "This file type is not supported.",
  file_too_large: "This file exceeds the allowed size.",
  batch_too_large: "This upload batch exceeds the allowed file count or total size.",
  bucket_missing: "Media storage is not configured for this project.",
  permission_denied: "Your workspace role does not permit this action.",
  invalid_path: "The media destination is invalid. Refresh and try again.",
  duplicate_object: "A file already exists at this destination. Retry the upload.",
  session_expired: "Your session has expired. Sign in again and retry.",
  network_error: "The upload was interrupted. Check your connection and retry.",
  metadata_failed: "The file uploaded, but its media record could not be saved.",
  signed_url_failed: "A private preview could not be generated.",
  delete_denied: "This media item could not be deleted with your current permissions.",
  media_in_use: "This media item is used by a post and cannot be deleted.",
  upload_cancelled: "The upload was cancelled.",
  unknown: "The media operation could not be completed.",
};

export class StorageServiceError extends Error {
  constructor(
    public readonly code: StorageErrorCode,
    message = MESSAGES[code],
  ) {
    super(message);
    this.name = "StorageServiceError";
  }
}

export function mapStorageError(
  error: unknown,
  fallback: StorageErrorCode = "unknown",
): StorageServiceError {
  if (error instanceof StorageServiceError) return error;
  const raw = error instanceof Error ? error.message.toLowerCase() : "";
  if (raw.includes("bucket") && (raw.includes("not found") || raw.includes("does not exist"))) {
    return new StorageServiceError("bucket_missing");
  }
  if (raw.includes("duplicate") || raw.includes("already exists") || raw.includes("409")) {
    return new StorageServiceError("duplicate_object");
  }
  if (raw.includes("jwt") || raw.includes("session") || raw.includes("401")) {
    return new StorageServiceError("session_expired");
  }
  if (raw.includes("permission") || raw.includes("policy") || raw.includes("403")) {
    return new StorageServiceError(
      fallback === "delete_denied" ? "delete_denied" : "permission_denied",
    );
  }
  if (raw.includes("network") || raw.includes("fetch") || raw.includes("offline")) {
    return new StorageServiceError("network_error");
  }
  if (raw.includes("used by a post") || raw.includes("23503")) {
    return new StorageServiceError("media_in_use");
  }
  return new StorageServiceError(fallback);
}

export function getStorageErrorMessage(error: unknown): string {
  return mapStorageError(error).message;
}
