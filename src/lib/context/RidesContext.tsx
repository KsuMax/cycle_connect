"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthContext";

const STORAGE_KEY = "cc_rides";

interface RidesContextValue {
  /** routeId → number of times ridden */
  rideCounts: Map<string, number>;
  ridesLoaded: boolean;
  /** Add one ride (manual or auto from event). Does NOT remove rides. */
  addRide: (routeId: string, distanceKm?: number, eventId?: string) => Promise<void>;
  hasRidden: (routeId: string) => boolean;
  rideCount: (routeId: string) => number;
}

const RidesContext = createContext<RidesContextValue | null>(null);

export function RidesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [rideCounts, setRideCounts] = useState<Map<string, number>>(new Map());
  const [ridesLoaded, setRidesLoaded] = useState(false);

  useEffect(() => {
    setRidesLoaded(false);
    if (user) {
      supabase
        .from("route_rides")
        .select("route_id")
        .eq("user_id", user.id)
        .then(({ data, error }) => {
          if (data && !error) {
            const counts = new Map<string, number>();
            for (const r of data as { route_id: string }[]) {
              counts.set(r.route_id, (counts.get(r.route_id) ?? 0) + 1);
            }
            setRideCounts(counts);
          } else {
            // Fallback to localStorage
            try {
              const stored = localStorage.getItem(STORAGE_KEY);
              if (stored) {
                const parsed = JSON.parse(stored);
                // Support old format (array of ids) and new format (object map)
                if (Array.isArray(parsed)) {
                  const counts = new Map<string, number>();
                  for (const id of parsed as string[]) counts.set(id, 1);
                  setRideCounts(counts);
                } else {
                  setRideCounts(new Map(Object.entries(parsed)));
                }
              }
            } catch {}
          }
          setRidesLoaded(true);
        });
    } else {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            const counts = new Map<string, number>();
            for (const id of parsed as string[]) counts.set(id, 1);
            setRideCounts(counts);
          } else {
            setRideCounts(new Map(Object.entries(parsed)));
          }
        }
      } catch {}
      setRidesLoaded(true);
    }
  }, [user]);

  const addRide = useCallback(async (routeId: string, distanceKm?: number, eventId?: string) => {
    if (user) {
      try {
        await supabase.from("route_rides").insert({
          user_id: user.id,
          route_id: routeId,
          ...(eventId ? { event_id: eventId } : {}),
        });
        if (distanceKm) {
          const { data } = await supabase.from("profiles").select("km_total").eq("id", user.id).single();
          const current = (data as { km_total: number } | null)?.km_total ?? 0;
          await supabase.from("profiles").update({ km_total: current + distanceKm }).eq("id", user.id);
        }
      } catch {}
    }

    setRideCounts((prev) => {
      const next = new Map(prev);
      next.set(routeId, (next.get(routeId) ?? 0) + 1);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(next)));
      return next;
    });
  }, [user]);

  const hasRidden = useCallback((routeId: string) => (rideCounts.get(routeId) ?? 0) > 0, [rideCounts]);
  const rideCount = useCallback((routeId: string) => rideCounts.get(routeId) ?? 0, [rideCounts]);

  return (
    <RidesContext.Provider value={{ rideCounts, ridesLoaded, addRide, hasRidden, rideCount }}>
      {children}
    </RidesContext.Provider>
  );
}

export function useRides() {
  const ctx = useContext(RidesContext);
  if (!ctx) throw new Error("useRides must be used within RidesProvider");
  return ctx;
}
