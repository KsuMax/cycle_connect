"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthContext";

type RouteEventStatus = "upcoming" | "past";

interface EventRidesContextValue {
  getRouteEventStatus: (routeId: string) => RouteEventStatus | null;
  loaded: boolean;
}

const EventRidesContext = createContext<EventRidesContextValue | null>(null);

export function EventRidesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [statusMap, setStatusMap] = useState<Map<string, RouteEventStatus>>(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    if (!user) {
      setStatusMap(new Map());
      setLoaded(true);
      return;
    }

    supabase
      .from("event_participants")
      .select("event:events!event_id(route_id, end_date)")
      .eq("user_id", user.id)
      .then(({ data }) => {
        const map = new Map<string, RouteEventStatus>();
        if (data) {
          const today = new Date().toISOString().split("T")[0];
          for (const row of data as unknown as { event: { route_id: string | null; end_date: string | null } }[]) {
            const routeId = row.event?.route_id;
            if (!routeId) continue;
            const endDate = row.event?.end_date;
            const isPast = endDate ? endDate < today : false;
            const status: RouteEventStatus = isPast ? "past" : "upcoming";

            const existing = map.get(routeId);
            // "upcoming" takes priority — if any event is still upcoming, show that
            if (!existing || (existing === "past" && status === "upcoming")) {
              map.set(routeId, status);
            }
          }
        }
        setStatusMap(map);
        setLoaded(true);
      });
  }, [user]);

  const getRouteEventStatus = useCallback(
    (routeId: string) => statusMap.get(routeId) ?? null,
    [statusMap]
  );

  return (
    <EventRidesContext.Provider value={{ getRouteEventStatus, loaded }}>
      {children}
    </EventRidesContext.Provider>
  );
}

export function useEventRides() {
  const ctx = useContext(EventRidesContext);
  if (!ctx) throw new Error("useEventRides must be used within EventRidesProvider");
  return ctx;
}
