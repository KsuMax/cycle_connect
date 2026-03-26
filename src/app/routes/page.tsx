"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { RouteCard } from "@/components/routes/RouteCard";
import { Search, SlidersHorizontal, X, Plus } from "lucide-react";
import Link from "next/link";
import type { Difficulty, RouteType, Route } from "@/types";
import { supabase, type DbRoute } from "@/lib/supabase";
import { useAuth } from "@/lib/context/AuthContext";

const DIFFICULTIES: { value: Difficulty | "all"; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "easy", label: "Лёгкий" },
  { value: "medium", label: "Средний" },
  { value: "hard", label: "Сложный" },
];

const ROUTE_TYPES: { value: RouteType; label: string }[] = [
  { value: "road",   label: "Шоссе" },
  { value: "gravel", label: "Гревел" },
  { value: "mtb",    label: "МТБ" },
  { value: "urban",  label: "Городской" },
];

const REGIONS = ["Все регионы", "Карелия", "Санкт-Петербург", "Ленинградская область"];

function dbRouteToRoute(r: DbRoute): Route {
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
      initials: (r.author?.name ?? "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
      color: "#F4632A",
      km_total: r.author?.km_total ?? 0,
      routes_count: r.author?.routes_count ?? 0,
      events_count: r.author?.events_count ?? 0,
    },
    riders_today: r.riders_today,
    likes: r.likes_count,
    mapmagic_url: r.mapmagic_url ?? undefined,
    mapmagic_embed: r.mapmagic_embed ?? undefined,
    images: r.route_images?.map((img) => img.url),
    created_at: r.created_at,
  };
}

