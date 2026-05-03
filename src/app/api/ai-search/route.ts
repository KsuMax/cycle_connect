/**
 * POST /api/ai-search
 *
 * Body: { query: string }
 * Response: { routes: RouteResult[], filters: object }
 *
 * Env vars required:
 *   OPENROUTER_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { embedQuery, toPgVector } from "@/lib/embeddings/jina";
import { scoreWind } from "@/lib/wind";

export const dynamic = "force-dynamic";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cycleconnect.cc";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RouteFilters {
  difficulty?: string;
  distance_min?: number;
  distance_max?: number;
  /** Target distance for relevance sorting — not passed to SQL */
  distance_target?: number;
  elevation_min?: number;
  elevation_max?: number;
  surface?: string[];
  route_types?: string[];
  bike_types?: string[];
  region?: string;
  search_text?: string;
  /** Ranking mode: 'relevance' (default cosine) | 'popular' (weighted score) */
  sort_by?: "relevance" | "popular";
  /** When true, re-rank candidates by wind favorability for the target window. */
  wind_intent?: boolean;
}

export interface RouteResult {
  id: string;
  title: string;
  distance_km: number;
  elevation_m: number;
  duration_min: number;
  difficulty: string;
  region: string;
  cover_url: string | null;
  tags: string[];
  /** Only set when the search was wind-aware. Directional score −1…+1. */
  wind_score?: number;
  /** Wind speed in m/s at the best hour. */
  wind_speed_ms?: number;
  /** UTC ISO timestamp of the best wind window found. */
  best_wind_hour?: string;
}

// ─── Geolocation: nearest region ─────────────────────────────────────────────

/** Approximate center coordinates for each DB region. */
const REGION_CENTERS: [string, number, number][] = [
  ["Санкт-Петербург",       59.95,  30.32],
  ["Ленинградская область", 60.07,  30.58],
  ["Карелия",               62.50,  32.50],
  ["Москва",                55.75,  37.62],
  ["Подмосковье",           55.75,  37.20],
  ["Краснодарский край",    45.04,  38.98],
  ["Крым",                  45.30,  34.00],
  ["Алтай",                 52.00,  85.00],
  ["Байкал",                53.00, 107.00],
  ["Урал",                  56.50,  60.00],
];

function closestRegion(lat: number, lng: number): string {
  let best = REGION_CENTERS[0][0];
  let bestDist = Infinity;
  for (const [name, rlat, rlng] of REGION_CENTERS) {
    const d = Math.hypot(lat - rlat, lng - rlng);
    if (d < bestDist) { bestDist = d; best = name; }
  }
  return best;
}

// ─── Distance helper ──────────────────────────────────────────────────────────

/** Parses distance from any common phrasing. Returns true if something was found. */
function extractDistance(q: string, out: RouteFilters): boolean {
  // "от X до Y" — explicit range
  const range = q.match(/от\s+(\d+)\s+до\s+(\d+)/);
  if (range) {
    out.distance_min = parseInt(range[1], 10);
    out.distance_max = parseInt(range[2], 10);
    return true;
  }

  // Explicit max: "до 50", "до 50 км", "не более 50", "километров до 50"
  const maxMatch =
    q.match(/(?:до|не\s*бол[её]е?|не\s*больше|максимум)\s+(\d+)\s*(?:км|километр\w*)?/) ||
    q.match(/(?:км|километр\w+)\s+до\s+(\d+)/);
  if (maxMatch) {
    out.distance_max = parseInt(maxMatch[1], 10);
    return true;
  }

  // Target: "50 км", "50км", "50 километров", "около 50"
  const target =
    q.match(/(\d+)\s*(?:км|километр\w*)/) ||
    q.match(/около\s+(\d+)/);
  if (target) {
    const n = parseInt(target[1], 10);
    out.distance_target = n;
    out.distance_min = Math.max(1, Math.round(n * 0.75));
    out.distance_max = Math.round(n * 1.25);
    return true;
  }

  return false;
}

// ─── Elevation helper ─────────────────────────────────────────────────────────

