"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore, Bell, Check, CheckCheck, ExternalLink, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { useNotifications } from "@/hooks/useNotifications";
import {
  archive as archiveNotification, isSafeNotificationPath, listNotifications,
  markRead, unarchive as unarchiveNotification,
} from "@/lib/services/notification-service";
import { formatRelative } from "@/lib/utils";
import type { Notification, NotificationListOptions } from "@/types";

type View = "all" | "unread" | "team" | "approvals" | "publishing" | "social" | "archived";
const PAGE_SIZE = 15;

export default function NotificationsPage() {
  const router = useRouter();
  const context = useNotifications();
  const [view, setView] = useState<View>("all"); const [query, setQuery] = useState("");
  const [page, setPage] = useState(1); const [items, setItems] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0); const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const options: NotificationListOptions = { page, pageSize: PAGE_SIZE, search: query || undefined };
    if (view === "unread") options.unreadOnly = true;
    else if (view === "archived") options.archived = true;
    else if (view !== "all") options.category = view;
    try { const result = await listNotifications(options); setItems(result.items); setTotal(result.total); }
    catch { setError("Notifications could not be loaded. Please retry."); }
    finally { setLoading(false); }
  }, [page, query, view]);
  useEffect(() => { void load(); }, [load, context.unreadCount]);

  const open = async (item: Notification) => {
    if (!item.readAt) await markRead(item.id);
    await context.refresh(); setItems((current) => current.map((row) => row.id === item.id ? { ...row, readAt: row.readAt ?? new Date().toISOString() } : row));
    if (isSafeNotificationPath(item.actionPath)) router.push(item.actionPath);
  };
  const toggleArchive = async (item: Notification) => {
    if (item.archivedAt) await unarchiveNotification(item.id); else await archiveNotification(item.id);
    await Promise.all([load(), context.refresh()]);
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="Team, approval, publishing and account activity for your Towkn account."
        actions={<Button variant="outline" onClick={() => void context.markAllRead()} disabled={context.unreadCount === 0}><CheckCheck className="h-4 w-4" aria-hidden /> Mark all read</Button>} />
      <Tabs active={view} onChange={(id) => { setView(id as View); setPage(1); }} tabs={[
        { id: "all", label: "All" }, { id: "unread", label: "Unread", count: context.unreadCount },
        { id: "team", label: "Team" }, { id: "approvals", label: "Approvals" },
        { id: "publishing", label: "Publishing" }, { id: "social", label: "Social Accounts" },
        { id: "archived", label: "Archived" },
      ]} />
      <div className="flex items-center gap-3">
        <SearchInput value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder="Search notifications…" className="max-w-md" />
        <Button variant="outline" size="sm" onClick={() => void load()} title="Refresh"><RefreshCw className="h-4 w-4" aria-hidden /> Refresh</Button>
      </div>
      {loading ? <div className="space-y-3">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-24 w-full" />)}</div>
        : error ? <EmptyState icon={Bell} title="Notifications unavailable" description={error} action={<Button onClick={() => void load()}>Retry</Button>} />
        : items.length === 0 ? <EmptyState icon={Bell} title="Nothing here" description="No notifications match this view." />
        : <div className="divide-y divide-border border-y border-border bg-surface">
          {items.map((item) => <article key={item.id} className={item.readAt ? "px-4 py-4" : "bg-brand-soft/30 px-4 py-4"}>
            <div className="flex items-start gap-3">
              <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${item.readAt ? "bg-border" : "bg-brand"}`} />
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-ink">{item.title}</h2>
                {!item.readAt && <Badge tone="brand">Unread</Badge>}
              </div>{item.body && <p className="mt-1 text-sm text-ink-muted">{item.body}</p>}
                <p className="mt-2 text-xs text-ink-subtle">{formatRelative(item.createdAt)}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                {!item.readAt && <button type="button" title="Mark as read" onClick={() => void open({ ...item, actionPath: null })} className="rounded-lg p-2 text-ink-muted hover:bg-surface-muted"><Check className="h-4 w-4" /></button>}
                {isSafeNotificationPath(item.actionPath) && <button type="button" title="Open" onClick={() => void open(item)} className="rounded-lg p-2 text-ink-muted hover:bg-surface-muted"><ExternalLink className="h-4 w-4" /></button>}
                <button type="button" title={item.archivedAt ? "Unarchive" : "Archive"} onClick={() => void toggleArchive(item)} className="rounded-lg p-2 text-ink-muted hover:bg-surface-muted">
                  {item.archivedAt ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </article>)}
        </div>}
      <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} onPageChange={setPage} totalItems={total} pageSize={PAGE_SIZE} />
    </div>
  );
}
