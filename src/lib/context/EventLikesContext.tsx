"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";

interface EventLikesContextValue {
  isLiked: (eventId: string) => boolean;
  toggleLike: (eventId: string) => Promise<void>;
}

const EventLikesContext = createContext<EventLikesContextValue | null>(null);

export function EventLikesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [liked, setLiked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setLiked(new Set());
      return;
    }
    supabase
      .from("event_likes")
      .select("event_id")
      .eq("user_id", user.id)
      .then(({ data, error }) => {
        if (error) {
          console.error("[EventLikesContext] failed to load likes", error.message);
          return;
        }
        if (data) setLiked(new Set(data.map((r: { event_id: string }) => r.event_id)));
      });
  }, [user]);

  const isLiked = useCallback((eventId: string) => liked.has(eventId), [liked]);

  const toggleLike = useCallback(async (eventId: string) => {
    if (!user) return;
    const wasLiked = liked.has(eventId);

    // Optimistic update
    setLiked((prev) => {
      const next = new Set(prev);
      wasLiked ? next.delete(eventId) : next.add(eventId);
      return next;
    });

    const { error: likeError } = wasLiked
      ? await supabase.from("event_likes").delete().eq("user_id", user.id).eq("event_id", eventId)
      : await supabase.from("event_likes").insert({ user_id: user.id, event_id: eventId });

    if (likeError) {
      // Rollback optimistic update
      setLiked((prev) => {
        const next = new Set(prev);
        wasLiked ? next.add(eventId) : next.delete(eventId);
        return next;
      });
      showToast("Не удалось обновить лайк — попробуй ещё раз", "error");
    }
  }, [user, liked, showToast]);

  return (
    <EventLikesContext.Provider value={{ isLiked, toggleLike }}>
      {children}
    </EventLikesContext.Provider>
  );
}

export function useEventLikes() {
  const ctx = useContext(EventLikesContext);
  if (!ctx) throw new Error("useEventLikes must be used within EventLikesProvider");
  return ctx;
}
