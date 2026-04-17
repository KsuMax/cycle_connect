"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { RouteCard } from "@/components/routes/RouteCard";
import { EventCard } from "@/components/events/EventCard";
import { Search, SlidersHorizontal, X, Plus, Map, Calendar } from "lucide-react";
import Link from "next/link";
import type { Difficulty, RouteType, Route, CycleEvent, Surface } from "@/types";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/context/AuthContext";
import { ROUTE_TYPES, DIFFICULTIES as BASE_DIFFICULTIES, SURFACES } from "@/constants/routes";
import { dbToRoute, dbToEvent } from "@/lib/transforms";

type LocationScope = "all" | "city" | "out";
const LOCATION_SCOPES: { value: LocationScope; label: string }[] = [
  { value: "all",  label: "Все" },
  { value: "out",  label: "За городом" },
  { value: "city", label: "Город" },
];

const OUT_TYPES: RouteType[] = ["road", "gravel", "mtb"];

const DIFFICULTIES: { value: Difficulty | "all"; label: string }[] = [
  { value: "all", label: "Все" },
  ...BASE_DIFFICULTIES,
];

function RoutesPageInner() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = searchParams.get("tab") === "events" ? "events" : "routes";

  const setTab = useCallback((tab: "routes" | "events") => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "events") params.set("tab", "events");
    else params.delete("tab");
    router.replace(`/routes?${params.toString()}`);
  }, [searchParams, router]);

  // ── Routes state ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty | "all">("all");
  const [selectedTypes, setSelectedTypes] = useState<RouteType[]>([]);
  const [selectedSurfaces, setSelectedSurfaces] = useState<Surface[]>([]);
  const [locationScope, setLocationScope] = useState<LocationScope>("out");
  const [minDistance, setMinDistance] = useState<string>("");
  const [maxDistance, setMaxDistance] = useState<string>("");
  const [region, setRegion] = useState("");
  const [regions, setRegions] = useState<string[]>([]);
  const [regionSearch, setRegionSearch] = useState("");
  const [regionOpen, setRegionOpen] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routesLoading, setRoutesLoading] = useState(true);

  // ── Events state ──────────────────────────────────────────────────────────
  const [events, setEvents] = useState<CycleEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [eventSearch, setEventSearch] = useState("");
  const [eventSortBy, setEventSortBy] = useState<"date_asc" | "date_desc">("date_asc");
  const [eventStartFrom, setEventStartFrom] = useState("");
  const [eventStartTo, setEventStartTo] = useState("");
  const [eventMaxDays, setEventMaxDays] = useState(30);
  const [eventMaxDistance, setEventMaxDistance] = useState(500);
  const [eventOnlyWithSpots, setEventOnlyWithSpots] = useState(false);
  const [showEventFilters, setShowEventFilters] = useState(false);

  // ── Load regions ──────────────────────────────────────────────────────────
  const PRIORITY_REGIONS = ["Санкт-Петербург", "Ленинградская область", "Карелия"];

  useEffect(() => {
    supabase
      .from("regions")
      .select("name")
      .order("name")
      .then(({ data }) => {
        if (!data) return;
        const names = data.map((r) => r.name);
        const priority = PRIORITY_REGIONS.filter((r) => names.includes(r));
        const rest = names.filter((r) => !PRIORITY_REGIONS.includes(r));
        setRegions([...priority, ...rest]);
      });
  }, []);

  // ── Close region combobox on outside click ────────────────────────────────
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (regionRef.current && !regionRef.current.contains(e.target as Node)) {
        setRegionOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // ── Load routes ───────────────────────────────────────────────────────────
  useEffect(() => {
    supabase
      .from("routes")
      .select("*, author:profiles!author_id(*), route_images(url), route_comments(id, text, likes_count, created_at, author:profiles!author_id(name))")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setRoutes(data.map(dbToRoute));
        setRoutesLoading(false);
      });
  }, []);

  // ── Load events (lazy — only when tab first opened) ───────────────────────
  useEffect(() => {
    if (activeTab !== "events" || eventsLoaded) return;
    setEventsLoading(true);
    supabase
      .from("events")
      .select("*, organizer:profiles!organizer_id(*), route:routes(*), event_days(*), event_participants(user_id, profile:profiles!user_id(*))")
      .order("start_date", { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setEvents(data.map(dbToEvent));
        setEventsLoading(false);
        setEventsLoaded(true);
      });
  }, [activeTab, eventsLoaded]);

  // ── Routes filtering / sorting ────────────────────────────────────────────
  const toggleType = (type: RouteType) =>
    setSelectedTypes((prev) => prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]);

  const toggleSurface = (s: Surface) =>
    setSelectedSurfaces((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  const minKm = minDistance === "" ? null : Number(minDistance);
  const maxKm = maxDistance === "" ? null : Number(maxDistance);

  const filtered = routes.filter((route) => {
    if (search && !route.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (difficulty !== "all" && route.difficulty !== difficulty) return false;
    if (selectedTypes.length > 0 && !selectedTypes.some((t) => route.route_types.includes(t))) return false;
    if (locationScope === "city" && !route.route_types.includes("urban")) return false;
    if (locationScope === "out"  && !route.route_types.some((t) => OUT_TYPES.includes(t))) return false;
    if (selectedSurfaces.length > 0 && !selectedSurfaces.some((s) => route.surface.includes(s))) return false;
    if (minKm !== null && !Number.isNaN(minKm) && route.distance_km < minKm) return false;
    if (maxKm !== null && !Number.isNaN(maxKm) && route.distance_km > maxKm) return false;
    if (region && route.region !== region) return false;
    return true;
  }).sort((a, b) =>
    sortBy === "oldest"
      ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const hasActiveRouteFilters =
    difficulty !== "all"
    || locationScope !== "all"
    || selectedTypes.length > 0
    || selectedSurfaces.length > 0
    || minDistance !== ""
    || maxDistance !== ""
    || region !== "";

  const resetRouteFilters = () => {
    setDifficulty("all");
    setSelectedTypes([]);
    setSelectedSurfaces([]);
    setLocationScope("all");
    setMinDistance("");
    setMaxDistance("");
    setRegion("");
  };

  // ── Events filtering / sorting ────────────────────────────────────────────
  const filteredEvents = events.filter((ev) => {
    if (ev.is_private && !(user != null && ev.participants.some(p => p.id === user.id))) return false;
    if (eventSearch && !ev.title.toLowerCase().includes(eventSearch.toLowerCase())) return false;
    if (eventStartFrom && ev.start_date && ev.start_date < eventStartFrom) return false;
    if (eventStartTo && ev.start_date && ev.start_date > eventStartTo) return false;
    if (ev.days.length > eventMaxDays) return false;
    const totalKm = ev.days.reduce((s, d) => s + d.distance_km, 0);
    if (totalKm > eventMaxDistance) return false;
    if (eventOnlyWithSpots && ev.max_participants != null) {
      if (ev.participants.length >= ev.max_participants) return false;
    }
    return true;
  }).sort((a, b) => {
    const da = a.start_date ?? "";
    const db = b.start_date ?? "";
    return eventSortBy === "date_asc" ? da.localeCompare(db) : db.localeCompare(da);
  });

  const hasActiveEventFilters = eventStartFrom !== "" || eventStartTo !== "" || eventMaxDays < 30 || eventMaxDistance < 500 || eventOnlyWithSpots;

  const resetEventFilters = () => {
    setEventStartFrom("");
    setEventStartTo("");
    setEventMaxDays(30);
    setEventMaxDistance(500);
    setEventOnlyWithSpots(false);
  };

  const selectStyle = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23A1A1AA' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat" as const,
    backgroundPosition: "right 12px center" as const,
  };

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#1C1C1E] mb-1">
              {activeTab === "routes" ? "Маршруты" : "Мероприятия"}
            </h1>
            <p className="text-[#71717A] text-sm">
              {activeTab === "routes"
                ? "Найди идеальный маршрут для следующей поездки"
                : "Ближайшие велопоходы и групповые поездки"}
            </p>
          </div>
          {activeTab === "routes" && (
            <Link href={user ? "/routes/new" : "/auth/login"}
              className="flex items-center gap-2 px-4 min-h-[44px] rounded-xl text-sm font-semibold text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: "#F4632A" }}>
              <Plus size={16} />
              Добавить маршрут
            </Link>
          )}
          {activeTab === "events" && (
            <Link href={user ? "/events/new" : "/auth/login"}
              className="flex items-center gap-2 px-4 min-h-[44px] rounded-xl text-sm font-semibold text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: "#7C5CFC" }}>
              <Plus size={16} />
              Создать мероприятие
            </Link>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white border border-[#E4E4E7] rounded-xl p-1 w-fit" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
          <button
            onClick={() => setTab("routes")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={activeTab === "routes"
              ? { backgroundColor: "#1C1C1E", color: "white" }
              : { color: "#71717A" }}>
            <Map size={15} />
            Маршруты
          </button>
          <button
            onClick={() => setTab("events")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={activeTab === "events"
              ? { backgroundColor: "#1C1C1E", color: "white" }
              : { color: "#71717A" }}>
            <Calendar size={15} />
            Мероприятия
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">

          {/* ── ROUTES tab: filters sidebar (desktop) ─────────────────────── */}
          {activeTab === "routes" && (
            <aside className="hidden lg:block">
              <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7] sticky top-24" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-[#1C1C1E]">Фильтры</h3>
                  {hasActiveRouteFilters && (
                    <button onClick={resetRouteFilters} className="text-xs text-[#F4632A] hover:underline flex items-center gap-1">
                      <X size={12} /> Сбросить
                    </button>
                  )}
                </div>

                <div className="mb-5">
                  <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2 block">Сортировка</label>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "newest" | "oldest")}
                    className="w-full px-3 py-2 rounded-xl border border-[#E4E4E7] bg-white text-sm outline-none focus:border-[#F4632A] transition-colors appearance-none cursor-pointer"
                    style={selectStyle}>
                    <option value="newest">По дате (сначала новые)</option>
                    <option value="oldest">По дате (сначала старые)</option>
                  </select>
                </div>

                <div className="mb-5">
                  <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2 block">Где</label>
                  <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: "#F5F4F1" }}>
                    {LOCATION_SCOPES.map(({ value, label }) => (
                      <button key={value} onClick={() => setLocationScope(value)}
                        className="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        style={locationScope === value
                          ? { backgroundColor: "white", color: "#1C1C1E", boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.07)" }
                          : { color: "#71717A" }}>
                        {label}
                      </button>
                    ))}
                  </div>
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
                  <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2 block">Покрытие</label>
                  <div className="flex flex-wrap gap-2">
                    {SURFACES.map(({ value, label }) => (
                      <button key={value} onClick={() => toggleSurface(value)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
                        style={selectedSurfaces.includes(value)
                          ? { backgroundColor: "#1C1C1E", color: "white", borderColor: "#1C1C1E" }
                          : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-5">
                  <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2 block">Дистанция, км</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} placeholder="От" value={minDistance}
                      onChange={(e) => setMinDistance(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#E4E4E7] bg-white text-sm outline-none focus:border-[#F4632A] transition-colors" />
                    <span className="text-xs text-[#A1A1AA]">—</span>
                    <input type="number" min={0} placeholder="До" value={maxDistance}
                      onChange={(e) => setMaxDistance(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#E4E4E7] bg-white text-sm outline-none focus:border-[#F4632A] transition-colors" />
                  </div>
                </div>

                <div className="mb-5">
                  <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2 block">Регион</label>
                  <div className="relative" ref={regionRef}>
                    <input
                      type="text"
                      placeholder={region || "Все регионы"}
                      value={regionOpen ? regionSearch : (region || "")}
                      onFocus={() => { setRegionOpen(true); setRegionSearch(""); }}
                      onChange={(e) => setRegionSearch(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border text-sm outline-none transition-colors"
                      style={{
                        borderColor: region ? "#F4632A" : "#E4E4E7",
                        color: region && !regionOpen ? "#F4632A" : "#1C1C1E",
                        fontWeight: region && !regionOpen ? 500 : 400,
                      }}
                    />
                    {regionOpen && (
                      <div className="absolute z-10 top-full mt-1 w-full bg-white border border-[#E4E4E7] rounded-xl shadow-lg overflow-hidden">
                        <button
                          type="button"
                          onMouseDown={() => { setRegion(""); setRegionOpen(false); setRegionSearch(""); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-[#F5F4F1] transition-colors"
                          style={region === "" ? { color: "#F4632A", fontWeight: 500 } : { color: "#71717A" }}>
                          Все регионы
                        </button>
                        {regions
                          .filter((r) => r.toLowerCase().includes(regionSearch.toLowerCase()))
                          .map((r) => (
                            <button
                              key={r}
                              type="button"
                              onMouseDown={() => { setRegion(r); setRegionOpen(false); setRegionSearch(""); }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-[#F5F4F1] transition-colors"
                              style={region === r ? { color: "#F4632A", fontWeight: 500 } : { color: "#1C1C1E" }}>
                              {r}
                            </button>
                          ))
                        }
                        {regions.filter((r) => r.toLowerCase().includes(regionSearch.toLowerCase())).length === 0 && (
                          <p className="px-3 py-2 text-sm text-[#A1A1AA]">Ничего не найдено</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </aside>
          )}

          {/* ── EVENTS tab: filters sidebar (desktop) ─────────────────────── */}
          {activeTab === "events" && (
            <aside className="hidden lg:block">
              <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7] sticky top-24" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-[#1C1C1E]">Фильтры</h3>
                  {hasActiveEventFilters && (
                    <button onClick={resetEventFilters} className="text-xs text-[#F4632A] hover:underline flex items-center gap-1">
                      <X size={12} /> Сбросить
                    </button>
                  )}
                </div>

                <div className="mb-5">
                  <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2 block">Сортировка</label>
                  <select value={eventSortBy} onChange={(e) => setEventSortBy(e.target.value as "date_asc" | "date_desc")}
                    className="w-full px-3 py-2 rounded-xl border border-[#E4E4E7] bg-white text-sm outline-none focus:border-[#7C5CFC] transition-colors appearance-none cursor-pointer"
                    style={selectStyle}>
                    <option value="date_asc">По дате (ближайшие сначала)</option>
                    <option value="date_desc">По дате (дальние сначала)</option>
                  </select>
                </div>

                <div className="mb-5">
                  <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2 block">Дата начала</label>
                  <div className="space-y-2">
                    <div>
                      <div className="text-xs text-[#A1A1AA] mb-1">С</div>
                      <input type="date" value={eventStartFrom} onChange={(e) => setEventStartFrom(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[#E4E4E7] bg-white text-sm outline-none focus:border-[#7C5CFC] transition-colors" />
                    </div>
                    <div>
                      <div className="text-xs text-[#A1A1AA] mb-1">По</div>
                      <input type="date" value={eventStartTo} onChange={(e) => setEventStartTo(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[#E4E4E7] bg-white text-sm outline-none focus:border-[#7C5CFC] transition-colors" />
                    </div>
                  </div>
                </div>

                <div className="mb-5">
                  <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2 block">
                    Количество дней: до {eventMaxDays === 30 ? "30+" : eventMaxDays}
                  </label>
                  <input type="range" min={1} max={30} step={1} value={eventMaxDays}
                    onChange={(e) => setEventMaxDays(Number(e.target.value))}
                    className="w-full accent-[#7C5CFC]" />
                  <div className="flex justify-between text-xs text-[#A1A1AA] mt-1">
                    <span>1 день</span><span>30+ дней</span>
                  </div>
                </div>

                <div className="mb-5">
                  <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2 block">
                    Общая дистанция: до {eventMaxDistance === 500 ? "500+" : eventMaxDistance} км
                  </label>
                  <input type="range" min={10} max={500} step={10} value={eventMaxDistance}
                    onChange={(e) => setEventMaxDistance(Number(e.target.value))}
                    className="w-full accent-[#7C5CFC]" />
                  <div className="flex justify-between text-xs text-[#A1A1AA] mt-1">
                    <span>10 км</span><span>500+ км</span>
                  </div>
                </div>

                <div>
                  <button
                    onClick={() => setEventOnlyWithSpots(!eventOnlyWithSpots)}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl border transition-colors text-sm font-medium"
                    style={eventOnlyWithSpots
                      ? { backgroundColor: "#F0FDF4", color: "#16A34A", borderColor: "#86EFAC" }
                      : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }}>
                    <div className="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
                      style={eventOnlyWithSpots
                        ? { backgroundColor: "#16A34A", borderColor: "#16A34A" }
                        : { borderColor: "#D1D5DB" }}>
                      {eventOnlyWithSpots && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    Есть свободные места
                  </button>
                </div>
              </div>
            </aside>
          )}

          {/* ── Content area ──────────────────────────────────────────────── */}
          <div>
            {/* Search + mobile filter toggle */}
            <div className="flex gap-3 mb-5">
              <div className="flex-1 relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
                <input
                  type="text"
                  placeholder={activeTab === "routes" ? "Поиск маршрутов..." : "Поиск мероприятий..."}
                  value={activeTab === "routes" ? search : eventSearch}
                  onChange={(e) => activeTab === "routes" ? setSearch(e.target.value) : setEventSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#E4E4E7] bg-white text-sm outline-none focus:border-[#F4632A] transition-colors"
                  style={{ boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)" }} />
              </div>
              <button
                onClick={() => activeTab === "routes" ? setShowFilters(!showFilters) : setShowEventFilters(!showEventFilters)}
                className="lg:hidden flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors"
                style={(activeTab === "routes" ? hasActiveRouteFilters : hasActiveEventFilters)
                  ? { backgroundColor: "#F4632A", color: "white", borderColor: "#F4632A" }
                  : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }}>
                <SlidersHorizontal size={16} />Фильтры
              </button>
            </div>

            {/* Mobile filters — routes */}
            {activeTab === "routes" && showFilters && (
              <div className="lg:hidden bg-white rounded-2xl p-4 border border-[#E4E4E7] mb-4 space-y-4">
                <div>
                  <div className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2">Сортировка</div>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "newest" | "oldest")}
                    className="w-full px-3 py-2 rounded-xl border border-[#E4E4E7] bg-white text-sm outline-none focus:border-[#F4632A] transition-colors appearance-none cursor-pointer"
                    style={selectStyle}>
                    <option value="newest">По дате (сначала новые)</option>
                    <option value="oldest">По дате (сначала старые)</option>
                  </select>
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2">Где</div>
                  <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: "#F5F4F1" }}>
                    {LOCATION_SCOPES.map(({ value, label }) => (
                      <button key={value} onClick={() => setLocationScope(value)}
                        className="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        style={locationScope === value
                          ? { backgroundColor: "white", color: "#1C1C1E", boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.07)" }
                          : { color: "#71717A" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
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
                  <div className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2">Покрытие</div>
                  <div className="flex flex-wrap gap-2">
                    {SURFACES.map(({ value, label }) => (
                      <button key={value} onClick={() => toggleSurface(value)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
                        style={selectedSurfaces.includes(value)
                          ? { backgroundColor: "#1C1C1E", color: "white", borderColor: "#1C1C1E" }
                          : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2">Дистанция, км</div>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} placeholder="От" value={minDistance}
                      onChange={(e) => setMinDistance(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#E4E4E7] bg-white text-sm outline-none focus:border-[#F4632A] transition-colors" />
                    <span className="text-xs text-[#A1A1AA]">—</span>
                    <input type="number" min={0} placeholder="До" value={maxDistance}
                      onChange={(e) => setMaxDistance(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#E4E4E7] bg-white text-sm outline-none focus:border-[#F4632A] transition-colors" />
                  </div>
                </div>
              </div>
            )}

            {/* Mobile filters — events */}
            {activeTab === "events" && showEventFilters && (
              <div className="lg:hidden bg-white rounded-2xl p-4 border border-[#E4E4E7] mb-4 space-y-4">
                <div>
                  <div className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2">Сортировка</div>
                  <select value={eventSortBy} onChange={(e) => setEventSortBy(e.target.value as "date_asc" | "date_desc")}
                    className="w-full px-3 py-2 rounded-xl border border-[#E4E4E7] bg-white text-sm outline-none transition-colors appearance-none cursor-pointer"
                    style={selectStyle}>
                    <option value="date_asc">По дате (ближайшие сначала)</option>
                    <option value="date_desc">По дате (дальние сначала)</option>
                  </select>
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2">Дата начала</div>
                  <div className="flex gap-2">
                    <input type="date" value={eventStartFrom} onChange={(e) => setEventStartFrom(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl border border-[#E4E4E7] bg-white text-sm outline-none" />
                    <input type="date" value={eventStartTo} onChange={(e) => setEventStartTo(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl border border-[#E4E4E7] bg-white text-sm outline-none" />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#71717A] mb-1">До {eventMaxDays} дней</div>
                  <input type="range" min={1} max={30} step={1} value={eventMaxDays}
                    onChange={(e) => setEventMaxDays(Number(e.target.value))}
                    className="w-full accent-[#7C5CFC]" />
                </div>
                <div>
                  <div className="text-xs text-[#71717A] mb-1">До {eventMaxDistance} км</div>
                  <input type="range" min={10} max={500} step={10} value={eventMaxDistance}
                    onChange={(e) => setEventMaxDistance(Number(e.target.value))}
                    className="w-full accent-[#7C5CFC]" />
                </div>
                <button
                  onClick={() => setEventOnlyWithSpots(!eventOnlyWithSpots)}
                  className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-xl border w-full transition-colors"
                  style={eventOnlyWithSpots
                    ? { backgroundColor: "#F0FDF4", color: "#16A34A", borderColor: "#86EFAC" }
                    : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }}>
                  Есть свободные места {eventOnlyWithSpots ? "✓" : ""}
                </button>
              </div>
            )}

            {/* ── Routes grid ───────────────────────────────────────────── */}
            {activeTab === "routes" && (
              routesLoading ? (
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
                      {hasActiveRouteFilters && (
                        <button onClick={resetRouteFilters} className="mt-4 text-sm text-[#F4632A] hover:underline">
                          Сбросить все фильтры
                        </button>
                      )}
                    </div>
                  )}
                </>
              )
            )}

            {/* ── Events grid ───────────────────────────────────────────── */}
            {activeTab === "events" && (
              eventsLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="bg-white rounded-2xl h-64 animate-pulse border border-[#E4E4E7]" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="text-sm text-[#71717A] mb-4">
                    {filteredEvents.length === 0 ? "Мероприятия не найдены" : `${filteredEvents.length} мероприяти${filteredEvents.length === 1 ? "е" : filteredEvents.length < 5 ? "я" : "й"}`}
                  </div>
                  {filteredEvents.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
                      {filteredEvents.map((ev) => <EventCard key={ev.id} event={ev} />)}
                    </div>
                  ) : (
                    <div className="text-center py-16 text-[#71717A]">
                      <div className="text-4xl mb-3">🚴</div>
                      <div className="font-medium mb-1">Мероприятия не найдены</div>
                      <div className="text-sm">Попробуй изменить фильтры</div>
                      {hasActiveEventFilters && (
                        <button onClick={resetEventFilters} className="mt-4 text-sm hover:underline" style={{ color: "#7C5CFC" }}>
                          Сбросить все фильтры
                        </button>
                      )}
                    </div>
                  )}
                </>
              )
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function RoutesPage() {
  return (
    <Suspense>
      <RoutesPageInner />
    </Suspense>
  );
}
