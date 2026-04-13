"use client";

import { useState, use, useEffect } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { RouteGallery } from "@/components/routes/RouteGallery";
import { RouteComments } from "@/components/routes/RouteComments";
import { useFavorites } from "@/lib/context/FavoritesContext";
import { useLikes } from "@/lib/context/LikesContext";
import { useAuth } from "@/lib/context/AuthContext";
import { useRides } from "@/lib/context/RidesContext";
import { useEventRides } from "@/lib/context/EventRidesContext";
import { useIntents } from "@/lib/context/IntentsContext";
import { supabase } from "@/lib/supabase";
import { DifficultyBadge, Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { useRouter } from "next/navigation";
import { useAuthModal } from "@/components/ui/AuthModal";
import { useToast } from "@/lib/context/ToastContext";
import { useAchievements } from "@/lib/context/AchievementsContext";
import { RideIntentsSection } from "@/components/routes/RideIntentsSection";
import { Bike, Mountain, Clock, Heart, ChevronLeft, Calendar, ExternalLink, MapPin, Bookmark, Pencil, Trash2, Lock, Users } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitize";
import type { Route, RouteType } from "@/types";
import type { DbRoute, DbRideIntent } from "@/lib/supabase";

interface RelatedEvent {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  is_private: boolean;
  participants: { user_id: string }[];
}

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
    images: r.route_images?.map((img: { url: string }) => img.url),
    created_at: r.created_at,
  };
}

/** Ride button state machine */
type RideButtonState =
  | { type: "not_ridden" }
  | { type: "upcoming_event"; eventTitle: string; eventDate: string | null; eventId: string }
  | { type: "has_intent"; intentDate: string; intentId: string }
  | { type: "ridden"; count: number };

