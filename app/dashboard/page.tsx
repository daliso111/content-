"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Calendar as CalendarIcon,
  CalendarClock,
  CheckCircle2,
  FileText,
  PlusCircle,
  RefreshCw,
  TrendingUp,
  XCircle,
  AlertTriangle,
  Send,
  ShieldCheck,
  UserRoundCheck,
  MessageSquareWarning,
  Clock3,
} from "lucide-react";
import { BarChart, HorizontalBars } from "@/components/analytics/Charts";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { UpcomingPostRow } from "@/components/posts/PostCard";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/hooks/useWorkspace";
import { analytics } from "@/data/mock-analytics";
import { PLATFORMS } from "@/lib/constants";
import { getPostErrorMessage } from "@/lib/post-errors";
import {
  deletePost,
  duplicatePost,
  getPlatformDistribution,
  getPostCounts,
  getRecentPosts,
  getUpcomingPosts,
  toSocialPost,
} from "@/lib/services/post-service";
import { getPublishingCounts, listRecentPublishingResults } from "@/lib/services/publishing-service";
import { getApprovalCounts, listApprovalRequests } from "@/lib/services/approval-service";
import { formatCompact, formatDateTime, truncate } from "@/lib/utils";
import type { ApprovalCounts, ApprovalRequestWithRelations, PostCounts, PostWithRelations, PublishingCounts, PublishingJob, SocialPlatform } from "@/types";

const MANAGER_ROLES = ["owner", "administrator", "content_manager"];
const CREATOR_ROLES = [...MANAGER_ROLES, "designer"];
const WRITABLE_STATUSES = ["draft", "scheduled", "cancelled"];
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
const PLATFORM_COLORS: Record<SocialPlatform, string> = {
  facebook: "#1877F2",
  instagram: "#C13584",
  linkedin: "#0A66C2",
  tiktok: "#111827",
  youtube: "#DC2626",
  x: "#475569",
};

