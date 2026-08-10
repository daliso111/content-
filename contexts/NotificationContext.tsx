"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  getUnreadCount, listNotifications, mapNotification,
  markAllRead as markAllReadService, markRead as markReadService,
} from "@/lib/services/notification-service";
import type { Notification } from "@/types";
import type { Tables } from "@/types/database.generated";

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
  markAllRead: (workspaceId?: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const connectedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!user) { setNotifications([]); setUnreadCount(0); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const [latest, unread] = await Promise.all([
        listNotifications({ pageSize: 8, unreadOnly: true }), getUnreadCount(),
      ]);
      setNotifications(latest.items); setUnreadCount(unread.count);
    } catch {
      setError("Notifications could not be loaded. Refresh to try again.");
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { if (!authLoading) void refresh(); }, [authLoading, refresh]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !user) return;
    if (channelRef.current) void supabase.removeChannel(channelRef.current);
    const channel = supabase.channel(`notifications:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === "DELETE") {
          const removed = payload.old as Partial<Tables<"notifications">>;
          setNotifications((current) => current.filter((item) => item.id !== removed.id));
        } else {
          const next = mapNotification(payload.new as Tables<"notifications">);
          setNotifications((current) => next.readAt || next.archivedAt
            ? current.filter((item) => item.id !== next.id)
            : [next, ...current.filter((item) => item.id !== next.id)]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8));
        }
        void getUnreadCount().then(({ count }) => setUnreadCount(count)).catch(() => undefined);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (connectedRef.current) void refresh();
          connectedRef.current = true;
        }
      });
    channelRef.current = channel;
    return () => {
      connectedRef.current = false; channelRef.current = null; void supabase.removeChannel(channel);
    };
  }, [refresh, user]);

  const markRead = useCallback(async (id: string) => {
    await markReadService(id);
    setNotifications((current) => current.filter((item) => item.id !== id));
    setUnreadCount((count) => Math.max(0, count - (notifications.find((item) => item.id === id)?.readAt ? 0 : 1)));
  }, [notifications]);
  const markAllRead = useCallback(async (workspaceId?: string) => {
    await markAllReadService(workspaceId);
    setNotifications((current) => current.filter((item) => workspaceId && item.workspaceId !== workspaceId));
    await refresh();
  }, [refresh]);

  const value = useMemo(() => ({ notifications, unreadCount, loading, error, refresh, markRead, markAllRead }),
    [notifications, unreadCount, loading, error, refresh, markRead, markAllRead]);
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotificationContext(): NotificationContextValue {
  const value = useContext(NotificationContext);
  if (!value) throw new Error("useNotifications must be used within <NotificationProvider>");
  return value;
}
