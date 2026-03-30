"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { RouteCard } from "@/components/routes/RouteCard";
import { EventCard } from "@/components/events/EventCard";
import { Avatar } from "@/components/ui/Avatar";
import { Bike, TrendingUp, Calendar } from "lucide-react";
import Link from "next/link";
import { supabase, type DbRoute, type DbEvent } from "@/lib/supabase";
import type { Route, CycleEvent, RouteType } from "@/types";

function dbToRoute(r: DbRoute): Route {
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
    author: {
      id: r.author_id,
      name: r.author?.name ?? "Участник",
      initials: (r.author?.name ?? "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
      color: "#F4632A",
      avatar_url: r.author?.avatar_url ?? null,
      km_total: r.author?.km_total ?? 0,
      routes_count: r.author?.routes_count ?? 0,
      events_count: r.author?.events_count ?? 0,
    },
    riders_today: r.riders_today,
    likes: r.likes_count,
    mapmagic_url: r.mapmagic_url ?? undefined,
    mapmagic_embed: r.mapmagic_embed ?? undefined,
    cover_url: r.cover_url ?? undefined,
    images: r.route_images?.map((img) => img.url),
    created_at: r.created_at,
  };
}

function dbToEvent(e: DbEvent): CycleEvent {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    start_date: e.start_date ?? "",
    end_date: e.end_date ?? "",
    organizer: {
      id: e.organizer_id,
      name: e.organizer?.name ?? "Организатор",
      initials: (e.organizer?.name ?? "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
      color: "#7C5CFC",
      avatar_url: e.organizer?.avatar_url ?? null,
      km_total: 0,
      routes_count: 0,
      events_count: 0,
    },
    route: e.route ? dbToRoute(e.route as DbRoute) : {
      id: "", title: "", description: "", region: "", distance_km: 0,
      elevation_m: 0, duration_min: 0, difficulty: "medium" as const,
      surface: [], bike_types: [], route_types: [], tags: [],
      author: { id: "", name: "", initials: "", color: "", km_total: 0, routes_count: 0, events_count: 0 },
      riders_today: 0, likes: 0, created_at: "",
    },
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
        initials: name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
        color: "#7C5CFC",
        km_total: p.profile?.km_total ?? 0,
        routes_count: p.profile?.routes_count ?? 0,
        events_count: p.profile?.events_count ?? 0,
      };
    }) ?? [],
    max_participants: e.max_participants ?? undefined,
    likes: e.likes_count,
    created_at: e.created_at,
  };
}

export default function FeedPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [events, setEvents] = useState<CycleEvent[]>([]);

  useEffect(() => {
    supabase.from("routes")
      .select("*, author:profiles!author_id(*), route_images(url)")
      .order("likes_count", { ascending: false })
      .limit(4)
      .then(({ data }) => { if (data) setRoutes(data.map(dbToRoute)); });

    supabase.from("events")
      .select("*, organizer:profiles!organizer_id(*), route:routes(*), event_days(*), event_participants(user_id, profile:profiles!user_id(*))")
      .order("created_at", { ascending: false })
      .limit(2)
      .then(({ data }) => { if (data) setEvents(data.map(dbToEvent)); });
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">

          {/* Feed */}
          <div className="space-y-6">
            {/* Welcome banner */}
            <div className="rounded-2xl p-6 text-white relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, #F4632A 0%, #7C5CFC 100%)" }}>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-10">
                <Bike size={120} strokeWidth={1} />
              </div>
              <div className="relative">
                <h1 className="text-2xl font-bold mb-1">Привет, велосипедист 👋</h1>
                <p className="text-white/80 text-sm mb-4">Куда едем сегодня? В ленте — новые маршруты и поездки</p>
                <Link href="/routes"
                  className="inline-flex items-center gap-2 bg-white font-semibold text-sm px-4 py-2 rounded-xl hover:bg-white/90 transition-colors"
                  style={{ color: "#F4632A" }}>
                  <Bike size={16} />
                  Найти маршрут
                </Link>
              </div>
            </div>

            {/* Upcoming events */}
            {events.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-[#1C1C1E] flex items-center gap-2">
                    <Calendar size={18} style={{ color: "#7C5CFC" }} />
                    Ближайшие поездки
                  </h2>
                  <Link href="/routes?tab=events" className="text-sm hover:underline" style={{ color: "#F4632A" }}>Все</Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
                  {events.map((event) => <EventCard key={event.id} event={event} />)}
                </div>
              </section>
            )}

            {/* Popular routes */}
            {routes.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-[#1C1C1E] flex items-center gap-2">
                    <TrendingUp size={18} style={{ color: "#F4632A" }} />
                    Популярные маршруты
                  </h2>
                  <Link href="/routes" className="text-sm hover:underline" style={{ color: "#F4632A" }}>Все маршруты</Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {routes.map((route) => <RouteCard key={route.id} route={route} />)}
                </div>
              </section>
            )}

            {routes.length === 0 && events.length === 0 && (
              <div className="text-center py-16 text-[#71717A]">
                <div className="text-4xl mb-3">🚴</div>
                <div className="font-medium mb-1">Маршрутов пока нет</div>
                <div className="text-sm mb-4">Будь первым — добавь маршрут!</div>
                <Link href="/routes/new"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
                  style={{ backgroundColor: "#F4632A" }}>
                  Добавить маршрут
                </Link>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-5">
            <div className="rounded-2xl p-4 text-white"
              style={{ background: "linear-gradient(135deg, #0BBFB5 0%, #7C5CFC 100%)" }}>
              <h3 className="font-semibold mb-1 text-sm">Планируешь поездку?</h3>
              <p className="text-white/80 text-xs mb-3">Создай мероприятие, опиши маршрут по дням и позови друзей</p>
              <Link href="/events/new"
                className="block text-center bg-white font-semibold text-sm px-4 py-2 rounded-xl hover:bg-white/90 transition-colors"
                style={{ color: "#7C5CFC" }}>
                Создать мероприятие
              </Link>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
