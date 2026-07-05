"use client";

import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import { dbToRoute } from "@/lib/transforms";
import { ROUTE_LIST_SELECT } from "@/lib/queries";
import type { DbRoute } from "@/lib/supabase";
import type { Route } from "@/types";
import { useAuthModal } from "@/components/ui/AuthModal";

export type ShelfId = "saved" | "ridden" | "mine";

const SHELVES: { id: ShelfId; label: string; authLabel: string }[] = [
  { id: "saved",  label: "Сохранённые", authLabel: "посмотреть сохранённые маршруты" },
  { id: "ridden", label: "Проехано",     authLabel: "посмотреть проеханные маршруты" },
  { id: "mine",   label: "Мои",          authLabel: "посмотреть свои маршруты" },
];

/**
 * Loads and caches the three "personal shelf" route sets (saved / ridden / mine)
 * on demand. Each shelf is fetched in full from Supabase (not from the paginated
 * catalog list) so activating a shelf never silently drops routes that haven't
 * been paged in yet.
 */
export function useRouteShelves(userId: string | null) {
  const [activeShelf, setActiveShelf] = useState<ShelfId | null>(null);
  const [shelfRoutes, setShelfRoutes] = useState<Record<ShelfId, Route[] | null>>({
    saved: null,
    ridden: null,
    mine: null,
  });
  const [shelfLoading, setShelfLoading] = useState(false);

  const fetchShelf = useCallback(async (shelf: ShelfId, uid: string) => {
    setShelfLoading(true);
    try {
      if (shelf === "mine") {
        const { data, error } = await supabase
          .from("routes")
          .select(ROUTE_LIST_SELECT)
          .eq("author_id", uid)
          .order("created_at", { ascending: false });
        if (!error && data) {
          setShelfRoutes((prev) => ({ ...prev, mine: (data as unknown as DbRoute[]).map(dbToRoute) }));
        }
        return;
      }

      const table = shelf === "saved" ? "route_favorites" : "route_rides";
      const { data: idsData, error: idsError } = await supabase
        .from(table)
        .select("route_id")
        .eq("user_id", uid);
      if (idsError || !idsData) return;

      const ids = Array.from(new Set((idsData as { route_id: string }[]).map((r) => r.route_id)));
      if (ids.length === 0) {
        setShelfRoutes((prev) => ({ ...prev, [shelf]: [] }));
        return;
      }

      const { data, error } = await supabase
        .from("routes")
        .select(ROUTE_LIST_SELECT)
        .in("id", ids)
        .order("created_at", { ascending: false });
      if (!error && data) {
        setShelfRoutes((prev) => ({ ...prev, [shelf]: (data as unknown as DbRoute[]).map(dbToRoute) }));
      }
    } finally {
      setShelfLoading(false);
    }
  }, []);

  const toggleShelf = useCallback((shelf: ShelfId) => {
    setActiveShelf((prev) => {
      const next = prev === shelf ? null : shelf;
      if (next && userId && shelfRoutes[next] === null) {
        fetchShelf(next, userId);
      }
      return next;
    });
  }, [userId, shelfRoutes, fetchShelf]);

  return { activeShelf, shelfRoutes, shelfLoading, toggleShelf };
}

export function ShelfChipRow({
  activeShelf,
  onToggle,
}: {
  activeShelf: ShelfId | null;
  onToggle: (shelf: ShelfId) => void;
}) {
  const { requireAuth } = useAuthModal();

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {SHELVES.map(({ id, label, authLabel }) => (
        <button
          key={id}
          onClick={() => {
            if (!requireAuth(authLabel)) return;
            onToggle(id);
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
          style={activeShelf === id
            ? { backgroundColor: "#1C1C1E", color: "white", borderColor: "#1C1C1E" }
            : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }}>
          {label}
        </button>
      ))}
    </div>
  );
}
