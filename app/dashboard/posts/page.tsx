"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Copy,
  Eye,
  FileText,
  LayoutGrid,
  MoreVertical,
  Pencil,
  PlusCircle,
  RefreshCw,
  Table as TableIcon,
  Trash2,
  XCircle,
  Activity,
  AlertTriangle,
  RotateCcw,
  Ban,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PostCard } from "@/components/posts/PostCard";
import { PostDetail } from "@/components/posts/PostDetail";
import { MediaThumbnail } from "@/components/media/MediaThumbnail";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, FormField } from "@/components/ui/Field";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterSelect, SegmentedControl } from "@/components/ui/FilterSelect";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { SearchInput } from "@/components/ui/SearchInput";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { PostStatusBadge } from "@/components/ui/StatusBadge";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/hooks/useWorkspace";
import { PLATFORM_LIST, POST_STATUS_META } from "@/lib/constants";
import { getPostErrorMessage } from "@/lib/post-errors";
import { getPublishingErrorMessage } from "@/lib/publishing-errors";
import {
  deletePost,
  deletePosts,
  duplicatePost,
  getPostCounts,
  listPosts,
  toSocialPost,
  updatePost,
} from "@/lib/services/post-service";
import { cancelPublication, getPostCurrentRevision, getPostPublishingJobs, getPublishingAttempts, hasActivePublishingOperation, retryPublishingJob } from "@/lib/services/publishing-service";
import { getLatestPostApproval, withdrawRequest } from "@/lib/services/approval-service";
import { utcToWorkspaceFields, workspaceDateTimeToUtc } from "@/lib/timezone";
import { cn, formatDate, truncate } from "@/lib/utils";
import { isActivePublishingJobStatus, isCurrentRevisionPublishingJob } from "@/types";
import type {
  PostCounts,
  PostSort,
  PostStatus,
  PostWithRelations,
  SocialPlatform,
  SocialPost,
  PublishingAttempt,
  PublishingJobView,
  ApprovalRequestWithRelations,
} from "@/types";

type ViewMode = "grid" | "table";
const PAGE_SIZE = 6;
const MANAGER_ROLES = ["owner", "administrator", "content_manager"];
const CREATOR_ROLES = [...MANAGER_ROLES, "designer"];
const WRITABLE_STATUSES: PostStatus[] = ["draft", "scheduled", "cancelled"];
const EMPTY_COUNTS: PostCounts = {
  all: 0,
  draft: 0,
  pending_approval: 0,
  approved: 0,
  scheduled: 0,
  publishing: 0,
  published: 0,
  failed: 0,
  cancelled: 0,
  publishedThisMonth: 0,
};

