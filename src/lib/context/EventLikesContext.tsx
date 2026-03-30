"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthContext";

interface EventLikesContextValue {
  isLiked: (eventId: string) => boolean;
  toggleLike: (eventId: string, currentCount: number) => Promise<void>;
}

const EventLikesContext = createContext<EventLikesContextValue | null>(null);

export function EventLikesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
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
      .then(({ data }) => {
        if (data) setLiked(new Set(data.map((r: { event_id: string }) => r.event_id)));
      });
  }, [user]);

  const isLiked = useCallback((eventId: string) => liked.has(eventId), [liked]);

  const toggleLike = useCallback(async (eventId: string, currentCount: number) => {
    if (!user) return;
    const wasLiked = liked.has(eventId);

    setLiked((prev) => {
      const next = new Set(prev);
      wasLiked ? next.delete(eventId) : next.add(eventId);
      return next;
    });

    if (wasLiked) {
      await supabase.from("event_likes").delete().eq("user_id", user.id).eq("event_id", eventId);
    } else {
      await supabase.from("event_likes").insert({ user_id: user.id, event_id: eventId });
    }
    await supabase
      .from("events")
      .update({ likes_count: wasLiked ? currentCount - 1 : currentCount + 1 })
      .eq("id", eventId);
  }, [user, liked]);

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
