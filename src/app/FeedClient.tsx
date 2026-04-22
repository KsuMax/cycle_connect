"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { RouteCard } from "@/components/routes/RouteCard";
import { EventCard } from "@/components/events/EventCard";
import { Bike, TrendingUp, Calendar, Users, Plus, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Route, CycleEvent } from "@/types";

interface Props {
  initialRoutes: Route[];
  initialEvents: CycleEvent[];
}

export function FeedClient({ initialRoutes, initialEvents }: Props) {
  const { user } = useAuth();
  // null = ещё грузим, true = есть клуб, false = нет клуба
  const [hasClub, setHasClub] = useState<boolean | null>(null);
  const [hasOwnEvents, setHasOwnEvents] = useState(false);

  useEffect(() => {
    if (!user) { setHasClub(false); return; }
    Promise.all([
      supabase
        .from("club_members")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "active"),
      supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("organizer_id", user.id),
    ]).then(([clubRes, eventsRes]) => {
      setHasClub((clubRes.count ?? 0) > 0);
      setHasOwnEvents((eventsRes.count ?? 0) > 0);
    });
  }, [user]);

  const visibleEvents = initialEvents.filter(ev =>
    !ev.is_private || (user != null && ev.participants.some(p => p.id === user.id))
  );

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
            {visibleEvents.length > 0 && (
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
                  {visibleEvents.map((event, i) => <EventCard key={event.id} event={event} priority={i === 0} />)}
                </div>
              </section>
            )}

            {/* Inline create CTA */}
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

            {/* Club discovery CTA — показываем только если у пользователя нет клуба */}
            {hasClub === false && (
              <div className="rounded-2xl border border-[#E4E4E7] bg-white p-5 flex items-start gap-4"
                style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
                <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: "#F0EDFF" }}>
                  <Users size={20} style={{ color: "#7C5CFC" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-[#1C1C1E] mb-0.5">
                    {user ? "Ты ещё не в клубе" : "Присоединяйся к сообществу"}
                  </p>
                  <p className="text-xs text-[#71717A] mb-3">
                    {user
                      ? "Клубы — место для регулярных поездок с командой, общей лентой и маршрутами"
                      : "Велоклубы объединяют тех, кто катается регулярно. Найди своих или создай клуб"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link href="/clubs"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                      style={{ backgroundColor: "#7C5CFC", color: "white" }}>
                      <ArrowRight size={13} /> Найти клуб
                    </Link>
                    {(user && hasOwnEvents) && (
                      <Link href="/clubs/new"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#E4E4E7] text-[#71717A] hover:border-[#7C5CFC] hover:text-[#7C5CFC] transition-colors">
                        <Plus size={13} /> Создать клуб
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Popular routes */}
            {initialRoutes.length > 0 && (
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
                  {initialRoutes.map((route, i) => <RouteCard key={route.id} route={route} priority={i === 0 && visibleEvents.length === 0} />)}
                </div>
              </section>
            )}

            {initialRoutes.length === 0 && initialEvents.length === 0 && (
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

            {/* Club CTA в сайдбаре */}
            {hasClub === false && (
              <div className="rounded-2xl border border-[#E4E4E7] bg-white p-4"
                style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <Users size={16} style={{ color: "#7C5CFC" }} />
                  <h3 className="font-semibold text-sm text-[#1C1C1E]">Велоклубы</h3>
                </div>
                <p className="text-xs text-[#71717A] mb-3">
                  Регулярные поездки с командой, общие маршруты и лента событий клуба
                </p>
                <Link href="/clubs"
                  className="block text-center font-semibold text-xs px-4 py-2 rounded-xl transition-colors mb-2"
                  style={{ backgroundColor: "#F0EDFF", color: "#7C5CFC" }}>
                  Найти клуб
                </Link>
                {user && hasOwnEvents && (
                  <Link href="/clubs/new"
                    className="block text-center font-semibold text-xs px-4 py-2 rounded-xl border border-[#E4E4E7] text-[#71717A] hover:border-[#7C5CFC] hover:text-[#7C5CFC] transition-colors">
                    Создать свой клуб
                  </Link>
                )}
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
