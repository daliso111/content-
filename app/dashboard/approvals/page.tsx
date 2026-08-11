"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  Clock3,
  History,
  Inbox,
  MessageSquare,
  RefreshCw,
  Send,
  UserRoundCog,
  X,
} from "lucide-react";
import { MediaThumbnail } from "@/components/media/MediaThumbnail";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { FormField, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { SearchInput } from "@/components/ui/SearchInput";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toMediaItem } from "@/lib/services/storage-service";
import {
  addComment,
  approveRequest,
  changeDeadline,
  getApprovalCounts,
  listApprovalRequests,
  listEligibleApprovers,
  reassignRequest,
  rejectRequest,
  requestChanges,
  withdrawRequest,
} from "@/lib/services/approval-service";
import { formatDateTime, formatRelative, truncate } from "@/lib/utils";
import type {
  ApprovalActionResult,
  ApprovalCounts,
  ApprovalRequestStatus,
  ApprovalRequestWithRelations,
  ApprovalTab,
  EligibleApprover,
} from "@/types";

type ActionKind = "approve" | "changes" | "reject" | "withdraw" | "reassign" | "deadline" | "comment";

const EMPTY_COUNTS: ApprovalCounts = {
  pending: 0,
  awaitingMine: 0,
  submittedByMe: 0,
  approved: 0,
  recentlyApproved: 0,
  changesRequested: 0,
  rejected: 0,
  overdue: 0,
};

