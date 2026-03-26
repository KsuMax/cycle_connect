"use client";

import { useState, use, useEffect } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { RouteGallery } from "@/components/routes/RouteGallery";
import { RouteComments } from "@/components/routes/RouteComments";
import { useFavorites } from "@/lib/context/FavoritesContext";
import { useAuth } from "@/lib/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { MOCK_COMMENTS } from "@/lib/data/mock";
import { DifficultyBadge, Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { EventCard } from "@/components/events/EventCard";
import { useRouter } from "next/navigation";
import { Bike, Mountain, Clock, Heart, ChevronLeft, Calendar, ExternalLink, MapPin, Bookmark, Pencil, Trash2 } from "lucide-react";
import type { Route, RouteType } from "@/types";
import type { DbRoute } from "@/lib/supabase";

const ROUTE_TYPE_LABELS: Record<RouteType, string> = {
  road: "Шоссе", gravel: "Гревел", mtb: "МТБ", urban: "Городской",
};
const ROUTE_TYPE_COLORS: Record<RouteType, { bg: string; text: string }> = {
  road:   { bg: "#EFF6FF", text: "#2563EB" },
  gravel: { bg: "#FFF7ED", text: "#EA580C" },
  mtb:    { bg: "#F5F3FF", text: "#7C3AED" },
  urban:  { bg: "#F0FDFA", text: "#0D9488" },
};

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
      initials: (r.author?.name ?? "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase(),
      color: "#F4632A",
      km_total: r.author?.km_total ?? 0,
      routes_count: r.author?.routes_count ?? 0,
      events_count: r.author?.events_count ?? 0,
    },
    riders_today: r.riders_today,
    likes: r.likes_count,
    mapmagic_url: r.mapmagic_url ?? undefined,
    mapmagic_embed: r.mapmagic_embed ?? undefined,
    images: r.route_images?.map((img: { url: string }) => img.url),
    created_at: r.created_at,
  };
}

