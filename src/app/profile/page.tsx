"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { RouteCard } from "@/components/routes/RouteCard";
import { useAuth } from "@/lib/context/AuthContext";
import { useFavorites } from "@/lib/context/FavoritesContext";
import { useRides } from "@/lib/context/RidesContext";
import { supabase } from "@/lib/supabase";
import { Bike, Map, Calendar, Settings, Bookmark, ChevronRight, Camera, Globe, ExternalLink, Users, Shield } from "lucide-react";
import { AvatarLightbox } from "@/components/ui/AvatarLightbox";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import type { Route, RouteType } from "@/types";
import type { DbRoute } from "@/lib/supabase";

type Tab = "routes" | "favorites" | "events";
type EventsSubTab = "rides" | "events_list";

interface ProfileEvent {
  id: string;
  title: string;
  start_date: string | null;
  organizer: { name: string } | null;
}

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

export default function ProfilePage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const { favorites } = useFavorites();
  const { rides, ridesLoaded } = useRides();

  const [activeTab, setActiveTab] = useState<Tab>("routes");
  const [eventsSubTab, setEventsSubTab] = useState<EventsSubTab>("rides");

  const [myRoutes, setMyRoutes] = useState<Route[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(true);

  const [ridesData, setRidesData] = useState<Route[]>([]);
  const [loadingRides, setLoadingRides] = useState(true);

  const [favoriteRoutes, setFavoriteRoutes] = useState<Route[]>([]);
  const [loadingFavorites, setLoadingFavorites] = useState(false);

  const [myEvents, setMyEvents] = useState<ProfileEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [showAvatarLightbox, setShowAvatarLightbox] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push("/auth/login");
  }, [user, authLoading, router]);

  // Load my routes
  useEffect(() => {
    if (!user) return;
    supabase
      .from("routes")
      .select("*, author:profiles!author_id(*), route_images(url)")
      .eq("author_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setMyRoutes(data.map(dbToRoute));
        setLoadingRoutes(false);
      });
  }, [user]);

  // Load ridden routes from context rides Set (which handles Supabase + localStorage fallback)
  useEffect(() => {
    if (!user || !ridesLoaded) return;
    const routeIds = Array.from(rides);
    if (routeIds.length === 0) {
      setRidesData([]);
      setLoadingRides(false);
      return;
    }
    supabase
      .from("routes")
      .select("*, author:profiles!author_id(*), route_images(url)")
      .in("id", routeIds)
      .then(({ data }) => {
        if (data) setRidesData(data.map(dbToRoute));
        setLoadingRides(false);
      });
  }, [rides, ridesLoaded, user]);

  // Load favorite routes from Supabase (favorites Set contains real IDs, not mock)
  useEffect(() => {
    if (!user) return;
    const ids = Array.from(favorites);
    if (ids.length === 0) {
      setFavoriteRoutes([]);
      return;
    }
    setLoadingFavorites(true);
    supabase
      .from("routes")
      .select("*, author:profiles!author_id(*), route_images(url)")
      .in("id", ids)
      .then(({ data }) => {
        if (data) setFavoriteRoutes(data.map(dbToRoute));
        setLoadingFavorites(false);
      });
  }, [favorites, user]);

  // Load participated events
  useEffect(() => {
    if (!user) return;
    supabase
      .from("event_participants")
      .select("event_id")
      .eq("user_id", user.id)
      .then(async ({ data: participantRows }) => {
        const eventIds = participantRows?.map((p: { event_id: string }) => p.event_id) ?? [];
        if (eventIds.length > 0) {
          const { data } = await supabase
            .from("events")
            .select("id, title, start_date, organizer:profiles!organizer_id(name)")
            .in("id", eventIds);
          if (data) setMyEvents(data as unknown as ProfileEvent[]);
        }
        setLoadingEvents(false);
      });
  }, [user]);

  // Sync avatarUrl from profile
  useEffect(() => {
    setAvatarUrl(profile?.avatar_url ?? null);
  }, [profile]);

  // Load followers/following counts
  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("following_id", user.id)
      .then(({ count }) => setFollowersCount(count ?? 0));
    supabase
      .from("user_follows")
      .select("following_id", { count: "exact", head: true })
      .eq("follower_id", user.id)
      .then(({ count }) => setFollowingCount(count ?? 0));
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["jpg", "jpeg", "png", "webp"].includes(ext ?? "")) return;
    setUploadingAvatar(true);
    setAvatarError(null);
    const path = `${user.id}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, cacheControl: "0" });
    if (uploadError) {
      setAvatarError(uploadError.message);
    } else {
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      const urlWithBust = `${publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase.from("profiles").update({ avatar_url: urlWithBust }).eq("id", user.id);
      if (updateError) {
        setAvatarError(updateError.message);
      } else {
        setAvatarUrl(urlWithBust);
      }
    }
    setUploadingAvatar(false);
    e.target.value = "";
  };

  const ridesKm = loadingRides
    ? (profile?.km_total ?? 0)
    : ridesData.reduce((sum, r) => sum + r.distance_km, 0);
  const tripsCount = ridesData.length + myEvents.length;

  const initials = profile?.name
    ? profile.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.[0].toUpperCase() ?? "?";

  const TABS: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: "routes",    label: "Мои маршруты", icon: <Map size={15} />,      count: myRoutes.length },
    { id: "favorites", label: "Избранное",    icon: <Bookmark size={15} />, count: favoriteRoutes.length },
    { id: "events",    label: "Поездки",      icon: <Calendar size={15} />, count: tripsCount },
  ];

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="h-40 bg-white rounded-2xl animate-pulse border border-[#E4E4E7]" />
        </main>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Profile header */}
        <div className="bg-white rounded-2xl p-6 border border-[#E4E4E7] mb-6" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
          <div className="flex items-start gap-5">
            <div className="relative shrink-0 group">
              <div
                className={`w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center text-xl font-bold text-white${avatarUrl ? " cursor-pointer" : ""}`}
                style={{ backgroundColor: "#7C5CFC" }}
                onClick={() => avatarUrl && setShowAvatarLightbox(true)}>
                {avatarUrl
                  ? <img src={avatarUrl} alt="Аватар" className="w-full h-full object-cover" />
                  : initials
                }
              </div>
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute inset-0 rounded-2xl flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Загрузить фото">
                {uploadingAvatar
                  ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Camera size={18} className="text-white" />
                }
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarUpload}
              />
              {avatarError && (
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-red-500 font-medium">
                  {avatarError}
                </div>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-xl font-bold text-[#1C1C1E]">{profile?.name || "Участник"}</h1>
                  {profile?.username && <p className="text-sm font-medium mt-0.5" style={{ color: "#F4632A" }}>@{profile.username}</p>}
                  <p className="text-sm text-[#71717A] mt-0.5">{user.email}</p>
                  {profile?.bio && <p className="text-sm text-[#71717A] mt-1">{profile.bio}</p>}
                  {(profile?.website || profile?.strava_url) && (
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {profile.website && (
                        <a href={profile.website} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-[#7C5CFC] hover:underline">
                          <Globe size={12} />
                          {(() => { try { return new URL(profile.website!).hostname.replace("www.", ""); } catch { return profile.website; } })()}
                          <ExternalLink size={10} />
                        </a>
                      )}
                      {profile.strava_url && (
                        <a href={profile.strava_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-medium hover:underline"
                          style={{ color: "#FC4C02" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
                          </svg>
                          Strava
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  )}
                </div>
                <Link href="/profile/settings" className="flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#1C1C1E] transition-colors p-2 rounded-lg hover:bg-[#F5F4F1]">
                  <Settings size={16} /><span className="hidden sm:inline">Настройки</span>
                </Link>
              </div>
              <div className="flex gap-6 mt-4 flex-wrap">
                {[
                  { value: Math.round(ridesKm).toLocaleString(), label: "км всего", color: "#F4632A", href: null },
                  { value: myRoutes.length, label: "маршрутов", color: "#7C5CFC", href: null },
                  { value: loadingRides ? "..." : ridesData.length, label: "поездок", color: "#0BBFB5", href: null },
                  { value: followersCount, label: "подписчиков", color: "#A1A1AA", href: user ? `/users/${user.id}/followers` : null },
                  { value: followingCount, label: "подписок",    color: "#A1A1AA", href: user ? `/users/${user.id}/following` : null },
                ].map(({ value, label, color, href }) => (
                  href ? (
                    <Link key={label} href={href} className="text-center group">
                      <div className="text-xl font-bold group-hover:underline" style={{ color }}>{value}</div>
                      <div className="text-xs text-[#71717A]">{label}</div>
                    </Link>
                  ) : (
                    <div key={label} className="text-center">
                      <div className="text-xl font-bold" style={{ color }}>{value}</div>
                      <div className="text-xs text-[#71717A]">{label}</div>
                    </div>
                  )
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Profile completion hint */}
        {!profile?.bio && !avatarUrl && myRoutes.length === 0 && !loadingRoutes && (
          <div className="bg-gradient-to-r from-[#FFF0EB] to-[#F5F3FF] rounded-2xl p-5 border border-[#E4E4E7] mb-6" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <h3 className="font-semibold text-[#1C1C1E] text-sm mb-1">Заполни профиль</h3>
            <p className="text-xs text-[#71717A] mb-3">Добавь фото и расскажи о себе, чтобы другие велосипедисты тебя узнали</p>
            <div className="flex items-center gap-2 flex-wrap">
              {!avatarUrl && (
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[#E4E4E7] text-[#71717A] hover:bg-white transition-colors"
                >
                  <Camera size={12} /> Добавить фото
                </button>
              )}
              <Link href="/profile/settings"
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[#E4E4E7] text-[#71717A] hover:bg-white transition-colors"
              >
                <Settings size={12} /> Настроить профиль
              </Link>
            </div>
          </div>
        )}

        {/* Community section */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Link href="/users"
            className="flex items-center gap-3 bg-white rounded-2xl p-4 border border-[#E4E4E7] hover:border-[#7C5CFC]/40 transition-colors group"
            style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#F0ECFF" }}>
              <Users size={18} style={{ color: "#7C5CFC" }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[#1C1C1E] group-hover:text-[#7C5CFC] transition-colors">Участники</div>
              <div className="text-[11px] text-[#A1A1AA]">Найти велосипедистов</div>
            </div>
            <ChevronRight size={14} className="text-[#A1A1AA] shrink-0" />
          </Link>
          <Link href="/clubs"
            className="flex items-center gap-3 bg-white rounded-2xl p-4 border border-[#E4E4E7] hover:border-[#0BBFB5]/40 transition-colors group relative overflow-hidden"
            style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#E8FAF9" }}>
              <Shield size={18} style={{ color: "#0BBFB5" }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[#1C1C1E] group-hover:text-[#0BBFB5] transition-colors">Клубы</div>
              <div className="text-[11px] text-[#A1A1AA]">Скоро</div>
            </div>
            <ChevronRight size={14} className="text-[#A1A1AA] shrink-0" />
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-2xl p-1.5 border border-[#E4E4E7] mb-6" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
          {TABS.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium transition-all"
              style={activeTab === tab.id ? { backgroundColor: "#1C1C1E", color: "white" } : { color: "#71717A" }}>
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.count > 0 && (
                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center"
                  style={activeTab === tab.id
                    ? { backgroundColor: "rgba(255,255,255,0.2)", color: "white" }
                    : { backgroundColor: "#F5F4F1", color: "#71717A" }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === "routes" && (
          <section>
            {loadingRoutes ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[1, 2].map((i) => <div key={i} className="h-64 bg-white rounded-2xl animate-pulse border border-[#E4E4E7]" />)}
              </div>
            ) : myRoutes.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {myRoutes.map((route) => <RouteCard key={route.id} route={route} />)}
              </div>
            ) : (
              <EmptyState icon={<Map size={28} />} title="Пока нет маршрутов"
                text="Поделись своим любимым маршрутом — покажи его другим велосипедистам"
                action={<Link href="/routes/new" className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl text-white" style={{ backgroundColor: "#F4632A" }}>
                  <Map size={16} /> Добавить маршрут
                </Link>}
              />
            )}
          </section>
        )}

        {activeTab === "favorites" && (
          <section>
            {loadingFavorites ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[1, 2].map((i) => <div key={i} className="h-64 bg-white rounded-2xl animate-pulse border border-[#E4E4E7]" />)}
              </div>
            ) : favoriteRoutes.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {favoriteRoutes.map((route) => <RouteCard key={route.id} route={route} />)}
              </div>
            ) : (
              <EmptyState icon={<Bookmark size={28} />} title="Нет избранных маршрутов"
                text="Найди интересный маршрут и сохрани его, чтобы не потерять"
                action={<Link href="/routes" className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl text-white" style={{ backgroundColor: "#F4632A" }}>
                  <Map size={16} /> Найти маршрут
                </Link>}
              />
            )}
          </section>
        )}

        {activeTab === "events" && (
          <section>
            {/* Sub-tabs */}
            <div className="flex gap-1 bg-white rounded-xl p-1 border border-[#E4E4E7] mb-5" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
              {([
                { id: "rides" as const,       label: "Катанул",     icon: <Bike size={14} />,     count: ridesData.length },
                { id: "events_list" as const, label: "Мероприятия", icon: <Calendar size={14} />, count: myEvents.length },
              ]).map((sub) => (
                <button key={sub.id} onClick={() => setEventsSubTab(sub.id)}
                  className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all"
                  style={eventsSubTab === sub.id ? { backgroundColor: "#1C1C1E", color: "white" } : { color: "#71717A" }}>
                  {sub.icon}
                  {sub.label}
                  {sub.count > 0 && (
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                      style={eventsSubTab === sub.id
                        ? { backgroundColor: "rgba(255,255,255,0.2)", color: "white" }
                        : { backgroundColor: "#F5F4F1", color: "#71717A" }}>
                      {sub.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {eventsSubTab === "rides" && (
              loadingRides ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[1, 2].map((i) => <div key={i} className="h-64 bg-white rounded-2xl animate-pulse border border-[#E4E4E7]" />)}
                </div>
              ) : ridesData.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {ridesData.map((route) => <RouteCard key={route.id} route={route} />)}
                </div>
              ) : (
                <EmptyState icon={<Bike size={28} />} title="Нет прокатанных маршрутов"
                  text='Открой любой маршрут и нажми "Катнуть", чтобы добавить его в свои поездки'
                  action={<Link href="/routes" className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl text-white" style={{ backgroundColor: "#F4632A" }}>
                    <Bike size={16} /> Найти маршрут
                  </Link>}
                />
              )
            )}

            {eventsSubTab === "events_list" && (
              loadingEvents ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-[#E4E4E7]" />)}
                </div>
              ) : myEvents.length > 0 ? (
                <div className="space-y-3">
                  {myEvents.map((ev) => (
                    <Link key={ev.id} href={`/events/${ev.id}`}
                      className="flex items-center gap-4 bg-white rounded-2xl p-4 border border-[#E4E4E7] hover:border-[#F4632A] transition-colors"
                      style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: "#FFF0EB" }}>
                        <Calendar size={18} style={{ color: "#F4632A" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-[#1C1C1E] truncate">{ev.title}</div>
                        <div className="text-xs text-[#A1A1AA] mt-0.5">
                          {ev.start_date ? formatDate(ev.start_date) : "Дата не указана"}
                          {ev.organizer?.name && ` · ${ev.organizer.name}`}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-[#A1A1AA] shrink-0" />
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState icon={<Calendar size={28} />} title="Нет мероприятий"
                  text="Запишись на групповую поездку или организуй свою"
                  action={
                    <div className="flex items-center gap-2 justify-center flex-wrap">
                      <Link href="/routes?tab=events" className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl border border-[#E4E4E7] text-[#1C1C1E] hover:bg-[#F5F4F1] transition-colors">
                        Найти поездку
                      </Link>
                      <Link href="/events/new" className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl text-white" style={{ backgroundColor: "#F4632A" }}>
                        <Calendar size={16} /> Создать
                      </Link>
                    </div>
                  }
                />
              )
            )}
          </section>
        )}
      </main>

      {showAvatarLightbox && avatarUrl && (
        <AvatarLightbox
          src={avatarUrl}
          alt={profile?.name || "Аватар"}
          onClose={() => setShowAvatarLightbox(false)}
        />
      )}
    </div>
  );
}

function EmptyState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-12 px-4">
      <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: "#FFF0EB" }}>
        <div style={{ color: "#F4632A" }}>{icon}</div>
      </div>
      <div className="font-semibold mb-1 text-[#1C1C1E]">{title}</div>
      <div className="text-sm text-[#71717A] max-w-xs mx-auto mb-4">{text}</div>
      {action}
    </div>
  );
}
