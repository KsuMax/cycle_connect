"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";

interface LikesContextValue {
  isLiked: (routeId: string) => boolean;
  toggleLike: (routeId: string, currentCount: number) => Promise<void>;
}

const LikesContext = createContext<LikesContextValue | null>(null);

export function LikesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [liked, setLiked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setLiked(new Set());
      return;
    }
    supabase
      .from("route_likes")
      .select("route_id")
      .eq("user_id", user.id)
      .then(({ data, error }) => {
        if (error) {
          console.error("[LikesContext] failed to load likes", error.message);
          return;
        }
        if (data) setLiked(new Set(data.map((r: { route_id: string }) => r.route_id)));
      });
  }, [user]);

  const isLiked = useCallback((routeId: string) => liked.has(routeId), [liked]);

  const toggleLike = useCallback(async (routeId: string, currentCount: number) => {
    if (!user) return;
    const wasLiked = liked.has(routeId);

    // Optimistic update
    setLiked((prev) => {
      const next = new Set(prev);
      wasLiked ? next.delete(routeId) : next.add(routeId);
      return next;
    });

    const { error: likeError } = wasLiked
      ? await supabase.from("route_likes").delete().eq("user_id", user.id).eq("route_id", routeId)
      : await supabase.from("route_likes").insert({ user_id: user.id, route_id: routeId });

    if (likeError) {
      // Rollback optimistic update
      setLiked((prev) => {
        const next = new Set(prev);
        wasLiked ? next.add(routeId) : next.delete(routeId);
        return next;
      });
      showToast("Не удалось обновить лайк — попробуй ещё раз", "error");
      return;
    }

    await supabase
      .from("routes")
      .update({ likes_count: wasLiked ? currentCount - 1 : currentCount + 1 })
      .eq("id", routeId);
  }, [user, liked, showToast]);

  return (
    <LikesContext.Provider value={{ isLiked, toggleLike }}>
      {children}
    </LikesContext.Provider>
  );
}

export function useLikes() {
  const ctx = useContext(LikesContext);
  if (!ctx) throw new Error("useLikes must be used within LikesProvider");
  return ctx;
}
