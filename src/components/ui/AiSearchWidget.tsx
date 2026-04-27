"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { Sparkles, X, ArrowUp, MapPin, Mountain, LocateFixed } from "lucide-react";
import type { RouteResult } from "@/app/api/ai-search/route";
import { proxyImageUrl } from "@/lib/supabase";

// ─── Filters type (mirrors server RouteFilters) ───────────────────────────────

interface RouteFilters {
  difficulty?: string;
  distance_min?: number;
  distance_max?: number;
  distance_target?: number;
  elevation_min?: number;
  elevation_max?: number;
  surface?: string[];
  route_types?: string[];
  bike_types?: string[];
  region?: string;
  search_text?: string;
}

// ─── Chip definitions ─────────────────────────────────────────────────────────

interface Chip {
  label: string;
  emoji: string;
  /** Returns null if chip is not applicable given current filters/results. */
  apply: (f: RouteFilters, routes: RouteResult[]) => RouteFilters | null;
}

// ─── Match explanation ────────────────────────────────────────────────────────

const DIFFICULTY_LABELS_SHORT: Record<string, string> = {
  easy: "лёгкий",
  medium: "средний",
  hard: "сложный",
};

const SURFACE_LABELS: Record<string, string> = {
  asphalt: "асфальт",
  gravel: "гравий",
  dirt: "грунт",
  mixed: "микс",
};

/** Returns up to 3 short reasons why this route matched the active filters. */
function matchReasons(route: RouteResult, filters: RouteFilters): string[] {
  const out: string[] = [];

  if (filters.region && route.region) {
    out.push(`📍 ${route.region}`);
  }

  const hasDist = filters.distance_target != null || filters.distance_min != null || filters.distance_max != null;
  if (hasDist) {
    out.push(`${route.distance_km} км`);
  }

  if (filters.difficulty) {
    out.push(DIFFICULTY_LABELS_SHORT[route.difficulty] ?? route.difficulty);
  }

  if (filters.elevation_min != null || filters.elevation_max != null) {
    out.push(`набор ${route.elevation_m} м`);
  }

  if (filters.surface?.length) {
    const label = filters.surface.map((s) => SURFACE_LABELS[s] ?? s).join("/");
    out.push(label);
  }

  // Semantic-only match (no structural filters extracted from query)
  if (out.length === 0) {
    if (route.tags?.length) {
      out.push(...route.tags.slice(0, 2));
    } else {
      out.push("по смыслу запроса");
    }
  }

  return out.slice(0, 3);
}

// ─── Smart fallback: relax the most restrictive filter ───────────────────────

interface RelaxResult {
  filters: RouteFilters;
  reason: string;
}

function relaxFilters(f: RouteFilters): RelaxResult | null {
  if (f.elevation_min != null && f.elevation_min > 0) {
    return { filters: { ...f, elevation_min: undefined }, reason: "убрали минимальный набор высот" };
  }
  if (f.elevation_max != null && f.elevation_max < 400) {
    return { filters: { ...f, elevation_max: undefined }, reason: "убрали ограничение по набору высот" };
  }
  if (f.difficulty) {
    return { filters: { ...f, difficulty: undefined }, reason: "убрали фильтр по сложности" };
  }
  if (f.surface?.length) {
    return { filters: { ...f, surface: undefined }, reason: "убрали фильтр по покрытию" };
  }
  if (f.distance_min != null || f.distance_max != null) {
    return {
      filters: { ...f, distance_min: undefined, distance_max: undefined, distance_target: undefined },
      reason: "расширили диапазон дистанции",
    };
  }
  if (f.region) {
    return { filters: { ...f, region: undefined }, reason: "убрали фильтр по региону" };
  }
  return null;
}

// ─── Chip definitions ─────────────────────────────────────────────────────────