const STATUS_META: Record<ApprovalRequestStatus, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  pending: { label: "Pending", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  changes_requested: { label: "Changes requested", tone: "info" },
  rejected: { label: "Rejected", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
  superseded: { label: "Superseded", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export default function ApprovalsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const { activeWorkspace, activeMembership, loading: workspaceLoading } = useWorkspace();
  const [tab, setTab] = useState<ApprovalTab>("awaiting");
  const [items, setItems] = useState<ApprovalRequestWithRelations[]>([]);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [approvers, setApprovers] = useState<EligibleApprover[]>([]);
  const [review, setReview] = useState<ApprovalRequestWithRelations | null>(null);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [message, setMessage] = useState("");
  const [selection, setSelection] = useState("");
  const [deadline, setDeadline] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ApprovalRequestStatus | "all">("all");
  const [requesterFilter, setRequesterFilter] = useState("all");
  const [approverFilter, setApproverFilter] = useState("all");
  const [due, setDue] = useState<"all" | "overdue" | "today" | "week" | "none">("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "due_asc" | "due_desc">("newest");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 12;

  const load = useCallback(async () => {
    if (workspaceLoading) return;
    if (!activeWorkspace) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [result, nextCounts, nextApprovers] = await Promise.all([
        listApprovalRequests({
          workspaceId: activeWorkspace.id,
          tab,
          page,
          pageSize,
          search: query,
          status,
          requesterId: requesterFilter === "all" ? null : requesterFilter,
          approverId: approverFilter === "all" ? null : approverFilter,
          due,
          sort,
        }),
        getApprovalCounts(activeWorkspace.id),
        listEligibleApprovers(activeWorkspace.id),
      ]);
      setItems(result.items);
      setTotal(result.total);
      setCounts(nextCounts);
      setApprovers(nextApprovers);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Approvals could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, approverFilter, due, page, query, requesterFilter, sort, status, tab, workspaceLoading]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [activeWorkspace?.id, approverFilter, due, query, requesterFilter, sort, status, tab]);

  const requesterOptions = useMemo(() => {
    const profiles = new Map(items.map((item) => [item.requester.id, item.requester.name]));
    return [...profiles].map(([value, label]) => ({ value, label }));
  }, [items]);

  const role = activeMembership?.role;
  const isAdmin = role === "owner" || role === "administrator";
  const canDecide = (item: ApprovalRequestWithRelations) =>
    item.request.status === "pending" && !item.stale && Boolean(user) &&
    (role === "owner" || role === "administrator" || role === "approver") &&
    (isAdmin || item.request.assigned_approver_id === user?.id) &&
    item.request.requested_by !== user?.id && item.post?.post.created_by !== user?.id;
  const canWithdraw = (item: ApprovalRequestWithRelations) =>
    item.request.status === "pending" && (isAdmin || item.request.requested_by === user?.id);
  const canReassign = (item: ApprovalRequestWithRelations) => canWithdraw(item);
  const canChangeDue = (item: ApprovalRequestWithRelations) =>
    item.request.status === "pending" && (isAdmin || item.request.requested_by === user?.id || item.request.assigned_approver_id === user?.id);

  const openAction = (kind: ActionKind, item = review) => {
    if (!item) return;
    setReview(item);
    setAction(kind);
    setMessage("");
    setSelection(item.request.assigned_approver_id ?? "");
    setDeadline(item.request.due_at ? item.request.due_at.slice(0, 16) : "");
  };

  const runAction = async () => {
    if (!review || !action) return;
    if ((action === "changes" || action === "reject" || action === "comment") && !message.trim()) {
      toast.error("Message required", action === "comment" ? "Enter a comment." : "Enter clear review feedback.");
      return;
    }
    if (action === "reassign" && !selection) {
      toast.error("Approver required", "Choose an eligible approver.");
      return;
    }
    setMutating(true);
    try {
      let result: ApprovalActionResult | null = null;
      switch (action) {
        case "approve": result = await approveRequest(review.request.id, message.trim() || undefined); break;
        case "changes": result = await requestChanges(review.request.id, message.trim()); break;
        case "reject": result = await rejectRequest(review.request.id, message.trim()); break;
        case "withdraw": result = await withdrawRequest(review.request.id, message.trim() || undefined); break;
        case "reassign": result = await reassignRequest(review.request.id, selection, message.trim() || undefined); break;
        case "deadline": result = await changeDeadline(review.request.id, deadline ? new Date(deadline).toISOString() : null, message.trim() || undefined); break;
        case "comment": await addComment(review.request.id, message.trim()); break;
      }
      const labels: Record<ActionKind, string> = {
        approve: "Post approved",
        changes: "Changes requested",
        reject: "Post rejected",
        withdraw: "Request withdrawn",
        reassign: "Approver reassigned",
        deadline: "Deadline updated",
        comment: "Comment added",
      };
      toast.success(labels[action], result?.postStatus ? `Post status: ${result.postStatus.replaceAll("_", " ")}.` : "Approval history was updated.");
      setAction(null);
      setReview(null);
      await load();
    } catch (actionError) {
      toast.error("Approval action failed", actionError instanceof Error ? actionError.message : "Please try again.");
    } finally {
      setMutating(false);
    }
  };

  const tabs = [
    { id: "awaiting", label: "Awaiting My Approval", count: counts.awaitingMine },
    { id: "submitted", label: "Submitted by Me", count: counts.submittedByMe },
    { id: "pending", label: "All Pending", count: counts.pending },
    { id: "approved", label: "Approved", count: counts.approved },
    { id: "changes_requested", label: "Changes Requested", count: counts.changesRequested },
    { id: "rejected", label: "Rejected", count: counts.rejected },
    { id: "history", label: "History" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Approval Centre" description="Review workspace content and keep every decision tied to an exact revision." />
      <Tabs active={tab} onChange={(id) => setTab(id as ApprovalTab)} tabs={tabs} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search post captions" className="min-w-0 flex-1 lg:max-w-sm" />
        <div className="flex flex-wrap gap-2">
          <FilterSelect value={status} onChange={(value) => setStatus(value as ApprovalRequestStatus | "all")} label="Status" options={[
            { value: "all", label: "All" }, ...Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label })),
          ]} />
          <FilterSelect value={approverFilter} onChange={setApproverFilter} label="Approver" options={[
            { value: "all", label: "All" }, ...approvers.map((item) => ({ value: item.userId, label: item.name })),
          ]} />
          <FilterSelect value={requesterFilter} onChange={setRequesterFilter} label="Requester" options={[
            { value: "all", label: "All" }, ...requesterOptions,
          ]} />
          <FilterSelect value={due} onChange={(value) => setDue(value as typeof due)} label="Due" options={[
            { value: "all", label: "Any date" }, { value: "overdue", label: "Overdue" },
            { value: "today", label: "Today" }, { value: "week", label: "Next 7 days" }, { value: "none", label: "No deadline" },
          ]} />
          <FilterSelect value={sort} onChange={(value) => setSort(value as typeof sort)} label="Sort" options={[
            { value: "newest", label: "Newest" }, { value: "oldest", label: "Oldest" },
            { value: "due_asc", label: "Deadline soonest" }, { value: "due_desc", label: "Deadline latest" },
          ]} />
          <Button variant="outline" size="sm" onClick={() => void load()} aria-label="Refresh approvals">
            <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <EmptyState icon={AlertCircle} title="Approvals unavailable" description={error} action={<Button onClick={() => void load()}>Try again</Button>} />
      ) : loading ? (
        <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <SkeletonCard key={index} />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Inbox} title="Nothing here" description={tab === "awaiting" ? "No posts are waiting for your review." : "No approval requests match these filters."} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <ApprovalCard key={item.request.id} item={item} canDecide={canDecide(item)} onReview={() => setReview(item)} onApprove={() => openAction("approve", item)} />
          ))}
        </div>
      )}

      <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / pageSize))} onPageChange={setPage} totalItems={total} pageSize={pageSize} />

      <Modal open={Boolean(review) && !action} onClose={() => setReview(null)} title="Review post" size="xl" footer={review && (
        <>
          <Button variant="outline" className="mr-auto" onClick={() => openAction("comment")}><MessageSquare className="h-4 w-4" /> Comment</Button>
          {canWithdraw(review) && <Button variant="ghost" onClick={() => openAction("withdraw")}>Withdraw</Button>}
          {canReassign(review) && <Button variant="outline" onClick={() => openAction("reassign")}><UserRoundCog className="h-4 w-4" /> Reassign</Button>}
          {canChangeDue(review) && <Button variant="outline" onClick={() => openAction("deadline")}><Clock3 className="h-4 w-4" /> Deadline</Button>}
          {canDecide(review) && <>
            <Button variant="danger" onClick={() => openAction("reject")}><X className="h-4 w-4" /> Reject</Button>
            <Button variant="secondary" onClick={() => openAction("changes")}><MessageSquare className="h-4 w-4" /> Request changes</Button>
            <Button onClick={() => openAction("approve")}><Check className="h-4 w-4" /> Approve</Button>
          </>}
        </>
      )}>
        {review && <ReviewDetails item={review} />}
      </Modal>

      <Modal open={Boolean(action)} onClose={() => setAction(null)} title={actionTitle(action)} size="sm" footer={action && (
        <>
          <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
          <Button variant={action === "reject" ? "danger" : "primary"} loading={mutating} onClick={() => void runAction()}>
            {action === "reject" ? "Confirm rejection" : action === "approve" ? "Confirm approval" : "Confirm"}
          </Button>
        </>
      )}>
        {action === "reassign" ? (
          <FormField label="New approver" required><Select value={selection} onChange={(event) => setSelection(event.target.value)}><option value="">Choose an approver</option>{approvers.filter((item) => item.userId !== review?.request.requested_by && item.userId !== review?.post?.post.created_by).map((item) => <option key={item.userId} value={item.userId}>{item.name} · {item.role.replaceAll("_", " ")}</option>)}</Select></FormField>
        ) : action === "deadline" ? (
          <FormField label="Approval deadline" hint="Leave empty to remove the deadline."><Input type="datetime-local" value={deadline} min={new Date().toISOString().slice(0, 16)} onChange={(event) => setDeadline(event.target.value)} /></FormField>
        ) : null}
        <FormField className="mt-4" label={action === "changes" ? "Change instructions" : action === "reject" ? "Rejection reason" : action === "comment" ? "Comment" : "Message (optional)"} required={action === "changes" || action === "reject" || action === "comment"}>
          <Textarea value={message} maxLength={5000} onChange={(event) => setMessage(event.target.value)} placeholder={action === "approve" ? "Add an optional approval note" : "Add clear context for the team"} />
        </FormField>
      </Modal>
    </div>
  );
}

