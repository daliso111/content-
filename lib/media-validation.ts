import type { MediaType } from "@/types";
import { StorageServiceError } from "@/lib/storage-errors";

export const MEDIA_BUCKET = "postflow-media";
export const STANDARD_UPLOAD_LIMIT = 6 * 1024 * 1024;
export const MAX_BATCH_FILES = 10;
export const MAX_BATCH_SIZE = 100 * 1024 * 1024;
export const MEDIA_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.gif,.avif,.mp4,.webm,.mov,.pdf,image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime,application/pdf";

const MIME_EXTENSIONS: Record<string, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/gif": ["gif"],
  "image/avif": ["avif"],
  "video/mp4": ["mp4"],
  "video/webm": ["webm"],
  "video/quicktime": ["mov"],
  "application/pdf": ["pdf"],
};

function extensionOf(fileName: string): string {
  const safeName = fileName.split(/[\\/]/).pop() ?? "";
  const lastDot = safeName.lastIndexOf(".");
  return lastDot > 0 ? safeName.slice(lastDot + 1).toLowerCase() : "";
}

export function mediaTypeForMime(mimeType: string): MediaType {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "document";
  throw new StorageServiceError("unsupported_type");
}

export function validateMediaFile(file: File): void {
  const allowedExtensions = MIME_EXTENSIONS[file.type];
  if (!allowedExtensions || !allowedExtensions.includes(extensionOf(file.name))) {
    throw new StorageServiceError(
      "unsupported_type",
      `${file.name} has an unsupported or mismatched file type.`,
    );
  }

  const limit = file.type.startsWith("image/")
    ? 10 * 1024 * 1024
    : file.type.startsWith("video/")
      ? 50 * 1024 * 1024
      : 20 * 1024 * 1024;
  if (file.size > limit) {
    throw new StorageServiceError(
      "file_too_large",
      `${file.name} exceeds its ${limit / 1024 / 1024} MB limit.`,
    );
  }
}

export function validateMediaBatch(files: File[]): void {
  if (files.length === 0) return;
  if (files.length > MAX_BATCH_FILES) {
    throw new StorageServiceError(
      "batch_too_large",
      `Choose no more than ${MAX_BATCH_FILES} files at once.`,
    );
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_BATCH_SIZE) {
    throw new StorageServiceError(
      "batch_too_large",
      "The combined upload size cannot exceed 100 MB.",
    );
  }
}

export function sanitizeFileName(fileName: string): string {
  const originalName = fileName.split(/[\\/]/).pop() ?? "file";
  const extension = extensionOf(originalName);
  const stem = extension
    ? originalName.slice(0, -(extension.length + 1))
    : originalName;
  const safeStem = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || "file";
  return extension ? `${safeStem}.${extension}` : safeStem;
}

export function createMediaObjectPath(
  workspaceId: string,
  userId: string,
  fileName: string,
  now = new Date(),
): string {
  const year = String(now.getUTCFullYear()).padStart(4, "0");
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${workspaceId}/${userId}/${year}/${month}/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`;
}

export function validateMediaClassification(
  mimeType: string,
  mediaType: MediaType,
): void {
  if ((mediaType === "graphic" || mediaType === "logo") && !mimeType.startsWith("image/")) {
    throw new StorageServiceError("unsupported_type");
  }
  if (mediaType === "video" && !mimeType.startsWith("video/")) {
    throw new StorageServiceError("unsupported_type");
  }
  if (mediaType === "document" && mimeType !== "application/pdf") {
    throw new StorageServiceError("unsupported_type");
  }
}
