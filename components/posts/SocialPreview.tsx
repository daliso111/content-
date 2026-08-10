import {
  Bookmark,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Music2,
  Repeat2,
  Send,
  Share,
  ThumbsUp,
  Play,
} from "lucide-react";
import { MediaThumbnail } from "@/components/media/MediaThumbnail";
import { PlatformGlyph } from "@/components/ui/PlatformIcon";
import { PLATFORMS } from "@/lib/constants";
import {
  findYouTubePreviewVideo,
  formatPrivacyStatus,
  YOUTUBE_VIDEO_PREVIEW_MESSAGE,
} from "@/lib/live-preview";
import type { MediaItem, SocialPlatform } from "@/types";

export interface PreviewProps {
  platform: SocialPlatform;
  caption: string;
  media: MediaItem[];
  accountName: string;
  handle: string | null;
  avatarUrl?: string | null;
  title?: string;
  privacyStatus?: string;
}

/** Renders a realistic mock of how a post appears on the given platform. */
export function SocialPreview(props: PreviewProps) {
  switch (props.platform) {
    case "instagram":
      return <InstagramPreview {...props} />;
    case "facebook":
      return <FacebookPreview {...props} />;
    case "youtube":
      return <YouTubePreview {...props} />;
    case "linkedin":
      return <LinkedInPreview {...props} />;
    case "tiktok":
      return <TikTokPreview {...props} />;
    case "x":
      return <XPreview {...props} />;
    default:
      return <FacebookPreview {...props} />;
  }
}

function YouTubePreview({
  caption,
  media,
  accountName,
  handle,
  avatarUrl,
  title,
  privacyStatus,
}: PreviewProps) {
  const video = findYouTubePreviewVideo(media);
  return (
    <Frame>
      <div className="relative aspect-video bg-slate-900">
        {video ? (
          <MediaBlock media={[video]} aspect="aspect-video" />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-300">
            {YOUTUBE_VIDEO_PREVIEW_MESSAGE}
          </div>
        )}
        {video && (
          <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white">
            <Play className="h-5 w-5 fill-current" aria-hidden />
          </span>
        )}
      </div>
      <div className="space-y-2 p-3">
        <p className="line-clamp-2 text-base font-semibold">
          {title?.trim() || "Add a title to preview your YouTube post."}
        </p>
        <div className="flex items-center gap-2">
          <AccountAvatar platform="youtube" accountName={accountName} avatarUrl={avatarUrl} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{accountName}</p>
            {handle && <p className="truncate text-xs text-slate-500">@{handle}</p>}
          </div>
        </div>
        <p className="line-clamp-3 whitespace-pre-wrap break-words rounded-lg bg-slate-100 p-2 text-xs">
          {caption || "No description added."}
        </p>
        <p className="text-xs font-medium text-slate-500">
          Visibility: {formatPrivacyStatus(privacyStatus ?? "private")}
        </p>
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-sm overflow-hidden rounded-2xl border border-border bg-white text-[13px] text-slate-900 shadow-card">
      {children}
    </div>
  );
}

