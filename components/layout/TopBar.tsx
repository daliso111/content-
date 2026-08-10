"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronDown,
  HelpCircle,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeft,
  Search,
  Settings,
  User2,
  Check,
  CheckCheck,
} from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/hooks/useWorkspace";
import { formatRelative } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/useNotifications";
import { isSafeNotificationPath } from "@/lib/services/notification-service";

export function TopBar({
  onOpenMobileNav,
  onToggleCollapse,
  collapsed,
}: {
  onOpenMobileNav: () => void;
  onToggleCollapse: () => void;
  collapsed: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { user, signOut } = useAuth();
  const { unreadCount } = useNotifications();
  const {
    workspaces,
    activeWorkspace,
    loading: workspacesLoading,
    selectWorkspace,
  } = useWorkspace();
  const [notifOpen, setNotifOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const displayName =
    typeof user?.user_metadata.full_name === "string"
      ? user.user_metadata.full_name
      : "PostFlow user";
  const displayRole = user?.email ?? "Signed in";

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    const result = await signOut();
    if (!result.success) {
      setSigningOut(false);
      toast.error("Could not sign out", result.error);
      return;
    }
    toast.success("Signed out", "You have been signed out securely.");
    router.replace("/sign-in");
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-surface/95 px-4 backdrop-blur">
      {/* Mobile menu */}
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
        className="rounded-lg p-2 text-ink-muted hover:bg-surface-muted hover:text-ink lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      {/* Desktop collapse toggle */}
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="hidden rounded-lg p-2 text-ink-muted hover:bg-surface-muted hover:text-ink lg:inline-flex"
      >
        {collapsed ? (
          <PanelLeft className="h-5 w-5" aria-hidden />
        ) : (
          <PanelLeftClose className="h-5 w-5" aria-hidden />
        )}
      </button>

      {/* Workspace selector */}
      <Dropdown
        align="left"
        trigger={
          <span className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand text-xs font-bold text-white">
              {activeWorkspace?.name[0]?.toUpperCase() ?? "W"}
            </span>
            <span className="hidden max-w-[9rem] truncate sm:inline">
              {workspacesLoading
                ? "Loading…"
                : activeWorkspace?.name ?? "No workspace"}
            </span>
            <ChevronDown className="h-4 w-4 text-ink-subtle" aria-hidden />
          </span>
        }
        items={workspaces.map((ws) => ({
          label: ws.name,
          icon:
            ws.id === activeWorkspace?.id ? (
              <Check className="text-brand-text" />
            ) : (
              <span className="h-4 w-4 rounded bg-brand-soft" />
            ),
          onClick: () => {
            selectWorkspace(ws.id);
            toast.success("Workspace switched", `Now viewing ${ws.name}.`);
          },
        }))}
      />

      {/* Search */}
      <div className="relative ml-1 hidden max-w-md flex-1 md:block">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
          aria-hidden
        />
        <input
          type="search"
          placeholder="Search posts, media, people…"
          aria-label="Search"
          className="field h-10 pl-9"
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        {/* Notifications */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((o) => !o)}
            aria-label="Notifications"
            className="relative rounded-lg p-2 text-ink-muted hover:bg-surface-muted hover:text-ink"
          >
            <Bell className="h-5 w-5" aria-hidden />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <NotificationPanel onClose={() => setNotifOpen(false)} />
          )}
        </div>

        {/* Help */}
        <Link
          href="/dashboard/settings"
          aria-label="Help"
          className="hidden rounded-lg p-2 text-ink-muted hover:bg-surface-muted hover:text-ink sm:inline-flex"
        >
          <HelpCircle className="h-5 w-5" aria-hidden />
        </Link>

        {/* Profile */}
        <Dropdown
          trigger={
            <span className="ml-1 flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-surface-muted">
              <Avatar name={displayName} color="#2563EB" size="sm" />
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-medium leading-tight text-ink">
                  {displayName}
                </span>
                <span className="block text-xs leading-tight text-ink-subtle">
                  {displayRole}
                </span>
              </span>
              <ChevronDown className="hidden h-4 w-4 text-ink-subtle sm:block" aria-hidden />
            </span>
          }
          items={[
            {
              label: "Profile",
              icon: <User2 />,
              onClick: () => router.push("/dashboard/settings"),
            },
            {
              label: "Settings",
              icon: <Settings />,
              onClick: () => router.push("/dashboard/settings"),
            },
            {
              label: signingOut ? "Signing out..." : "Sign out",
              icon: <LogOut />,
              separated: true,
              onClick: () => void handleSignOut(),
            },
          ]}
        />
      </div>
    </header>
  );
}

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { notifications, unreadCount, loading, error, markRead, markAllRead } = useNotifications();
  const openNotification = async (notificationId: string, actionPath: string | null) => {
    await markRead(notificationId);
    onClose();
    if (isSafeNotificationPath(actionPath)) router.push(actionPath);
  };
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} aria-hidden />
      <div className="absolute right-0 z-40 mt-1.5 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-pop animate-scale-in">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-ink">Notifications</p>
          <div className="flex items-center gap-2">
            <Badge tone="brand">{unreadCount} new</Badge>
            {unreadCount > 0 && (
              <button type="button" onClick={() => void markAllRead()} title="Mark all as read"
                className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink">
                <CheckCheck className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        </div>
        <div className="max-h-96 divide-y divide-border overflow-y-auto">
          {loading && <p className="px-4 py-8 text-center text-sm text-ink-muted">Loading notifications…</p>}
          {!loading && error && <p className="px-4 py-8 text-center text-sm text-danger">{error}</p>}
          {!loading && !error && notifications.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">You are all caught up.</p>
          )}
          {!loading && notifications.map((n) => (
            <button type="button"
              key={n.id}
              onClick={() => void openNotification(n.id, n.actionPath)}
              className={cn(
                "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted",
                !n.readAt && "bg-brand-soft/40",
              )}
            >
              <span
                className={cn(
                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                  n.readAt ? "bg-transparent" : "bg-brand",
                )}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{n.title}</p>
                {n.body && <p className="mt-0.5 text-xs text-ink-muted">{n.body}</p>}
                <p className="mt-1 text-xs text-ink-subtle">
                  {formatRelative(n.createdAt)}
                </p>
              </div>
            </button>
          ))}
        </div>
        <Link
          href="/dashboard/notifications"
          onClick={onClose}
          className="block border-t border-border px-4 py-2.5 text-center text-sm font-medium text-brand-text hover:bg-surface-muted"
        >
          View all notifications
        </Link>
      </div>
    </>
  );
}
