"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { RouteCard } from "@/components/routes/RouteCard";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/lib/context/AuthContext";
import { useFavorites } from "@/lib/context/FavoritesContext";
import { supabase } from "@/lib/supabase";
import { MOCK_ROUTES } from "@/lib/data/mock";
import { Bike, Map, Calendar, Settings, Bookmark, LogIn } from "lucide-react";
import Link from "next/link";
import type { Route, RouteType } from "@/types";
import type { DbRoute } from "@/lib/supabase";

type Tab = "routes" | "favorites" | "events";

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

export default function ProfilePage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const { favorites } = useFavorites();
  const [activeTab, setActiveTab] = useState<Tab>("routes");
  const [myRoutes, setMyRoutes] = useState<Route[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    async function loadMyRoutes() {
      const { data, error } = await supabase
        .from("routes")
        .select("*, author:profiles(*), route_images(url)")
        .eq("author_id", user!.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setMyRoutes(data.map(dbToRoute));
      }
      setLoadingRoutes(false);
    }
    loadMyRoutes();
  }, [user]);

  const favoriteRoutes = MOCK_ROUTES.filter((r) => favorites.has(r.id));

  const initials = profile?.name
    ? profile.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.[0].toUpperCase() ?? "?";

  const profileUser = {
    id: user?.id ?? "",
    name: profile?.name ?? user?.email ?? "Участник",
    initials,
    color: "#7C5CFC",
    bio: profile?.bio ?? undefined,
    km_total: profile?.km_total ?? 0,
    routes_count: profile?.routes_count ?? 0,
    events_count: profile?.events_count ?? 0,
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: "routes",    label: "Мои маршруты", icon: <Map size={15} />,      count: myRoutes.length },
    { id: "favorites", label: "Избранное",    icon: <Bookmark size={15} />, count: favoriteRoutes.length },
    { id: "events",    label: "Поездки",      icon: <Calendar size={15} />, count: profileUser.events_count },
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
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white shrink-0"
              style={{ backgroundColor: "#7C5CFC" }}>
              {initials}
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-xl font-bold text-[#1C1C1E]">{profileUser.name}</h1>
                  {profile?.username && <p className="text-sm font-medium mt-0.5" style={{ color: "#F4632A" }}>@{profile.username}</p>}
                  <p className="text-sm text-[#71717A] mt-0.5">{user.email}</p>
                  {profileUser.bio && <p className="text-sm text-[#71717A] mt-1">{profileUser.bio}</p>}
                </div>
                <button className="flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#1C1C1E] transition-colors p-2 rounded-lg hover:bg-[#F5F4F1]">
                  <Settings size={16} /><span className="hidden sm:inline">Настройки</span>
                </button>
              </div>
              <div className="flex gap-6 mt-4">
                {[
                  { value: profileUser.km_total.toLocaleString(), label: "км всего", color: "#F4632A" },
                  { value: myRoutes.length, label: "маршрутов", color: "#7C5CFC" },
                  { value: profileUser.events_count, label: "поездок", color: "#0BBFB5" },
                ].map(({ value, label, color }) => (
                  <div key={label} className="text-center">
                    <div className="text-xl font-bold" style={{ color }}>{value}</div>
                    <div className="text-xs text-[#71717A]">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
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
              <EmptyState icon={<Map size={40} />} title="Нет маршрутов"
                text="Добавь первый маршрут, нажав + в меню"
                action={<Link href="/routes/new" className="mt-4 inline-block text-sm font-medium px-4 py-2 rounded-xl text-white" style={{ backgroundColor: "#F4632A" }}>Добавить маршрут</Link>}
              />
            )}
          </section>
        )}

        {activeTab === "favorites" && (
          <section>
            {favoriteRoutes.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {favoriteRoutes.map((route) => <RouteCard key={route.id} route={route} />)}
              </div>
            ) : (
              <EmptyState icon={<Bookmark size={40} />} title="Нет избранных"
                text='Нажми "Сохранить" на странице маршрута, чтобы добавить его сюда' />
            )}
          </section>
        )}

        {activeTab === "events" && (
          <EmptyState icon={<Calendar size={40} />} title="Нет поездок"
            text="Присоединись к мероприятию или создай своё"
            action={<Link href="/events/new" className="mt-4 inline-block text-sm font-medium px-4 py-2 rounded-xl text-white" style={{ backgroundColor: "#F4632A" }}>Создать мероприятие</Link>}
          />
        )}
      </main>
    </div>
  );
}

function EmptyState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-16 text-[#71717A]">
      <div className="flex justify-center mb-3 opacity-20">{icon}</div>
      <div className="font-medium mb-1 text-[#1C1C1E]">{title}</div>
      <div className="text-sm max-w-xs mx-auto">{text}</div>
      {action}
    </div>
  );
}