export default function OverviewPage() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { activeWorkspace, activeMembership, loading: workspaceLoading } = useWorkspace();
  const [counts, setCounts] = useState<PostCounts>(EMPTY_COUNTS);
  const [upcoming, setUpcoming] = useState<PostWithRelations[]>([]);
  const [recent, setRecent] = useState<PostWithRelations[]>([]);
  const [distribution, setDistribution] = useState<Record<SocialPlatform, number>>({ facebook: 0, instagram: 0, linkedin: 0, tiktok: 0, youtube: 0, x: 0 });
  const [publishingCounts, setPublishingCounts] = useState<PublishingCounts>({ publishing: 0, failed: 0, reconciliationRequired: 0 });
  const [recentPublishing, setRecentPublishing] = useState<PublishingJob[]>([]);
  const [approvalCounts, setApprovalCounts] = useState<ApprovalCounts>({ pending: 0, awaitingMine: 0, submittedByMe: 0, approved: 0, recentlyApproved: 0, changesRequested: 0, rejected: 0, overdue: 0 });
  const [recentApprovals, setRecentApprovals] = useState<ApprovalRequestWithRelations[]>([]);
  const [toDelete, setToDelete] = useState<PostWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = activeMembership?.role;
  const canCreate = !!role && CREATOR_ROLES.includes(role);
  const canEdit = useCallback((record: PostWithRelations) =>
    !!role && ((MANAGER_ROLES.includes(role) && WRITABLE_STATUSES.includes(record.post.status)) || (role === "designer" && record.post.created_by === user?.id && record.post.status === "draft")),
  [role, user?.id]);
  const canDelete = useCallback((record: PostWithRelations) =>
    !!role && (MANAGER_ROLES.includes(role) || (role === "designer" && record.post.created_by === user?.id && record.post.status === "draft")),
  [role, user?.id]);

  const load = useCallback(async () => {
    if (!activeWorkspace) {
      setLoading(workspaceLoading);
      setUpcoming([]);
      setRecent([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextCounts, nextUpcoming, nextRecent, nextDistribution, nextPublishingCounts, nextPublishing, nextApprovalCounts, nextApprovals] = await Promise.all([
        getPostCounts(activeWorkspace.id),
        getUpcomingPosts(activeWorkspace.id, 5),
        getRecentPosts(activeWorkspace.id, 5),
        getPlatformDistribution(activeWorkspace.id),
        getPublishingCounts(activeWorkspace.id),
        listRecentPublishingResults(activeWorkspace.id, 5),
        getApprovalCounts(activeWorkspace.id),
        listApprovalRequests({ workspaceId: activeWorkspace.id, tab: "pending", page: 1, pageSize: 5, sort: "due_asc" }),
      ]);
      setCounts(nextCounts);
      setUpcoming(nextUpcoming);
      setRecent(nextRecent);
      setDistribution(nextDistribution);
      setPublishingCounts(nextPublishingCounts);
      setRecentPublishing(nextPublishing);
      setApprovalCounts(nextApprovalCounts);
      setRecentApprovals(nextApprovals.items);
    } catch (loadError) {
      setError(getPostErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, workspaceLoading]);

  useEffect(() => void load(), [load]);

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
      toast.success("Post deleted", "Media files remain in the workspace library.");
      await load();
    } catch (mutationError) {
      toast.error("Delete failed", getPostErrorMessage(mutationError));
    } finally {
      setMutating(false);
      setToDelete(null);
    }
  };

  const platformBars = useMemo(() => Object.entries(distribution)
    .map(([platform, value]) => ({
      label: PLATFORMS[platform as SocialPlatform].label,
      value,
      color: PLATFORM_COLORS[platform as SocialPlatform],
      icon: <PlatformIcon platform={platform as SocialPlatform} size="sm" />,
    })), [distribution]);

  const displayName = String(user?.user_metadata?.full_name || user?.email?.split("@")[0] || "there");

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${displayName.split(" ")[0]}`}
        description={`Live post activity for ${activeWorkspace?.name || "your active workspace"}.`}
        actions={<><Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Refresh</Button><Link href="/dashboard/calendar"><Button variant="outline"><CalendarIcon className="h-4 w-4" /> View Calendar</Button></Link>{canCreate && <Link href="/dashboard/create"><Button><PlusCircle className="h-4 w-4" /> Create Post</Button></Link>}</>}
      />

      {error && <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {loading ? Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-36" />) : <>
          <MetricCard label="Scheduled Posts" value={counts.scheduled} icon={CalendarClock} tone="brand" hint="Persisted schedules" />
          <MetricCard label="Publishing Now" value={publishingCounts.publishing} icon={Send} tone="brand" hint="Active destination jobs" />
          <MetricCard label="Published This Month" value={counts.publishedThisMonth} icon={CheckCircle2} tone="success" hint="Database publishing records" />
          <MetricCard label="Failed Jobs" value={publishingCounts.failed} icon={XCircle} tone="danger" hint="Destination-level failures" />
          <MetricCard label="Needs Verification" value={publishingCounts.reconciliationRequired} icon={AlertTriangle} tone="warning" hint="Uncertain provider results" />
        </>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {loading ? Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-28" />) : <>
          <MetricCard label="Pending Approval" value={approvalCounts.pending} icon={ShieldCheck} tone="warning" hint="Workspace requests" />
          <MetricCard label="Awaiting My Approval" value={approvalCounts.awaitingMine} icon={UserRoundCheck} tone="brand" hint="Assigned to you" />
          <MetricCard label="Changes Requested" value={approvalCounts.changesRequested} icon={MessageSquareWarning} tone="warning" hint="Needs another revision" />
          <MetricCard label="Overdue Approvals" value={approvalCounts.overdue} icon={Clock3} tone="danger" hint="Past their deadline" />
          <MetricCard label="Recently Approved" value={approvalCounts.recentlyApproved} icon={CheckCircle2} tone="success" hint="Last 7 days" />
        </>}
      </div>

      <Card>
        <CardHeader title="Approval queue" description="Pending workspace reviews ordered by deadline" action={<Link href="/dashboard/approvals" className="inline-flex items-center gap-1 text-sm font-medium text-brand-text hover:underline">Open Approval Centre <ArrowRight className="h-3.5 w-3.5" /></Link>} />
        <CardBody>
          {recentApprovals.length === 0 ? <p className="py-4 text-center text-sm text-ink-muted">No pending approvals.</p> : <div className="divide-y divide-border">
            {recentApprovals.map((item) => <div key={item.request.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[minmax(0,1.5fr)_minmax(120px,1fr)_minmax(120px,1fr)_auto] sm:items-center">
              <p className="truncate font-medium text-ink">{truncate(item.post?.post.caption || "Untitled post", 70)}</p>
              <p className="text-ink-muted">{item.requester.name}</p>
              <p className="text-ink-muted">{item.approver?.name ?? "Unassigned"}</p>
              <p className={item.overdue ? "font-medium text-danger" : "text-ink-muted"}>{item.request.due_at ? formatDateTime(item.request.due_at) : "No deadline"}</p>
            </div>)}
          </div>}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <PostListCard title="Upcoming posts" description="Next persisted schedules" records={upcoming} loading={loading} emptyTitle="Nothing scheduled yet" emptyDescription="Schedule a post to see it here." canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} onEdit={(record) => router.push(`/dashboard/create?post=${record.post.id}`)} onDuplicate={(record) => void runDuplicate(record)} onDelete={setToDelete} />
        <Card>
          <CardHeader title="Platform usage" description="Live post-platform relationships" action={<Link href="/dashboard/posts" className="text-sm font-medium text-brand-text hover:underline">Explore</Link>} />
          <CardBody>{loading ? <div className="space-y-4">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-5" />)}</div> : <HorizontalBars data={platformBars} ariaLabel="Live platform distribution" />}</CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent publishing results" description="Latest destination-level queue outcomes" action={<Link href="/dashboard/posts" className="text-sm font-medium text-brand-text hover:underline">View details</Link>} />
        <CardBody>{recentPublishing.length === 0 ? <p className="py-4 text-center text-sm text-ink-muted">No publishing jobs yet.</p> : <div className="divide-y divide-border">{recentPublishing.map((job) => <div key={job.id} className="flex items-center gap-3 py-3"><PlatformIcon platform={job.platform} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-ink">{job.operation.replaceAll("_", " ")}</p><p className="text-xs text-ink-subtle">Revision {job.post_revision} · {job.attempt_count} attempt{job.attempt_count === 1 ? "" : "s"}</p></div><span className="text-xs font-semibold capitalize text-ink-muted">{job.status.replaceAll("_", " ")}</span></div>)}</div>}</CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Engagement preview" description="Demo analytics data; social publishing integrations are not connected" action={<span className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-xs font-semibold text-info"><TrendingUp className="h-3 w-3" /> Demo</span>} />
          <CardBody><BarChart ariaLabel="Demo engagement by day of week" data={analytics.byDay.map((day) => ({ label: day.day, value: day.engagement }))} /></CardBody>
        </Card>
        <PostListCard title="Recent posts" description="Latest database records" records={recent} loading={loading} emptyTitle="No posts yet" emptyDescription="Persisted drafts and schedules appear here." canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} onEdit={(record) => router.push(`/dashboard/create?post=${record.post.id}`)} onDuplicate={(record) => void runDuplicate(record)} onDelete={setToDelete} compact />
      </div>

      <Card>
        <CardHeader title="Content performance" description="Demo analytics only; these figures are not derived from Supabase posts" action={<Link href="/dashboard/analytics" className="inline-flex items-center gap-1 text-sm font-medium text-brand-text hover:underline">View demo analytics <ArrowRight className="h-3.5 w-3.5" /></Link>} />
        <CardBody><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><PerfStat label="Demo reach" value={formatCompact(analytics.summary.totalReach)} /><PerfStat label="Demo engagement" value={formatCompact(analytics.summary.totalEngagement)} /><PerfStat label="Demo link clicks" value={formatCompact(analytics.summary.linkClicks)} /><PerfStat label="Demo followers gained" value={`+${formatCompact(analytics.summary.followersGained)}`} /></div></CardBody>
      </Card>

      <ConfirmModal open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={() => void runDelete()} title="Delete post?" message="The post and its child relationships will be removed. Media files remain available." confirmLabel={mutating ? "Deleting..." : "Delete"} destructive />
    </div>
  );
}

function PostListCard({ title, description, records, loading, emptyTitle, emptyDescription, canCreate, canEdit, canDelete, onEdit, onDuplicate, onDelete, compact = false }: {
  title: string;
  description: string;
  records: PostWithRelations[];
  loading: boolean;
  emptyTitle: string;
  emptyDescription: string;
  canCreate: boolean;
  canEdit: (record: PostWithRelations) => boolean;
  canDelete: (record: PostWithRelations) => boolean;
  onEdit: (record: PostWithRelations) => void;
  onDuplicate: (record: PostWithRelations) => void;
  onDelete: (record: PostWithRelations) => void;
  compact?: boolean;
}) {
  return <Card className={compact ? "" : "lg:col-span-2"}>
    <CardHeader title={title} description={description} action={<Link href="/dashboard/posts" className="inline-flex items-center gap-1 text-sm font-medium text-brand-text hover:underline">View all <ArrowRight className="h-3.5 w-3.5" /></Link>} />
    <CardBody className="space-y-2.5">{loading ? Array.from({ length: compact ? 3 : 5 }, (_, index) => <Skeleton key={index} className="h-20" />) : records.length ? records.map((record) => <UpcomingPostRow key={record.post.id} post={toSocialPost(record)} onEdit={canEdit(record) ? () => onEdit(record) : undefined} onDuplicate={canCreate ? () => onDuplicate(record) : undefined} onDelete={canDelete(record) ? () => onDelete(record) : undefined} />) : <EmptyState icon={compact ? FileText : CalendarClock} title={emptyTitle} description={emptyDescription} action={canCreate ? <Link href="/dashboard/create"><Button size="sm">Create Post</Button></Link> : undefined} />}</CardBody>
  </Card>;
}

function PerfStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-surface-muted/40 p-4"><p className="text-2xl font-bold text-ink">{value}</p><p className="mt-1 text-sm text-ink-muted">{label}</p></div>;
}
