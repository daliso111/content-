"use client";

import {
  Copy,
  MoreVertical,
  Pencil,
  Eye,
  CalendarClock,
  Trash2,
  ImageOff,
  XCircle,
  Activity,
  ShieldCheck,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { PostStatusBadge } from "@/components/ui/StatusBadge";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { MediaThumbnail } from "@/components/media/MediaThumbnail";
import { Checkbox } from "@/components/ui/Field";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime, truncate } from "@/lib/utils";
import type { ApprovalRequestWithRelations, SocialPost } from "@/types";

export function PostCard({
  post,
  onPreview,
  onEdit,
  onDuplicate,
  onReschedule,
  onCancelSchedule,
  onDelete,
  onPublishingDetails,
  approval,
  onApprovalDetails,
  selected,
  onSelect,
}: {
  post: SocialPost;
  onPreview?: (p: SocialPost) => void;
  onEdit?: (p: SocialPost) => void;
  onDuplicate?: (p: SocialPost) => void;
  onReschedule?: (p: SocialPost) => void;
  onCancelSchedule?: (p: SocialPost) => void;
  onDelete?: (p: SocialPost) => void;
  onPublishingDetails?: (p: SocialPost) => void;
  approval?: ApprovalRequestWithRelations | null;
  onApprovalDetails?: (p: SocialPost) => void;
  selected?: boolean;
  onSelect?: (checked: boolean) => void;
}) {
  const scheduleLabel = post.scheduledAt
    ? formatDateTime(post.scheduledAt)
    : post.publishedAt
      ? formatDateTime(post.publishedAt)
      : "Not scheduled";

  return (
    <Card className="group flex flex-col overflow-hidden transition-shadow hover:shadow-card-hover">
      <div className="relative">
        {post.media.length > 0 ? (
          <MediaThumbnail
            item={post.media[0]}
            rounded="rounded-none"
            className="aspect-[16/10] w-full"
          />
        ) : (
          <div className="flex aspect-[16/10] w-full items-center justify-center bg-surface-muted text-ink-subtle">
            <ImageOff className="h-7 w-7" aria-hidden />
          </div>
        )}
        {onSelect && (
          <div className="absolute left-3 top-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 shadow-sm">
              <Checkbox
                checked={selected}
                onChange={(e) => onSelect(e.target.checked)}
                aria-label={`Select post: ${truncate(post.caption, 30)}`}
              />
            </span>
          </div>
        )}
        <div className="absolute right-3 top-3">
          <PostStatusBadge status={post.status} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-center gap-1.5">
          {post.platforms.map((p) => (
            <PlatformIcon key={p} platform={p} size="sm" />
          ))}
        </div>
        <p className="flex-1 text-sm text-ink">{truncate(post.caption, 96)}</p>
        {approval && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={approval.request.status === "approved" && !approval.stale ? "success" : approval.request.status === "rejected" ? "danger" : "warning"}>
              {approval.request.status.replaceAll("_", " ")}
            </Badge>
            {approval.stale && <Badge tone="danger">Stale</Badge>}
            {approval.overdue && <Badge tone="danger">Overdue</Badge>}
          </div>
        )}
        <div className="mt-3 flex items-center gap-2 text-xs text-ink-muted">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden />
          {scheduleLabel}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <span className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Avatar
              name={post.createdBy.name}
              color={post.createdBy.avatarColor}
              size="xs"
            />
            {post.createdBy.name.split(" ")[0]}
          </span>
          <div className="flex items-center gap-1">
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(post)}
                aria-label="Edit post"
                className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
              >
                <Pencil className="h-4 w-4" aria-hidden />
              </button>
            )}
            {(onPreview || onEdit || onDuplicate || onReschedule || onCancelSchedule || onDelete || onPublishingDetails || onApprovalDetails) && <Dropdown
              trigger={
                <span
                  className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                  aria-label="More options"
                >
                  <MoreVertical className="h-4 w-4" aria-hidden />
                </span>
              }
              items={[
                ...(onPreview ? [{ label: "Preview", icon: <Eye />, onClick: () => onPreview(post) }] : []),
                ...(onPublishingDetails ? [{ label: "Publishing details", icon: <Activity />, onClick: () => onPublishingDetails(post) }] : []),
                ...(onApprovalDetails ? [{ label: approval ? "View approval" : "Submit for approval", icon: <ShieldCheck />, onClick: () => onApprovalDetails(post) }] : []),
                ...(onEdit ? [{ label: "Edit", icon: <Pencil />, onClick: () => onEdit(post) }] : []),
                ...(onDuplicate ? [{
                  label: "Duplicate",
                  icon: <Copy />,
                  onClick: () => onDuplicate(post),
                }] : []),
                ...(onReschedule ? [{
                  label: "Reschedule",
                  icon: <CalendarClock />,
                  onClick: () => onReschedule(post),
                }] : []),
                ...(onCancelSchedule ? [{
                  label: "Cancel schedule",
                  icon: <XCircle />,
                  onClick: () => onCancelSchedule(post),
                }] : []),
                ...(onDelete ? [{
                  label: "Delete",
                  icon: <Trash2 />,
                  destructive: true,
                  separated: true,
                  onClick: () => onDelete(post),
                }] : []),
              ]}
            />}
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Compact horizontal post row used in the dashboard "upcoming" list. */
export function UpcomingPostRow({
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
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:bg-surface-muted/60">
      {post.media.length > 0 ? (
        <MediaThumbnail item={post.media[0]} className="h-12 w-12 shrink-0" />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-ink-subtle">
          <ImageOff className="h-4 w-4" aria-hidden />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {truncate(post.caption, 60)}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
          <span className="flex items-center gap-1">
            {post.platforms.map((p) => (
              <PlatformIcon key={p} platform={p} size="sm" />
            ))}
          </span>
          <span aria-hidden>·</span>
          <span>
            {post.scheduledAt ? formatDateTime(post.scheduledAt) : "Draft"}
          </span>
        </div>
      </div>
      <PostStatusBadge status={post.status} />
      {(onEdit || onDuplicate || onDelete) && <div className="hidden items-center gap-1 sm:flex">
        {onEdit && <button
          type="button"
          onClick={() => onEdit(post)}
          aria-label="Edit post"
          className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-surface hover:text-ink"
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </button>}
        <Dropdown
          trigger={
            <span
              className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-surface hover:text-ink"
              aria-label="More options"
            >
              <MoreVertical className="h-4 w-4" aria-hidden />
            </span>
          }
          items={[
            ...(onEdit ? [{ label: "Edit", icon: <Pencil />, onClick: () => onEdit(post) }] : []),
            ...(onDuplicate ? [{
              label: "Duplicate",
              icon: <Copy />,
              onClick: () => onDuplicate(post),
            }] : []),
            ...(onDelete ? [{
              label: "Delete",
              icon: <Trash2 />,
              destructive: true,
              separated: true,
              onClick: () => onDelete(post),
            }] : []),
          ]}
        />
      </div>}
    </div>
  );
}
