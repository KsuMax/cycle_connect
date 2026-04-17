import { createServerSupabase } from "@/lib/supabase-server";
import { dbToRoute, dbToEvent } from "@/lib/transforms";
import type { Route, CycleEvent } from "@/types";
import { FeedClient } from "./FeedClient";

export default async function FeedPage() {
  const supabase = await createServerSupabase();

  const [routesResult, eventsResult] = await Promise.all([
    supabase
      .from("routes")
      .select("*, author:profiles!author_id(*), route_images(url), route_comments(id, text, likes_count, created_at, author:profiles!author_id(name))")
      .order("likes_count", { ascending: false })
      .limit(4),
    supabase
      .from("events")
      .select("*, organizer:profiles!organizer_id(*), route:routes(*), event_days(*), event_participants(user_id, profile:profiles!user_id(*))")
      .order("created_at", { ascending: false })
      .limit(2),
  ]);

  const initialRoutes: Route[] = routesResult.data?.map(dbToRoute) ?? [];
  const initialEvents: CycleEvent[] = eventsResult.data?.map(dbToEvent) ?? [];

  return <FeedClient initialRoutes={initialRoutes} initialEvents={initialEvents} />;
}
