"use client";

import { useState, use } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { MOCK_ROUTES, MOCK_EVENTS, MOCK_COMMENTS } from "@/lib/data/mock";
import { RouteGallery } from "@/components/routes/RouteGallery";
import { RouteComments } from "@/components/routes/RouteComments";
import { useFavorites } from "@/lib/context/FavoritesContext";
import { DifficultyBadge, Badge } from "@/components/ui/Badge";
import { Avatar, AvatarGroup } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EventCard } from "@/components/events/EventCard";
import {
  Bike, Mountain, Clock, Heart, Share2,
  ChevronLeft, Calendar, ExternalLink, MapPin, Bookmark, Pencil,
} from "lucide-react";

// MVP: текущий пользователь
const CURRENT_USER_ID = "u1";

export default function RouteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const route = MOCK_ROUTES.find((r) => r.id === id);
  if (!route) notFound();

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(route.likes);
  const [going, setGoing] = useState(false);
  const { isFavorite, toggleFavorite } = useFavorites();
  const isAuthor = route.author.id === CURRENT_USER_ID;

  const relatedEvents = MOCK_EVENTS.filter((e) => e.route.id === route.id);
  const comments = MOCK_COMMENTS[route.id] ?? [];

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Back */}
        <Link
          href="/routes"
          className="inline-flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#1C1C1E] mb-5 transition-colors"
        >
          <ChevronLeft size={16} /> Маршруты
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
          {/* Left: Map + Description */}
          <div className="space-y-5">
            {/* MapMagic iframe */}
            <div className="bg-white rounded-2xl overflow-hidden border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
              {route.mapmagic_url ? (
                <iframe
                  src={route.mapmagic_url}
                  className="mapmagic-frame"
                  style={{ height: 440, borderRadius: 0 }}
                  allowFullScreen
                  title={route.title}
                />
              ) : (
                <div
                  className="relative flex items-center justify-center"
                  style={{ height: 440, background: "linear-gradient(135deg, #E6FAF9 0%, #F0ECFF 100%)" }}
                >
                  <svg viewBox="0 0 600 440" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                    <path
                      d={route.difficulty === "hard"
                        ? "M 60,360 Q 150,100 250,220 Q 350,340 450,120 Q 520,40 560,160"
                        : "M 60,300 Q 180,150 300,220 Q 420,290 540,180"}
                      fill="none"
                      stroke={route.difficulty === "hard" ? "#7C5CFC" : route.difficulty === "medium" ? "#F4632A" : "#0BBFB5"}
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                    <circle cx="60" cy={route.difficulty === "hard" ? 360 : 300} r="8" fill="#22C55E" />
                    <circle cx="540" cy={route.difficulty === "hard" ? 160 : 180} r="8" fill="#F4632A" />
                  </svg>
                  <div className="relative text-center">
                    <MapPin size={40} className="mx-auto mb-2 text-[#71717A] opacity-40" />
                    <p className="text-sm text-[#71717A]">Карта недоступна</p>
                  </div>
                </div>
              )}
              {route.mapmagic_url && (
                <div className="px-4 py-2.5 border-t border-[#F5F4F1] flex items-center justify-between">
                  <span className="text-xs text-[#71717A]">Карта: MapMagic</span>
                  <a
                    href={route.mapmagic_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs hover:underline"
                    style={{ color: "#F4632A" }}
                  >
                    Открыть полностью <ExternalLink size={11} />
                  </a>
                </div>
              )}
            </div>

            {/* Description */}
            <div className="bg-white rounded-2xl p-6 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
              <h2 className="font-semibold text-[#1C1C1E] mb-3">О маршруте</h2>
              <p className="text-[#71717A] text-sm leading-relaxed">{route.description}</p>
            </div>

            {/* Gallery */}
            {(route.images ?? []).length > 0 && (
              <RouteGallery images={route.images!} />
            )}

            {/* Related events */}
            {relatedEvents.length > 0 && (
              <div>
                <h2 className="font-semibold text-[#1C1C1E] mb-3 flex items-center gap-2">
                  <Calendar size={18} style={{ color: "#7C5CFC" }} />
                  Мероприятия на этом маршруте
                </h2>
                <div className="space-y-4">
                  {relatedEvents.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              </div>
            )}

            {/* Comments */}
            <RouteComments routeId={route.id} initialComments={comments} />
          </div>

          {/* Right: Info card (sticky) */}
          <aside>
            <div
              className="bg-white rounded-2xl p-5 border border-[#E4E4E7] sticky top-24"
              style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
            >
              {/* Title + diff */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <h1 className="text-xl font-bold text-[#1C1C1E] leading-tight">{route.title}</h1>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <DifficultyBadge difficulty={route.difficulty} />
                  {isAuthor && (
                    <Link
                      href={`/routes/${route.id}/edit`}
                      className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-[#E4E4E7] text-[#71717A] hover:text-[#1C1C1E] hover:bg-[#F5F4F1] transition-colors"
                    >
                      <Pencil size={12} />
                      Изменить
                    </Link>
                  )}
                </div>
              </div>

              {/* Region */}
              <div className="flex items-center gap-1.5 text-sm text-[#71717A] mb-4">
                <MapPin size={14} />
                {route.region}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-4 p-3 rounded-xl" style={{ backgroundColor: "#F5F4F1" }}>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-xs text-[#71717A] mb-0.5">
                    <Bike size={12} />
                    Дистанция
                  </div>
                  <div className="font-bold text-[#1C1C1E]">{route.distance_km} км</div>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-xs text-[#71717A] mb-0.5">
                    <Mountain size={12} />
                    Набор
                  </div>
                  <div className="font-bold text-[#1C1C1E]">{route.elevation_m} м</div>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-xs text-[#71717A] mb-0.5">
                    <Clock size={12} />
                    Время
                  </div>
                  <div className="font-bold text-[#1C1C1E]">~{Math.round(route.duration_min / 60)} ч</div>
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {route.tags.map((tag) => (
                  <Badge key={tag} variant="outline">{tag}</Badge>
                ))}
              </div>

              {/* Велотип */}
              <div className="text-xs text-[#71717A] mb-4">
                🚲 Подходит для: {route.bike_types.map(b =>
                  b === "road" ? "Шоссе" : b === "gravel" ? "Гравел" : b === "mountain" ? "МТБ" : "Любой"
                ).join(", ")}
              </div>

              {/* Author */}
              <div className="flex items-center gap-2 mb-5 pb-4 border-b border-[#F5F4F1]">
                <Avatar user={route.author} size="sm" />
                <div>
                  <div className="text-xs text-[#71717A]">Добавил</div>
                  <div className="text-sm font-medium text-[#1C1C1E]">{route.author.name}</div>
                </div>
              </div>

              {/* Riders */}
              {route.riders_today > 0 && (
                <div className="mb-4">
                  <AvatarGroup
                    users={[route.author]}
                    label={`${route.riders_today} ${route.riders_today === 1 ? "едет" : "едут"} сегодня`}
                  />
                </div>
              )}

              {/* CTA buttons */}
              <Button
                variant={going ? "outline" : "secondary"}
                size="lg"
                className="w-full mb-3"
                onClick={() => setGoing(!going)}
              >
                {going ? "✓ Ты едешь!" : "Я поеду →"}
              </Button>

              <Link
                href={`/events/new?route=${route.id}`}
                className="block text-center py-2.5 rounded-xl border border-[#E4E4E7] text-sm font-medium text-[#71717A] hover:bg-[#F5F4F1] transition-colors mb-3"
              >
                <Calendar size={14} className="inline mr-1.5" />
                Создать мероприятие
              </Link>

              {/* Like + Bookmark + Share */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setLiked(!liked); setLikeCount(liked ? likeCount - 1 : likeCount + 1); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-[#E4E4E7] text-sm transition-colors hover:bg-[#F5F4F1]"
                  style={{ color: liked ? "#F4632A" : "#71717A" }}
                >
                  <Heart size={14} fill={liked ? "#F4632A" : "none"} />
                  {likeCount}
                </button>
                <button
                  onClick={() => toggleFavorite(route.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-sm transition-colors"
                  style={isFavorite(route.id)
                    ? { backgroundColor: "#FFF0EB", borderColor: "#FDCDB9", color: "#F4632A" }
                    : { borderColor: "#E4E4E7", color: "#71717A", backgroundColor: "white" }
                  }
                  title={isFavorite(route.id) ? "Убрать из избранного" : "В избранное"}
                >
                  <Bookmark size={14} fill={isFavorite(route.id) ? "#F4632A" : "none"} />
                  {isFavorite(route.id) ? "Сохранено" : "Сохранить"}
                </button>
                <button className="px-3 flex items-center justify-center py-2 rounded-xl border border-[#E4E4E7] text-sm text-[#71717A] hover:bg-[#F5F4F1] transition-colors">
                  <Share2 size={14} />
                </button>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
