"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthContext";

interface IntentStatus {
  intentId: string;
  plannedDate: string;
}

interface IntentsContextValue {
  getRouteIntentStatus: (routeId: string) => IntentStatus | null;
  loaded: boolean;
  refresh: () => void;
}

const IntentsContext = createContext<IntentsContextValue | null>(null);

export function IntentsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [statusMap, setStatusMap] = useState<Map<string, IntentStatus>>(new Map());
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    setLoaded(false);
    if (!user) {
      setStatusMap(new Map());
      setLoaded(true);
      return;
    }

    const today = new Date().toISOString().split("T")[0];

    supabase
      .from("ride_intent_participants")
      .select("intent:ride_intents!intent_id(id, route_id, planned_date)")
      .eq("user_id", user.id)
      .then(({ data }) => {
        const map = new Map<string, IntentStatus>();
        if (data) {
          for (const row of data as unknown as { intent: { id: string; route_id: string; planned_date: string } }[]) {
            const intent = row.intent;
            if (!intent?.route_id) continue;
            // Only future intents
            if (intent.planned_date < today) continue;
            const existing = map.get(intent.route_id);
            // Keep the soonest date
            if (!existing || intent.planned_date < existing.plannedDate) {
              map.set(intent.route_id, { intentId: intent.id, plannedDate: intent.planned_date });
            }
          }
        }
        setStatusMap(map);
        setLoaded(true);
      });
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const getRouteIntentStatus = useCallback(
    (routeId: string) => statusMap.get(routeId) ?? null,
    [statusMap]
  );

  return (
    <IntentsContext.Provider value={{ getRouteIntentStatus, loaded, refresh: load }}>
      {children}
    </IntentsContext.Provider>
  );
}

export function useIntents() {
  const ctx = useContext(IntentsContext);
  if (!ctx) throw new Error("useIntents must be used within IntentsProvider");
  return ctx;
}