function ApprovalCard({ item, canDecide, onReview, onApprove }: { item: ApprovalRequestWithRelations; canDecide: boolean; onReview: () => void; onApprove: () => void }) {
  const post = item.post;
  const meta = STATUS_META[item.request.status];
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start gap-3">
        {post?.media[0] ? <MediaThumbnail item={toMediaItem(post.media[0])} className="h-16 w-16 shrink-0" /> : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-ink-subtle"><Send className="h-5 w-5" /></div>}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge tone={meta.tone} dot>{meta.label}</Badge>
            {item.stale && <Badge tone="danger">Stale revision</Badge>}
            {item.overdue && <Badge tone="danger">Overdue</Badge>}
          </div>
          <p className="text-sm text-ink">{truncate(post?.post.caption || "Untitled post", 110)}</p>
          <div className="mt-2 flex gap-1">{post?.platforms.map((platform) => <PlatformIcon key={platform.id} platform={platform.platform} size="sm" />)}</div>
        </div>
      </div>
      <div className="mt-3 grid gap-2 border-t border-border pt-3 text-xs text-ink-muted sm:grid-cols-2">
        <span className="flex items-center gap-1.5"><Avatar name={item.requester.name} color="#475569" size="xs" />{item.requester.name}</span>
        <span>{item.approver ? `Reviewer: ${item.approver.name}` : "No reviewer assigned"}</span>
        <span>Submitted {formatRelative(item.request.requested_at)}</span>
        <span>{item.request.due_at ? `Due ${formatDateTime(item.request.due_at)}` : "No deadline"}</span>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onReview}>Review</Button>
        <span className="text-xs text-ink-subtle">Revision {item.request.post_revision}{post ? ` of ${post.post.revision}` : ""}</span>
        {canDecide && <Button size="sm" className="ml-auto" onClick={onApprove}><Check className="h-4 w-4" /> Approve</Button>}
      </div>
    </Card>
  );
}