export default function RouteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { isLiked, toggleLike } = useLikes();
  const { hasRidden, rideCount, addRide } = useRides();
  const { requireAuth } = useAuthModal();
  const { showToast } = useToast();
  const { checkAndAward } = useAchievements();
  const { getRouteEventStatus } = useEventRides();
  const { getRouteIntentStatus } = useIntents();
  const router = useRouter();

  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [relatedEvents, setRelatedEvents] = useState<RelatedEvent[]>([]);
  const [rideIntents, setRideIntents] = useState<DbRideIntent[]>([]);
  const [intentsKey, setIntentsKey] = useState(0);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("routes")
        .select("*, author:profiles!author_id(*), route_images(url)")
        .eq("id", id)
        .single();

      if (!error && data) {
        const r = dbToRoute(data);
        setRoute(r);
        setLikeCount(r.likes);
      } else {
        setFetchError(error?.message ?? "Маршрут не найден");
      }
      setLoading(false);
    }
    load();
  }, [id]);

  // Load all events for this route (past + upcoming) for the sidebar list and tooltip details
  useEffect(() => {
    supabase
      .from("events")
      .select("id, title, start_date, end_date, is_private, participants:event_participants(user_id)")
      .eq("route_id", id)
      .order("start_date", { ascending: true })
      .then(({ data }) => {
        if (data) setRelatedEvents(data as RelatedEvent[]);
      });
  }, [id]);

  // Load ride intents for this route
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    supabase
      .from("ride_intents")
      .select("*, creator:profiles!creator_id(id, name, avatar_url), participants:ride_intent_participants(user_id, joined_at, profile:profiles!user_id(id, name, avatar_url))")
      .eq("route_id", id)
      .gte("planned_date", today)
      .order("planned_date", { ascending: true })
      .then(({ data }) => {
        if (data) setRideIntents(data as unknown as DbRideIntent[]);
      });
  }, [id, intentsKey]);

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

  if (!route) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-6xl mx-auto px-4 py-8 text-center">
          <div className="text-4xl mb-3">🗺️</div>
          <h2 className="text-xl font-bold text-[#1C1C1E] mb-2">Маршрут не найден</h2>
          {fetchError && <p className="text-sm text-[#71717A] mb-2 font-mono">{fetchError}</p>}
          <Link href="/routes" className="text-sm text-[#F4632A] hover:underline">← Все маршруты</Link>
        </main>
      </div>
    );
  }

  const isAuthor = user?.id === route.author.id;
  const today = new Date().toISOString().split("T")[0];

  const handleDelete = async () => {
    if (!confirm("Удалить маршрут? Это действие нельзя отменить.")) return;
    setDeleting(true);
    await supabase.from("routes").delete().eq("id", route.id);
    showToast("Маршрут удалён", "info");
    router.push("/routes");
  };

  const liked = isLiked(route.id);

  const handleLike = async () => {
    if (!requireAuth("поставить лайк")) return;
    const prev = likeCount;
    const willLike = !liked;
    setLikeCount(willLike ? prev + 1 : prev - 1);
    await toggleLike(route.id, prev);
    showToast(willLike ? "Маршрут отмечен" : "Лайк убран", "info");
  };

  const handleFavorite = () => {
    if (!requireAuth("добавить в избранное")) return;
    const willFav = !isFavorite(route.id);
    toggleFavorite(route.id);
    showToast(willFav ? "Добавлено в избранное" : "Убрано из избранного", "info");
  };

  // Visible events (public or user is participant)
  const visibleEvents = relatedEvents.filter(
    ev => !ev.is_private || (user && ev.participants.some(p => p.user_id === user.id))
  );
  const upcomingEvents = visibleEvents.filter(ev => ev.start_date && ev.start_date >= today);

  // Derive ride button state.
  // Primary detection: EventRidesContext (pre-loaded for all routes the user participates in).
  // Tooltip details: relatedEvents (event title + date for the hover tooltip).
  function getRideButtonState(): RideButtonState {
    const eventStatus = getRouteEventStatus(route!.id);

    if (eventStatus === "upcoming") {
      const upcomingParticipating = upcomingEvents.find(ev =>
        user && ev.participants.some(p => p.user_id === user.id)
      );
      return {
        type: "upcoming_event",
        eventTitle: upcomingParticipating?.title ?? "",
        eventDate: upcomingParticipating?.start_date ?? null,
        eventId: upcomingParticipating?.id ?? "",
      };
    }

    const intentStatus = getRouteIntentStatus(route!.id);
    if (intentStatus) {
      return {
        type: "has_intent",
        intentDate: intentStatus.plannedDate,
        intentId: intentStatus.intentId,
      };
    }

    if (hasRidden(route!.id)) {
      return { type: "ridden", count: rideCount(route!.id) };
    }

    return { type: "not_ridden" };
  }

  const rideState = getRideButtonState();

  function RideButton() {
    if (rideState.type === "upcoming_event") {
      return (
        <div className="flex-1 relative group/ridebtn">
          <div
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-center cursor-default select-none"
            style={{ backgroundColor: "#EFF6FF", color: "#2563EB" }}
          >
            Скоро катну
          </div>
          {rideState.eventDate && (
            <div
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover/ridebtn:opacity-100 transition-opacity pointer-events-none z-10"
              style={{ backgroundColor: "#1C1C1E", color: "white" }}
            >
              {rideState.eventTitle} · {formatDate(rideState.eventDate)}
            </div>
          )}
        </div>
      );
    }

    if (rideState.type === "has_intent") {
      return (
        <div className="flex-1 relative group/ridebtn">
          <div
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-center cursor-default select-none"
            style={{ backgroundColor: "#F0FDF4", color: "#16A34A" }}
          >
            Планирую
          </div>
          {rideState.intentDate && (
            <div
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover/ridebtn:opacity-100 transition-opacity pointer-events-none z-10"
              style={{ backgroundColor: "#1C1C1E", color: "white" }}
            >
              {formatDate(rideState.intentDate)}
            </div>
          )}
        </div>
      );
    }

    if (rideState.type === "ridden") {
      return (
        <div className="flex-1 flex flex-col gap-1">
          <button
            onClick={() => {
              if (!requireAuth("отметить проезд")) return;
              addRide(route!.id, route!.distance_km);
              showToast("Проезд отмечен! +" + route!.distance_km + " км", "success");
              checkAndAward("ride_added", { routeId: route!.id, authorId: route!.author.id, distanceKm: route!.distance_km });
            }}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{ backgroundColor: "#F4632A", color: "white" }}
          >
            Катнуть ещё
          </button>
          <div className="text-center text-xs text-[#A1A1AA]">
            Проехал {rideState.count} {rideState.count === 1 ? "раз" : rideState.count < 5 ? "раза" : "раз"} · {rideState.count * route!.distance_km} км
          </div>
        </div>
      );
    }

    // not_ridden
    return (
      <button
        onClick={() => {
          if (!requireAuth("отметить маршрут")) return;
          addRide(route!.id, route!.distance_km);
          showToast("Маршрут отмечен как проеханный!", "success");
          checkAndAward("ride_added", { routeId: route!.id, authorId: route!.author.id, distanceKm: route!.distance_km });
        }}
        className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
        style={{ backgroundColor: "#1C1C1E", color: "white" }}
      >
        Катнуть
      </button>
    );
  }

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
                <div className="prose prose-sm max-w-none text-[#3F3F46] leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(route.description) }} />
              </div>
            )}

            {/* Comments */}
            <RouteComments routeId={route.id} />
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
                <RideButton />
                <button onClick={handleFavorite}
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
              <Link href={`/users/${route.author.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <Avatar user={route.author} />
                <div>
                  <div className="font-medium text-sm text-[#1C1C1E]">{route.author.name}</div>
                  <div className="text-xs text-[#A1A1AA]">{route.author.routes_count} маршрутов</div>
                </div>
              </Link>
            </div>

            {/* Upcoming events linked to this route */}
            {upcomingEvents.length > 0 && (
              <div className="bg-white rounded-2xl p-4 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
                <h3 className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Calendar size={12} /> Ближайшие мероприятия
                </h3>
                <div className="space-y-1">
                  {upcomingEvents.map(ev => (
                    <Link key={ev.id} href={`/events/${ev.id}`}
                      className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-[#F5F4F1] transition-colors group">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: "linear-gradient(135deg, #0BBFB5 0%, #7C5CFC 100%)" }}>
                        {ev.is_private
                          ? <Lock size={12} className="text-white" />
                          : <Calendar size={12} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[#1C1C1E] truncate group-hover:text-[#F4632A] transition-colors">
                          {ev.title}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[#A1A1AA]">
                          {ev.start_date && <span>{formatDate(ev.start_date)}</span>}
                          <span className="flex items-center gap-0.5">
                            <Users size={10} /> {ev.participants.length}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Ride intents */}
            <RideIntentsSection
              routeId={route.id}
              routeTitle={route.title}
              intents={rideIntents}
              onIntentsChange={() => setIntentsKey(k => k + 1)}
            />

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
