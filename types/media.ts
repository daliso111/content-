export type MediaType = "image" | "video" | "graphic" | "logo" | "document";

export interface MediaItem {
  id: string;
  name: string;
  type: MediaType;
  /** MIME-ish extension label, e.g. "jpg", "mp4", "pdf". */
  format: string;
  /** Size in bytes. */
  size: number;
  /** Placeholder preview — a gradient token or (later) a storage URL. */
  thumbnailColor: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  uploadedAt: string; // ISO date
  usedInPosts: number;
}

export interface MediaAssetPresentation {
  asset: import("./database.generated").Tables<"media_assets">;
  signedUrl: string | null;
  signedUrlExpiresAt: string | null;
  uploadedByName: string | null;
  usedInPosts: number;
}

export type MediaUploadState = "queued" | "uploading" | "complete" | "failed" | "cancelled";

export interface MediaUploadQueueItem {
  id: string;
  file: File;
  progress: number;
  state: MediaUploadState;
  error: string | null;
}
