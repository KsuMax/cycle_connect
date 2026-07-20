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
import { useInterests } from "@/lib/context/InterestsContext";
import { supabase } from "@/lib/supabase";
import { formatRouteDuration } from "@/lib/duration";
import { DifficultyBadge, Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { useRouter, notFound } from "next/navigation";
import { useAuthModal } from "@/components/ui/AuthModal";
import { useToast } from "@/lib/context/ToastContext";
import { useAchievements } from "@/lib/context/AchievementsContext";
import { RouteInterestSection } from "@/components/routes/RouteInterestSection";
import { RideReportsSection } from "@/components/routes/RideReportsSection";
import { WindWidget } from "@/components/routes/WindWidget";
import { SendToNavigator } from "@/components/routes/SendToNavigator";
import { PostRideSheet } from "@/components/routes/PostRideSheet";
import { ymGoal } from "@/lib/ym";
import { toMapMagicEmbed } from "@/lib/mapmagic";
import { mapProviderName, isEmbeddableMapUrl } from "@/lib/map-provider";
import { RouteMap } from "@/components/routes/RouteMap";
import { Bike, Mountain, Clock, Heart, ChevronLeft, Calendar, ExternalLink, MapPin, Bookmark, Pencil, Trash2, Lock, Users, Download, Train, Bus, CarTaxiFront, Route as RouteIcon, MoreVertical, Navigation, Star, NotebookPen } from "lucide-react";
import type { ExitPointKind } from "@/types";
import { formatDate } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitize";
import type { Route, RouteType } from "@/types";
import type { DbRoute, DbRouteInterest } from "@/lib/supabase";
import { dbToRoute } from "@/lib/transforms";

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

/** Ride button state machine */
type RideButtonState =
  | { type: "not_ridden" }
  | { type: "upcoming_event"; eventTitle: string; eventDate: string | null; eventId: string }
  | { type: "has_intent"; intentDate: string | null; intentId: string }
  | { type: "ridden"; count: number };

/** 1 отчёт / 2 отчёта / 5 отчётов */
function reportsPlural(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "отчёт";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "отчёта";
  return "отчётов";
}

const EXIT_KIND_META: Record<ExitPointKind, { label: string; icon: React.ReactNode }> = {
  train: { label: "Электричка", icon: <Train size={14} /> },
  bus:   { label: "Автобус",     icon: <Bus size={14} /> },
  taxi:  { label: "Такси",       icon: <CarTaxiFront size={14} /> },
  road:  { label: "Трасса",      icon: <RouteIcon size={14} /> },
  other: { label: "Другое",      icon: <MapPin size={14} /> },
};

function GpxFreshnessBadge({ updatedAt, routeCreatedAt }: { updatedAt: string | null | undefined; routeCreatedAt: string }) {
  if (!updatedAt) return null;
  const updatedMs = new Date(updatedAt).getTime();
  const createdMs = new Date(routeCreatedAt).getTime();
  // Treat as "fresh" if GPX was uploaded within 10 minutes of route creation
  if (Math.abs(updatedMs - createdMs) < 10 * 60 * 1000) {
    return <span className="text-[11px] text-[#71717A]">Загружен вместе с маршрутом</span>;
  }
  const days = Math.floor((Date.now() - updatedMs) / (1000 * 60 * 60 * 24));
  const label = days === 0 ? "сегодня" : days === 1 ? "вчера" : `${days} дн. назад`;
  return <span className="text-[11px] text-[#71717A]">Обновлён {label}</span>;
}

function ExitPointsSection({ status, points }: { status: import("@/types").ExitPointsStatus; points: import("@/types").ExitPoint[] }) {
  if (status === "unknown") return null;
  if (status === "none") {
    return (
      <div className="bg-white rounded-2xl p-4 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
        <div className="flex items-center gap-2 text-sm text-[#71717A]">
          <MapPin size={14} /> Точек схода нет — маршрут автономный
        </div>
      </div>
    );
  }
  if (points.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
      <h2 className="font-semibold text-[#1C1C1E] mb-3 flex items-center gap-2">
        <MapPin size={16} /> Точки схода
      </h2>
      <ul className="space-y-2">
        {points.map((p) => {
          const meta = EXIT_KIND_META[p.kind];
          return (
            <li key={p.id} className="flex items-start gap-3 p-3 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA]">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: "#F5F4F1", color: "#1C1C1E" }}>
                {meta.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-[#1C1C1E]">{p.title}</span>
                  <span className="text-[11px] text-[#71717A]">{meta.label}</span>
                  {p.distance_km_from_start != null && (
                    <span className="text-[11px] text-[#71717A]">· {p.distance_km_from_start} км от старта</span>
                  )}
                </div>
                {p.note && <div className="text-xs text-[#71717A] mt-0.5">{p.note}</div>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function RoutePageClient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { isLiked, toggleLike } = useLikes();
  const { hasRidden, rideCount, removeRide } = useRides();
  const { requireAuth } = useAuthModal();
  const { showToast } = useToast();
  const { checkAndAward } = useAchievements();
  const { getRouteEventStatus } = useEventRides();
  const { getRouteInterest, hasInterest, addInterest, removeInterest } = useInterests();
  const router = useRouter();

  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [likeCount, setLikeCount] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [relatedEvents, setRelatedEvents] = useState<RelatedEvent[]>([]);
  const [interests, setInterests] = useState<DbRouteInterest[]>([]);
  const [interestsKey, setInterestsKey] = useState(0);
  const [showRideMenu, setShowRideMenu] = useState(false);
  const [removingRide, setRemovingRide] = useState(false);
  const [postRideOpen, setPostRideOpen] = useState(false);
  const [sendSheetOpen, setSendSheetOpen] = useState(false);
  // Агрегат по отчётам для сводной карточки: количество + средняя оценка.
  // reportsKey бампается после публикации из шита — рефетч агрегата и списка отчётов.
  const [reportsAgg, setReportsAgg] = useState<{ count: number; avg: number | null }>({ count: 0, avg: null });
  const [reportsKey, setReportsKey] = useState(0);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("routes")
        .select("*, author:profiles!author_id(id, name, username, avatar_url, bio, website, strava_url, telegram_username, km_total, routes_count, events_count, showcase_achievements, is_admin, strava_connected, strava_synced_km, strava_synced_rides, strava_last_activity_at, strava_show_activities, strava_sport_types, season_goal_km, created_at), route_images(url), route_exit_points(*)")
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

  // Load interest pool for this route
  useEffect(() => {
    supabase
      .from("route_interests")
      .select("*, profile:profiles!user_id(id, name, avatar_url, telegram_username)")
      .eq("route_id", id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) setInterests(data as unknown as DbRouteInterest[]);
      });
  }, [id, interestsKey]);

  // Aggregate ride reports: count + average rating for the summary card link.
  // Колонки rating может ещё не быть в проде — тогда fallback на подсчёт по id.
  useEffect(() => {
    let cancelled = false;
    async function loadReportsAgg() {
      let count = 0;
      let avg: number | null = null;
      const { data, error } = await supabase
        .from("ride_reports")
        .select("rating")
        .eq("route_id", id);
      if (!error && data) {
        count = data.length;
        const ratings = (data as { rating: number | null }[])
          .map((r) => r.rating)
          .filter((r): r is number => r != null);
        if (ratings.length > 0) avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      } else {
        const { data: fallback } = await supabase
          .from("ride_reports")
          .select("id")
          .eq("route_id", id);
        count = fallback?.length ?? 0;
      }
      if (!cancelled) setReportsAgg({ count, avg });
    }
    loadReportsAgg();
    return () => { cancelled = true; };
  }, [id, reportsKey]);

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
    notFound();
  }

  const isAuthor = user?.id === route.author.id;
  const today = new Date().toISOString().split("T")[0];
  // TS не переносит сужение `route` (после notFound()) внутрь вложенной
  // renderSummaryCard — даём ей заведомо non-null ссылку под тем же именем.
  const routeNonNull = route;

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

  // Единая точка «сохранения»: избранное + «хочу проехать» — теперь один и тот же
  // пользовательский жест. Легаси-данные (есть одно, но не другое) считаем
  // сохранённым состоянием; отмена убирает оба, повторное сохранение — добавляет оба.
  const handleFavorite = async () => {
    if (!requireAuth("сохранить маршрут")) return;
    const wasFavorite = isFavorite(route.id);
    const wasInterested = hasInterest(route.id);
    const wasSaved = wasFavorite || wasInterested;

    if (wasSaved) {
      // Убираем оба — независимо от того, есть ли расхождение (легаси-данные,
      // где стоит только одна из двух отметок).
      if (wasFavorite) toggleFavorite(route.id);
      if (wasInterested) await removeInterest(route.id);
      showToast("Убрано из сохранённого", "info");
    } else {
      toggleFavorite(route.id);
      await addInterest(route.id);
      showToast("Сохранено — попадёшь в список желающих проехать", "success");
    }
    // Перезагрузить локальный список интересов — блок «Хотят проехать».
    setInterestsKey((k) => k + 1);
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

    const interest = getRouteInterest(route!.id);
    if (interest) {
      return {
        type: "has_intent",
        intentDate: interest.plannedDate,
        intentId: "",
      };
    }

    if (hasRidden(route!.id)) {
      return { type: "ridden", count: rideCount(route!.id) };
    }

    return { type: "not_ridden" };
  }

  const rideState = getRideButtonState();

  // Открытие пост-райд шита «Как прокатилось?» — единая точка входа для отметки проезда
  const openPostRideSheet = () => {
    if (!requireAuth("отметить проезд")) return;
    setPostRideOpen(true);
  };

  // После успешного сабмита шита: ачивки за проезд + рефетч агрегата и списка отчётов
  const handleRidePublished = () => {
    checkAndAward("ride_added", { routeId: routeNonNull.id, authorId: routeNonNull.author.id, distanceKm: routeNonNull.distance_km });
    setReportsKey((k) => k + 1);
  };

  function RideButton() {
    if (rideState.type === "upcoming_event") {
      return (
        <div className="flex-1 relative group/ridebtn">
          <div
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-center cursor-default select-none"
            style={{ backgroundColor: "#EFF6FF", color: "#2563EB" }}
          >
            Скоро еду
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
      // Сохранён/запланирован, но ещё не отмечен как проеханный — «Я проехал(а)»
      // важнее пассивной плашки: пользователю, который сохранил маршрут и уже
      // прокатился, нужно в первую очередь отметить проезд.
      return (
        <div className="flex-1 flex flex-col gap-1">
          <div className="text-center text-xs font-medium" style={{ color: "#16A34A" }}>
            {rideState.intentDate ? `Запланировано на ${formatDate(rideState.intentDate)}` : "В списке «Хочу проехать»"}
          </div>
          <div className="relative group/ridebtn">
            <button
              onClick={openPostRideSheet}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors"
              style={{ backgroundColor: "#1C1C1E", color: "white" }}
            >
              Я проехал(а)
            </button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover/ridebtn:opacity-100 transition-opacity pointer-events-none z-10"
              style={{ backgroundColor: "#1C1C1E", color: "white" }}>
              Если ты уже ездил этот маршрут, нажимай, чтобы отметиться
            </div>
          </div>
        </div>
      );
    }

    if (rideState.type === "ridden") {
      return (
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex gap-2 group/rideactions">
            <div className="flex-1 relative group/ridebtn">
              <button
                onClick={openPostRideSheet}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors"
                style={{ backgroundColor: "#F4632A", color: "white" }}
              >
                Проехал ещё раз
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover/ridebtn:opacity-100 transition-opacity pointer-events-none z-10"
                style={{ backgroundColor: "#1C1C1E", color: "white" }}>
                Если ты уже ездил этот маршрут, нажимай, чтобы отметиться
              </div>
            </div>
            <div className="relative">
              <button
                onClick={() => setShowRideMenu(!showRideMenu)}
                className="w-10 h-10 rounded-xl border border-[#E4E4E7] flex items-center justify-center text-[#A1A1AA] hover:text-[#1C1C1E] hover:border-[#F4632A] transition-colors"
                title="Ещё действия"
              >
                <MoreVertical size={16} />
              </button>
              {showRideMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-lg border border-[#E4E4E7] shadow-lg z-10 min-w-48"
                  style={{ boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)" }}>
                  <Link
                    href={`/routes/${route!.id}/report/new`}
                    onClick={() => setShowRideMenu(false)}
                    className="w-full px-4 py-2.5 text-left text-sm font-medium text-[#1C1C1E] hover:bg-[#F5F4F1] transition-colors first:rounded-t-lg last:rounded-b-lg flex items-center gap-2"
                  >
                    <NotebookPen size={15} aria-hidden /> Написать отчёт
                  </Link>
                  <button
                    onClick={async () => {
                      setRemovingRide(true);
                      const result = await removeRide(route!.id);
                      if (result === true) {
                        showToast("Запись отменена", "info");
                      } else {
                        showToast("Не удалось отменить — попробуй ещё раз", "error");
                      }
                      setShowRideMenu(false);
                      setRemovingRide(false);
                    }}
                    disabled={removingRide}
                    className="w-full px-4 py-2.5 text-left text-sm font-medium text-red-500 hover:bg-red-50 transition-colors first:rounded-t-lg last:rounded-b-lg disabled:opacity-50"
                  >
                    {removingRide ? "..." : "Отменить проезд"}
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="text-center text-xs text-[#A1A1AA]">
            Проехал {rideState.count} {rideState.count === 1 ? "раз" : rideState.count < 5 ? "раза" : "раз"} · {rideState.count * route!.distance_km} км
          </div>
        </div>
      );
    }

    // not_ridden
    return (
      <div className="flex-1 relative group/ridebtn">
        <button
          onClick={openPostRideSheet}
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors"
          style={{ backgroundColor: "#1C1C1E", color: "white" }}
        >
          Я проехал(а)
        </button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover/ridebtn:opacity-100 transition-opacity pointer-events-none z-10"
          style={{ backgroundColor: "#1C1C1E", color: "white" }}>
          Если ты уже ездил этот маршрут, нажимай, чтобы отметиться
        </div>
      </div>
    );
  }

  // Сводная карточка маршрута: на мобиле рендерится первой (над картой),
  // на десктопе — в правой колонке. Функция с двумя точками монтирования —
  // заголовок должен встречаться в DOM только один раз (единственный <h1>),
  // поэтому во втором месте монтирования рендерим <p> с той же версткой.
  function renderSummaryCard(titleAsH1: boolean) {
    const TitleTag = titleAsH1 ? "h1" : "p";
    const route = routeNonNull; // route уже проверен на null в рендере страницы выше
    // «Сохранено» = избранное ИЛИ отметка «хочу проехать» — легаси-данные,
    // где есть только одно из двух, тоже считаем сохранённым состоянием.
    const isSaved = isFavorite(route.id) || hasInterest(route.id);
    return (
    <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
      <div className="flex items-start justify-between mb-3">
        <TitleTag className="text-xl font-bold text-[#1C1C1E] leading-tight">{route.title}</TitleTag>
        <DifficultyBadge difficulty={route.difficulty} />
      </div>

      {/* Отчёты как отзывы: «★ 4,8 · 12 отчётов» — скролл к секции #reports */}
      {reportsAgg.count > 0 && (
        <button
          type="button"
          onClick={() => document.getElementById("reports")?.scrollIntoView({ behavior: "smooth" })}
          className="-mt-1 mb-3 flex items-center gap-1 text-sm transition-opacity hover:opacity-70"
        >
          {reportsAgg.avg != null && (
            <>
              <Star size={14} fill="#F4632A" style={{ color: "#F4632A" }} />
              <span className="font-semibold text-[#1C1C1E]">
                {reportsAgg.avg.toFixed(1).replace(".", ",")}
              </span>
              <span className="text-[#A1A1AA]">·</span>
            </>
          )}
          <span className="text-[#71717A] underline decoration-[#D4D4D8] underline-offset-2">
            {reportsAgg.count} {reportsPlural(reportsAgg.count)}
          </span>
        </button>
      )}

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
          { icon: <Clock size={16} />, value: formatRouteDuration(route.duration_min, route.duration_days), label: route.duration_days ? "Длительность" : "Время" },
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

      {/* Primary actions: получить маршрут в первую очередь, до отметки проезда */}
      <div className="pt-1 border-t border-[#F4F4F5] mb-3 mt-1" />
      {route.gpx_url && (
        <>
          <button
            onClick={() => setSendSheetOpen(true)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            style={{ backgroundColor: "#1C1C1E", color: "white" }}
          >
            <Navigation size={16} /> В навигатор
          </button>
          <SendToNavigator
            routeId={route.id}
            routeTitle={route.title}
            open={sendSheetOpen}
            onOpenChange={setSendSheetOpen}
            hideTrigger
          />
        </>
      )}
      <div className="flex gap-2 mt-2">
        {route.gpx_url && (
          <a href={`/api/routes/${route.id}/export`} download
            onClick={() => ymGoal("route_export", { target: "download_direct", route_id: route.id })}
            className="flex-1 py-2.5 rounded-xl border border-[#E4E4E7] text-sm font-semibold text-[#1C1C1E] flex items-center justify-center gap-1.5 hover:bg-[#F5F4F1] transition-colors">
            <Download size={15} /> GPX
          </a>
        )}
        <button onClick={handleFavorite}
          className="flex-1 py-2.5 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors"
          style={isSaved
            ? { backgroundColor: "#FFF0EB", borderColor: "#F4632A", color: "#F4632A" }
            : { backgroundColor: "white", borderColor: "#E4E4E7", color: "#1C1C1E" }}>
          <Bookmark size={15} fill={isSaved ? "#F4632A" : "none"} />
          {isSaved ? "Сохранено" : "Сохранить"}
        </button>
        <button onClick={handleLike}
          className="w-10 h-10 shrink-0 rounded-xl border flex items-center justify-center transition-colors"
          style={liked
            ? { backgroundColor: "#FFF0EB", borderColor: "#F4632A", color: "#F4632A" }
            : { backgroundColor: "white", borderColor: "#E4E4E7", color: "#A1A1AA" }}>
          <Heart size={15} fill={liked ? "#F4632A" : "none"} />
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
            {/* Mobile: сводка первой — что за маршрут, до карты и фото */}
            <div className="lg:hidden">{renderSummaryCard(true)}</div>

            {/* Map. Only MapMagic can be iframed (others send X-Frame-Options →
                blank window); for every other planner we draw the track from
                our own GPX. See lib/map-provider.ts. */}
            <div className="bg-white rounded-2xl overflow-hidden border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
              {isEmbeddableMapUrl(route.mapmagic_url ?? route.mapmagic_embed) && route.mapmagic_embed ? (
                <iframe src={toMapMagicEmbed(route.mapmagic_embed, route.title) ?? route.mapmagic_embed} className="w-full" style={{ height: 400, border: "none" }} allowFullScreen />
              ) : route.gpx_url ? (
                <RouteMap gpxUrl={route.gpx_url} height={400} />
              ) : (
                <div className="relative bg-gradient-to-br from-[#E6FAF9] to-[#D1FAF7] flex items-center justify-center" style={{ height: 400 }}>
                  <div className="text-center text-[#71717A]">
                    <MapPin size={48} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Карта не добавлена</p>
                  </div>
                </div>
              )}
              {(route.mapmagic_url || route.gpx_url) && (
                <div className="p-3 border-t border-[#F5F4F1] flex flex-wrap gap-2 items-center">
                  {route.mapmagic_url && (
                    <a href={route.mapmagic_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
                      style={{ backgroundColor: "#FFF7ED", color: "#F4632A" }}>
                      <ExternalLink size={13} /> Открыть в {mapProviderName(route.mapmagic_url) ?? "источнике"}
                    </a>
                  )}
                  {route.gpx_url && (
                    <span className="ml-auto">
                      <GpxFreshnessBadge updatedAt={route.gpx_updated_at} routeCreatedAt={route.created_at} />
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Description */}
            {route.description && (
              <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
                <h2 className="font-semibold text-[#1C1C1E] mb-3">О маршруте</h2>
                <div className="prose prose-sm max-w-none text-[#3F3F46] leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(route.description) }} />
              </div>
            )}

            {/* Ride reports — отзывы сразу после описания маршрута; якорь для ссылки из сводки */}
            <div id="reports" className="scroll-mt-24">
              <RideReportsSection key={reportsKey} routeId={route.id} routeTitle={route.title} />
            </div>

            {/* Exit points */}
            <ExitPointsSection status={route.exit_points_status} points={route.exit_points ?? []} />

            {/* Gallery */}
            {route.images && route.images.length > 0 && <RouteGallery images={route.images} />}

            {/* Ride history: отметка проезда — открывает пост-райд шит «Как прокатилось?» */}
            <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
              <span className="text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wide">История проездов</span>
              <div className="flex gap-2 mt-3">
                <RideButton />
              </div>
            </div>

            <PostRideSheet
              routeId={route.id}
              routeTitle={route.title}
              routeDistanceKm={route.distance_km}
              open={postRideOpen}
              onOpenChange={setPostRideOpen}
              onPublished={handleRidePublished}
            />

            {/* Comments */}
            <RouteComments routeId={route.id} />
          </div>

          {/* Right */}
          <aside className="space-y-4">
            {/* Main card — desktop only; on mobile it renders above the map.
                Заголовок здесь — <p>, а не <h1>: единственный <h1> страницы уже
                отрендерен в мобильной точке монтирования выше (см. renderSummaryCard). */}
            <div className="hidden lg:block">{renderSummaryCard(false)}</div>

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

            {/* Wind forecast for this route over the next 7 days */}
            <WindWidget routeId={route.id} />

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

            {/* Interest pool */}
            <RouteInterestSection interests={interests} />

            {/* Create event */}
            <Link href={`/events/new?route=${route.id}`}
              className="flex items-center gap-3 bg-white rounded-2xl p-4 border border-[#E4E4E7] hover:border-[#F4632A] transition-colors group"
              style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#FFF0EB" }}>
                <Calendar size={18} style={{ color: "#F4632A" }} />
              </div>
              <div>
                <div className="text-sm font-semibold text-[#1C1C1E] group-hover:text-[#F4632A] transition-colors">Создать заезд</div>
                <div className="text-xs text-[#A1A1AA]">Собери заезд по этому маршруту</div>
              </div>
            </Link>

          </aside>
        </div>
      </main>
    </div>
  );
}