function AccountAvatar({
  platform,
  accountName,
  avatarUrl,
}: {
  platform: SocialPlatform;
  accountName: string;
  avatarUrl?: string | null;
}) {
  const meta = PLATFORMS[platform];
  if (avatarUrl) {
    return (
      <div
        role="img"
        aria-label={`${accountName} profile image`}
        className="h-9 w-9 shrink-0 rounded-full bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${JSON.stringify(avatarUrl)})` }}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={`${accountName} profile image unavailable`}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
      style={{ backgroundColor: meta.color }}
    >
      <PlatformGlyph platform={platform} size="sm" />
    </div>
  );
}

function MediaBlock({
  media,
  aspect = "aspect-[4/5]",
}: {
  media: MediaItem[];
  aspect?: string;
}) {
  if (media.length === 0) return null;
  return (
    <MediaThumbnail item={media[0]} rounded="rounded-none" className={aspect} />
  );
}

/* ----------------------------------------------------------- Instagram */
function InstagramPreview({ caption, media, accountName, handle, avatarUrl }: PreviewProps) {
  return (
    <Frame>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <AccountAvatar platform="instagram" accountName={accountName} avatarUrl={avatarUrl} />
        <span className="font-semibold">{handle || accountName}</span>
        <MoreHorizontal className="ml-auto h-4 w-4 text-slate-500" aria-hidden />
      </div>
      {media.length > 0 ? (
        <MediaBlock media={media} aspect="aspect-square" />
      ) : (
        <div className="flex aspect-square items-center justify-center bg-slate-100 text-xs text-slate-400">
          No media added
        </div>
      )}
      <div className="flex items-center gap-4 px-3 pt-2.5">
        <Heart className="h-5 w-5" aria-hidden />
        <MessageCircle className="h-5 w-5" aria-hidden />
        <Send className="h-5 w-5" aria-hidden />
        <Bookmark className="ml-auto h-5 w-5" aria-hidden />
      </div>
      <div className="px-3 pb-3 pt-2">
        <p className="whitespace-pre-wrap break-words">
          <span className="font-semibold">{handle || accountName} </span>
          {caption || "Your caption preview will appear here…"}
        </p>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------ Facebook */
function FacebookPreview({ caption, media, accountName, avatarUrl }: PreviewProps) {
  return (
    <Frame>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <AccountAvatar platform="facebook" accountName={accountName} avatarUrl={avatarUrl} />
        <div>
          <p className="font-semibold leading-tight">{accountName}</p>
          <p className="text-xs text-slate-500">Just now</p>
        </div>
        <MoreHorizontal className="ml-auto h-4 w-4 text-slate-500" aria-hidden />
      </div>
      <p className="whitespace-pre-wrap break-words px-3 pb-2.5">
        {caption || "Your caption preview will appear here…"}
      </p>
      {media.length > 0 ? (
        <MediaBlock media={media} aspect="aspect-[1.91/1]" />
      ) : (
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-5 text-center text-xs text-slate-400">
          No media selected. Facebook can preview this as a text-only post.
        </div>
      )}
      <div className="grid grid-cols-3 border-t border-slate-100 py-1 text-slate-500">
        <button className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium">
          <ThumbsUp className="h-4 w-4" aria-hidden /> Like
        </button>
        <button className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium">
          <MessageCircle className="h-4 w-4" aria-hidden /> Comment
        </button>
        <button className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium">
          <Share className="h-4 w-4" aria-hidden /> Share
        </button>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------ LinkedIn */
function LinkedInPreview({ caption, media, accountName, avatarUrl }: PreviewProps) {
  return (
    <Frame>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <AccountAvatar platform="linkedin" accountName={accountName} avatarUrl={avatarUrl} />
        <div>
          <p className="font-semibold leading-tight">{accountName}</p>
          <p className="text-xs text-slate-500">
            1,204 followers · Promoted
          </p>
        </div>
        <MoreHorizontal className="ml-auto h-4 w-4 text-slate-500" aria-hidden />
      </div>
      <p className="whitespace-pre-wrap break-words px-3 pb-2.5">
        {caption || "Your caption preview will appear here…"}
      </p>
      <MediaBlock media={media} aspect="aspect-[1.91/1]" />
      <div className="flex items-center justify-around border-t border-slate-100 py-1 text-slate-500">
        <button className="flex items-center gap-1.5 py-1.5 text-xs font-medium">
          <ThumbsUp className="h-4 w-4" aria-hidden /> Like
        </button>
        <button className="flex items-center gap-1.5 py-1.5 text-xs font-medium">
          <MessageCircle className="h-4 w-4" aria-hidden /> Comment
        </button>
        <button className="flex items-center gap-1.5 py-1.5 text-xs font-medium">
          <Repeat2 className="h-4 w-4" aria-hidden /> Repost
        </button>
        <button className="flex items-center gap-1.5 py-1.5 text-xs font-medium">
          <Send className="h-4 w-4" aria-hidden /> Send
        </button>
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------- TikTok */
function TikTokPreview({ caption, media, handle, accountName }: PreviewProps) {
  return (
    <Frame>
      <div className="relative aspect-[9/16] bg-slate-900">
        {media.length > 0 ? (
          <MediaThumbnail
            item={media[0]}
            rounded="rounded-none"
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            No video added
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-white">
          <p className="font-semibold">@{handle || accountName}</p>
          <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-xs">
            {caption || "Your caption preview will appear here…"}
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs">
            <Music2 className="h-3.5 w-3.5" aria-hidden /> original sound
          </p>
        </div>
        <div className="absolute bottom-4 right-2 flex flex-col items-center gap-3 text-white">
          <Heart className="h-6 w-6" aria-hidden />
          <MessageCircle className="h-6 w-6" aria-hidden />
          <Bookmark className="h-6 w-6" aria-hidden />
          <Share className="h-6 w-6" aria-hidden />
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------- X */
function XPreview({ caption, media, accountName, handle, avatarUrl }: PreviewProps) {
  return (
    <Frame>
      <div className="flex gap-2.5 p-3">
        <AccountAvatar platform="x" accountName={accountName} avatarUrl={avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5">
            <span className="font-semibold">{accountName}</span>
            <span className="text-slate-500">@{handle || "handle"} · 1m</span>
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words">
            {caption || "Your caption preview will appear here…"}
          </p>
          {media.length > 0 && (
            <div className="mt-2.5 overflow-hidden rounded-2xl border border-slate-200">
              <MediaBlock media={media} aspect="aspect-[1.91/1]" />
            </div>
          )}
          <div className="mt-3 flex items-center justify-between pr-6 text-slate-500">
            <MessageCircle className="h-4 w-4" aria-hidden />
            <Repeat2 className="h-4 w-4" aria-hidden />
            <Heart className="h-4 w-4" aria-hidden />
            <Share className="h-4 w-4" aria-hidden />
          </div>
        </div>
      </div>
    </Frame>
  );
}
