import { FileText, Film, ImageIcon, Play, Shapes } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaItem, MediaType } from "@/types";

const TYPE_ICON: Record<MediaType, typeof ImageIcon> = {
  image: ImageIcon,
  video: Film,
  graphic: Shapes,
  logo: Shapes,
  document: FileText,
};

/**
 * Renders a media item's placeholder preview using its gradient token.
 * A real thumbnail URL (once storage is connected) takes precedence.
 */
export function MediaThumbnail({
  item,
  className,
  rounded = "rounded-xl",
}: {
  item: MediaItem;
  className?: string;
  rounded?: string;
}) {
  const Icon = TYPE_ICON[item.type];
  const showImage =
    item.thumbnailUrl && ["image", "graphic", "logo"].includes(item.type);
  const showVideo = item.thumbnailUrl && item.type === "video";
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-surface-muted",
        rounded,
        className,
      )}
      style={showImage || showVideo ? undefined : { background: item.thumbnailColor }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbnailUrl}
          alt={item.name}
          className="h-full w-full object-cover"
        />
      ) : showVideo ? (
        <video
          src={item.thumbnailUrl}
          aria-label={item.name}
          className="h-full w-full object-cover"
          preload="metadata"
          muted
          playsInline
        />
      ) : (
        <Icon className="h-1/3 w-1/3 max-h-8 max-w-8 text-white/70" aria-hidden />
      )}
      {item.type === "video" && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
            <Play className="h-4 w-4 fill-white text-white" aria-hidden />
          </span>
        </span>
      )}
      {item.type === "video" && item.durationSeconds && (
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {formatDuration(item.durationSeconds)}
        </span>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}