export default function RoutesPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty | "all">("all");
  const [selectedTypes, setSelectedTypes] = useState<RouteType[]>([]);
  const [maxDistance, setMaxDistance] = useState(300);
  const [region, setRegion] = useState("Все регионы");
  const [showFilters, setShowFilters] = useState(false);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("routes")
        .select("*, author:profiles(*), route_images(url)")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setRoutes(data.map(dbRouteToRoute));
      }
      setLoading(false);
    }
    load();
  }, []);

  const toggleType = (type: RouteType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const filtered = routes.filter((route) => {
    if (search && !route.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (difficulty !== "all" && route.difficulty !== difficulty) return false;
    if (selectedTypes.length > 0 && !selectedTypes.some((t) => route.route_types.includes(t))) return false;
    if (route.distance_km > maxDistance) return false;
    if (region !== "Все регионы" && route.region !== region) return false;
    return true;
  });

  const hasActiveFilters = difficulty !== "all" || maxDistance < 300 || region !== "Все регионы" || selectedTypes.length > 0;

  const resetFilters = () => {
    setDifficulty("all");
    setSelectedTypes([]);
    setMaxDistance(300);
    setRegion("Все регионы");
  };

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#1C1C1E] mb-1">Маршруты</h1>
            <p className="text-[#71717A] text-sm">Найди идеальный маршрут для следующей поездки</p>
          </div>
          {user && (
            <Link href="/routes/new"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: "#F4632A" }}>
              <Plus size={16} />
              <span className="hidden sm:inline">Добавить маршрут</span>
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
          {/* Filters sidebar — desktop */}
          <aside className="hidden lg:block">
            <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7] sticky top-24" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-[#1C1C1E]">Фильтры</h3>
                {hasActiveFilters && (
                  <button onClick={resetFilters} className="text-xs text-[#F4632A] hover:underline flex items-center gap-1">
                    <X size={12} /> Сбросить
                  </button>
                )}
              </div>

              <div className="mb-5">
                <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2 block">Сложность</label>
                <div className="flex flex-wrap gap-2">
                  {DIFFICULTIES.map(({ value, label }) => (
                    <button key={value} onClick={() => setDifficulty(value)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
                      style={difficulty === value
                        ? { backgroundColor: "#F4632A", color: "white", borderColor: "#F4632A" }
                        : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-5">
                <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2 block">Тип маршрута</label>
                <div className="flex flex-wrap gap-2">
                  {ROUTE_TYPES.map(({ value, label }) => (
                    <button key={value} onClick={() => toggleType(value)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
                      style={selectedTypes.includes(value)
                        ? { backgroundColor: "#1C1C1E", color: "white", borderColor: "#1C1C1E" }
                        : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-5">
                <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2 block">
                  Дистанция: до {maxDistance} км
                </label>
                <input type="range" min={10} max={300} step={10} value={maxDistance}
                  onChange={(e) => setMaxDistance(Number(e.target.value))}
                  className="w-full accent-[#F4632A]" />
                <div className="flex justify-between text-xs text-[#A1A1AA] mt-1">
                  <span>10 км</span><span>300 км</span>
                </div>
              </div>

              <div className="mb-5">
                <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2 block">Регион</label>
                <div className="flex flex-col gap-2">
                  {REGIONS.map((r) => (
                    <button key={r} onClick={() => setRegion(r)}
                      className="text-left px-3 py-2 rounded-lg text-sm transition-colors"
                      style={region === r
                        ? { backgroundColor: "#FFF0EB", color: "#F4632A", fontWeight: 500 }
                        : { color: "#71717A" }}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          <div>
            <div className="flex gap-3 mb-5">
              <div className="flex-1 relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
                <input type="text" placeholder="Поиск маршрутов..." value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#E4E4E7] bg-white text-sm outline-none focus:border-[#F4632A] transition-colors"
                  style={{ boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)" }} />
              </div>
              <button onClick={() => setShowFilters(!showFilters)}
                className="lg:hidden flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors"
                style={hasActiveFilters
                  ? { backgroundColor: "#F4632A", color: "white", borderColor: "#F4632A" }
                  : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }}>
                <SlidersHorizontal size={16} />Фильтры
              </button>
            </div>

            {showFilters && (
              <div className="lg:hidden bg-white rounded-2xl p-4 border border-[#E4E4E7] mb-4 space-y-4">
                <div>
                  <div className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2">Сложность</div>
                  <div className="flex flex-wrap gap-2">
                    {DIFFICULTIES.map(({ value, label }) => (
                      <button key={value} onClick={() => setDifficulty(value)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
                        style={difficulty === value
                          ? { backgroundColor: "#F4632A", color: "white", borderColor: "#F4632A" }
                          : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2">Тип маршрута</div>
                  <div className="flex flex-wrap gap-2">
                    {ROUTE_TYPES.map(({ value, label }) => (
                      <button key={value} onClick={() => toggleType(value)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
                        style={selectedTypes.includes(value)
                          ? { backgroundColor: "#1C1C1E", color: "white", borderColor: "#1C1C1E" }
                          : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#71717A] mb-1">До {maxDistance} км</div>
                  <input type="range" min={10} max={300} step={10} value={maxDistance}
                    onChange={(e) => setMaxDistance(Number(e.target.value))}
                    className="w-full accent-[#F4632A]" />
                </div>
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-white rounded-2xl h-64 animate-pulse border border-[#E4E4E7]" />
                ))}
              </div>
            ) : (
              <>
                <div className="text-sm text-[#71717A] mb-4">
                  {filtered.length === 0 ? "Маршруты не найдены" : `${filtered.length} маршрут${filtered.length === 1 ? "" : filtered.length < 5 ? "а" : "ов"}`}
                </div>
                {filtered.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {filtered.map((route) => <RouteCard key={route.id} route={route} />)}
                  </div>
                ) : (
                  <div className="text-center py-16 text-[#71717A]">
                    <div className="text-4xl mb-3">🗺️</div>
                    <div className="font-medium mb-1">Маршруты не найдены</div>
                    <div className="text-sm">Попробуй изменить фильтры</div>
                    {hasActiveFilters && (
                      <button onClick={resetFilters} className="mt-4 text-sm text-[#F4632A] hover:underline">
                        Сбросить все фильтры
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
