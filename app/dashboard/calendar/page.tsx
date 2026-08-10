"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, PlusCircle, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PostDetail } from "@/components/posts/PostDetail";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterSelect, SegmentedControl } from "@/components/ui/FilterSelect";
import { FormField, Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { Skeleton } from "@/components/ui/Skeleton";
import { PostStatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getMonthMatrix, getWeekDates, monthLabel, WEEKDAYS } from "@/lib/calendar";
import { PLATFORM_LIST, POST_STATUS_META } from "@/lib/constants";
import { getPostErrorMessage } from "@/lib/post-errors";
import {
  deletePost,
  duplicatePost,
  listCalendarPosts,
  toSocialPost,
  updatePost,
} from "@/lib/services/post-service";
import {
  formatInWorkspaceTime,
  utcToWorkspaceFields,
  workspaceDateTimeToUtc,
} from "@/lib/timezone";
import { cn, truncate } from "@/lib/utils";
import type { CalendarPost, PostStatus, SocialPlatform } from "@/types";

type View = "month" | "week" | "list";
const MANAGER_ROLES = ["owner", "administrator", "content_manager"];
const CREATOR_ROLES = [...MANAGER_ROLES, "designer"];
const WRITABLE_STATUSES: PostStatus[] = ["draft", "scheduled", "cancelled"];

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function writeInput(record: CalendarPost, status: "scheduled" | "cancelled", scheduledAt: string | null) {
  return {
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
    mediaAssetIds: record.mediaLinks.map((row) => row.media_asset_id),
    destinationAccountIds: record.destinations.map((destination) => destination.social_account_id),
  };
}

export default function CalendarPage() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { activeWorkspace, activeMembership, loading: workspaceLoading } = useWorkspace();
  const [records, setRecords] = useState<CalendarPost[]>([]);
  const [cursor, setCursor] = useState(() => new Date());
  const [view, setView] = useState<View>("month");
  const [platform, setPlatform] = useState<SocialPlatform | "all">("all");
  const [status, setStatus] = useState<PostStatus | "all">("all");
  const [selected, setSelected] = useState<CalendarPost | null>(null);
  const [toDelete, setToDelete] = useState<CalendarPost | null>(null);
  const [reschedule, setReschedule] = useState<CalendarPost | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const zone = activeWorkspace?.timezone || "UTC";
  const role = activeMembership?.role;
  const canCreate = !!role && CREATOR_ROLES.includes(role);
  const canSchedule = !!role && MANAGER_ROLES.includes(role);
  const canEdit = useCallback(
    (record: CalendarPost) =>
      !!role &&
      ((MANAGER_ROLES.includes(role) && WRITABLE_STATUSES.includes(record.post.status)) ||
        (role === "designer" && record.post.created_by === user?.id && record.post.status === "draft")),
    [role, user?.id],
  );
  const canDelete = useCallback(
    (record: CalendarPost) =>
      !!role &&
      (MANAGER_ROLES.includes(role) ||
        (role === "designer" && record.post.created_by === user?.id && record.post.status === "draft")),
    [role, user?.id],
  );

  const visibleDays = useMemo(
    () => (view === "week" ? getWeekDates(cursor) : getMonthMatrix(cursor)),
    [cursor, view],
  );

  const load = useCallback(async () => {
    if (!activeWorkspace) {
      setRecords([]);
      setLoading(workspaceLoading);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const days = view === "week" ? getWeekDates(cursor) : getMonthMatrix(cursor);
      const first = localDateKey(days[0]);
      const last = localDateKey(days[days.length - 1]);
      const result = await listCalendarPosts(
        activeWorkspace.id,
        workspaceDateTimeToUtc(first, "00:00", zone),
        workspaceDateTimeToUtc(last, "23:59", zone),
      );
      setRecords(result);
    } catch (loadError) {
      setError(getPostErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, cursor, view, workspaceLoading, zone]);

  useEffect(() => void load(), [load]);

  const filtered = useMemo(
    () => records.filter((record) => {
      if (platform !== "all" && !record.platforms.some((row) => row.platform === platform)) return false;
      if (status !== "all" && record.post.status !== status) return false;
      return true;
    }),
    [platform, records, status],
  );

  const postsForDay = (day: Date) => filtered.filter((record) => {
    if (!record.displayDate) return false;
    return formatInWorkspaceTime(record.displayDate, zone, "yyyy-MM-dd") === localDateKey(day);
  });

  const shift = (direction: number) => setCursor((current) => {
    const next = new Date(current);
    if (view === "week") next.setDate(current.getDate() + direction * 7);
    else next.setMonth(current.getMonth() + direction);
    return next;
  });

  const runDuplicate = async (record: CalendarPost) => {
    setMutating(true);
    try {
      const newId = await duplicatePost(record.post.id);
      toast.success("Post duplicated", "A persisted draft copy was created.");
      setSelected(null);
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
      toast.success("Post deleted", "Its media files remain in the workspace library.");
      setSelected(null);
      await load();
    } catch (mutationError) {
      toast.error("Delete failed", getPostErrorMessage(mutationError));
    } finally {
      setMutating(false);
      setToDelete(null);
    }
  };

  const openReschedule = (record: CalendarPost) => {
    const fields = utcToWorkspaceFields(record.post.scheduled_at!, record.post.timezone || zone);
    setScheduleDate(fields.date);
    setScheduleTime(fields.time);
    setReschedule(record);
  };

  const saveReschedule = async () => {
    if (!reschedule) return;
    setMutating(true);
    try {
      const scheduledAt = workspaceDateTimeToUtc(scheduleDate, scheduleTime, reschedule.post.timezone || zone);
      if (new Date(scheduledAt).getTime() <= Date.now()) throw new Error("Choose a future time.");
      await updatePost(reschedule.post.id, reschedule.post.revision, writeInput(reschedule, "scheduled", scheduledAt));
      toast.success("Schedule updated", `The time was saved in ${reschedule.post.timezone || zone}.`);
      setReschedule(null);
      setSelected(null);
      await load();
    } catch (mutationError) {
      toast.error("Reschedule failed", mutationError instanceof Error && mutationError.message === "Choose a future time." ? mutationError.message : getPostErrorMessage(mutationError));
    } finally {
      setMutating(false);
    }
  };

  const cancelSchedule = async (record: CalendarPost) => {
    setMutating(true);
    try {
      await updatePost(record.post.id, record.post.revision, writeInput(record, "cancelled", null));
      toast.success("Schedule cancelled", "The post remains available with cancelled status.");
      setSelected(null);
      await load();
    } catch (mutationError) {
      toast.error("Cancellation failed", getPostErrorMessage(mutationError));
    } finally {
      setMutating(false);
    }
  };

  const todayKey = utcToWorkspaceFields(new Date().toISOString(), zone).date;
  const week = getWeekDates(cursor);
  const rangeLabel = view === "week"
    ? `${localDateKey(week[0])} to ${localDateKey(week[6])}`
    : monthLabel(cursor);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Calendar"
        description={`Real scheduled posts shown in ${zone}.`}
        actions={<div className="flex gap-2"><Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Refresh</Button>{canCreate && <Link href="/dashboard/create"><Button><PlusCircle className="h-4 w-4" /> Create Post</Button></Link>}</div>}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-surface">
            <button type="button" onClick={() => shift(-1)} aria-label="Previous period" className="p-2 text-ink-muted hover:bg-surface-muted"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => shift(1)} aria-label="Next period" className="border-l border-border p-2 text-ink-muted hover:bg-surface-muted"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
          <h2 className="text-sm font-semibold text-ink sm:text-base">{rangeLabel}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterSelect label="Platform" value={platform} onChange={(value) => setPlatform(value as SocialPlatform | "all")} options={[{ value: "all", label: "All" }, ...PLATFORM_LIST.map((item) => ({ value: item.id, label: item.label }))]} />
          <FilterSelect label="Status" value={status} onChange={(value) => setStatus(value as PostStatus | "all")} options={[{ value: "all", label: "All" }, ...Object.entries(POST_STATUS_META).map(([value, meta]) => ({ value, label: meta.label }))]} />
          <SegmentedControl value={view} onChange={setView} options={[{ value: "month", label: "Month" }, { value: "week", label: "Week" }, { value: "list", label: "List" }]} />
        </div>
      </div>

      {loading ? <CalendarSkeleton /> : error ? <EmptyState icon={CalendarDays} title="Calendar could not be loaded" description={error} action={<Button onClick={() => void load()}>Retry</Button>} /> : view === "list" ? (
        <CalendarList records={filtered} zone={zone} onSelect={setSelected} />
      ) : (
        <CalendarGrid days={visibleDays} cursor={cursor} weekView={view === "week"} todayKey={todayKey} zone={zone} postsForDay={postsForDay} onSelect={setSelected} />
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Post details" size="md" centered={false}>
        {selected && <PostDetail post={toSocialPost(selected)} onEdit={canEdit(selected) ? () => router.push(`/dashboard/create?post=${selected.post.id}`) : undefined} onDuplicate={canCreate ? () => void runDuplicate(selected) : undefined} onDelete={canDelete(selected) ? () => setToDelete(selected) : undefined} />}
        {selected?.publishingState === "reconciliation_required" && <p className="mt-3 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-ink-muted">Manual provider verification is required before another publication is attempted.</p>}
        {selected?.approval && <p className={cn("mt-3 rounded-lg border px-3 py-2 text-sm capitalize", selected.approvalOverdue || selected.approvalStale ? "border-danger/30 bg-danger-soft text-danger" : "border-warning/30 bg-warning-soft text-ink-muted")}>Approval: {selected.approval.status.replaceAll("_", " ")}{selected.approvalStale ? " · stale revision" : ""}{selected.approvalOverdue ? " · overdue" : ""}{selected.scheduleNeedsUpdating ? " · schedule needs updating" : ""}</p>}
        {selected && canSchedule && selected.post.status === "scheduled" && !selected.post.approval_required && <div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => openReschedule(selected)}>Reschedule</Button><Button size="sm" variant="outline" onClick={() => void cancelSchedule(selected)} loading={mutating}>Cancel schedule</Button></div>}
      </Modal>
      <Modal open={!!reschedule} onClose={() => setReschedule(null)} title="Reschedule post" description={`Times are interpreted in ${reschedule?.post.timezone || zone}.`} size="sm" footer={<><Button variant="outline" onClick={() => setReschedule(null)}>Cancel</Button><Button loading={mutating} onClick={() => void saveReschedule()}>Save schedule</Button></>}>
        <div className="grid grid-cols-2 gap-3"><FormField label="Date" htmlFor="calendar-date"><Input id="calendar-date" type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} /></FormField><FormField label="Time" htmlFor="calendar-time"><Input id="calendar-time" type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} /></FormField></div>
      </Modal>
      <ConfirmModal open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={() => void runDelete()} title="Delete post?" message="Post relationships are removed, while media files remain in the workspace library." confirmLabel={mutating ? "Deleting..." : "Delete"} destructive />
    </div>
  );
}

