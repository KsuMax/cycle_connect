"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { RouteCard } from "@/components/routes/RouteCard";
import { Avatar } from "@/components/ui/Avatar";
import { supabase, proxyImageUrl } from "@/lib/supabase";
import { useAuth } from "@/lib/context/AuthContext";
import { useFollow } from "@/lib/context/FollowContext";
import { Map, Calendar, Globe, ExternalLink, UserPlus, UserCheck, ChevronRight, Trophy } from "lucide-react";
import { useAchievements } from "@/lib/context/AchievementsContext";
import { AchievementBadge } from "@/components/ui/AchievementBadge";
import { ProfileShowcase } from "@/components/ui/ProfileShowcase";
import { AvatarLightbox } from "@/components/ui/AvatarLightbox";
import { formatDate } from "@/lib/utils";
import type { Route, RouteType } from "@/types";
import type { DbRoute, DbProfile } from "@/lib/supabase";

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

type Tab = "routes" | "events" | "achievements";

export default function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { isFollowing, follow, unfollow, loaded: followLoaded } = useFollow();
  const { achievements, fetchUserAchievements, checkAndAward } = useAchievements();

  const [profile, setProfile] = useState<DbProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>("routes");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(true);
  const [events, setEvents] = useState<ProfileEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [showAvatarLightbox, setShowAvatarLightbox] = useState(false);
  const [userAchievementLevels, setUserAchievementLevels] = useState<Map<string, number>>(new Map());
  const [loadingAchievements, setLoadingAchievements] = useState(true);

  // Load profile
  useEffect(() => {
    supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setNotFound(true); }
        else { setProfile(data as DbProfile); }
        setLoading(false);
      });
  }, [id]);

  // Load follow counts
  useEffect(() => {
    supabase
      .from("user_follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("following_id", id)
      .then(({ count }) => setFollowersCount(count ?? 0));

    supabase
      .from("user_follows")
      .select("following_id", { count: "exact", head: true })
      .eq("follower_id", id)
      .then(({ count }) => setFollowingCount(count ?? 0));
  }, [id]);

  // Load user's routes
  useEffect(() => {
    supabase
      .from("routes")
      .select("*, author:profiles!author_id(*), route_images(url)")
      .eq("author_id", id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setRoutes(data.map(dbToRoute));
        setLoadingRoutes(false);
      });
  }, [id]);

  // Load user's achievements
  useEffect(() => {
    fetchUserAchievements(id).then((levels) => {
      setUserAchievementLevels(levels);
      setLoadingAchievements(false);
    });
  }, [id, fetchUserAchievements]);

  // Load events user participates in
  useEffect(() => {
    supabase
      .from("event_participants")
      .select("event_id")
      .eq("user_id", id)
      .then(async ({ data: rows }) => {
        const ids = rows?.map((r: { event_id: string }) => r.event_id) ?? [];
        if (ids.length > 0) {
          const { data } = await supabase
            .from("events")
            .select("id, title, start_date, organizer:profiles!organizer_id(name)")
            .in("id", ids)
            .order("start_date", { ascending: false });
          if (data) setEvents(data as unknown as ProfileEvent[]);
        }
        setLoadingEvents(false);
      });
  }, [id]);

  const isOwnProfile = user?.id === id;
  const following = isFollowing(id);

  const handleFollowToggle = async () => {
    if (!user || followBusy) return;
    setFollowBusy(true);
    if (following) {
      await unfollow(id);
      setFollowersCount((c) => Math.max(0, c - 1));
    } else {
      await follow(id);
      setFollowersCount((c) => c + 1);
      checkAndAward("user_followed", {});
    }
    setFollowBusy(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="h-40 bg-white rounded-2xl animate-pulse border border-[#E4E4E7]" />
        </main>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-8 text-center py-20">
          <div className="text-4xl mb-3">👤</div>
          <h2 className="text-xl font-bold text-[#1C1C1E] mb-2">Пользователь не найден</h2>
          <Link href="/" className="text-sm text-[#F4632A] hover:underline">← На главную</Link>
        </main>
      </div>
    );
  }

  const initials = profile.name
    ? profile.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  const userObj = {
    id: profile.id,
    name: profile.name,
    initials,
    color: "#7C5CFC",
    avatar_url: profile.avatar_url,
    km_total: profile.km_total,
    routes_count: profile.routes_count,
    events_count: profile.events_count,
  };

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Profile header */}
        <div className="bg-white rounded-2xl p-6 border border-[#E4E4E7] mb-6" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
          <div className="flex items-start gap-5">
            <div
              className={profile.avatar_url ? "cursor-pointer" : ""}
              onClick={() => profile.avatar_url && setShowAvatarLightbox(true)}
            >
              <Avatar user={userObj} size="lg" className="rounded-2xl w-16 h-16 shrink-0" />
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-xl font-bold text-[#1C1C1E]">{profile.name}</h1>
                  {profile.username && (
                    <p className="text-sm font-medium mt-0.5" style={{ color: "#F4632A" }}>@{profile.username}</p>
                  )}
                  {profile.bio && <p className="text-sm text-[#71717A] mt-1">{profile.bio}</p>}
                  {(profile.website || profile.strava_url) && (
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
                {!isOwnProfile && user && followLoaded && (
                  <button
                    onClick={handleFollowToggle}
                    disabled={followBusy}
                    className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-60"
                    style={following
                      ? { backgroundColor: "#F5F4F1", color: "#71717A", border: "1px solid #E4E4E7" }
                      : { backgroundColor: "#F4632A", color: "white" }}>
                    {following
                      ? <><UserCheck size={15} /> Подписан</>
                      : <><UserPlus size={15} /> Подписаться</>}
                  </button>
                )}
                {isOwnProfile && (
                  <Link href="/profile/settings"
                    className="text-sm text-[#71717A] hover:text-[#1C1C1E] border border-[#E4E4E7] px-3 py-2 rounded-xl hover:bg-[#F5F4F1] transition-colors">
                    Настройки
                  </Link>
                )}
              </div>

              {/* Stats */}
              <div className="flex gap-6 mt-4 flex-wrap">
                {[
                  { value: Math.round(profile.km_total).toLocaleString(), label: "км всего", color: "#F4632A", href: null },
                  { value: routes.length, label: "маршрутов", color: "#7C5CFC", href: null },
                  { value: followersCount, label: "подписчиков", color: "#0BBFB5", href: `/users/${id}/followers` },
                  { value: followingCount, label: "подписок", color: "#A1A1AA", href: `/users/${id}/following` },
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

        {/* Showcase */}
        {!loadingAchievements && profile.showcase_achievements && profile.showcase_achievements.length > 0 && (
          <div className="mb-6">
            <ProfileShowcase
              showcaseIds={profile.showcase_achievements}
              achievements={achievements}
              earnedLevels={userAchievementLevels}
            />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-2xl p-1.5 border border-[#E4E4E7] mb-6" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
          {([
            { id: "routes" as const, label: "Маршруты", icon: <Map size={15} />, count: routes.length },
            { id: "events" as const, label: "Мероприятия", icon: <Calendar size={15} />, count: events.length },
            { id: "achievements" as const, label: "Достижения", icon: <Trophy size={15} />, count: userAchievementLevels.size },
          ]).map((tab) => (
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
            ) : routes.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {routes.map((route) => <RouteCard key={route.id} route={route} />)}
              </div>
            ) : (
              <div className="text-center py-16 text-[#71717A]">
                <div className="flex justify-center mb-3 opacity-20"><Map size={40} /></div>
                <div className="font-medium text-[#1C1C1E]">Нет маршрутов</div>
                <div className="text-sm mt-1">Пользователь ещё не добавил маршруты</div>
              </div>
            )}
          </section>
        )}

        {activeTab === "events" && (
          <section>
            {loadingEvents ? (
              <div className="space-y-3">
                {[1, 2].map((i) => <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-[#E4E4E7]" />)}
              </div>
            ) : events.length > 0 ? (
              <div className="space-y-3">
                {events.map((ev) => (
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
              <div className="text-center py-16 text-[#71717A]">
                <div className="flex justify-center mb-3 opacity-20"><Calendar size={40} /></div>
                <div className="font-medium text-[#1C1C1E]">Нет мероприятий</div>
                <div className="text-sm mt-1">Пользователь ещё не участвовал в мероприятиях</div>
              </div>
            )}
          </section>
        )}

        {activeTab === "achievements" && (
          <section>
            {loadingAchievements ? (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-32 bg-white rounded-2xl animate-pulse border border-[#E4E4E7]" />
                ))}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex-1">
                    <div className="flex justify-between text-xs text-[#71717A] mb-1">
                      <span>Открыто {userAchievementLevels.size} из {achievements.length}</span>
                      <span>{Math.round((userAchievementLevels.size / Math.max(achievements.length, 1)) * 100)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#E4E4E7] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(userAchievementLevels.size / Math.max(achievements.length, 1)) * 100}%`,
                          background: "linear-gradient(90deg, #F4632A, #7C5CFC)",
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {achievements.map((ach) => (
                    <AchievementBadge
                      key={ach.id}
                      achievement={ach}
                      earned={userAchievementLevels.has(ach.id)}
                      level={userAchievementLevels.get(ach.id)}
                      hideIfHiddenAndNotEarned
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        )}
      </main>

      {showAvatarLightbox && profile.avatar_url && (
        <AvatarLightbox
          src={proxyImageUrl(profile.avatar_url) ?? profile.avatar_url}
          alt={profile.name}
          onClose={() => setShowAvatarLightbox(false)}
        />
      )}
    </div>
  );
}