export default function PostsPage() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { activeWorkspace, activeMembership, loading: workspaceLoading } = useWorkspace();
  const [records, setRecords] = useState<PostWithRelations[]>([]);
  const [counts, setCounts] = useState<PostCounts>(EMPTY_COUNTS);
  const [tab, setTab] = useState<PostStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<SocialPlatform | "all">("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [sort, setSort] = useState<PostSort>("newest");
  const [view, setView] = useState<ViewMode>("grid");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<PostWithRelations | null>(null);
  const [toDelete, setToDelete] = useState<PostWithRelations | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [reschedule, setReschedule] = useState<PostWithRelations | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [mutating, setMutating] = useState(false);
  const [publishingPostId, setPublishingPostId] = useState<string | null>(null);
  const [publishingPostRevision, setPublishingPostRevision] = useState<number | null>(null);
  const [publishingJobs, setPublishingJobs] = useState<PublishingJobView[]>([]);
  const [publishingAttempts, setPublishingAttempts] = useState<Record<string, PublishingAttempt[]>>({});
  const [publishingLoading, setPublishingLoading] = useState(false);
  const [approvals, setApprovals] = useState<Record<string, ApprovalRequestWithRelations | null>>({});
  const [approvalToWithdraw, setApprovalToWithdraw] = useState<ApprovalRequestWithRelations | null>(null);

  const role = activeMembership?.role;
  const canCreate = !!role && CREATOR_ROLES.includes(role);
  const canPublish = !!role && MANAGER_ROLES.includes(role);
  const canEditRecord = useCallback(
    (record: PostWithRelations) =>
      !!role &&
      ((MANAGER_ROLES.includes(role) && WRITABLE_STATUSES.includes(record.post.status)) ||
        (role === "designer" && record.post.created_by === user?.id && record.post.status === "draft")),
    [role, user?.id],
  );
  const canDeleteRecord = useCallback(
    (record: PostWithRelations) =>
      !!role &&
      (MANAGER_ROLES.includes(role) ||
        (role === "designer" && record.post.created_by === user?.id && record.post.status === "draft")),
    [role, user?.id],
  );
  const canScheduleRecord = useCallback(
    (record: PostWithRelations) =>
      !!role && MANAGER_ROLES.includes(role) && WRITABLE_STATUSES.includes(record.post.status),
    [role],
  );

  const createdFrom = useMemo(() => {
    if (dateFilter === "all") return null;
    const date = new Date();
    date.setDate(date.getDate() - Number(dateFilter));
    return date.toISOString();
  }, [dateFilter]);

  const load = useCallback(async () => {
    if (!activeWorkspace) {
      setRecords([]);
      setLoading(workspaceLoading);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [result, nextCounts] = await Promise.all([
        listPosts({
          workspaceId: activeWorkspace.id,
          page,
          pageSize: PAGE_SIZE,
          status: tab,
          platform,
          search: query,
          createdFrom,
          sort,
        }),
        getPostCounts(activeWorkspace.id),
      ]);
      setRecords(result.items);
      const approvalEntries = await Promise.all(
        result.items.map(async (record) => [record.post.id, await getLatestPostApproval(record.post.id)] as const),
      );
      setApprovals(Object.fromEntries(approvalEntries));
      setTotal(result.total);
      setCounts(nextCounts);
      setSelectedIds(new Set());
    } catch (loadError) {
      setError(getPostErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, createdFrom, page, platform, query, sort, tab, workspaceLoading]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);
  useEffect(() => setPage(1), [activeWorkspace?.id, tab, platform, dateFilter, query, sort]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("publishing");
    if (!requested) return;
    let active = true;
    void hasActivePublishingOperation(requested)
      .then((hasActiveOperation) => {
        if (!active) return;
        if (hasActiveOperation) setPublishingPostId(requested);
        else router.replace("/dashboard/posts", { scroll: false });
      })
      .catch(() => {
        if (active) router.replace("/dashboard/posts", { scroll: false });
      });
    return () => { active = false; };
  }, [router]);

  const loadPublishing = useCallback(async (postId: string) => {
    setPublishingLoading(true);
    try {
      const [jobs, currentRevision] = await Promise.all([
        getPostPublishingJobs(postId),
        getPostCurrentRevision(postId),
      ]);
      setPublishingJobs(jobs);
      setPublishingPostRevision(currentRevision);
      const entries = await Promise.all(jobs.map(async ({ job }) => [job.id, await getPublishingAttempts(job.id)] as const));
      setPublishingAttempts(Object.fromEntries(entries));
    } catch (publishingError) {
      toast.error("Publishing details unavailable", getPublishingErrorMessage(publishingError));
    } finally {
      setPublishingLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (publishingPostId) void loadPublishing(publishingPostId);
  }, [loadPublishing, publishingPostId]);

  const openPublishing = (postId: string) => {
    setPublishingPostId(postId);
    router.replace(`/dashboard/posts?publishing=${postId}`, { scroll: false });
  };

  const closePublishing = () => {
    setPublishingPostId(null);
    setPublishingPostRevision(null);
    setPublishingJobs([]);
    setPublishingAttempts({});
    router.replace("/dashboard/posts", { scroll: false });
  };

  const retryJob = async (jobId: string) => {
    setMutating(true);
    try {
      await retryPublishingJob(jobId);
      toast.success("Retry queued", "The destination will be attempted again by the worker.");
      if (publishingPostId) await loadPublishing(publishingPostId);
      await load();
    } catch (retryError) {
      toast.error("Retry unavailable", getPublishingErrorMessage(retryError));
    } finally {
      setMutating(false);
    }
  };

  const cancelPublishing = async () => {
    if (!publishingPostId) return;
    setMutating(true);
    try {
      const result = await cancelPublication(publishingPostId);
      if (result.reconciliationRequired > 0) toast.info("Cancellation needs verification", "A provider submission may already have started.");
      else toast.success("Publication cancelled", `${result.cancelledJobs} queued destinations cancelled.`);
      await loadPublishing(publishingPostId);
      await load();
    } catch (cancelError) {
      toast.error("Cancellation unavailable", getPublishingErrorMessage(cancelError));
    } finally {
      setMutating(false);
    }
  };

  const displayPosts = useMemo(() => records.map(toSocialPost), [records]);
  const recordById = useMemo(() => new Map(records.map((record) => [record.post.id, record])), [records]);
  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const runDuplicate = async (record: PostWithRelations) => {
    setMutating(true);
    try {
      const newId = await duplicatePost(record.post.id);
      toast.success("Post duplicated", "A new persisted draft was created.");
      await load();
      router.push(`/dashboard/create?post=${newId}`);
    } catch (mutationError) {
      toast.error("Duplicate failed", getPostErrorMessage(mutationError));
    } finally {
      setMutating(false);
    }
  };

  const runDelete = async () => {
    if (!toDelete) return;
    setMutating(true);
    try {
      await deletePost(toDelete.post.id);
      toast.success("Post deleted", "Media files remain available in the workspace library.");
      setPreview(null);
      await load();
    } catch (mutationError) {
      toast.error("Delete failed", getPostErrorMessage(mutationError));
    } finally {
      setMutating(false);
      setToDelete(null);
    }
  };

  const runBulkDelete = async () => {
    setMutating(true);
    try {
      const deleted = await deletePosts([...selectedIds]);
      toast.success("Bulk deletion complete", `${deleted.length} posts were deleted atomically.`);
      setSelectedIds(new Set());
      await load();
    } catch (mutationError) {
      toast.error("No posts were deleted", getPostErrorMessage(mutationError));
    } finally {
      setMutating(false);
      setBulkDeleteOpen(false);
    }
  };

  const writeInput = (record: PostWithRelations, status: "draft" | "scheduled" | "cancelled", scheduledAt: string | null) => ({
    workspaceId: record.post.workspace_id,
    caption: record.post.caption,
    status,
    scheduledAt,
    timezone: record.post.timezone,
    approvalRequired: record.post.approval_required,
    assignedTo: record.post.assigned_to,
    platforms: record.platforms.map((row) => ({
      platform: row.platform,
      platform_caption: row.platform_caption,
      platform_title: row.platform_title,
      platform_settings: row.platform_settings,
    })),
    mediaAssetIds: record.mediaLinks.map((link) => link.media_asset_id),
    destinationAccountIds: record.destinations.map((destination) => destination.social_account_id),
  });

  const cancelSchedule = async (record: PostWithRelations) => {
    setMutating(true);
    try {
      await updatePost(record.post.id, record.post.revision, writeInput(record, "cancelled", null));
      toast.success("Schedule cancelled", "The post remains in the workspace with cancelled status.");
      await load();
    } catch (mutationError) {
      toast.error("Cancellation failed", getPostErrorMessage(mutationError));
    } finally {
      setMutating(false);
    }
  };

  const openReschedule = (record: PostWithRelations) => {
    const zone = record.post.timezone || activeWorkspace?.timezone || "UTC";
    const fields = record.post.scheduled_at
      ? utcToWorkspaceFields(record.post.scheduled_at, zone)
      : { date: "", time: "09:00" };
    setScheduleDate(fields.date);
    setScheduleTime(fields.time);
    setReschedule(record);
  };

  const runReschedule = async () => {
    if (!reschedule) return;
    try {
      const scheduledAt = workspaceDateTimeToUtc(scheduleDate, scheduleTime, reschedule.post.timezone);
      if (new Date(scheduledAt).getTime() <= Date.now()) throw new Error("Choose a future time.");
      setMutating(true);
      await updatePost(reschedule.post.id, reschedule.post.revision, writeInput(reschedule, "scheduled", scheduledAt));
      toast.success("Schedule updated", "The new UTC publishing time has been saved.");
      setReschedule(null);
      await load();
    } catch (mutationError) {
      toast.error("Reschedule failed", mutationError instanceof Error && mutationError.message === "Choose a future time." ? mutationError.message : getPostErrorMessage(mutationError));
    } finally {
      setMutating(false);
    }
  };

  const runWithdrawApproval = async () => {
    if (!approvalToWithdraw) return;
    setMutating(true);
    try {
      await withdrawRequest(approvalToWithdraw.request.id);
      toast.success("Approval withdrawn", "The post returned to draft and its history was preserved.");
      await load();
    } catch (withdrawError) {
      toast.error("Withdrawal failed", withdrawError instanceof Error ? withdrawError.message : "Please try again.");
    } finally {
      setMutating(false);
      setApprovalToWithdraw(null);
    }
  };

  const deletablePosts = displayPosts.filter((post) => canDeleteRecord(recordById.get(post.id)!));
  const allSelected = deletablePosts.length > 0 && deletablePosts.every((post) => selectedIds.has(post.id));
  const columns: Column<SocialPost>[] = [
    ...(canCreate ? [{
      key: "select",
      header: <Checkbox checked={allSelected} onChange={(event) => setSelectedIds(event.target.checked ? new Set(displayPosts.filter((post) => canDeleteRecord(recordById.get(post.id)!)).map((post) => post.id)) : new Set())} aria-label="Select deletable posts" />,
      cell: (post: SocialPost) => <Checkbox checked={selectedIds.has(post.id)} disabled={!canDeleteRecord(recordById.get(post.id)!)} onChange={(event) => toggleSelect(post.id, event.target.checked)} aria-label={`Select ${truncate(post.caption, 20)}`} />,
    }] : []),
    {
      key: "post", header: "Post", cell: (post) => (
        <div className="flex items-center gap-3">
          {post.media[0] ? <MediaThumbnail item={post.media[0]} className="h-10 w-10" /> : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-muted"><FileText className="h-4 w-4" /></div>}
          <span className="max-w-xs truncate font-medium">{truncate(post.caption || "Untitled draft", 60)}</span>
        </div>
      ),
    },
    { key: "platforms", header: "Platforms", cell: (post) => <div className="flex gap-1">{post.platforms.map((item) => <PlatformIcon key={item} platform={item} size="sm" />)}</div> },
    { key: "created", header: "Created", cell: (post) => <span className="text-ink-muted">{formatDate(post.createdAt)}</span> },
    { key: "author", header: "Author", cell: (post) => <span className="flex items-center gap-2"><Avatar name={post.createdBy.name} color={post.createdBy.avatarColor} size="xs" />{post.createdBy.name}</span> },
    { key: "status", header: "Status", cell: (post) => <div className="flex flex-col items-start gap-1"><PostStatusBadge status={post.status} />{approvals[post.id] && <span className={cn("text-xs font-medium capitalize", approvals[post.id]?.stale ? "text-danger" : "text-ink-muted")}>{approvals[post.id]?.request.status.replaceAll("_", " ")}{approvals[post.id]?.stale ? " · stale" : ""}</span>}</div> },
    { key: "actions", header: "", cell: (post) => <PostActions post={post} record={recordById.get(post.id)!} approval={approvals[post.id]} canEdit={canEditRecord(recordById.get(post.id)!)} canDelete={canDeleteRecord(recordById.get(post.id)!)} canSchedule={canScheduleRecord(recordById.get(post.id)!)} canDuplicate={canCreate} onPreview={() => setPreview(recordById.get(post.id)!)} onPublishing={() => openPublishing(post.id)} onApproval={() => router.push(approvals[post.id] ? "/dashboard/approvals" : `/dashboard/create?post=${post.id}`)} onWithdraw={approvals[post.id]?.request.status === "pending" && (approvals[post.id]?.request.requested_by === user?.id || MANAGER_ROLES.includes(role ?? "")) ? () => setApprovalToWithdraw(approvals[post.id]) : undefined} onEdit={() => router.push(`/dashboard/create?post=${post.id}`)} onDuplicate={() => void runDuplicate(recordById.get(post.id)!)} onReschedule={() => openReschedule(recordById.get(post.id)!)} onCancel={() => void cancelSchedule(recordById.get(post.id)!)} onDelete={() => setToDelete(recordById.get(post.id)!)} /> },
  ];

  const statusTabs = (["all", ...Object.keys(POST_STATUS_META)] as Array<PostStatus | "all">).map((status) => ({
    id: status,
    label: status === "all" ? "All" : POST_STATUS_META[status].label,
    count: status === "all" ? counts.all : counts[status],
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Posts"
        description="Manage persisted workspace posts, drafts and schedules."
        actions={<div className="flex gap-2"><Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Refresh</Button>{canCreate && <Link href="/dashboard/create"><Button><PlusCircle className="h-4 w-4" /> Create Post</Button></Link>}</div>}
      />

      <Tabs tabs={statusTabs} active={tab} onChange={(id) => setTab(id as PostStatus | "all")} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput value={query} onChange={setQuery} placeholder="Search captions…" className="lg:max-w-xs" />
        <div className="flex flex-wrap gap-2">
          <FilterSelect label="Platform" value={platform} onChange={(value) => setPlatform(value as SocialPlatform | "all")} options={[{ value: "all", label: "All" }, ...PLATFORM_LIST.map((item) => ({ value: item.id, label: item.label }))]} />
          <FilterSelect label="Created" value={dateFilter} onChange={setDateFilter} options={[{ value: "all", label: "Any time" }, { value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]} />
          <FilterSelect label="Sort" value={sort} onChange={(value) => setSort(value as PostSort)} options={[{ value: "newest", label: "Newest" }, { value: "oldest", label: "Oldest" }, { value: "scheduled_asc", label: "Schedule soonest" }, { value: "scheduled_desc", label: "Schedule latest" }, { value: "caption_asc", label: "Caption A–Z" }]} />
          <SegmentedControl value={view} onChange={setView} options={[{ value: "grid", label: "Grid", icon: <LayoutGrid className="h-4 w-4" /> }, { value: "table", label: "Table", icon: <TableIcon className="h-4 w-4" /> }]} />
        </div>
      </div>

      {selectedIds.size > 0 && <div className="flex items-center justify-between rounded-lg border border-brand/30 bg-brand-soft px-4 py-2.5"><p className="text-sm font-medium text-brand-text">{selectedIds.size} selected</p><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>Clear</Button><Button size="sm" variant="danger" onClick={() => setBulkDeleteOpen(true)}><Trash2 className="h-4 w-4" /> Delete</Button></div></div>}

      {loading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <SkeletonCard key={index} />)}</div> : error ? <EmptyState icon={FileText} title="Posts could not be loaded" description={error} action={<Button onClick={() => void load()}>Retry</Button>} /> : displayPosts.length === 0 ? <EmptyState icon={FileText} title="No posts found" description="Adjust the filters or create a persisted draft." action={canCreate ? <Link href="/dashboard/create"><Button>Create Post</Button></Link> : undefined} /> : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{displayPosts.map((post) => { const record = recordById.get(post.id)!; return <PostCard key={post.id} post={post} approval={approvals[post.id]} selected={selectedIds.has(post.id)} onSelect={canDeleteRecord(record) ? (checked) => toggleSelect(post.id, checked) : undefined} onPreview={() => setPreview(record)} onPublishingDetails={() => openPublishing(post.id)} onApprovalDetails={() => router.push(approvals[post.id] ? "/dashboard/approvals" : `/dashboard/create?post=${post.id}`)} onEdit={canEditRecord(record) ? () => router.push(`/dashboard/create?post=${post.id}`) : undefined} onDuplicate={canCreate ? () => void runDuplicate(record) : undefined} onReschedule={canScheduleRecord(record) ? () => openReschedule(record) : undefined} onCancelSchedule={canScheduleRecord(record) && record.post.status === "scheduled" ? () => void cancelSchedule(record) : undefined} onDelete={canDeleteRecord(record) ? () => setToDelete(record) : undefined} />; })}</div>
      ) : <DataTable columns={columns} rows={displayPosts} rowKey={(post) => post.id} />}

      {total > 0 && <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} onPageChange={setPage} totalItems={total} pageSize={PAGE_SIZE} />}

      <Modal open={!!preview} onClose={() => setPreview(null)} title="Post preview" size="md">{preview && <PostDetail post={toSocialPost(preview)} onEdit={canEditRecord(preview) ? () => router.push(`/dashboard/create?post=${preview.post.id}`) : undefined} onDuplicate={canCreate ? () => void runDuplicate(preview) : undefined} onDelete={canDeleteRecord(preview) ? () => setToDelete(preview) : undefined} />}</Modal>
      <PublishingDetailsModal open={!!publishingPostId} loading={publishingLoading} currentRevision={publishingPostRevision} jobs={publishingJobs} attempts={publishingAttempts} canManage={canPublish} mutating={mutating} onClose={closePublishing} onRetry={retryJob} onCancel={cancelPublishing} />
      <Modal open={!!reschedule} onClose={() => setReschedule(null)} title="Reschedule post" description={`Times are interpreted in ${reschedule?.post.timezone ?? "the workspace time zone"}.`} size="sm" footer={<><Button variant="outline" onClick={() => setReschedule(null)}>Cancel</Button><Button onClick={() => void runReschedule()} loading={mutating}>Save schedule</Button></>}><div className="grid grid-cols-2 gap-3"><FormField label="Date" htmlFor="reschedule-date"><Input id="reschedule-date" type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} /></FormField><FormField label="Time" htmlFor="reschedule-time"><Input id="reschedule-time" type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} /></FormField></div></Modal>
      <ConfirmModal open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={() => void runDelete()} title="Delete post?" message="The post and its platform/media relationships will be removed. Media files remain in the workspace library." confirmLabel={mutating ? "Deleting…" : "Delete"} destructive />
      <ConfirmModal open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} onConfirm={() => void runBulkDelete()} title={`Delete ${selectedIds.size} posts?`} message="This atomic operation deletes all selected posts or none. Media files remain available." confirmLabel="Delete all" destructive />
      <ConfirmModal open={!!approvalToWithdraw} onClose={() => setApprovalToWithdraw(null)} onConfirm={() => void runWithdrawApproval()} title="Withdraw approval request?" message="The post will return to draft and its approval history will be preserved." confirmLabel={mutating ? "Withdrawing…" : "Withdraw"} destructive />
    </div>
  );
}

