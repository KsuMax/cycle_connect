import { createServerSupabase } from "@/lib/supabase-server";
import { dbToRoute, dbToEvent } from "@/lib/transforms";
import type { Route, CycleEvent } from "@/types";
import { RoutesPageClient } from "./RoutesPageClient";

export default async function RoutesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab === "events" ? "events" : "routes";

  const supabase = await createServerSupabase();

  let initialRoutes: Route[] = [];
  let initialEvents: CycleEvent[] = [];

  if (tab === "routes") {
    const { data } = await supabase
      .from("routes")
      .select("*, author:profiles!author_id(*), route_images(url), route_comments(id, text, likes_count, created_at, author:profiles!author_id(name))")
      .order("created_at", { ascending: false });
    if (data) initialRoutes = data.map(dbToRoute);
  } else {
    const { data } = await supabase
      .from("events")
      .select("*, organizer:profiles!organizer_id(*), route:routes(*), event_days(*), event_participants(user_id, profile:profiles!user_id(*))")
      .order("start_date", { ascending: true });
    if (data) initialEvents = data.map(dbToEvent);
  }

  return <RoutesPageClient initialRoutes={initialRoutes} initialEvents={initialEvents} />;
}
