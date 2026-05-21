"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase, type RoughWhen } from "@/lib/supabase";
import { useAuth } from "./AuthContext";

interface InterestStatus {
  plannedDate: string | null;
  roughWhen: RoughWhen | null;
}

interface InterestsContextValue {
  getRouteInterest: (routeId: string) => InterestStatus | null;
  hasInterest: (routeId: string) => boolean;
  loaded: boolean;
  refresh: () => void;
}

const InterestsContext = createContext<InterestsContextValue | null>(null);

export function InterestsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [statusMap, setStatusMap] = useState<Map<string, InterestStatus>>(new Map());
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    setLoaded(false);
    if (!user) {
      setStatusMap(new Map());
      setLoaded(true);
      return;
    }

    supabase
      .from("route_interests")
      .select("route_id, planned_date, rough_when")
      .eq("user_id", user.id)
      .then(({ data }) => {
        const map = new Map<string, InterestStatus>();
        if (data) {
          for (const row of data as { route_id: string; planned_date: string | null; rough_when: RoughWhen | null }[]) {
            map.set(row.route_id, { plannedDate: row.planned_date, roughWhen: row.rough_when });
          }
        }
        setStatusMap(map);
        setLoaded(true);
      });
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const getRouteInterest = useCallback(
    (routeId: string) => statusMap.get(routeId) ?? null,
    [statusMap]
  );

  const hasInterest = useCallback(
    (routeId: string) => statusMap.has(routeId),
    [statusMap]
  );

  return (
    <InterestsContext.Provider value={{ getRouteInterest, hasInterest, loaded, refresh: load }}>
      {children}
    </InterestsContext.Provider>
  );
}

export function useInterests() {
  const ctx = useContext(InterestsContext);
  if (!ctx) throw new Error("useInterests must be used within InterestsProvider");
  return ctx;
}
