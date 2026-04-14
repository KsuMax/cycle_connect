"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";

const STORAGE_KEY = "cc_favorites";

interface FavoritesContextValue {
  favorites: Set<string>;
  toggleFavorite: (routeId: string) => Promise<void>;
  isFavorite: (routeId: string) => boolean;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) {
      supabase
        .from("route_favorites")
        .select("route_id")
        .eq("user_id", user.id)
        .then(({ data, error }) => {
          if (error) {
            console.error("[FavoritesContext] failed to load favorites", error.message);
            return;
          }
          if (data) setFavorites(new Set(data.map((r: { route_id: string }) => r.route_id)));
        });
    } else {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        setFavorites(stored ? new Set(JSON.parse(stored)) : new Set());
      } catch {
        setFavorites(new Set());
      }
    }
  }, [user]);

  const toggleFavorite = useCallback(async (routeId: string) => {
    const wasFavorite = favorites.has(routeId);

    // Optimistic update
    const next = new Set(favorites);
    wasFavorite ? next.delete(routeId) : next.add(routeId);
    setFavorites(next);

    if (user) {
      const { error } = wasFavorite
        ? await supabase.from("route_favorites").delete().eq("user_id", user.id).eq("route_id", routeId)
        : await supabase.from("route_favorites").insert({ user_id: user.id, route_id: routeId });

      if (error) {
        // Rollback optimistic update
        setFavorites(favorites);
        showToast("Не удалось обновить избранное — попробуй ещё раз", "error");
      }
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
    }
  }, [user, favorites, showToast]);

  const isFavorite = useCallback((routeId: string) => favorites.has(routeId), [favorites]);

  return (
    <FavoritesContext.Provider value={{ favorites, toggleFavorite, isFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used within FavoritesProvider");
  return ctx;
}
