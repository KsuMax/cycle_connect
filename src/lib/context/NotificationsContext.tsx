"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthContext";
import type { DbNotification } from "@/lib/supabase";

interface NotificationsContextValue {
  notifications: DbNotification[];
  unreadCount: number;
  loaded: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  refresh: () => Promise<void>;
}

const DEFAULT_VALUE: NotificationsContextValue = {
  notifications: [],
  unreadCount: 0,
  loaded: false,
  markAsRead: async () => {},
  markAllRead: async () => {},
  dismiss: async () => {},
  clearAll: async () => {},
  refresh: async () => {},
};

const NotificationsContext = createContext<NotificationsContextValue>(DEFAULT_VALUE);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<DbNotification[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setLoaded(true);
      return;
    }
    const { data, error } = await supabase
      .from("notifications")
      .select("*, actor:profiles!actor_id(id, name, avatar_url)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[NotificationsContext] failed to load notifications", error.message);
    } else if (data) {
      setNotifications(data as unknown as DbNotification[]);
    }
    setLoaded(true);
  }, [user]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Subscribe to realtime notifications — append single row instead of refetching all 50
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const newId = (payload.new as { id: string }).id;
          const { data, error } = await supabase
            .from("notifications")
            .select("*, actor:profiles!actor_id(id, name, avatar_url)")
            .eq("id", newId)
            .single();
          if (!error && data) {
            setNotifications((prev) => [data as unknown as DbNotification, ...prev]);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id?: string }).id;
          if (deletedId) {
            setNotifications((prev) => prev.filter((n) => n.id !== deletedId));
          } else {
            // DELETE payload may be empty when REPLICA IDENTITY is DEFAULT — refetch as fallback.
            loadNotifications();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  }, []);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
  }, [user]);

  const dismiss = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) {
      console.error("[NotificationsContext] failed to dismiss notification", error.message);
      loadNotifications();
    }
  }, [loadNotifications]);

  const clearAll = useCallback(async () => {
    if (!user) return;
    setNotifications([]);
    const { error } = await supabase.from("notifications").delete().eq("user_id", user.id);
    if (error) {
      console.error("[NotificationsContext] failed to clear notifications", error.message);
      loadNotifications();
    }
  }, [user, loadNotifications]);

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, loaded, markAsRead, markAllRead, dismiss, clearAll, refresh: loadNotifications }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