function CalendarGrid({ days, cursor, weekView, todayKey, zone, postsForDay, onSelect }: {
  days: Date[];
  cursor: Date;
  weekView: boolean;
  todayKey: string;
  zone: string;
  postsForDay: (day: Date) => CalendarPost[];
  onSelect: (record: CalendarPost) => void;
}) {
  return <Card className="overflow-hidden">
    <div className="grid grid-cols-7 border-b border-border bg-surface-muted/60">{WEEKDAYS.map((day) => <div key={day} className="px-2 py-2.5 text-center text-xs font-semibold text-ink-muted"><span className="sm:hidden">{day[0]}</span><span className="hidden sm:inline">{day}</span></div>)}</div>
    <div className="grid grid-cols-7">{days.map((day) => {
      const records = postsForDay(day);
      const inMonth = weekView || day.getMonth() === cursor.getMonth();
      const today = localDateKey(day) === todayKey;
      return <div key={localDateKey(day)} className={cn("min-h-[104px] border-b border-r border-border p-1.5 sm:min-h-[128px]", !inMonth && "bg-surface-muted/40")}>
        <div className="mb-1 flex justify-end"><span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium", today ? "bg-brand text-white" : inMonth ? "text-ink" : "text-ink-subtle")}>{day.getDate()}</span></div>
        <div className="space-y-1">{records.slice(0, 3).map((record) => <button key={record.post.id} type="button" onClick={() => onSelect(record)} className={cn("w-full rounded-md border bg-surface px-1.5 py-1 text-left hover:bg-surface-muted", record.approvalOverdue || record.scheduleNeedsUpdating ? "border-danger/50" : record.approval?.status === "pending" ? "border-warning/50" : record.approval?.status === "approved" ? "border-success/50" : "border-border")}><div className="flex items-center gap-1"><PlatformIcon platform={record.platforms[0]?.platform || "facebook"} size="sm" /><span className="truncate text-[11px] text-ink">{truncate(record.post.caption || "Untitled post", 28)}</span></div><span className="text-[10px] text-ink-subtle">{formatInWorkspaceTime(record.post.scheduled_at!, zone, "HH:mm")}{record.scheduleNeedsUpdating ? " · update schedule" : record.approval ? ` · ${record.approval.status.replaceAll("_", " ")}` : ""}</span></button>)}{records.length > 3 && <p className="px-1 text-[10px] text-ink-subtle">+{records.length - 3} more</p>}</div>
      </div>;
    })}</div>
  </Card>;
}

