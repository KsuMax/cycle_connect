"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { RouteCard } from "@/components/routes/RouteCard";
import { EventCard } from "@/components/events/EventCard";
import { Sparkles, Search, ArrowUp, TrendingUp, Calendar, Users, ArrowRight, BookOpen } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Route, CycleEvent } from "@/types";
import type { DbRideReport } from "@/lib/supabase";

interface Props {
  initialRoutes: Route[];
  initialEvents: CycleEvent[];
  initialReports: DbRideReport[];
}

// Example prompts shown under the hero search field. Tapping one opens the
// AI-search widget with the query prefilled and run.
const HERO_EXAMPLES = [
  "Маршруты рядом со мной",
  "60 км несложный",
  "Гравий с видами",
  "С попутным ветром",
];

/** Opens the global AiSearchWidget, optionally prefilling + running a query. */
function openSearch(query?: string) {
  window.dispatchEvent(
    new CustomEvent("ai-search:open", query ? { detail: { query } } : undefined),
  );
}

export function FeedClient({ initialRoutes, initialEvents, initialReports }: Props) {
  const { user } = useAuth();
  // null = ещё грузим, true = есть клуб, false = нет клуба
  const [hasClub, setHasClub] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) { setHasClub(false); return; }
    supabase
      .from("club_members")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "active")
      .then(({ count }) => setHasClub((count ?? 0) > 0));
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
            {/* AI-search hero */}
            <section className="rounded-2xl p-6 text-white relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, #4B2FD6 0%, #7C5CFC 100%)" }}>
              <div className="absolute right-4 top-4 opacity-10">
                <Sparkles size={120} strokeWidth={1} />
              </div>
              <div className="relative">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-white/90 mb-2">
                  <Sparkles size={14} />
                  AI-поиск маршрутов
                </div>
                <h1 className="text-2xl font-bold mb-1">Опиши поездку — подберём маршрут</h1>
                <p className="text-white/90 text-sm mb-4">
                  Расстояние, сложность, покрытие, попутный ветер или места рядом — обычными словами
                </p>

                <button
                  onClick={() => openSearch()}
                  className="w-full bg-white rounded-xl px-4 py-3 flex items-center gap-3 text-left hover:bg-white/95 transition-colors"
                >
                  <Search size={18} style={{ color: "#7C5CFC" }} className="shrink-0" />
                  <span className="text-sm text-[#A1A1AA] flex-1 truncate">
                    Например: «60 км несложный с попутным ветром»
                  </span>
                  <span className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white"
                    style={{ backgroundColor: "#7C5CFC" }}>
                    <ArrowUp size={16} strokeWidth={2.5} />
                  </span>
                </button>

                <div className="flex flex-wrap gap-2 mt-3">
                  {HERO_EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => openSearch(ex)}
                      className="text-xs font-medium px-3 py-1.5 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Upcoming events */}
            {visibleEvents.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-6 rounded-full" style={{ backgroundColor: "#7C5CFC" }} />
                    <h2 className="text-lg font-bold text-[#1C1C1E] flex items-center gap-2">
                      <Calendar size={18} style={{ color: "#7C5CFC" }} />
                      Ближайшие заезды
                    </h2>
                  </div>
                  <Link href="/routes?tab=events" className="text-sm font-medium hover:underline" style={{ color: "#F4632A" }}>Все →</Link>
                </div>
                <div className="space-y-4">
                  {visibleEvents.map((event, i) => <EventCard key={event.id} event={event} priority={i === 0} />)}
                </div>
              </section>
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
            {/* Кататься вместе — заезды + клубы в одну строку */}
            <div>
              <h3 className="font-semibold text-sm text-[#1C1C1E] mb-2.5 px-0.5">Кататься вместе</h3>
              <div className="grid grid-cols-2 gap-2.5">
                {/* Заезды */}
                <Link href="/events/new"
                  className={`rounded-2xl border border-[#E4E4E7] bg-white p-3.5 hover:border-[#7C5CFC]/50 transition-colors group ${hasClub === false ? "" : "col-span-2"}`}
                  style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2.5"
                    style={{ backgroundColor: "#EDE9FF" }}>
                    <Calendar size={18} style={{ color: "#7C5CFC" }} />
                  </div>
                  <p className="text-sm font-semibold text-[#1C1C1E] mb-0.5 group-hover:text-[#7C5CFC] transition-colors">Заезды</p>
                  <p className="text-xs text-[#71717A] leading-snug mb-2.5">Создай и позови друзей</p>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "#7C5CFC" }}>
                    Создать <ArrowRight size={12} />
                  </span>
                </Link>

                {/* Клубы — только если пользователь ещё не в клубе */}
                {hasClub === false && (
                  <Link href="/clubs"
                    className="rounded-2xl border border-[#E4E4E7] bg-white p-3.5 hover:border-[#7C5CFC]/50 transition-colors group"
                    style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2.5"
                      style={{ backgroundColor: "#EDE9FF" }}>
                      <Users size={18} style={{ color: "#7C5CFC" }} />
                    </div>
                    <p className="text-sm font-semibold text-[#1C1C1E] mb-0.5 group-hover:text-[#7C5CFC] transition-colors">Клубы</p>
                    <p className="text-xs text-[#71717A] leading-snug mb-2.5">Команда и регулярные катки</p>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "#7C5CFC" }}>
                      Найти <ArrowRight size={12} />
                    </span>
                  </Link>
                )}
              </div>
            </div>

            {/* Свежие отчёты — компактный блок «Из дневника» */}
            {initialReports.length > 0 && (
              <div className="rounded-2xl border border-[#E4E4E7] bg-white p-4"
                style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen size={16} style={{ color: "#22A75B" }} />
                  <h3 className="font-semibold text-sm text-[#1C1C1E]">Из дневника</h3>
                </div>
                <div className="space-y-3">
                  {initialReports.slice(0, 3).map((report) => {
                    const routeId = report.route_id ?? report.route?.id;
                    const href = routeId ? `/routes/${routeId}/report/${report.id}` : "#";
                    const thumb = report.photos?.[0] ?? report.route?.cover_url ?? null;
                    return (
                      <Link key={report.id} href={href} className="flex items-center gap-2.5 group">
                        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-[#F5F4F1] flex items-center justify-center">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <BookOpen size={14} className="text-[#A1A1AA]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-[#1C1C1E] truncate group-hover:text-[#22A75B] transition-colors">
                            {report.route?.title ?? "Отчёт о поездке"}
                          </p>
                          <p className="text-[11px] text-[#A1A1AA] truncate">
                            {report.author?.name ?? "Райдер"}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
