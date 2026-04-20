import { createServerSupabase } from "@/lib/supabase-server";
import { dbToRoute, dbToEvent } from "@/lib/transforms";
import type { Route, CycleEvent } from "@/types";
import type { DbRoute, DbEvent } from "@/lib/supabase";
import { RoutesPageClient } from "./RoutesPageClient";
import { ROUTE_LIST_SELECT, EVENT_LIST_SELECT, PAGE_SIZE } from "@/lib/queries";

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
      .select(ROUTE_LIST_SELECT)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (data) initialRoutes = (data as unknown as DbRoute[]).map(dbToRoute);
  } else {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("events")
      .select(EVENT_LIST_SELECT)
      .or(`end_date.gte.${today},and(end_date.is.null,start_date.gte.${today})`)
      .order("start_date", { ascending: true })
      .limit(PAGE_SIZE);
    if (data) initialEvents = (data as unknown as DbEvent[]).map(dbToEvent);
  }

  return <RoutesPageClient initialRoutes={initialRoutes} initialEvents={initialEvents} />;
}
