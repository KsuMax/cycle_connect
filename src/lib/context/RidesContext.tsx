"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthContext";

const STORAGE_KEY = "cc_rides";

interface RidesContextValue {
  rides: Set<string>;
  ridesLoaded: boolean;
  toggleRide: (routeId: string, distanceKm?: number) => Promise<void>;
  hasRidden: (routeId: string) => boolean;
}

const RidesContext = createContext<RidesContextValue | null>(null);

export function RidesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [rides, setRides] = useState<Set<string>>(new Set());
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
            setRides(new Set(data.map((r: { route_id: string }) => r.route_id)));
          } else {
            // Table may not exist yet — fall back to localStorage
            try {
              const stored = localStorage.getItem(STORAGE_KEY);
              if (stored) setRides(new Set(JSON.parse(stored)));
            } catch {}
          }
          setRidesLoaded(true);
        });
    } else {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) setRides(new Set(JSON.parse(stored)));
      } catch {}
      setRidesLoaded(true);
    }
  }, [user]);

  const toggleRide = useCallback(async (routeId: string, distanceKm?: number) => {
    const alreadyRidden = rides.has(routeId);

    if (user) {
      try {
        if (alreadyRidden) {
          await supabase.from("route_rides").delete().match({ user_id: user.id, route_id: routeId });
        } else {
          await supabase.from("route_rides").insert({ user_id: user.id, route_id: routeId });
        }
        // km_total обновляется автоматически триггером trg_sync_km_total на стороне БД
      } catch {
        // Supabase unavailable — persist locally only
      }
    }

    setRides((prev) => {
      const next = new Set(prev);
      if (alreadyRidden) next.delete(routeId);
      else next.add(routeId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  }, [rides, user]);

  const hasRidden = useCallback((routeId: string) => rides.has(routeId), [rides]);

  return (
    <RidesContext.Provider value={{ rides, ridesLoaded, toggleRide, hasRidden }}>
      {children}
    </RidesContext.Provider>
  );
}

export function useRides() {
  const ctx = useContext(RidesContext);
  if (!ctx) throw new Error("useRides must be used within RidesProvider");
  return ctx;
}