export default function RouteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();
  const router = useRouter();

  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [going, setGoing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("routes")
        .select("*, author:profiles(*), route_images(url)")
        .eq("id", id)
        .single();

      if (!error && data) {
        const r = dbToRoute(data);
        setRoute(r);
        setLikeCount(r.likes);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-6xl mx-auto px-4 py-8">
          <div className="h-96 bg-white rounded-2xl animate-pulse border border-[#E4E4E7]" />
        </main>
      </div>
    );
  }

  if (!route) return notFound();

  const isAuthor = user?.id === route.author.id;
  const comments = MOCK_COMMENTS?.[route.id] ?? [];

  const handleDelete = async () => {
    if (!confirm("Удалить маршрут? Это действие нельзя отменить.")) return;
    setDeleting(true);
    await supabase.from("routes").delete().eq("id", route.id);
    router.push("/routes");
  };

  const handleLike = async () => {
    setLiked((prev) => !prev);
    setLikeCount((prev) => liked ? prev - 1 : prev + 1);
    if (user) {
      await supabase.from("routes").update({ likes_count: liked ? likeCount - 1 : likeCount + 1 }).eq("id", route.id);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <Link href="/routes" className="inline-flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#1C1C1E] mb-5 transition-colors">
          <ChevronLeft size={16} /> Маршруты
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
          {/* Left */}
          <div className="space-y-5">
            {/* Map */}
            <div className="bg-white rounded-2xl overflow-hidden border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
              {route.mapmagic_embed ? (
                <iframe src={route.mapmagic_embed} className="w-full" style={{ height: 400, border: "none" }} allowFullScreen />
              ) : (
                <div className="relative bg-gradient-to-br from-[#E6FAF9] to-[#D1FAF7] flex items-center justify-center" style={{ height: 400 }}>
                  <div className="text-center text-[#71717A]">
                    <MapPin size={48} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Карта не добавлена</p>
                  </div>
                </div>
              )}
              {route.mapmagic_url && (
                <div className="p-3 border-t border-[#F5F4F1]">
                  <a href={route.mapmagic_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
                    style={{ color: "#F4632A" }}>
                    <ExternalLink size={13} /> Открыть полный маршрут
                  </a>
                </div>
              )}
            </div>

            {/* Gallery */}
            {route.images && route.images.length > 0 && <RouteGallery images={route.images} />}

            {/* Description */}
            {route.description && (
              <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
                <h2 className="font-semibold text-[#1C1C1E] mb-3">О маршруте</h2>
                <p className="text-sm text-[#3F3F46] leading-relaxed">{route.description}</p>
              </div>
            )}

            {/* Comments */}
            <RouteComments routeId={route.id} initialComments={comments} />
          </div>

          {/* Right */}
          <aside className="space-y-4">
            {/* Main card */}
            <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
              <div className="flex items-start justify-between mb-3">
                <h1 className="text-xl font-bold text-[#1C1C1E] leading-tight">{route.title}</h1>
                <DifficultyBadge difficulty={route.difficulty} />
              </div>

              {route.region && (
                <div className="flex items-center gap-1.5 text-sm text-[#71717A] mb-4">
                  <MapPin size={14} /> {route.region}
                </div>
              )}

              {/* Types */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {route.route_types.map((type) => (
                  <span key={type} className="text-[11px] font-semibold px-2 py-0.5 rounded-md"
                    style={{ backgroundColor: ROUTE_TYPE_COLORS[type].bg, color: ROUTE_TYPE_COLORS[type].text }}>
                    {ROUTE_TYPE_LABELS[type]}
                  </span>
                ))}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { icon: <Bike size={16} />, value: `${route.distance_km} км`, label: "Дистанция" },
                  { icon: <Mountain size={16} />, value: `${route.elevation_m} м`, label: "Набор" },
                  { icon: <Clock size={16} />, value: route.duration_min ? `~${Math.round(route.duration_min / 60)} ч` : "—", label: "Время" },
                ].map(({ icon, value, label }) => (
                  <div key={label} className="text-center p-3 rounded-xl" style={{ backgroundColor: "#F5F4F1" }}>
                    <div className="flex justify-center mb-1 text-[#71717A]">{icon}</div>
                    <div className="text-sm font-semibold text-[#1C1C1E]">{value}</div>
                    <div className="text-xs text-[#A1A1AA]">{label}</div>
                  </div>
                ))}
              </div>

              {/* Tags */}
              {route.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {route.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <button onClick={() => setGoing(!going)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                  style={going
                    ? { backgroundColor: "#F4632A", color: "white" }
                    : { backgroundColor: "#1C1C1E", color: "white" }}>
                  {going ? "Еду ✓" : "Я еду"}
                </button>
                <button onClick={() => toggleFavorite(route.id)}
                  className="w-10 h-10 rounded-xl border flex items-center justify-center transition-colors"
                  style={isFavorite(route.id)
                    ? { backgroundColor: "#FFF0EB", borderColor: "#F4632A", color: "#F4632A" }
                    : { backgroundColor: "white", borderColor: "#E4E4E7", color: "#A1A1AA" }}>
                  <Bookmark size={16} fill={isFavorite(route.id) ? "#F4632A" : "none"} />
                </button>
                <button onClick={handleLike}
                  className="w-10 h-10 rounded-xl border flex items-center justify-center transition-colors gap-1 text-xs font-medium"
                  style={liked
                    ? { backgroundColor: "#FFF0EB", borderColor: "#F4632A", color: "#F4632A" }
                    : { backgroundColor: "white", borderColor: "#E4E4E7", color: "#A1A1AA" }}>
                  <Heart size={14} fill={liked ? "#F4632A" : "none"} />
                </button>
              </div>

              {isAuthor && (
                <div className="mt-3 flex gap-2">
                  <Link href={`/routes/${route.id}/edit`}
                    className="flex-1 py-2 rounded-xl border border-[#E4E4E7] text-sm text-[#71717A] flex items-center justify-center gap-2 hover:bg-[#F5F4F1] transition-colors">
                    <Pencil size={14} /> Редактировать
                  </Link>
                  <button onClick={handleDelete} disabled={deleting}
                    className="py-2 px-3 rounded-xl border border-red-200 text-sm text-red-500 flex items-center justify-center gap-1.5 hover:bg-red-50 transition-colors disabled:opacity-50">
                    <Trash2 size={14} /> {deleting ? "..." : "Удалить"}
                  </button>
                </div>
              )}
            </div>

            {/* Author */}
            <div className="bg-white rounded-2xl p-4 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
              <h3 className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-3">Автор</h3>
              <div className="flex items-center gap-3">
                <Avatar user={route.author} />
                <div>
                  <div className="font-medium text-sm text-[#1C1C1E]">{route.author.name}</div>
                  <div className="text-xs text-[#A1A1AA]">{route.author.routes_count} маршрутов</div>
                </div>
              </div>
            </div>

            {/* Create event */}
            <Link href={`/events/new?route=${route.id}`}
              className="flex items-center gap-3 bg-white rounded-2xl p-4 border border-[#E4E4E7] hover:border-[#F4632A] transition-colors group"
              style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#FFF0EB" }}>
                <Calendar size={18} style={{ color: "#F4632A" }} />
              </div>
              <div>
                <div className="text-sm font-semibold text-[#1C1C1E] group-hover:text-[#F4632A] transition-colors">Создать мероприятие</div>
                <div className="text-xs text-[#A1A1AA]">Организуй поездку по этому маршруту</div>
              </div>
            </Link>

          </aside>
        </div>
      </main>
    </div>
  );
}