function extractElevation(q: string, out: RouteFilters): void {
  const hasElevCtx = /набор\w*|подъём\w*|подъем\w*|перепад\w*/.test(q);

  // "набор/подъём [более/от/до] N" — elevation context first, no unit required
  const ctxMin = q.match(/(?:набор\w*|подъём\w*|подъем\w*)\s+(?:более|больше|свыше|от|выше)\s+(\d+)/);
  if (ctxMin) { out.elevation_min = parseInt(ctxMin[1], 10); return; }

  const ctxMax = q.match(/(?:набор\w*|подъём\w*|подъем\w*)\s+(?:до|менее|меньше|не\s*бол[её]е?\w*)\s+(\d+)/);
  if (ctxMax) { out.elevation_max = parseInt(ctxMax[1], 10); return; }

  // "от X до Y м/метров [набора/подъёма]" — explicit range with unit
  const rangeM = q.match(/от\s+(\d+)\s+до\s+(\d+)\s*(?:м|метр\w*)/);
  if (rangeM && hasElevCtx) {
    out.elevation_min = parseInt(rangeM[1], 10);
    out.elevation_max = parseInt(rangeM[2], 10);
    return;
  }

  // "более/больше/свыше N м" or "от N м" near elevation context — minimum
  const minM =
    q.match(/(?:более|больше|свыше|выше)\s+(\d+)\s*(?:м|метр\w*)/) ||
    q.match(/от\s+(\d+)\s*(?:м|метр\w*)/);
  if (minM && hasElevCtx) { out.elevation_min = parseInt(minM[1], 10); return; }

  // "N м и более/больше" — minimum, number first
  const minM2 = q.match(/(\d+)\s*(?:м|метр\w*)\s+(?:и\s+)?(?:более|больше)/);
  if (minM2 && hasElevCtx) { out.elevation_min = parseInt(minM2[1], 10); return; }

  // "до/не более/менее N м" — maximum
  const maxM = q.match(/(?:до|не\s*бол[её]е?\w*|не\s*больш\w*|менее|меньше)\s+(\d+)\s*(?:м|метр\w*)/);
  if (maxM && hasElevCtx) { out.elevation_max = parseInt(maxM[1], 10); return; }

  // Semantic: minimal climbing — flat route
  if (/минимальн\S*\s+(?:подъём|набор|перепад|количеств)|мало\s+подъём|без\s+подъём|ровн|плоск/.test(q)) {
    out.elevation_max = 100;
    return;
  }

  // Semantic: lots of climbing (no explicit number)
  if (/много\s+подъём|горист|с\s+набором\s+высот/.test(q)) {
    if (out.elevation_min == null) out.elevation_min = 500;
  }
}

// ─── Regex extraction (always runs, reliable for explicit values) ──────────────