const CHIPS: Chip[] = [
  {
    label: "Покороче",
    emoji: "📏",
    apply: (f) => {
      const max = f.distance_max ?? f.distance_target;
      if (!max) return null;
      const newMax = Math.round(max * 0.65);
      if (newMax < 5) return null;
      return { ...f, distance_max: newMax, distance_min: undefined, distance_target: undefined };
    },
  },
  {
    label: "Подлиннее",
    emoji: "🚴",
    apply: (f) => {
      const base = f.distance_max ?? f.distance_target ?? f.distance_min;
      if (!base) return null;
      const newMin = Math.round(base * 1.3);
      return { ...f, distance_min: newMin, distance_max: undefined, distance_target: undefined };
    },
  },
  {
    label: "Проще",
    emoji: "😌",
    apply: (f) => {
      if (f.difficulty === "easy") return null;
      const down: Record<string, string> = { hard: "medium", medium: "easy" };
      const next = down[f.difficulty ?? "medium"] ?? "easy";
      return { ...f, difficulty: next };
    },
  },
  {
    label: "Сложнее",
    emoji: "💪",
    apply: (f) => {
      if (f.difficulty === "hard") return null;
      const up: Record<string, string> = { easy: "medium", medium: "hard" };
      const next = up[f.difficulty ?? "medium"] ?? "hard";
      return { ...f, difficulty: next };
    },
  },
  {
    label: "Ровнее",
    emoji: "🏞",
    apply: (f) => {
      if (f.elevation_max != null && f.elevation_max <= 150) return null;
      return { ...f, elevation_max: 150, elevation_min: undefined };
    },
  },
  {
    label: "Больше подъёмов",
    emoji: "⛰️",
    apply: (f) => {
      if (f.elevation_min != null && f.elevation_min >= 600) return null;
      return { ...f, elevation_min: 600, elevation_max: undefined };
    },
  },
  {
    label: "Другой регион",
    emoji: "🗺️",
    apply: (f) => {
      if (!f.region) return null;
      return { ...f, region: undefined };
    },
  },
  {
    label: "Только асфальт",
    emoji: "🛣️",
    apply: (f) => {
      if (f.surface?.includes("asphalt") && f.surface.length === 1) return null;
      return { ...f, surface: ["asphalt"] };
    },
  },
  {
    label: "Грунт / гравий",
    emoji: "🌲",
    apply: (f) => {
      if (f.surface?.includes("gravel")) return null;
      return { ...f, surface: ["gravel", "dirt"] };
    },
  },
];

const SUGGESTIONS = [
  "Маршруты рядом со мной",
  "Лёгкий маршрут на 50 км",
  "Горный MTB в Карелии",
  "Городская покатушка на 2 часа",
];

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  hard: "bg-red-50 text-red-600",
};

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "Лёгкий",
  medium: "Средний",
  hard: "Сложный",
};

/** Returns true when the query implies the user wants location-based results. */
function needsLocation(q: string): boolean {
  return /рядом|поблизости|около меня|возле меня|недалеко от меня|near me/i.test(q);
}

