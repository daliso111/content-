"use client";

import { CalendarClock, Copy, Pencil, Trash2, User2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PostStatusBadge } from "@/components/ui/StatusBadge";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { MediaThumbnail } from "@/components/media/MediaThumbnail";
import { Avatar } from "@/components/ui/Avatar";
import { SocialPreview } from "@/components/posts/SocialPreview";
import { PLATFORMS } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import type { SocialPost } from "@/types";

/** Read-only detail view of a post, used inside modals/side panels. */
export function PostDetail({
  post,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  post: SocialPost;
  onEdit?: (p: SocialPost) => void;
  onDuplicate?: (p: SocialPost) => void;
  onDelete?: (p: SocialPost) => void;
}) {
  const primaryPlatform = post.platforms[0] ?? "facebook";
  return (
    <div className="space-y-5">
      {/* Live preview on the primary platform */}
      <SocialPreview
        platform={primaryPlatform}
        caption={
          post.platformCaptions?.[primaryPlatform] ?? post.caption
        }
        media={post.media}
        accountName="Northwind Agency"
        handle="northwind.agency"
      />

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Detail label="Status">
          <PostStatusBadge status={post.status} />
        </Detail>
        <Detail label="Platforms">
          <div className="flex flex-wrap items-center gap-1.5">
            {post.platforms.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-xs font-medium text-ink"
              >
                <PlatformIcon platform={p} size="sm" />
                {PLATFORMS[p].label}
              </span>
            ))}
          </div>
        </Detail>
        <Detail label="Scheduled">
          <span className="flex items-center gap-1.5 text-sm text-ink">
            <CalendarClock className="h-4 w-4 text-ink-subtle" aria-hidden />
            {post.scheduledAt
              ? formatDateTime(post.scheduledAt)
              : "Not scheduled"}
          </span>
        </Detail>
        <Detail label="Created by">
          <span className="flex items-center gap-2 text-sm text-ink">
            <Avatar
              name={post.createdBy.name}
              color={post.createdBy.avatarColor}
              size="xs"
            />
            {post.createdBy.name}
          </span>
        </Detail>
      </dl>

      <div>
        <p className="label">Caption</p>
        <div className="rounded-xl border border-border bg-surface-muted/60 p-3 text-sm text-ink whitespace-pre-wrap">
          {post.caption}
        </div>
      </div>

      {post.media.length > 0 && (
        <div>
          <p className="label">Media ({post.media.length})</p>
          <div className="flex flex-wrap gap-2">
            {post.media.map((m) => (
              <MediaThumbnail key={m.id} item={m} className="h-16 w-16" />
            ))}
          </div>
        </div>
      )}

      {post.campaign && (
        <Detail label="Campaign">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-soft px-2 py-1 text-xs font-medium text-brand-text">
            <User2 className="h-3.5 w-3.5" aria-hidden />
            {post.campaign}
          </span>
        </Detail>
      )}

      {(onEdit || onDuplicate || onDelete) && <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {onEdit && <Button size="sm" onClick={() => onEdit(post)}>
          <Pencil className="h-4 w-4" aria-hidden /> Edit
        </Button>}
        {onDuplicate && <Button size="sm" variant="outline" onClick={() => onDuplicate(post)}>
          <Copy className="h-4 w-4" aria-hidden /> Duplicate
        </Button>}
        {onDelete && <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-danger hover:bg-danger-soft"
          onClick={() => onDelete(post)}
        >
          <Trash2 className="h-4 w-4" aria-hidden /> Delete
        </Button>}
      </div>}
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-subtle">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