function PostActions({ post, record, approval, canEdit, canDelete, canSchedule, canDuplicate, onPreview, onPublishing, onApproval, onWithdraw, onEdit, onDuplicate, onReschedule, onCancel, onDelete }: {
  post: SocialPost;
  record: PostWithRelations;
  approval?: ApprovalRequestWithRelations | null;
  canEdit: boolean;
  canDelete: boolean;
  canSchedule: boolean;
  canDuplicate: boolean;
  onPreview: () => void;
  onPublishing: () => void;
  onApproval: () => void;
  onWithdraw?: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onReschedule: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return <Dropdown trigger={<span className="inline-flex rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted" aria-label={`Actions for ${truncate(post.caption || "draft", 20)}`}><MoreVertical className="h-4 w-4" /></span>} items={[
    { label: "Preview", icon: <Eye />, onClick: onPreview },
    { label: "Publishing details", icon: <Activity />, onClick: onPublishing },
    { label: approval ? "View approval" : "Submit for approval", icon: <ShieldCheck />, onClick: onApproval },
    ...(onWithdraw ? [{ label: "Withdraw approval", icon: <XCircle />, onClick: onWithdraw }] : []),
    ...(canEdit ? [{ label: "Edit", icon: <Pencil />, onClick: onEdit }] : []),
    ...(canDuplicate ? [{ label: "Duplicate", icon: <Copy />, onClick: onDuplicate }] : []),
    ...(canSchedule ? [{ label: "Reschedule", icon: <CalendarClock />, onClick: onReschedule }] : []),
    ...(canSchedule && record.post.status === "scheduled" ? [{ label: "Cancel schedule", icon: <XCircle />, onClick: onCancel }] : []),
    ...(canDelete ? [{ label: "Delete", icon: <Trash2 />, destructive: true, separated: true, onClick: onDelete }] : []),
  ]} />;
}

function PublishingDetailsModal({ open, loading, currentRevision, jobs, attempts, canManage, mutating, onClose, onRetry, onCancel }: {
  open: boolean;
  loading: boolean;
  currentRevision: number | null;
  jobs: PublishingJobView[];
  attempts: Record<string, PublishingAttempt[]>;
  canManage: boolean;
  mutating: boolean;
  onClose: () => void;
  onRetry: (jobId: string) => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const currentJobs = jobs.filter(({ job }) => isCurrentRevisionPublishingJob(job, currentRevision));
  const active = currentJobs.some(({ job }) => isActivePublishingJobStatus(job.status));
  return <Modal open={open} onClose={onClose} title="Publishing details" description="Per-destination queue and provider results" size="xl" footer={<><Button variant="outline" onClick={onClose}>Close</Button>{canManage && active && <Button variant="danger" onClick={() => void onCancel()} loading={mutating}><Ban className="h-4 w-4" /> Cancel publication</Button>}</>}>
    {loading ? <p className="py-8 text-center text-sm text-ink-muted">Loading publishing history…</p> : jobs.length === 0 ? <div className="py-8 text-center"><Activity className="mx-auto mb-2 h-6 w-6 text-ink-subtle" /><p className="text-sm text-ink-muted">No publishing jobs exist for this post yet.</p></div> : <div className="space-y-4">
      {currentJobs.some(({ job }) => job.status === "reconciliation_required") && <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning-soft p-3"><AlertTriangle className="h-5 w-5 shrink-0 text-warning" /><p className="text-sm text-ink-muted">A provider result is uncertain. Check the destination directly before creating another publication.</p></div>}
      {jobs.map(({ job, account }) => <div key={job.id} className="rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3"><PlatformIcon platform={job.platform} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{account?.account_name ?? "Unavailable account"}</p><p className="text-xs text-ink-subtle">Revision {job.post_revision} · {job.operation.replaceAll("_", " ")}{!isCurrentRevisionPublishingJob(job, currentRevision) ? " · Historical" : ""}</p></div></div>
          <span className={cn("rounded-full px-2 py-1 text-xs font-semibold", job.status === "succeeded" ? "bg-success-soft text-success" : ["failed", "reconciliation_required"].includes(job.status) ? "bg-danger-soft text-danger" : "bg-info-soft text-info")}>{job.status.replaceAll("_", " ")}</span>
        </div>
        <div className="mt-3 grid gap-2 text-xs text-ink-muted sm:grid-cols-2 lg:grid-cols-4"><span>Attempts: {job.attempt_count}/{job.max_attempts}</span><span>Scheduled: {formatDate(job.scheduled_for)}</span><span>Started: {job.started_at ? formatDate(job.started_at) : "Not started"}</span><span>Completed: {job.completed_at ? formatDate(job.completed_at) : "Pending"}</span></div>
        {job.next_attempt_at && <p className="mt-2 text-xs text-info">Next attempt: {formatDate(job.next_attempt_at)}</p>}
        {job.provider_post_id && <p className="mt-2 break-all text-xs text-ink-muted">Provider ID: {job.provider_post_id}</p>}
        {job.provider_permalink && <a href={job.provider_permalink} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-text hover:underline">Open verified provider post <ExternalLink className="h-3 w-3" /></a>}
        {job.safe_error_message && <p className="mt-2 rounded-md bg-danger-soft px-2 py-1.5 text-xs text-danger">{job.safe_error_message}</p>}
        {(attempts[job.id] ?? []).length > 0 && <div className="mt-3 border-t border-border pt-3"><p className="mb-2 text-xs font-semibold text-ink">Attempt history</p><div className="space-y-1">{attempts[job.id].map((attempt) => <p key={attempt.id} className="text-xs text-ink-muted">#{attempt.attempt_number} {attempt.phase.replaceAll("_", " ")} · {attempt.outcome.replaceAll("_", " ")}{attempt.safe_error_message ? ` · ${attempt.safe_error_message}` : ""}</p>)}</div></div>}
        {canManage && isCurrentRevisionPublishingJob(job, currentRevision) && job.status === "failed" && job.retryable && job.attempt_count < job.max_attempts && <Button className="mt-3" size="sm" variant="outline" onClick={() => void onRetry(job.id)} loading={mutating}><RotateCcw className="h-4 w-4" /> Retry destination</Button>}
      </div>)}
    </div>}
  </Modal>;
}