/** Ask for geolocation via browser API — returns coords or throws GeolocationPositionError. */
function requestCoordsFromBrowser(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("not_supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

/**
 * Request coordinates with IP-based fallback.
 * Browser geolocation is tried first; if it fails with POSITION_UNAVAILABLE or TIMEOUT
 * (common in Russia where Google's location service is blocked), we fall back to
 * server-side IP geolocation.
 * Returns `approximate: true` when IP fallback was used.
 */
async function requestCoords(): Promise<{ lat: number; lng: number; approximate?: boolean }> {
  try {
    const coords = await requestCoordsFromBrowser();
    return coords;
  } catch (err) {
    // Only fall back on POSITION_UNAVAILABLE (2) or TIMEOUT (3).
    // PERMISSION_DENIED (1) means the user explicitly refused — respect that.
    const isPermanentDenial =
      err instanceof GeolocationPositionError && err.code === GeolocationPositionError.PERMISSION_DENIED;
    if (isPermanentDenial) throw err;

    // Try IP-based fallback
    const res = await fetch("/api/geo-ip");
    if (!res.ok) throw err; // re-throw original geo error so the caller can show the right message
    const data = await res.json() as { lat: number; lng: number; error?: string };
    if (data.error) throw err;
    return { lat: data.lat, lng: data.lng, approximate: true };
  }
}

export function AiSearchWidget() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [routes, setRoutes] = useState<RouteResult[] | null>(null);
  const [detectedRegion, setDetectedRegion] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<RouteFilters | null>(null);
  const [relaxedReason, setRelaxedReason] = useState<string | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
    } else {
      setRoutes(null);
      setQuery("");
      setError("");
      setDetectedRegion(null);
      setActiveFilters(null);
      setRelaxedReason(null);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  async function handleSearch(q: string, overrideFilters?: RouteFilters) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setLoading(true);
    setError("");
    setRoutes(null);
    setDetectedRegion(null);
    setRelaxedReason(null);

    let lat: number | undefined;
    let lng: number | undefined;

    if (!overrideFilters && needsLocation(trimmed)) {
      setLocating(true);
      try {
        const coords = await requestCoords();
        lat = coords.lat;
        lng = coords.lng;
      } catch (err) {
        const isPermission = err instanceof GeolocationPositionError && err.code === 1;
        setError(
          isPermission
            ? "Доступ к геолокации запрещён. Разреши в настройках браузера или укажи регион вручную."
            : "Не удалось определить местоположение. Укажи город или регион в запросе.",
        );
        setLoading(false);
        setLocating(false);
        return;
      }
      setLocating(false);
    }

    try {
      const body = overrideFilters
        ? { query: trimmed, filters: overrideFilters }
        : { query: trimmed, lat, lng };

      const res = await fetch("/api/ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка поиска");

      const resultRoutes: RouteResult[] = data.routes ?? [];
      const resultFilters: RouteFilters = data.filters ?? {};

      // Smart fallback: if empty results, try relaxing the tightest filter once.
      if (resultRoutes.length === 0 && !overrideFilters) {
        const relaxed = relaxFilters(resultFilters);
        if (relaxed) {
          const r2 = await fetch("/api/ai-search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: trimmed, filters: relaxed.filters }),
          });
          const d2 = await r2.json();
          const fallbackRoutes: RouteResult[] = d2.routes ?? [];
          if (fallbackRoutes.length > 0) {
            setRoutes(fallbackRoutes);
            setActiveFilters(relaxed.filters);
            setRelaxedReason(relaxed.reason);
            if (relaxed.filters.region) setDetectedRegion(relaxed.filters.region);
            return;
          }
        }
      }

      setRoutes(resultRoutes);
      setActiveFilters(resultFilters);
      if (resultFilters.region) setDetectedRegion(resultFilters.region);
    } catch {
      setError("Не удалось выполнить поиск. Попробуй ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    handleSearch(query);
  }

  function onSuggestion(s: string) {
    setQuery(s);
    handleSearch(s);
  }

  function onChip(chip: Chip) {
    if (!activeFilters) return;
    const newFilters = chip.apply(activeFilters, routes ?? []);
    if (!newFilters) return;
    setActiveFilters(newFilters);
    handleSearch(query, newFilters);
  }

  const visibleChips = activeFilters && routes !== null && routes.length > 0
    ? CHIPS.filter((c) => c.apply(activeFilters, routes) !== null).slice(0, 5)
    : [];

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        aria-label="AI поиск маршрутов"
        className="fixed right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl text-white text-sm font-semibold shadow-lg transition-transform active:scale-95 hover:brightness-110"
        style={{
          bottom: "calc(env(safe-area-inset-bottom) + 76px)",
          backgroundColor: "#7C5CFC",
          boxShadow: "0 4px 16px 0 rgb(124 92 252 / 0.45)",
        }}
      >
        <Sparkles size={16} strokeWidth={2} />
        <span className="sm:inline hidden">Найти маршрут с ИИ</span>
        <span className="sm:hidden inline">AI поиск</span>
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl transition-transform duration-300 ease-out flex flex-col
          sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:rounded-3xl sm:w-[600px] sm:max-h-[80vh]
          ${open ? "translate-y-0 sm:-translate-y-1/2" : "translate-y-full sm:translate-y-[-40%] sm:opacity-0 sm:pointer-events-none"}`}
        style={{ maxHeight: "90dvh", boxShadow: "0 -4px 40px 0 rgb(0 0 0 / 0.18)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#E4E4E7]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-xl" style={{ backgroundColor: "#EDE9FF" }}>
              <Sparkles size={16} style={{ color: "#7C5CFC" }} />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#1C1C1E]">AI-поиск маршрутов</p>
              <p className="text-xs text-[#71717A]">Опиши своими словами</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F5F4F1] text-[#71717A]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search form */}
        <form onSubmit={onSubmit} className="px-5 pb-3 flex-shrink-0">
          <div className="relative flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSearch(query); }
              }}
              placeholder='Например: "маршруты рядом со мной" или "60 км несложный"'
              rows={2}
              className="flex-1 resize-none rounded-2xl border border-[#E4E4E7] px-4 py-3 text-sm text-[#1C1C1E] placeholder-[#A1A1AA] focus:outline-none focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/20 transition-colors"
              style={{ maxHeight: 120 }}
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-40"
              style={{ backgroundColor: "#7C5CFC" }}
            >
              {loading ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <ArrowUp size={18} strokeWidth={2.5} />
              )}
            </button>
          </div>
        </form>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 pb-6" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}>

          {/* Suggestions */}
          {!loading && routes === null && !error && (
            <div className="flex flex-wrap gap-2 pt-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => onSuggestion(s)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1
                    ${s.includes("рядом")
                      ? "border-[#7C5CFC]/30 text-[#7C5CFC] bg-[#F5F3FF] hover:bg-[#EDE9FF]"
                      : "border-[#E4E4E7] text-[#3F3F46] hover:border-[#7C5CFC] hover:text-[#7C5CFC]"
                    }`}
                >
                  {s.includes("рядом") && <LocateFixed size={11} />}
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Locating indicator */}
          {locating && (
            <div className="flex items-center gap-2 pt-3 text-sm text-[#7C5CFC]">
              <LocateFixed size={16} className="animate-pulse" />
              Определяю твоё местоположение...
            </div>
          )}

          {/* Loading skeleton */}
          {loading && !locating && (
            <div className="space-y-3 pt-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl border border-[#E4E4E7] p-4 animate-pulse">
                  <div className="h-4 bg-[#F5F4F1] rounded w-3/4 mb-2" />
                  <div className="h-3 bg-[#F5F4F1] rounded w-1/2" />
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {error && <p className="text-sm text-red-500 pt-2">{error}</p>}

          {/* No results */}
          {!loading && routes !== null && routes.length === 0 && (
            <div className="text-center py-8">
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-sm font-medium text-[#1C1C1E]">Ничего не нашлось</p>
              <p className="text-xs text-[#71717A] mt-1 max-w-xs mx-auto">
                Попробуй убрать часть условий или описать маршрут по-другому
              </p>
            </div>
          )}

          {/* Results */}
          {!loading && routes !== null && routes.length > 0 && (
            <div className="space-y-2.5 pt-1">
              {/* Relaxed-filters banner */}
              {relaxedReason ? (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100 mb-1">
                  <span className="text-base leading-none mt-0.5">🔎</span>
                  <div>
                    <p className="text-xs font-medium text-amber-800">Точных совпадений нет — вот похожие</p>
                    <p className="text-xs text-amber-600 mt-0.5">{relaxedReason[0].toUpperCase() + relaxedReason.slice(1)}</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#71717A]">
                  {detectedRegion
                    ? `📍 ${detectedRegion} · ${routes.length} маршрут${routes.length === 1 ? "" : routes.length < 5 ? "а" : "ов"}`
                    : `Найдено ${routes.length} маршрут${routes.length === 1 ? "" : routes.length < 5 ? "а" : "ов"} по запросу «${query}»`
                  }
                </p>
              )}

              {/* Refinement chips */}
              {visibleChips.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {visibleChips.map((chip) => (
                    <button
                      key={chip.label}
                      onClick={() => onChip(chip)}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border border-[#E4E4E7] text-[#3F3F46] bg-white hover:border-[#7C5CFC] hover:text-[#7C5CFC] hover:bg-[#FAFAFF] transition-colors active:scale-95"
                    >
                      <span>{chip.emoji}</span>
                      <span>{chip.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {routes.map((r) => (
                <Link
                  key={r.id}
                  href={`/routes/${r.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 rounded-2xl border border-[#E4E4E7] p-4 hover:border-[#7C5CFC]/40 hover:bg-[#FAFAFF] transition-colors group"
                >
                  {r.cover_url ? (
                    <Image src={proxyImageUrl(r.cover_url) ?? r.cover_url} alt="" width={56} height={56} className="rounded-xl object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-[#F5F4F1] flex items-center justify-center flex-shrink-0">
                      <MapPin size={20} className="text-[#A1A1AA]" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1C1C1E] truncate group-hover:text-[#7C5CFC] transition-colors">
                      {r.title}
                    </p>
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1">
                      <span className="text-xs text-[#71717A]">
                        <span className="text-[#1C1C1E] font-medium">{r.distance_km}</span> км
                      </span>
                      <span className="text-xs text-[#71717A] flex items-center gap-1">
                        <Mountain size={11} />
                        <span className="text-[#1C1C1E] font-medium">{r.elevation_m}</span> м
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_STYLES[r.difficulty] ?? "bg-gray-50 text-gray-600"}`}>
                        {DIFFICULTY_LABELS[r.difficulty] ?? r.difficulty}
                      </span>
                    </div>
                    {!activeFilters?.region && r.region && (
                      <p className="text-xs text-[#A1A1AA] mt-1 flex items-center gap-1">
                        <MapPin size={10} />
                        {r.region}
                      </p>
                    )}

                    {/* Match explanation */}
                    {activeFilters && (() => {
                      const reasons = matchReasons(r, activeFilters);
                      return (
                        <p className="text-xs text-[#A1A1AA] mt-1.5 flex items-center gap-1 flex-wrap">
                          <span className="text-[#7C5CFC] font-medium">совпало:</span>
                          {reasons.map((reason, i) => (
                            <span key={i} className="flex items-center gap-1">
                              {i > 0 && <span className="text-[#D4D4D8]">·</span>}
                              {reason}
                            </span>
                          ))}
                        </p>
                      );
                    })()}
                  </div>
                </Link>
              ))}

              <Link
                href="/routes"
                onClick={() => setOpen(false)}
                className="block text-center text-xs text-[#7C5CFC] font-medium py-3 hover:underline"
              >
                Смотреть все маршруты →
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
