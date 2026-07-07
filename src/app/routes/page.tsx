import type { Metadata } from "next";
import { createServerSupabase } from "@/lib/supabase-server";
import { dbToRoute, dbToEvent } from "@/lib/transforms";
import type { Route, CycleEvent } from "@/types";
import type { DbRoute, DbEvent } from "@/lib/supabase";
import { RoutesPageClient } from "./RoutesPageClient";
import { ROUTE_LIST_SELECT, EVENT_LIST_SELECT, PAGE_SIZE } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Велосипедные маршруты с отзывами",
  description:
    "Каталог велосипедных маршрутов: шоссе, гравел, МТБ. Фильтры по региону, сложности и километражу, отзывы и фото от других велосипедистов.",
  alternates: { canonical: "/routes" },
};

export default async function RoutesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab === "events" ? "events" : "routes";

  const supabase = await createServerSupabase();

  let initialRoutes: Route[] = [];
  let initialRoutesTotal: number | null = null;
  let initialEvents: CycleEvent[] = [];
  let initialEventsTotal: number | null = null;

  if (tab === "routes") {
    const { data, count } = await supabase
      .from("routes")
      .select(ROUTE_LIST_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE);
    if (data) initialRoutes = (data as unknown as DbRoute[]).map(dbToRoute);
    initialRoutesTotal = count;
  } else {
    const today = new Date().toISOString().split("T")[0];
    const { data, count } = await supabase
      .from("events")
      .select(EVENT_LIST_SELECT, { count: "exact" })
      .or(`end_date.gte.${today},and(end_date.is.null,start_date.gte.${today})`)
      .order("start_date", { ascending: true })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE);
    if (data) initialEvents = (data as unknown as DbEvent[]).map(dbToEvent);
    initialEventsTotal = count;
  }

  return (
    <RoutesPageClient
      initialRoutes={initialRoutes}
      initialRoutesTotal={initialRoutesTotal}
      initialEvents={initialEvents}
      initialEventsTotal={initialEventsTotal}
    />
  );
}