function extractFromText(query: string): RouteFilters {
  const out: RouteFilters = {};
  const q = query.toLowerCase();

  // Distance extraction — handles all common Russian phrasings
  const hasExplicitDist = extractDistance(q, out);

  // Time / context hints → distance_max cap (only when no explicit distance)
  if (!hasExplicitDist) {
    // "2 часа", "на 3 часа", "часик" → ~25 km/h average pace
    const hoursMatch = q.match(/(?:на\s+)?(\d+)\s*час/);
    if (hoursMatch) {
      out.distance_max = Math.min(parseInt(hoursMatch[1], 10) * 25, 150);
    } else if (/вечер|после работы|пару час|час-другой/.test(q)) {
      out.distance_max = 60;
    } else if (/полдня|несколько час/.test(q)) {
      out.distance_max = 80;
    } else if (/на день|целый день|однодневн/.test(q)) {
      out.distance_max = 150;
    }
  }

  // Elevation
  extractElevation(q, out);

  // Popularity sort
  if (/популярн|рейтинг|лучш[иейая]|топ\b|часто\s+езд|рекоменд|самый\s+посещ|народн/.test(q)) {
    out.sort_by = "popular";
  }

  // Urban / near-city hints
  if (/\bгород|\bпо городу|недалеко от город|рядом с город|окраин/.test(q)) {
    out.route_types = ["urban"];
  }

  // Difficulty
  if (/несложн|лёгк|легк|начинающ|для новичк|простой/.test(q)) {
    out.difficulty = "easy";
  } else if (/сложн|тяжёл|тяжел|экстрим/.test(q)) {
    out.difficulty = "hard";
  } else if (/средн|умеренн/.test(q)) {
    out.difficulty = "medium";
  }

  // Surface
  const surface: string[] = [];
  if (/асфальт|шоссе/.test(q)) surface.push("asphalt");
  if (/гравий|грунтовк|грунт/.test(q)) surface.push("gravel");
  if (/грязь|бездорожье/.test(q)) surface.push("dirt");
  if (surface.length) out.surface = surface;

  // Bike type
  if (/горный вел|mtb|эндуро/.test(q)) {
    out.bike_types = ["mountain"];
    if (!out.route_types) out.route_types = ["mtb"];
  } else if (/шоссейн/.test(q)) {
    out.bike_types = ["road"];
  } else if (/гравийн|гравел/.test(q)) {
    out.bike_types = ["gravel"];
  }

  // Wind intent — user wants routes with favorable wind conditions
  if (/попутн\w*\s+ветер|ветер\s+попутн|ветер\s+в\s+спину|по\s+ветру|с\s+попутн\w*|без\s+встречн\w*\s+ветр|не\s+против\s+ветр|ветр\w*\s+(?:сегодня|завтра|утром|вечером)/.test(q)) {
    out.wind_intent = true;
  }

  // Region — matched against all inflected forms (genitive, prepositional, etc.)
  const REGIONS: Array<[RegExp, string]> = [
    [/карел/i,                          "Карелия"],
    [/санкт.петербург|питер\b|спб\b/i,  "Санкт-Петербург"],
    [/ленинград|лен\.?\s*обл/i,         "Ленинградская область"],
    [/подмосков/i,                      "Подмосковье"],
    [/москв/i,                          "Москва"],
    [/краснодар|кубан/i,                "Краснодарский край"],
    [/крым/i,                           "Крым"],
    [/алтай/i,                          "Алтай"],
    [/байкал/i,                         "Байкал"],
    [/урал/i,                           "Урал"],
  ];
  for (const [pattern, region] of REGIONS) {
    if (pattern.test(q)) { out.region = region; break; }
  }

  return out;
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a cycling route search assistant for CycleConnect (Russian community).
Extract search filters from the user message. Return ONLY raw JSON, no markdown, no explanation.

Output schema (all fields optional):
{"difficulty":"easy"|"medium"|"hard","distance_min":number,"distance_max":number,"distance_target":number,"elevation_min":number,"elevation_max":number,"surface":["asphalt"|"gravel"|"dirt"|"mixed"],"route_types":["road"|"gravel"|"mtb"|"urban"],"bike_types":["road"|"mountain"|"gravel"],"region":"Карелия"|"Санкт-Петербург"|"Ленинградская область"|"Москва"|"Подмосковье"|"Краснодарский край"|"Крым"|"Алтай"|"Байкал"|"Урал","search_text":"string","sort_by":"relevance"|"popular","wind_intent":true}

Rules (apply all that match):
1. If user says "N км" → distance_target=N, distance_min=N*0.75, distance_max=N*1.25
2. "вечером"/"часик"/"1-2 часа" → distance_max=60 (if no explicit km)
3. "полдня" → distance_max=80; "на день" → distance_max=150
4. "несложный"/"лёгкий"/"для новичка" → difficulty="easy"; "средний" → "medium"; "сложный" → "hard"
5. "по городу"/"городской"/"недалеко от города" → route_types=["urban"]
6. "горы"/"горный маршрут" → route_types=["mtb"]
7. "асфальт"/"шоссе" → surface=["asphalt"]; "гравий"/"грунт" → ["gravel"]
8. Region names → region field
9. Nature words (море, озеро, лес) → search_text
10. Return {} only if truly nothing can be extracted
11. "набор/подъём более N" or "более N м набора" → elevation_min=N; "набор до N" or "до N м набора" → elevation_max=N
12. "ровный"/"плоский"/"без подъёмов"/"минимальный подъём"/"мало подъёмов" → elevation_max=100
13. "много подъёмов"/"гористый"/"с набором высот" (no explicit N) → elevation_min=500
14. "попутный ветер"/"ветер в спину"/"по ветру"/"с попутным"/"без встречного ветра" → wind_intent=true`;

// ─── AI filter parsing ────────────────────────────────────────────────────────

async function parseAI(query: string): Promise<RouteFilters> {
  if (!OPENROUTER_API_KEY) return {};
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": SITE_URL,
        "X-Title": "CycleConnect",
      },
      body: JSON.stringify({
        model: "google/gemma-4-31b-it:free",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: query },
        ],
        max_tokens: 200,
        temperature: 0.1,
      }),
    });
    const data = await res.json();
    const raw: string = data.choices?.[0]?.message?.content ?? "";
    // Extract JSON object even if model wraps it in text/markdown
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};
    return JSON.parse(match[0]) as RouteFilters;
  } catch {
    return {};
  }
}

// ─── Merge: regex is authoritative for explicit values ────────────────────────

function mergeFilters(ai: RouteFilters, regex: RouteFilters): RouteFilters {
  const merged = { ...ai };

  // Regex wins for distance when the user explicitly said "N km"
  if (regex.distance_target) {
    merged.distance_target = regex.distance_target;
    merged.distance_min = regex.distance_min;
    merged.distance_max = regex.distance_max;
  } else if (regex.distance_max && !merged.distance_max) {
    // Time-hint cap (вечером etc.) only when AI didn't set anything
    merged.distance_max = regex.distance_max;
  }

  // Regex wins for explicit categorical signals
  if (regex.difficulty && !merged.difficulty) merged.difficulty = regex.difficulty;
  if (regex.surface?.length && !merged.surface?.length) merged.surface = regex.surface;
  if (regex.bike_types?.length && !merged.bike_types?.length) merged.bike_types = regex.bike_types;
  if (regex.route_types?.length && !merged.route_types?.length) merged.route_types = regex.route_types;
  if (regex.region && !merged.region) merged.region = regex.region;

  // Regex wins for elevation when explicitly extracted from the query
  if (regex.elevation_min != null) merged.elevation_min = regex.elevation_min;
  if (regex.elevation_max != null && merged.elevation_max == null) merged.elevation_max = regex.elevation_max;

  // Either source can set sort_by; regex takes priority
  if (regex.sort_by) merged.sort_by = regex.sort_by;
  else if (ai.sort_by) merged.sort_by = ai.sort_by;

  // Either source can flag wind intent
  if (regex.wind_intent || ai.wind_intent) merged.wind_intent = true;

  return merged;
}

// ─── Supabase query ───────────────────────────────────────────────────────────

/** Low-level wrapper around the match_routes RPC. */
async function runMatchRoutes(
  filters: RouteFilters,
  query: string,
  count: number,
): Promise<RouteResult[]> {
  let queryEmbedding: string | null = null;
  try {
    const v = await embedQuery(query);
    queryEmbedding = toPgVector(v);
  } catch (e) {
    console.warn("[ai-search] embedQuery failed:", e);
  }

  const { data, error } = await getSupabase().rpc("match_routes", {
    query_embedding: queryEmbedding,
    filter_difficulty: filters.difficulty ?? null,
    filter_distance_min: filters.distance_min ?? null,
    filter_distance_max: filters.distance_max ?? null,
    filter_elevation_min: filters.elevation_min ?? null,
    filter_elevation_max: filters.elevation_max ?? null,
    filter_region: filters.region ?? null,
    filter_surface: filters.surface ?? null,
    filter_route_types: filters.route_types ?? null,
    filter_bike_types: filters.bike_types ?? null,
    filter_search_text: filters.search_text ?? null,
    filter_distance_target: filters.distance_target ?? null,
    match_count: count,
    sort_by: filters.sort_by ?? "relevance",
  });

  if (error) {
    console.error("[ai-search] match_routes RPC error:", error);
    return [];
  }

  return (data ?? []).map((r: RouteResult & { similarity?: number }) => ({
    id: r.id,
    title: r.title,
    distance_km: r.distance_km,
    elevation_m: r.elevation_m,
    duration_min: r.duration_min,
    difficulty: r.difficulty,
    region: r.region,
    cover_url: r.cover_url,
    tags: r.tags,
  }));
}

// ─── Wind-aware search helpers ────────────────────────────────────────────────

const WIND_HOUR_SLOTS = [6, 9, 12, 15, 18, 21];

/**
 * Moscow offset used server-side to interpret time hints like "сегодня вечером".
 * Most users are Russian cyclists; callers can override by passing the offset.
 */
const MOSCOW_OFFSET_MS = 3 * 3600 * 1000; // UTC+3

/**
 * Returns UTC Date objects for the HOUR_SLOTS the user cares about.
 * Defaults to all remaining slots today; falls back to tomorrow if none remain.
 */
function getWindTargetSlots(query: string): Date[] {
  const q = query.toLowerCase();
  const nowUtcMs = Date.now();

  // Compute today's midnight in Moscow time, then back to UTC
  const moscowNowMs = nowUtcMs + MOSCOW_OFFSET_MS;
  const moscowToday = new Date(moscowNowMs);
  moscowToday.setUTCHours(0, 0, 0, 0);
  const todayUtcMs = moscowToday.getTime() - MOSCOW_OFFSET_MS;

  // Which calendar day(s)?
  let dayOffsets = [0]; // 0 = today
  if (/завтра/.test(q)) dayOffsets = [1];
  else if (/на\s+выходных|в\s+субботу|в\s+воскресенье/.test(q)) dayOffsets = [5, 6]; // rough

  // Time-of-day filter
  let hourFilter: number[] | null = null;
  if (/утром|утра\b/.test(q)) hourFilter = [6, 9];
  else if (/днём|дня\b|обед/.test(q)) hourFilter = [12, 15];
  else if (/вечером|вечера\b/.test(q)) hourFilter = [18, 21];

  const slots: Date[] = [];
  for (const dayOff of dayOffsets) {
    const dayStartUtcMs = todayUtcMs + dayOff * 86_400_000;
    for (const h of hourFilter ?? WIND_HOUR_SLOTS) {
      // Moscow H:00 = UTC (H − 3):00
      const slotUtcMs = dayStartUtcMs + h * 3_600_000 - MOSCOW_OFFSET_MS;
      if (slotUtcMs < nowUtcMs - 30 * 60_000) continue; // skip past
      slots.push(new Date(slotUtcMs));
    }
  }

  // Nothing left today → try tomorrow
  if (slots.length === 0) {
    const tomorrowStartUtcMs = todayUtcMs + 86_400_000;
    for (const h of hourFilter ?? WIND_HOUR_SLOTS) {
      const slotUtcMs = tomorrowStartUtcMs + h * 3_600_000 - MOSCOW_OFFSET_MS;
      slots.push(new Date(slotUtcMs));
    }
  }

  return slots;
}

interface WindPoint {
  ts: string;      // UTC ISO
  dir_deg: number;
  speed_ms: number;
}

/** Fetches 2-day hourly wind forecast from Open-Meteo for a single lat/lng. */
async function fetchWindForecastForPoint(lat: number, lng: number): Promise<WindPoint[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lng.toFixed(4));
  url.searchParams.set("hourly", "wind_speed_10m,wind_direction_10m");
  url.searchParams.set("forecast_days", "2");
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("wind_speed_unit", "ms");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const body = await res.json() as {
      hourly?: { time?: string[]; wind_speed_10m?: number[]; wind_direction_10m?: number[] };
    };
    const time = body.hourly?.time ?? [];
    const speeds = body.hourly?.wind_speed_10m ?? [];
    const dirs = body.hourly?.wind_direction_10m ?? [];
    return time.map((t, i) => ({
      ts: (t.endsWith("Z") ? t : `${t}:00Z`).replace(/:00:00Z$/, ":00:00.000Z"),
      dir_deg: Math.round(((dirs[i] % 360) + 360) % 360),
      speed_ms: Number(speeds[i]?.toFixed(1) ?? 0),
    }));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Scores each candidate route against a set of forecast hours and returns
 * the top results sorted by best wind score (descending).
 * Routes with no bearing profile or a net headwind at all target hours are excluded.
 */
function applyWindScoring(
  candidates: RouteResult[],
  profiles: Map<string, { buckets: number[]; total_m: number }>,
  forecastByHour: Map<string, WindPoint>,
  targetSlots: Date[],
): RouteResult[] {
  const scored: Array<RouteResult & { _wScore: number }> = [];

  for (const route of candidates) {
    const profile = profiles.get(route.id);
    if (!profile || profile.total_m <= 0) continue;

    let bestScore = -Infinity;
    let bestHour = "";
    let bestSpeed = 0;

    for (const slot of targetSlots) {
      // Build the same UTC-floored key used throughout the wind system
      const key = new Date(Date.UTC(
        slot.getUTCFullYear(), slot.getUTCMonth(), slot.getUTCDate(), slot.getUTCHours(),
      )).toISOString();
      const wind = forecastByHour.get(key);
      if (!wind) continue;

      const { score } = scoreWind(
        { buckets: profile.buckets, total_m: profile.total_m },
        { ts: wind.ts, dir_deg: wind.dir_deg, speed_ms: wind.speed_ms },
      );

      if (score > bestScore) {
        bestScore = score;
        bestHour = wind.ts;
        bestSpeed = wind.speed_ms;
      }
    }

    // Only surface routes where wind is at least slightly favorable
    if (bestScore < 0.1) continue;

    scored.push({
      ...route,
      wind_score: Math.round(bestScore * 100) / 100,
      wind_speed_ms: bestSpeed,
      best_wind_hour: bestHour,
      _wScore: bestScore,
    });
  }

  return scored
    .sort((a, b) => b._wScore - a._wScore)
    .slice(0, 6)
    .map(({ _wScore: _, ...rest }) => rest);
}

/** Full wind-aware search: broader candidate fetch → bearing profiles → forecast → re-rank. */
async function searchRoutesWind(
  filters: RouteFilters,
  query: string,
): Promise<RouteResult[]> {
  // 1. Wider candidate pool — semantic/filter match without wind constraint
  const candidates = await runMatchRoutes(
    { ...filters, wind_intent: undefined },
    query,
    24, // 4× normal so re-ranking has material to work with
  );
  if (candidates.length === 0) return [];

  // 2. Batch-fetch bearing profiles for all candidates
  const routeIds = candidates.map((r) => r.id);
  const { data: profileRows } = await getSupabase()
    .from("route_bearing_profile")
    .select("route_id, buckets, total_m")
    .in("route_id", routeIds);

  if (!profileRows?.length) {
    // No bearing data yet → return plain candidates
    return candidates.slice(0, 6);
  }

  const profiles = new Map(
    profileRows.map((p) => [
      p.route_id as string,
      { buckets: p.buckets as number[], total_m: p.total_m as number },
    ]),
  );

  // 3. Determine region centroid for the forecast call
  const regionName = filters.region ?? "Москва";
  const regionEntry =
    REGION_CENTERS.find(([name]) => name === regionName) ??
    REGION_CENTERS.find(([name]) => name === "Москва")!;
  const [, lat, lng] = regionEntry;

  // 4. Fetch regional wind forecast (one Open-Meteo call)
  let forecast: WindPoint[] = [];
  try {
    forecast = await fetchWindForecastForPoint(lat, lng);
  } catch (err) {
    console.warn("[ai-search wind] Open-Meteo unavailable:", err);
    return candidates.slice(0, 6);
  }

  // Build lookup map: UTC-hour ISO → wind point
  const forecastByHour = new Map<string, WindPoint>();
  for (const w of forecast) {
    const d = new Date(w.ts);
    const key = new Date(Date.UTC(
      d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(),
    )).toISOString();
    forecastByHour.set(key, w);
  }

  // 5. Target hours from the query
  const targetSlots = getWindTargetSlots(query);

  // 6. Score, filter, re-rank
  const windResults = applyWindScoring(candidates, profiles, forecastByHour, targetSlots);

  // If scoring yielded nothing (calm day, no bearing data, etc.) fall back to plain results
  return windResults.length > 0 ? windResults : candidates.slice(0, 6);
}

async function searchRoutes(
  filters: RouteFilters,
  query: string,
): Promise<RouteResult[]> {
  if (filters.wind_intent) {
    return searchRoutesWind(filters, query);
  }
  return runMatchRoutes(filters, query, 6);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth check — only authenticated users can use AI search
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const query: string = typeof body.query === "string" ? body.query.trim() : "";
  const lat: number | undefined = typeof body.lat === "number" ? body.lat : undefined;
  const lng: number | undefined = typeof body.lng === "number" ? body.lng : undefined;

  if (!query) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  let filters: RouteFilters;

  // Chip refinement: client sends pre-built filters, skip LLM parsing entirely.
  if (body.filters && typeof body.filters === "object") {
    filters = body.filters as RouteFilters;
  } else {
    const [aiFilters, regexFilters] = await Promise.all([
      parseAI(query),
      Promise.resolve(extractFromText(query)),
    ]);
    filters = mergeFilters(aiFilters, regexFilters);
  }

  // If coordinates provided and no region extracted from text — use nearest region
  if (lat !== undefined && lng !== undefined && !filters.region) {
    filters.region = closestRegion(lat, lng);
  }

  const routes = await searchRoutes(filters, query);

  return NextResponse.json({ routes, filters });
}
