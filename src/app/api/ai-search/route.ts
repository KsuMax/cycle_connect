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
{"difficulty":"easy"|"medium"|"hard","distance_min":number,"distance_max":number,"distance_target":number,"elevation_min":number,"elevation_max":number,"surface":["asphalt"|"gravel"|"dirt"|"mixed"],"route_types":["road"|"gravel"|"mtb"|"urban"],"bike_types":["road"|"mountain"|"gravel"],"region":"Карелия"|"Санкт-Петербург"|"Ленинградская область"|"Москва"|"Подмосковье"|"Краснодарский край"|"Крым"|"Алтай"|"Байкал"|"Урал","search_text":"string"}

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
13. "много подъёмов"/"гористый"/"с набором высот" (no explicit N) → elevation_min=500`;

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

  return merged;
}

// ─── Supabase query ───────────────────────────────────────────────────────────

async function searchRoutes(filters: RouteFilters): Promise<RouteResult[]> {
  const hasDistanceTarget = filters.distance_target != null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = getSupabase()
    .from("routes")
    .select("id, title, distance_km, elevation_m, duration_min, difficulty, region, cover_url, tags")
    // Fetch more when we need to re-rank by distance closeness
    .limit(hasDistanceTarget ? 30 : 6)
    .order("created_at", { ascending: false });

  if (filters.difficulty) q = q.eq("difficulty", filters.difficulty);
  if (filters.distance_min) q = q.gte("distance_km", filters.distance_min);
  if (filters.distance_max) q = q.lte("distance_km", filters.distance_max);
  if (filters.elevation_min) q = q.gte("elevation_m", filters.elevation_min);
  if (filters.elevation_max) q = q.lte("elevation_m", filters.elevation_max);
  if (filters.region) q = q.ilike("region", `%${filters.region}%`);
  if (filters.surface?.length) q = q.overlaps("surface", filters.surface);
  if (filters.route_types?.length) q = q.overlaps("route_types", filters.route_types);
  if (filters.bike_types?.length) q = q.overlaps("bike_types", filters.bike_types);
  if (filters.search_text) {
    q = q.or(
      `title.ilike.%${filters.search_text}%,description.ilike.%${filters.search_text}%`,
    );
  }

  const { data } = await q;
  let results: RouteResult[] = (data as RouteResult[]) ?? [];

  // Re-rank by closeness to target distance, then take top 6
  if (hasDistanceTarget && results.length > 1) {
    const target = filters.distance_target!;
    results.sort((a, b) =>
      Math.abs(a.distance_km - target) - Math.abs(b.distance_km - target),
    );
    results = results.slice(0, 6);
  }

  return results;
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

  const [aiFilters, regexFilters] = await Promise.all([
    parseAI(query),
    Promise.resolve(extractFromText(query)),
  ]);

  const filters = mergeFilters(aiFilters, regexFilters);

  // If coordinates provided and no region extracted from text — use nearest region
  if (lat !== undefined && lng !== undefined && !filters.region) {
    filters.region = closestRegion(lat, lng);
  }

  const routes = await searchRoutes(filters);

  return NextResponse.json({ routes, filters });
}
