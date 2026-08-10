"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Download,
  HardDrive,
  ImageIcon,
  LayoutGrid,
  List,
  MoreVertical,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { MediaThumbnail } from "@/components/media/MediaThumbnail";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterSelect, SegmentedControl } from "@/components/ui/FilterSelect";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { UploadArea } from "@/components/ui/UploadArea";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/hooks/useWorkspace";
import { MEDIA_TYPE_META } from "@/lib/constants";
import { MEDIA_ACCEPT, validateMediaBatch } from "@/lib/media-validation";
import {
  cancelUpload,
  createMediaSignedUrl,
  deleteMediaAsset,
  getWorkspaceMediaUsage,
  listMediaAssets,
  toMediaItem,
  uploadMediaFile,
  type WorkspaceMediaUsage,
} from "@/lib/services/storage-service";
import { getStorageErrorMessage } from "@/lib/storage-errors";
import { cn, formatBytes, formatDate } from "@/lib/utils";
import type {
  MediaAssetPresentation,
  MediaType,
  MediaUploadQueueItem,
} from "@/types";

type ViewMode = "grid" | "list";
const PAGE_SIZE = 20;
const UPLOAD_ROLES = ["owner", "administrator", "content_manager", "designer"];
const MANAGER_ROLES = ["owner", "administrator", "content_manager"];