function CalendarList({ records, zone, onSelect }: { records: CalendarPost[]; zone: string; onSelect: (record: CalendarPost) => void }) {
  if (!records.length) return <EmptyState icon={CalendarDays} title="No scheduled posts" description="No persisted schedules match this period and filter set." />;
  return <Card className="divide-y divide-border">{records.map((record) => <button key={record.post.id} type="button" onClick={() => onSelect(record)} className="flex w-full items-center gap-3 p-3.5 text-left hover:bg-surface-muted"><div className="w-20 shrink-0 text-center"><p className="text-xs text-ink-muted">{formatInWorkspaceTime(record.post.scheduled_at!, zone, "MMM d")}</p><p className="text-sm font-semibold text-ink">{formatInWorkspaceTime(record.post.scheduled_at!, zone, "HH:mm")}</p></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-ink">{record.post.caption || "Untitled post"}</p><div className="mt-1 flex gap-1">{record.platforms.map((row) => <PlatformIcon key={row.platform} platform={row.platform} size="sm" />)}</div>{record.approval && <p className={cn("mt-1 text-xs font-medium capitalize", record.approvalOverdue || record.approvalStale ? "text-danger" : record.approval.status === "approved" ? "text-success" : "text-warning")}>{record.scheduleNeedsUpdating ? "Schedule needs updating" : record.approval.status.replaceAll("_", " ")}</p>}{record.publishingState === "reconciliation_required" && <p className="mt-1 text-xs font-medium text-warning">Manual verification required</p>}</div><PostStatusBadge status={record.post.status} /></button>)}</Card>;
}

function CalendarSkeleton() {
  return <Card className="p-4"><div className="grid grid-cols-7 gap-2">{Array.from({ length: 35 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div></Card>;
}
