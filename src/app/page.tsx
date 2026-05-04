import { createServerSupabase } from "@/lib/supabase-server";
import { dbToRoute, dbToEvent } from "@/lib/transforms";
import type { Route, CycleEvent } from "@/types";
import type { DbRoute, DbEvent, DbRideReport } from "@/lib/supabase";
import { FeedClient } from "./FeedClient";
import { ROUTE_LIST_SELECT, EVENT_LIST_SELECT } from "@/lib/queries";

export default async function FeedPage() {
  const supabase = await createServerSupabase();

  const [routesResult, eventsResult, reportsResult] = await Promise.all([
    supabase
      .from("routes_ranked")
      .select(ROUTE_LIST_SELECT)
      .order("hot_score", { ascending: false })
      .limit(4),
    supabase
      .from("events")
      .select(EVENT_LIST_SELECT)
      .or(`end_date.gte.${new Date().toISOString().split("T")[0]},and(end_date.is.null,start_date.gte.${new Date().toISOString().split("T")[0]})`)
      .order("created_at", { ascending: false })
      .limit(2),
    supabase
      .from("ride_reports")
      .select("id, route_id, user_id, ride_id, ridden_at, vibe, text, photos, created_at, route:routes!route_id(id, title, cover_url), author:profiles!user_id(name, avatar_url)")
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const initialRoutes: Route[] = (routesResult.data as unknown as DbRoute[])?.map(dbToRoute) ?? [];
  const initialEvents: CycleEvent[] = (eventsResult.data as unknown as DbEvent[])?.map(dbToEvent) ?? [];
  const initialReports: DbRideReport[] = (reportsResult.data as unknown as DbRideReport[]) ?? [];

  return <FeedClient initialRoutes={initialRoutes} initialEvents={initialEvents} initialReports={initialReports} />;
}
