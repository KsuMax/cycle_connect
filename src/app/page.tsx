import { createServerSupabase } from "@/lib/supabase-server";
import { dbToRoute, dbToEvent } from "@/lib/transforms";
import type { Route, CycleEvent } from "@/types";
import type { DbRoute, DbEvent } from "@/lib/supabase";
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
      .or(`end_date.gte.${new Date().toISOString().split("T")[0]},and(end_date.is.null,start_date.gte.${new Date().toISOString().split("T")[0]})`)
      .order("created_at", { ascending: false })
      .limit(2),
  ]);

  const initialRoutes: Route[] = (routesResult.data as unknown as DbRoute[])?.map(dbToRoute) ?? [];
  const initialEvents: CycleEvent[] = (eventsResult.data as unknown as DbEvent[])?.map(dbToEvent) ?? [];

  return <FeedClient initialRoutes={initialRoutes} initialEvents={initialEvents} />;
}