function ReviewDetails({ item }: { item: ApprovalRequestWithRelations }) {
  const post = item.post;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,.85fr)]">
      <div className="space-y-5">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2"><Badge tone={STATUS_META[item.request.status].tone}>{STATUS_META[item.request.status].label}</Badge>{item.stale && <Badge tone="danger">Stale approval</Badge>}{item.overdue && <Badge tone="danger">Overdue</Badge>}</div>
          <p className="whitespace-pre-wrap text-sm text-ink">{post?.post.caption || "No general caption"}</p>
        </div>
        {post?.media.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{post.media.map((media) => <MediaThumbnail key={media.asset.id} item={toMediaItem(media)} className="aspect-square w-full" />)}</div> : <p className="rounded-lg bg-surface-muted p-4 text-sm text-ink-muted">No media attached.</p>}
        {post?.platforms.map((platform) => <div key={platform.id} className="border-t border-border pt-3"><p className="flex items-center gap-2 text-sm font-medium text-ink"><PlatformIcon platform={platform.platform} size="sm" />{platform.platform}</p><p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">{platform.platform_caption || "Uses the general caption"}</p></div>)}
        <div className="grid gap-3 rounded-lg border border-border p-3 text-sm sm:grid-cols-2">
          <span><strong className="block text-xs text-ink-subtle">Schedule</strong>{post?.post.scheduled_at ? formatDateTime(post.post.scheduled_at) : "Not scheduled"}</span>
          <span><strong className="block text-xs text-ink-subtle">Destinations</strong>{item.destinationAccounts.length ? item.destinationAccounts.map((account) => `${account.name}${account.username ? ` (@${account.username})` : ""}`).join(", ") : "None selected"}</span>
          <span><strong className="block text-xs text-ink-subtle">Submitted revision</strong>{item.request.post_revision}</span>
          <span><strong className="block text-xs text-ink-subtle">Current revision</strong>{post?.post.revision ?? "Unavailable"}</span>
        </div>
        <Button variant="outline" onClick={() => { window.location.href = `/dashboard/create?post=${item.request.post_id}`; }}>Edit post</Button>
      </div>
      <div className="space-y-5">
        <section><h3 className="text-sm font-semibold text-ink">Request</h3><dl className="mt-2 space-y-2 text-sm"><div><dt className="text-xs text-ink-subtle">Requester</dt><dd>{item.requester.name}</dd></div><div><dt className="text-xs text-ink-subtle">Assigned approver</dt><dd>{item.approver?.name ?? "Unassigned"}</dd></div><div><dt className="text-xs text-ink-subtle">Deadline</dt><dd>{item.request.due_at ? formatDateTime(item.request.due_at) : "No deadline"}</dd></div>{item.request.submission_message && <div><dt className="text-xs text-ink-subtle">Submission message</dt><dd className="whitespace-pre-wrap">{item.request.submission_message}</dd></div>}</dl></section>
        <section><h3 className="text-sm font-semibold text-ink">Comments</h3><div className="mt-2 space-y-2">{item.comments.length ? item.comments.map((comment) => <div key={comment.id} className="rounded-lg bg-surface-muted p-3"><p className="flex items-center gap-2 text-xs font-medium"><Avatar name={comment.author.name} color="#475569" size="xs" />{comment.author.name}<span className="ml-auto font-normal text-ink-subtle">{formatRelative(comment.created_at)}</span></p><p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">{comment.body}</p></div>) : <p className="text-sm text-ink-muted">No comments yet.</p>}</div></section>
        <section><h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><History className="h-4 w-4" />Event history</h3><ol className="mt-2 space-y-3 border-l border-border pl-4">{item.events.map((event) => <li key={event.id} className="relative text-sm before:absolute before:-left-[19px] before:top-1.5 before:h-2 before:w-2 before:rounded-full before:bg-brand"><p className="font-medium capitalize text-ink">{event.event_type.replaceAll("_", " ")}</p><p className="text-xs text-ink-subtle">{event.actor?.name ?? "Towkn"} · {formatDateTime(event.created_at)}</p>{event.message && <p className="mt-1 text-ink-muted">{event.message}</p>}</li>)}</ol></section>
      </div>
    </div>
  );
}

function actionTitle(action: ActionKind | null) {
  switch (action) {
    case "approve": return "Approve this revision";
    case "changes": return "Request changes";
    case "reject": return "Reject this revision";
    case "withdraw": return "Withdraw approval request";
    case "reassign": return "Reassign approver";
    case "deadline": return "Change approval deadline";
    case "comment": return "Add approval comment";
    default: return "Approval action";
  }
}
