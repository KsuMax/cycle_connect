"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface YearStat {
  year: number;
  rides: number;
  km: number;
}

/** One dated ride event (a single "проезд" of a route or event participation ride). */
export interface RideEntry {
  /** ISO date/timestamp of the ride, best source available (see useRideActivity). */
  date: string;
  km: number;
  routeId: string | null;
  eventId: string | null;
}

export interface RideActivity {
  /** Per-year aggregates, newest first. Null while loading. */
  yearly: YearStat[] | null;
  /** All dated rides, newest first. Empty while loading. */
  entries: RideEntry[];
  loaded: boolean;
}

/** Year string from an ISO date/timestamp ("YYYY-..."), avoiding timezone drift. */
function yearOf(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const y = Number(dateStr.slice(0, 4));
  return Number.isFinite(y) && y > 1970 ? y : null;
}

/**
 * Loads a user's ride history from `route_rides`, fully client-side.
 *
 * Each ride is dated by the most precise source available:
 *   1. ride_reports.ridden_at linked via ride_id (actual ride date)
 *   2. events.end_date for rides created from an event
 *   3. route_rides.created_at (when the ride was marked in the app)
 *
 * Single source of truth for the profile page: headline totals, the
 * activity heatmap, the season goal and the rides feed all derive from
 * `entries`, so the numbers can never disagree.
 */
export function useRideActivity(userId: string | null | undefined): RideActivity {
  const [activity, setActivity] = useState<RideActivity>({ yearly: null, entries: [], loaded: false });

  useEffect(() => {
    if (!userId) { setActivity({ yearly: null, entries: [], loaded: false }); return; }
    let cancelled = false;

    (async () => {
      const { data: rides } = await supabase
        .from("route_rides")
        .select("id, route_id, event_id, created_at")
        .eq("user_id", userId);

      if (cancelled) return;
      if (!rides || rides.length === 0) {
        setActivity({ yearly: [], entries: [], loaded: true });
        return;
      }

      type Ride = { id: string | null; route_id: string | null; event_id: string | null; created_at: string };
      const list = rides as Ride[];

      const routeIds = [...new Set(list.map((r) => r.route_id).filter(Boolean) as string[])];
      const eventIds = [...new Set(list.map((r) => r.event_id).filter(Boolean) as string[])];

      const [routesRes, eventsRes, reportsRes] = await Promise.all([
        routeIds.length
          ? supabase.from("routes").select("id, distance_km").in("id", routeIds)
          : Promise.resolve({ data: [] }),
        eventIds.length
          ? supabase.from("events").select("id, end_date").in("id", eventIds)
          : Promise.resolve({ data: [] }),
        supabase.from("ride_reports").select("ride_id, ridden_at").eq("user_id", userId),
      ]);
      if (cancelled) return;

      const kmByRoute = new Map(
        ((routesRes.data ?? []) as { id: string; distance_km: number | null }[])
          .map((r) => [r.id, r.distance_km ?? 0]),
      );
      const endByEvent = new Map(
        ((eventsRes.data ?? []) as { id: string; end_date: string | null }[])
          .map((e) => [e.id, e.end_date]),
      );
      const riddenByRideId = new Map<string, string>();
      for (const rep of (reportsRes.data ?? []) as { ride_id: string | null; ridden_at: string }[]) {
        if (rep.ride_id) riddenByRideId.set(rep.ride_id, rep.ridden_at);
      }

      const entries: RideEntry[] = [];
      for (const r of list) {
        const dateStr =
          (r.id ? riddenByRideId.get(r.id) : null) ??
          (r.event_id ? endByEvent.get(r.event_id) : null) ??
          r.created_at;
        if (yearOf(dateStr) == null) continue;
        entries.push({
          date: dateStr!,
          km: r.route_id ? kmByRoute.get(r.route_id) ?? 0 : 0,
          routeId: r.route_id,
          eventId: r.event_id,
        });
      }
      entries.sort((a, b) => b.date.localeCompare(a.date));

      const byYear = new Map<number, { rides: number; km: number }>();
      for (const e of entries) {
        const year = yearOf(e.date)!;
        const cur = byYear.get(year) ?? { rides: 0, km: 0 };
        cur.rides += 1;
        cur.km += e.km;
        byYear.set(year, cur);
      }
      const yearly: YearStat[] = [...byYear.entries()]
        .map(([year, v]) => ({ year, rides: v.rides, km: Math.round(v.km) }))
        .sort((a, b) => b.year - a.year);

      setActivity({ yearly, entries, loaded: true });
    })();

    return () => { cancelled = true; };
  }, [userId]);

  return activity;
}

/**
 * Backward-compatible wrapper: per-year aggregates only.
 * Used by the public profile page (/users/[id]).
 */
export function useYearlyRideStats(userId: string | null | undefined): YearStat[] | null {
  return useRideActivity(userId).yearly;
}