export default function MediaPage() {
  const toast = useToast();
  const { user } = useAuth();
  const { activeWorkspace, activeMembership, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const [items, setItems] = useState<MediaAssetPresentation[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<MediaType | "all">("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [view, setView] = useState<ViewMode>("grid");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [usage, setUsage] = useState<WorkspaceMediaUsage>({ bytes: 0, itemCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<MediaAssetPresentation | null>(null);
  const [toDelete, setToDelete] = useState<MediaAssetPresentation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [queue, setQueue] = useState<MediaUploadQueueItem[]>([]);

  const role = activeMembership?.role;
  const canUpload = !!role && UPLOAD_ROLES.includes(role);
  const canDelete = useCallback(
    (item: MediaAssetPresentation) =>
      !!role &&
      (MANAGER_ROLES.includes(role) ||
        (role === "designer" && item.asset.uploaded_by === user?.id)),
    [role, user?.id],
  );

  const uploadedAfter = useMemo(() => {
    if (dateFilter === "all") return null;
    const date = new Date();
    date.setDate(date.getDate() - Number(dateFilter));
    return date.toISOString();
  }, [dateFilter]);

  const load = useCallback(async () => {
    if (!activeWorkspace) {
      setItems([]);
      setLoading(!workspaceError);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [mediaPage, mediaUsage] = await Promise.all([
        listMediaAssets(activeWorkspace.id, {
          page,
          pageSize: PAGE_SIZE,
          search: query,
          mediaType: type,
          uploadedAfter,
        }),
        getWorkspaceMediaUsage(activeWorkspace.id),
      ]);
      setItems(mediaPage.items);
      setTotal(mediaPage.total);
      setUsage(mediaUsage);
    } catch (loadError) {
      setError(getStorageErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, page, query, type, uploadedAfter, workspaceError]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  useEffect(() => {
    if (!activeWorkspace) return;
    const timer = window.setInterval(() => void load(), 55 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [activeWorkspace, load]);

  useEffect(() => setPage(1), [query, type, dateFilter, activeWorkspace?.id]);

  const updateQueue = useCallback(
    (id: string, update: Partial<MediaUploadQueueItem>) =>
      setQueue((current) =>
        current.map((item) => (item.id === id ? { ...item, ...update } : item)),
      ),
    [],
  );

  const runUpload = useCallback(
    async (queueItem: MediaUploadQueueItem) => {
      if (!activeWorkspace) return;
      updateQueue(queueItem.id, { state: "uploading", progress: 0, error: null });
      try {
        await uploadMediaFile(activeWorkspace.id, queueItem.file, {
          uploadId: queueItem.id,
          onProgress: (progress) => updateQueue(queueItem.id, { progress }),
        });
        updateQueue(queueItem.id, { state: "complete", progress: 100 });
        toast.success("Media uploaded", `${queueItem.file.name} is saved to ${activeWorkspace.name}.`);
        await load();
      } catch (uploadError) {
        const message = getStorageErrorMessage(uploadError);
        updateQueue(queueItem.id, {
          state: message.toLowerCase().includes("cancel") ? "cancelled" : "failed",
          error: message,
        });
        toast.error("Upload failed", message);
      }
    },
    [activeWorkspace, load, toast, updateQueue],
  );

  const handleUpload = (files: File[]) => {
    try {
      validateMediaBatch(files);
    } catch (batchError) {
      toast.error("Files not accepted", getStorageErrorMessage(batchError));
      return;
    }
    const next = files.map<MediaUploadQueueItem>((file) => ({
      id: crypto.randomUUID(),
      file,
      progress: 0,
      state: "queued",
      error: null,
    }));
    setQueue((current) => [...next, ...current]);
    for (const queueItem of next) void runUpload(queueItem);
  };

  const requestDelete = (item: MediaAssetPresentation) => {
    if (item.usedInPosts > 0) {
      toast.error(
        "Media is in use",
        `This file is linked to ${item.usedInPosts} post${item.usedInPosts === 1 ? "" : "s"}. Remove those links first.`,
      );
      return;
    }
    setToDelete(item);
  };

  const remove = async () => {
    if (!toDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteMediaAsset(toDelete.asset);
      toast.success("Media deleted", `${toDelete.asset.file_name} was removed from the workspace.`);
      setDetail(null);
      setToDelete(null);
    } catch (deleteError) {
      toast.error("Delete failed", getStorageErrorMessage(deleteError));
    } finally {
      setDeleting(false);
      await load();
    }
  };

  const copyTemporaryLink = async (item: MediaAssetPresentation) => {
    try {
      const url = await createMediaSignedUrl(item.asset);
      await navigator.clipboard.writeText(url);
      toast.success("Temporary link copied", "The private link expires in one hour.");
    } catch (signedError) {
      toast.error("Link unavailable", getStorageErrorMessage(signedError));
    }
  };

  const download = async (item: MediaAssetPresentation) => {
    try {
      const url = await createMediaSignedUrl(item.asset);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = item.asset.file_name;
      anchor.rel = "noreferrer";
      anchor.click();
    } catch (signedError) {
      toast.error("Download unavailable", getStorageErrorMessage(signedError));
    }
  };

  const typeCounts = useMemo(() => {
    const counts: Partial<Record<MediaType, number>> = {};
    for (const item of items) {
      counts[item.asset.media_type] = (counts[item.asset.media_type] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  if (workspaceError || (!workspaceLoading && !activeWorkspace)) {
    return (
      <EmptyState
        icon={HardDrive}
        title="Workspace unavailable"
        description={workspaceError ?? "No active workspace is available for this account."}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Media Library"
        description="Organise the private media saved in your active workspace."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void load()} aria-label="Refresh media">
              <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
            </Button>
            {canUpload && (
              <Button onClick={() => setShowUpload(true)}>
                <UploadCloud className="h-4 w-4" aria-hidden /> Upload Media
              </Button>
            )}
          </div>
        }
      />

      {!canUpload && !workspaceLoading && (
        <div className="rounded-lg border border-info/30 bg-info-soft px-4 py-3 text-sm text-ink-muted">
          Your {role?.replace("_", " ")} role has read-only access to workspace media.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-text">
              <HardDrive className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Workspace media used</p>
              <p className="text-xs text-ink-subtle">
                {formatBytes(usage.bytes)} across {usage.itemCount} item{usage.itemCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <p className="mb-3 text-sm font-semibold text-ink">Categories on this page</p>
          <div className="flex flex-wrap gap-2">
            <CategoryButton active={type === "all"} onClick={() => setType("all")}>
              All ({type === "all" ? total : items.length})
            </CategoryButton>
            {(Object.keys(MEDIA_TYPE_META) as MediaType[]).map((mediaType) => (
              <CategoryButton
                key={mediaType}
                active={type === mediaType}
                onClick={() => setType(mediaType)}
              >
                {MEDIA_TYPE_META[mediaType].label} ({typeCounts[mediaType] ?? 0})
              </CategoryButton>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput value={query} onChange={setQuery} placeholder="Search media…" className="lg:max-w-xs" />
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            label="Type"
            value={type}
            onChange={(value) => setType(value as MediaType | "all")}
            options={[
              { value: "all", label: "All" },
              ...(Object.keys(MEDIA_TYPE_META) as MediaType[]).map((mediaType) => ({
                value: mediaType,
                label: MEDIA_TYPE_META[mediaType].label,
              })),
            ]}
          />
          <FilterSelect
            label="Uploaded"
            value={dateFilter}
            onChange={setDateFilter}
            options={[
              { value: "all", label: "Any time" },
              { value: "7", label: "Last 7 days" },
              { value: "30", label: "Last 30 days" },
              { value: "90", label: "Last 90 days" },
            ]}
          />
          <SegmentedControl
            value={view}
            onChange={setView}
            options={[
              { value: "grid", label: "Grid", icon: <LayoutGrid className="h-4 w-4" /> },
              { value: "list", label: "List", icon: <List className="h-4 w-4" /> },
            ]}
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="aspect-square w-full" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={HardDrive}
          title="Media could not be loaded"
          description={error}
          action={<Button onClick={() => void load()}>Retry</Button>}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="No media found"
          description="Upload media or adjust your filters to see workspace files here."
          action={canUpload ? <Button onClick={() => setShowUpload(true)}>Upload Media</Button> : undefined}
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => {
            const media = toMediaItem(item);
            return (
              <Card key={item.asset.id} className="group overflow-hidden transition-shadow hover:shadow-card-hover">
                <button type="button" onClick={() => setDetail(item)} className="block w-full">
                  <MediaThumbnail item={media} rounded="rounded-none" className="aspect-square w-full" />
                </button>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium text-ink" title={item.asset.file_name}>
                      {item.asset.file_name}
                    </p>
                    <MediaMenu
                      item={item}
                      onView={() => setDetail(item)}
                      onDelete={canDelete(item) ? () => requestDelete(item) : undefined}
                      onCopy={() => void copyTemporaryLink(item)}
                      onDownload={() => void download(item)}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-ink-subtle">
                    <span>{item.asset.mime_type ?? item.asset.media_type}</span>
                    <span>{formatBytes(item.asset.file_size ?? 0)}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-subtle">
                    Used in {item.usedInPosts} post{item.usedInPosts === 1 ? "" : "s"}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="divide-y divide-border">
          {items.map((item) => {
            const media = toMediaItem(item);
            return (
              <div key={item.asset.id} className="flex items-center gap-3 p-3 hover:bg-surface-muted/60">
                <button type="button" onClick={() => setDetail(item)}>
                  <MediaThumbnail item={media} className="h-12 w-12 shrink-0" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{item.asset.file_name}</p>
                  <p className="text-xs text-ink-subtle">
                    {MEDIA_TYPE_META[item.asset.media_type].label} · {formatBytes(item.asset.file_size ?? 0)} · {formatDate(item.asset.created_at)}
                  </p>
                </div>
                <span className="hidden text-xs text-ink-muted sm:block">
                  {item.usedInPosts} post{item.usedInPosts === 1 ? "" : "s"}
                </span>
                <MediaMenu
                  item={item}
                  onView={() => setDetail(item)}
                  onDelete={canDelete(item) ? () => requestDelete(item) : undefined}
                  onCopy={() => void copyTemporaryLink(item)}
                  onDownload={() => void download(item)}
                />
              </div>
            );
          })}
        </Card>
      )}

      <Pagination
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        onPageChange={setPage}
        totalItems={total}
        pageSize={PAGE_SIZE}
      />

      <Modal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        title="Upload media"
        description={`Files are saved privately to ${activeWorkspace?.name ?? "your workspace"}.`}
        size="md"
      >
        <div className="space-y-4">
          <UploadArea
            onFiles={handleUpload}
            accept={MEDIA_ACCEPT}
            hint="Images up to 10 MB, videos up to 50 MB, PDFs up to 20 MB"
          />
          {queue.length > 0 && (
            <div className="space-y-2">
              {queue.map((queueItem) => (
                <UploadQueueRow
                  key={queueItem.id}
                  item={queueItem}
                  onCancel={() => void cancelUpload(queueItem.id)}
                  onRetry={() => void runUpload(queueItem)}
                />
              ))}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Media details"
        size="md"
        centered={false}
        footer={
          detail && (
            <>
              {canDelete(detail) && (
                <Button variant="danger" onClick={() => requestDelete(detail)}>
                  <Trash2 className="h-4 w-4" aria-hidden /> Delete
                </Button>
              )}
              <Button variant="outline" onClick={() => setDetail(null)}>Close</Button>
              <Button onClick={() => void copyTemporaryLink(detail)}>
                <Copy className="h-4 w-4" aria-hidden /> Copy temporary link
              </Button>
            </>
          )
        }
      >
        {detail && <MediaDetails item={detail} />}
      </Modal>

      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => void remove()}
        title="Delete media?"
        message={`This removes “${toDelete?.asset.file_name}” from private Storage and its workspace media record.`}
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        destructive
      />
    </div>
  );
}

function CategoryButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "border-brand bg-brand-soft text-brand-text" : "border-border text-ink-muted hover:bg-surface-muted",
      )}
    >
      {children}
    </button>
  );
}

function UploadQueueRow({ item, onCancel, onRetry }: { item: MediaUploadQueueItem; onCancel: () => void; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{item.file.name}</p>
        <span className="text-xs capitalize text-ink-muted">{item.state}</span>
        {item.state === "uploading" && (
          <button type="button" onClick={onCancel} aria-label={`Cancel ${item.file.name}`} className="rounded-md p-1 text-ink-muted hover:bg-surface-muted">
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
        {(item.state === "failed" || item.state === "cancelled") && (
          <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
        )}
        {item.state === "complete" && <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full bg-brand transition-[width]" style={{ width: `${item.progress}%` }} />
      </div>
      {item.error && <p className="mt-1.5 text-xs text-danger">{item.error}</p>}
    </div>
  );
}

function MediaDetails({ item }: { item: MediaAssetPresentation }) {
  const media = toMediaItem(item);
  return (
    <div className="space-y-4">
      <MediaThumbnail item={media} className="aspect-video w-full" />
      <div>
        <p className="break-words text-sm font-semibold text-ink">{item.asset.file_name}</p>
        <Badge tone="brand" className="mt-1.5">{MEDIA_TYPE_META[item.asset.media_type].label}</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Meta label="MIME type" value={item.asset.mime_type ?? "Unknown"} />
        <Meta label="Size" value={formatBytes(item.asset.file_size ?? 0)} />
        <Meta label="Uploaded" value={formatDate(item.asset.created_at)} />
        <Meta label="Uploaded by" value={item.uploadedByName ?? "Workspace member"} />
        <Meta label="Used in posts" value={String(item.usedInPosts)} />
        {item.asset.width && item.asset.height && <Meta label="Dimensions" value={`${item.asset.width}×${item.asset.height}`} />}
        {item.asset.duration_seconds != null && <Meta label="Duration" value={`${Math.round(item.asset.duration_seconds)} seconds`} />}
      </dl>
    </div>
  );
}

function MediaMenu({ item, onView, onDelete, onCopy, onDownload }: {
  item: MediaAssetPresentation;
  onView: () => void;
  onDelete?: () => void;
  onCopy: () => void;
  onDownload: () => void;
}) {
  return (
    <Dropdown
      trigger={<span className="inline-flex shrink-0 rounded-lg p-1 text-ink-muted hover:bg-surface-muted" aria-label={`Options for ${item.asset.file_name}`}><MoreVertical className="h-4 w-4" aria-hidden /></span>}
      items={[
        { label: "View details", icon: <ImageIcon />, onClick: onView },
        { label: "Copy temporary link", icon: <Copy />, onClick: onCopy },
        { label: "Download", icon: <Download />, onClick: onDownload },
        ...(onDelete ? [{ label: "Delete", icon: <Trash2 />, destructive: true, separated: true, onClick: onDelete }] : []),
      ]}
    />
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-ink-subtle">{label}</dt><dd className="mt-0.5 break-words font-medium text-ink">{value}</dd></div>;
}
