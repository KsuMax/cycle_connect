import { createServerSupabase } from "@/lib/supabase-server";
import { dbToRoute, dbToEvent } from "@/lib/transforms";
import type { Route, CycleEvent } from "@/types";
import { FeedClient } from "./FeedClient";
import { ROUTE_LIST_SELECT, EVENT_LIST_SELECT } from "@/lib/queries";

export default async function FeedPage() {
  const supabase = await createServerSupabase();

  const [routesResult, eventsResult] = await Promise.all([
    supabase
      .from("routes")
      .select(ROUTE_LIST_SELECT)
      .order("likes_count", { ascending: false })
      .limit(4),
    supabase
      .from("events")
      .select(EVENT_LIST_SELECT)
      .order("created_at", { ascending: false })
      .limit(2),
  ]);

  const initialRoutes: Route[] = routesResult.data?.map(dbToRoute) ?? [];
  const initialEvents: CycleEvent[] = eventsResult.data?.map(dbToEvent) ?? [];

  return <FeedClient initialRoutes={initialRoutes} initialEvents={initialEvents} />;
}
