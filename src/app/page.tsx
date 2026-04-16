"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { RouteCard } from "@/components/routes/RouteCard";
import { EventCard } from "@/components/events/EventCard";
import { Avatar } from "@/components/ui/Avatar";
import { Bike, TrendingUp, Calendar, MapPin } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/context/AuthContext";
import type { Route, CycleEvent } from "@/types";
import { dbToRoute, dbToEvent } from "@/lib/transforms";

export default function FeedPage() {
  const { user } = useAuth();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [events, setEvents] = useState<CycleEvent[]>([]);

  useEffect(() => {
    supabase.from("routes")
      .select("*, author:profiles!author_id(*), route_images(url)")
      .order("likes_count", { ascending: false })
      .limit(4)
      .then(({ data, error }) => {
        if (error) { console.error("[FeedPage] routes fetch failed", error.message); return; }
        if (data) setRoutes(data.map(dbToRoute));
      });

    supabase.from("events")
      .select("*, organizer:profiles!organizer_id(*), route:routes(*), event_days(*), event_participants(user_id, profile:profiles!user_id(*))")
      .order("created_at", { ascending: false })
      .limit(2)
      .then(({ data, error }) => {
        if (error) { console.error("[FeedPage] events fetch failed", error.message); return; }
        if (data) setEvents(data.map(dbToEvent));
      });
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">

          {/* Feed */}
          <div className="space-y-8">
            {/* Welcome banner */}
            <div className="rounded-2xl p-6 text-white relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, #F4632A 0%, #7C5CFC 100%)" }}>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-10">
                <Bike size={120} strokeWidth={1} />
              </div>
              <div className="relative">
                <h1 className="text-2xl font-bold mb-1">Маршруты и поездки для велосипедистов</h1>
                <p className="text-white/95 text-sm mb-4">Находи маршруты рядом, записывайся на групповые поездки, добавляй свои треки</p>
                <div className="flex flex-wrap gap-2">
                  <Link href="/routes"
                    className="inline-flex items-center gap-2 bg-white font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-white/90 transition-colors"
                    style={{ color: "#F4632A" }}>
                    <Bike size={16} />
                    Найти маршрут
                  </Link>
                  <Link href="/routes?tab=events"
                    className="inline-flex items-center gap-2 bg-white/20 font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-white/30 transition-colors text-white">
                    <Calendar size={16} />
                    Ближайшие поездки
                  </Link>
                </div>
              </div>
            </div>

            {/* Upcoming events */}
            {(() => {
              const visibleEvents = events.filter(ev =>
                !ev.is_private || (user != null && ev.participants.some(p => p.id === user.id))
              );
              return visibleEvents.length > 0 ? (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-1 h-6 rounded-full" style={{ backgroundColor: "#7C5CFC" }} />
                      <h2 className="text-lg font-bold text-[#1C1C1E] flex items-center gap-2">
                        <Calendar size={18} style={{ color: "#7C5CFC" }} />
                        Ближайшие поездки
                      </h2>
                    </div>
                    <Link href="/routes?tab=events" className="text-sm font-medium hover:underline" style={{ color: "#F4632A" }}>Все →</Link>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
                    {visibleEvents.map((event) => <EventCard key={event.id} event={event} />)}
                  </div>
                </section>
              ) : null;
            })()}

            {/* Inline create CTA — visible on all screen sizes */}
            <div className="rounded-2xl p-5 flex items-center justify-between gap-4"
              style={{ background: "linear-gradient(135deg, #0BBFB5 0%, #7C5CFC 100%)" }}>
              <div>
                <p className="text-white font-semibold text-sm mb-0.5">Планируешь поездку?</p>
                <p className="text-white/80 text-xs">Создай мероприятие или нажми «Запланировать дату» на любом маршруте</p>
              </div>
              <Link href="/events/new"
                className="shrink-0 bg-white font-semibold text-xs px-4 py-2.5 rounded-xl hover:bg-white/90 transition-colors whitespace-nowrap"
                style={{ color: "#7C5CFC" }}>
                Создать
              </Link>
            </div>

            {/* Popular routes */}
            {routes.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-6 rounded-full" style={{ backgroundColor: "#F4632A" }} />
                    <h2 className="text-lg font-bold text-[#1C1C1E] flex items-center gap-2">
                      <TrendingUp size={18} style={{ color: "#F4632A" }} />
                      Популярные маршруты
                    </h2>
                  </div>
                  <Link href="/routes" className="text-sm font-medium hover:underline" style={{ color: "#F4632A" }}>Все →</Link>
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
