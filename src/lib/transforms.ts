/**
 * Centralised DB → domain-type transforms.
 *
 * All pages that read routes or events should import from here
 * instead of defining their own local copies.
 */

import type { DbProfile, DbRoute, DbEvent } from "@/lib/supabase";
import type { Route, CycleEvent, User, RouteType, ExitPoint } from "@/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/** Turn a stored `gpx_path` (e.g. "<route_id>/route.gpx") into a public URL. */
export function gpxPathToUrl(path: string | null | undefined): string | null {
  if (!path || !SUPABASE_URL) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/route-gpx/${path}`;
}

function toInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function dbToUser(p: DbProfile, color = "#7C5CFC"): User {
  const name = p.name ?? "Участник";
  return {
    id: p.id,
    name,
    initials: toInitials(name),
    color,
    avatar_url: p.avatar_url ?? null,
    km_total: p.km_total ?? 0,
    routes_count: p.routes_count ?? 0,
    events_count: p.events_count ?? 0,
  };
}

export function dbToRoute(r: DbRoute): Route {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    region: r.region,
    distance_km: r.distance_km,
    elevation_m: r.elevation_m,
    duration_min: r.duration_min,
    difficulty: r.difficulty,
    surface: r.surface as Route["surface"],
    bike_types: r.bike_types as Route["bike_types"],
    route_types: r.route_types as RouteType[],
    tags: r.tags,
    author: r.author
      ? dbToUser(r.author, "#F4632A")
      : { id: r.author_id, name: "Участник", initials: "У", color: "#F4632A", avatar_url: null, km_total: 0, routes_count: 0, events_count: 0 },
    riders_today: r.riders_today,
    likes: r.likes_count,
    mapmagic_url: r.mapmagic_url ?? undefined,
    mapmagic_embed: r.mapmagic_embed ?? undefined,
    cover_url: r.cover_url ?? undefined,
    images: r.route_images?.map((img) => img.url),
    gpx_url: gpxPathToUrl(r.gpx_path),
    gpx_updated_at: r.gpx_updated_at ?? null,
    exit_points_status: r.exit_points_status ?? "unknown",
    exit_points: r.route_exit_points
      ?.slice()
      .sort((a, b) => a.order_idx - b.order_idx)
      .map<ExitPoint>((p) => ({
        id: p.id,
        title: p.title,
        kind: p.kind,
        distance_km_from_start: p.distance_km_from_start,
        note: p.note,
        order_idx: p.order_idx,
      })),
    created_at: r.created_at,
  };
}

const EMPTY_ROUTE: Route = {
  id: "", title: "", description: "", region: "",
  distance_km: 0, elevation_m: 0, duration_min: 0,
  difficulty: "medium",
  surface: [], bike_types: [], route_types: [], tags: [],
  author: { id: "", name: "", initials: "", color: "", avatar_url: null, km_total: 0, routes_count: 0, events_count: 0 },
  riders_today: 0, likes: 0, exit_points_status: "unknown", created_at: "",
};

export function dbToEvent(e: DbEvent): CycleEvent {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    start_date: e.start_date ?? "",
    end_date: e.end_date ?? "",
    organizer: e.organizer
      ? dbToUser(e.organizer, "#7C5CFC")
      : { id: e.organizer_id, name: "Организатор", initials: "О", color: "#7C5CFC", avatar_url: null, km_total: 0, routes_count: 0, events_count: 0 },
    route: e.route ? dbToRoute(e.route) : EMPTY_ROUTE,
    days: e.event_days?.map((d) => ({
      day: d.day_number,
      date: d.date ?? "",
      title: d.title ?? "",
      distance_km: d.distance_km ?? 0,
      start_point: d.start_point ?? "",
      end_point: d.end_point ?? "",
      description: d.description ?? "",
    })) ?? [],
    participants: e.event_participants?.map((p) => {
      const name = p.profile?.name ?? "Участник";
      return {
        id: p.user_id,
        name,
        initials: toInitials(name),
        color: "#7C5CFC",
        avatar_url: p.profile?.avatar_url ?? null,
        km_total: p.profile?.km_total ?? 0,
        routes_count: p.profile?.routes_count ?? 0,
        events_count: p.profile?.events_count ?? 0,
      };
    }) ?? [],
    max_participants: e.max_participants ?? undefined,
    is_private: e.is_private ?? false,
    cover_url: e.cover_url ?? null,
    likes: e.likes_count,
    created_at: e.created_at,
  };
}
