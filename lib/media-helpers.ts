import type { MediaItem, MediaType } from "@/types";
import { makeId } from "./utils";

const GRADIENTS = [
  "linear-gradient(135deg,#6366F1,#8B5CF6)",
  "linear-gradient(135deg,#0EA5E9,#22D3EE)",
  "linear-gradient(135deg,#F59E0B,#F97316)",
  "linear-gradient(135deg,#EC4899,#F472B6)",
  "linear-gradient(135deg,#10B981,#34D399)",
];

/** Map a browser File extension to our MediaType taxonomy. */
function typeFromFile(file: File): MediaType {
  if (file.type.startsWith("video/")) return "video";
  if (file.type === "application/pdf") return "document";
  if (file.type === "image/svg+xml") return "graphic";
  return "image";
}

/**
 * Convert a locally-selected File into a MediaItem for preview purposes.
 * Images/videos get an object URL so they render in the browser; no upload
 * happens. Remember to call `revokeMedia` when removing the item.
 */
export function fileToMediaItem(file: File): MediaItem {
  const type = typeFromFile(file);
  const previewable = type === "image" || type === "video";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "file";
  return {
    id: makeId("upload"),
    name: file.name,
    type,
    format: ext,
    size: file.size,
    thumbnailColor: GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)],
    thumbnailUrl:
      previewable && typeof URL !== "undefined"
        ? URL.createObjectURL(file)
        : undefined,
    uploadedAt: new Date().toISOString(),
    usedInPosts: 0,
  };
}

/** Release an object URL created by `fileToMediaItem`. */
export function revokeMedia(item: MediaItem): void {
  if (item.thumbnailUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(item.thumbnailUrl);
  }
}
