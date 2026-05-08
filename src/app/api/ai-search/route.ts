/**
 * POST /api/ai-search
 *
 * Body: { query: string }
 * Response: { routes: RouteResult[], filters: object }
 *
 * Env vars required:
 *   OLLAMA_URL             — base URL for Ollama (default: http://localhost:11434)
 *   OPENROUTER_API_KEY     — fallback when Ollama is unavailable
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { embedQuery, toPgVector } from "@/lib/embeddings/jina";
import { scoreWind } from "@/lib/wind";
import { chatJSON } from "@/lib/llm/ollama-chat";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type EntityType = "routes" | "events" | "clubs";

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
  /** When true, attach regional weather comfort to each result. */
  weather_intent?: boolean;
  /** When true, personalize filters from user ride history. */
  personal_intent?: boolean;
  /** What the user is searching for — defaults to "routes". */
  entity_type?: EntityType;
  /**
   * Proximity filter: only routes whose start_point / route_line is within
   * near_km km of (near_lat, near_lng). Set by the server from request body
   * coords when the query contains "рядом / поблизости / недалеко от меня".
   * Persisted in activeFilters so conversational refinements keep the geo context.
   */
  near_km?: number;
  near_lat?: number;
  near_lng?: number;
  /**
   * POI filter: route must have at least one matching tag.
   * Values: lake | river | sea | forest | viewpoint | waterfall | cafe |
   *         water_source | monastery | station | park | beach | mountain |
   *         bridge | field | castle
   */
  poi_tags?: string[];
  /**
   * Season filter: route must be recommended for this month (1–12), or have
   * no season restriction (season_months IS NULL = year-round).
   */
  season_month?: number;
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
  /** LLM-generated one-liner: why this route matches the user's query. */
  why?: string;
  /** Regional weather comfort at the target ride time. */
  comfort?: {
    temp_c: number;
    precip_pct: number;
    /** Human-readable label with emoji, e.g. "🌤 Отлично" or "🌧 Дождь". */
    label: string;
    hour_iso: string;
  };
}

export interface EventResult {
  id: string;
  title: string;
  start_date: string;
  cover_url: string | null;
  description_short: string;
}

export interface ClubResult {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  avatar_url: string | null;
  members_count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Detects when the query is about events or clubs rather than routes. */
function detectEntityType(q: string): EntityType {
  if (/событи|мероприяти|покатушк|групповой\s+выезд|ближайш.*выезд|расписани|афиш|участвовать|поучаствовать/.test(q)) {
    return "events";
  }
  if (/клуб|сообщество\s+велосипед/.test(q)) {
    return "clubs";
  }
  return "routes";
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
  // hoursMatch declared here so the "короткий" check below can see it.
  const hoursMatch = !hasExplicitDist ? q.match(/(?:на\s+)?(\d+)\s*час/) : null;
  if (!hasExplicitDist) {
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

  // Short route: "недолгий / короткий" — apply only when no explicit distance/time already set
  if (!hasExplicitDist && !hoursMatch && !out.distance_max && /недолг|коротк/.test(q)) {
    out.distance_max = 40;
  }

  // Urban / near-city hints
  if (/\bгород|\bпо городу|недалеко от город|рядом с город|окраин/.test(q)) {
    out.route_types = ["urban"];
  }

  // Geo proximity: user explicitly says "near me" — server will fill near_lat/lng from body
  if (/рядом|поблизости|около меня|возле меня|недалеко от меня/.test(q)) {
    out.near_km = 15;
  }

  // POI tags — build array from any matching patterns
  const poi: string[] = [];
  if (/озер|водохранилищ|пруд/.test(q))                             poi.push("lake");
  if (/\bрек[аеуи]|\bручей|\bречк/.test(q))                        poi.push("river");
  if (/\bмор[еяю]|\bзалив|\bбухт/.test(q))                         poi.push("sea");
  if (/\bлес[аеу]?|\bлесн|\bбор\b|\bтайг/.test(q))                 poi.push("forest");
  if (/вид[ыа]?\b|панорам|смотров|обзорн|видовой/.test(q))          poi.push("viewpoint");
  if (/водопад/.test(q))                                            poi.push("waterfall");
  if (/\bкафе|\bкофейн|\bкофе\b|перекус/.test(q))                  poi.push("cafe");
  if (/родник|источник|питьевая вод/.test(q))                       poi.push("water_source");
  if (/монастыр|монастырь|храм|церков|собор/.test(q))               poi.push("monastery");
  if (/электричк|жд\s*стан|ж\/д\s*стан|станци[яю]/.test(q))        poi.push("station");
  if (/\bпляж/.test(q))                                             poi.push("beach");
  if (/замок|крепость|форт/.test(q))                                poi.push("castle");
  if (poi.length) out.poi_tags = poi;

  // Season: map common phrases to a representative month for the DB filter
  if (/весн|весенн|март|апрел|май/.test(q))      out.season_month = 5;
  else if (/лет[оа]|летн|июн|июл|август/.test(q)) out.season_month = 7;
  else if (/осен|осенн|сентябр|октябр|ноябр/.test(q)) out.season_month = 9;
  else if (/зим[аоу]|зимн|январ|феврал|декабр/.test(q)) out.season_month = 1;

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

  // Weather intent — user references a specific time → show comfort score on results
  if (/сегодня|завтра|утром|вечером|сейчас|в\s+выходные|в\s+субботу|в\s+воскресенье|погод|комфортн|хорош\w*\s+погод/.test(q)) {
    out.weather_intent = true;
  }

  // Personal intent — user wants recommendations based on their history
  if (/для\s+меня|посовет|рекомендуй|рекомендац|по\s+моей|исходя\s+из|на\s+основ\w*\s+мо|что\s+мне|мой\s+уровень|под\s+меня|персонал/.test(q)) {
    out.personal_intent = true;
  }

  // Entity type
  const entityType = detectEntityType(q);
  if (entityType !== "routes") out.entity_type = entityType;

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
{"difficulty":"easy"|"medium"|"hard","distance_min":number,"distance_max":number,"distance_target":number,"elevation_min":number,"elevation_max":number,"surface":["asphalt"|"gravel"|"dirt"|"mixed"],"route_types":["road"|"gravel"|"mtb"|"urban"],"bike_types":["road"|"mountain"|"gravel"],"region":"Карелия"|"Санкт-Петербург"|"Ленинградская область"|"Москва"|"Подмосковье"|"Краснодарский край"|"Крым"|"Алтай"|"Байкал"|"Урал","search_text":"string","sort_by":"relevance"|"popular","wind_intent":true,"near_km":number,"poi_tags":["lake"|"river"|"sea"|"forest"|"viewpoint"|"waterfall"|"cafe"|"water_source"|"monastery"|"station"|"park"|"beach"|"mountain"|"bridge"|"field"|"castle"],"season_month":number}

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
14. "попутный ветер"/"ветер в спину"/"по ветру"/"с попутным"/"без встречного ветра" → wind_intent=true
15. "рядом со мной"/"рядом"/"поблизости"/"около меня"/"недалеко от меня"/"возле меня" → near_km=15
16. poi_tags: "озеро"/"у озера" → ["lake"]; "лес"/"через лес" → ["forest"]; "водопад" → ["waterfall"]; "вид"/"панорама"/"смотровая" → ["viewpoint"]; "кафе"/"кофейня" → ["cafe"]; "море"/"залив" → ["sea"]; "пляж" → ["beach"]; "родник" → ["water_source"]; "монастырь"/"храм" → ["monastery"]; "электричка"/"станция" → ["station"]; "река"/"ручей" → ["river"]; "замок"/"крепость" → ["castle"]; "горы" (scenic) → ["mountain"]
17. season_month: "весной"/"весенний"/"апрель"/"май" → 5; "летом"/"летний"/"июль"/"август" → 7; "осенью"/"осенний"/"сентябрь"/"октябрь" → 9; "зимой"/"зимний"/"январь" → 1`;

// ─── AI filter parsing ────────────────────────────────────────────────────────

async function parseAI(query: string): Promise<RouteFilters> {
  try {
    const result = await chatJSON([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: query },
    ]);
    return result as RouteFilters;
  } catch (err) {
    console.error("[ai-search] parseAI failed:", err instanceof Error ? err.message : String(err));
    return {};
  }
}

/**
 * Parses a conversational refinement (e.g. "покороче", "без асфальта", "другой регион")
 * as a DELTA on top of existing filters. Returns only the changed fields.
 */
async function parseRefinement(
  query: string,
  baseFilters: RouteFilters,
): Promise<RouteFilters> {
  const baseJson = JSON.stringify(baseFilters, null, 0);
  const refinementPrompt =
    `Current search filters: ${baseJson}\n\n` +
    `User refinement: "${query}"\n\n` +
    `Return a JSON with ONLY the fields the user wants to change. ` +
    `If a filter should be removed, set its value to null. ` +
    `Return {} if nothing needs to change. Same field names as the original schema.`;
  try {
    const delta = await chatJSON([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: refinementPrompt },
    ]);
    return delta as RouteFilters;
  } catch (err) {
    console.error("[ai-search] parseRefinement failed:", err instanceof Error ? err.message : String(err));
    return {};
  }
}

/** Merges a refinement delta into base filters. Null values remove the field. */
function applyRefinementDelta(base: RouteFilters, delta: RouteFilters): RouteFilters {
  const result = { ...base };
  for (const [key, value] of Object.entries(delta)) {
    if (value === null) {
      delete result[key as keyof RouteFilters];
    } else {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
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

  // Regex wins unconditionally for difficulty — small LLM (1b) often confuses
  // negations ("несложный" → it reads "сложный"). Regex is 100% reliable here.
  if (regex.difficulty) merged.difficulty = regex.difficulty;
  else if (!merged.difficulty && ai.difficulty) merged.difficulty = ai.difficulty;

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
  // Either source can flag weather intent (wind_intent implies weather_intent)
  if (regex.weather_intent || ai.weather_intent || merged.wind_intent) merged.weather_intent = true;

  // Regex wins for entity type (more reliable pattern matching)
  if (regex.entity_type) merged.entity_type = regex.entity_type;

  // Either source can flag personal intent
  if (regex.personal_intent || ai.personal_intent) merged.personal_intent = true;

  // POI tags: union of both sources (regex is reliable for explicit mentions)
  const allPoi = [
    ...(regex.poi_tags ?? []),
    ...(ai.poi_tags ?? []),
  ];
  if (allPoi.length) merged.poi_tags = [...new Set(allPoi)];

  // Season: regex wins (explicit month/season word is reliable)
  if (regex.season_month != null) merged.season_month = regex.season_month;
  else if (ai.season_month != null) merged.season_month = ai.season_month;

  return merged;
}

// ─── Smart fallback: relax the most restrictive filter ───────────────────────

interface RelaxResult {
  filters: RouteFilters;
  reason: string;
}

function relaxFilters(f: RouteFilters): RelaxResult | null {
  // Geo: widen radius 15 → 50 → drop before touching other filters
  if (f.near_km != null && f.near_km <= 20) {
    return { filters: { ...f, near_km: 50 }, reason: "расширили радиус поиска до 50 км" };
  }
  if (f.near_km != null && f.near_km <= 50) {
    return { filters: { ...f, near_km: undefined, near_lat: undefined, near_lng: undefined }, reason: "убрали ограничение по расстоянию от вас" };
  }
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
  if (f.season_month != null) {
    return { filters: { ...f, season_month: undefined }, reason: "убрали фильтр по сезону" };
  }
  if (f.poi_tags?.length) {
    return { filters: { ...f, poi_tags: undefined }, reason: "убрали фильтр по точкам интереса" };
  }
  if (f.region) {
    return { filters: { ...f, region: undefined }, reason: "убрали фильтр по региону" };
  }
  return null;
}

// ─── LLM explanations ────────────────────────────────────────────────────────

const DIFFICULTY_LABEL: Record<string, string> = { easy: "лёгкий", medium: "средний", hard: "сложный" };

/**
 * Asks the LLM to write a one-liner "why" for each route.
 * Returns a map of route id → explanation string.
 * Silently returns an empty map on any failure.
 */
async function generateWhys(
  routes: RouteResult[],
  query: string,
): Promise<Map<string, string>> {
  if (routes.length === 0) return new Map();

  const routeList = routes
    .map((r, i) =>
      `${i + 1}. id:${r.id} "${r.title}" ` +
      `${r.distance_km}км подъём:${r.elevation_m}м ` +
      `${DIFFICULTY_LABEL[r.difficulty] ?? r.difficulty} ` +
      `${r.region}` +
      (r.tags?.length ? ` [${r.tags.slice(0, 3).join(",")}]` : ""),
    )
    .join("\n");

  const userMsg =
    `Запрос: "${query}"\n\nМаршруты:\n${routeList}\n\n` +
    `Напиши для каждого маршрута ОДНО короткое предложение (8-12 слов) на русском — ` +
    `чем конкретно он подходит для этого запроса. ` +
    `Отвечай в формате {"items":[{"id":"...","why":"..."},...]}`;

  try {
    const raw = await chatJSON(
      [
        { role: "system", content: "Ты — помощник велосипедиста. Возвращай только JSON." },
        { role: "user", content: userMsg },
      ],
      6_000,
    );

    const arr = Array.isArray(raw.items) ? raw.items : [];
    const map = new Map<string, string>();
    for (const item of arr as Array<{ id?: string; why?: string }>) {
      if (typeof item.id === "string" && typeof item.why === "string") {
        map.set(item.id, item.why);
      }
    }
    return map;
  } catch (err) {
    console.warn("[ai-search] generateWhys failed:", err instanceof Error ? err.message : String(err));
    return new Map();
  }
}

// ─── Events & Clubs search ────────────────────────────────────────────────────

async function searchEvents(query: string): Promise<EventResult[]> {
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await getSupabase()
    .from("events")
    .select("id, title, start_date, cover_url, description")
    .gte("start_date", today)
    .order("start_date")
    .limit(8);

  if (error || !data) {
    console.error("[ai-search] searchEvents error:", error);
    return [];
  }

  const qLower = query.toLowerCase();
  const terms = qLower.split(/\s+/).filter((w) => w.length > 3 && !/событи|мероприят/.test(w));

  return data
    .filter((e) => {
      if (!terms.length) return true;
      const haystack = (e.title + " " + stripHtml(e.description ?? "")).toLowerCase();
      return terms.some((t) => haystack.includes(t));
    })
    .slice(0, 5)
    .map((e) => ({
      id: e.id as string,
      title: e.title as string,
      start_date: e.start_date as string,
      cover_url: (e.cover_url ?? null) as string | null,
      description_short: stripHtml(e.description ?? "").slice(0, 120),
    }));
}

async function searchClubs(query: string): Promise<ClubResult[]> {
  const { data, error } = await getSupabase()
    .from("clubs")
    .select("id, slug, name, city, avatar_url, members_count")
    .order("members_count", { ascending: false })
    .limit(8);

  if (error || !data) {
    console.error("[ai-search] searchClubs error:", error);
    return [];
  }

  const qLower = query.toLowerCase();
  const terms = qLower.split(/\s+/).filter((w) => w.length > 3 && !/клуб|сообщество/.test(w));

  return data
    .filter((c) => {
      if (!terms.length) return true;
      const haystack = (c.name + " " + (c.city ?? "")).toLowerCase();
      return terms.some((t) => haystack.includes(t));
    })
    .slice(0, 5)
    .map((c) => ({
      id: c.id as string,
      slug: c.slug as string,
      name: c.name as string,
      city: (c.city ?? null) as string | null,
      avatar_url: (c.avatar_url ?? null) as string | null,
      members_count: (c.members_count ?? 0) as number,
    }));
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
    filter_near_lat: filters.near_lat ?? null,
    filter_near_lng: filters.near_lng ?? null,
    filter_near_km: filters.near_km ?? null,
    filter_poi_tags: filters.poi_tags ?? null,
    filter_season_month: filters.season_month ?? null,
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
  temp_c: number;
  precip_pct: number;
}

/** Fetches 2-day hourly forecast from Open-Meteo: wind + temperature + precipitation. */
async function fetchWindForecastForPoint(lat: number, lng: number): Promise<WindPoint[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lng.toFixed(4));
  url.searchParams.set("hourly", "wind_speed_10m,wind_direction_10m,temperature_2m,precipitation_probability");
  url.searchParams.set("forecast_days", "2");
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("wind_speed_unit", "ms");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const body = await res.json() as {
      hourly?: {
        time?: string[];
        wind_speed_10m?: number[];
        wind_direction_10m?: number[];
        temperature_2m?: number[];
        precipitation_probability?: number[];
      };
    };
    const time = body.hourly?.time ?? [];
    const speeds = body.hourly?.wind_speed_10m ?? [];
    const dirs = body.hourly?.wind_direction_10m ?? [];
    const temps = body.hourly?.temperature_2m ?? [];
    const precips = body.hourly?.precipitation_probability ?? [];
    return time.map((t, i) => ({
      ts: (t.endsWith("Z") ? t : `${t}:00Z`).replace(/:00:00Z$/, ":00:00.000Z"),
      dir_deg: Math.round(((dirs[i] % 360) + 360) % 360),
      speed_ms: Number(speeds[i]?.toFixed(1) ?? 0),
      temp_c: Math.round(temps[i] ?? 15),
      precip_pct: Math.round(precips[i] ?? 0),
    }));
  } finally {
    clearTimeout(timer);
  }
}

// Cache Open-Meteo regional forecasts for 15 minutes — avoids repeated API calls
// when many users search with weather/wind intent at the same time.
const FORECAST_CACHE = new Map<string, { data: WindPoint[]; expires: number }>();
const FORECAST_TTL_MS = 15 * 60 * 1000;

async function fetchForecastCached(lat: number, lng: number): Promise<WindPoint[]> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const now = Date.now();
  const hit = FORECAST_CACHE.get(key);
  if (hit && hit.expires > now) return hit.data;
  const data = await fetchWindForecastForPoint(lat, lng);
  FORECAST_CACHE.set(key, { data, expires: now + FORECAST_TTL_MS });
  return data;
}

/** Builds a human-readable comfort label from temperature and precipitation. */
function comfortLabel(temp_c: number, precip_pct: number): string {
  if (precip_pct >= 60) return "🌧 Дождь";
  if (precip_pct >= 35) return "🌦 Возможен дождь";
  if (temp_c <= 2) return "🥶 Очень холодно";
  if (temp_c <= 8) return "🧤 Холодно";
  if (temp_c >= 33) return "🥵 Жарко";
  if (temp_c >= 24 && precip_pct < 20) return "🌤 Отлично";
  if (temp_c >= 14 && precip_pct < 20) return "🌤 Хорошая погода";
  return "☁️ Пасмурно, сухо";
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
  const scored: Array<RouteResult & { _wRank: number }> = [];

  for (const route of candidates) {
    const profile = profiles.get(route.id);
    if (!profile || profile.total_m <= 0) continue;

    // Rank by `tailwindMs` (= score · speed): a 0.7 score in 1 m/s wind is
    // imperceptible while 0.3 in 8 m/s is a real assist. Picking the slot
    // by raw `score` would systematically prefer the former.
    let bestTailMs = -Infinity;
    let bestScore = 0;
    let bestKey: string | null = null;

    for (const slot of targetSlots) {
      const key = new Date(Date.UTC(
        slot.getUTCFullYear(), slot.getUTCMonth(), slot.getUTCDate(), slot.getUTCHours(),
      )).toISOString();
      const wind = forecastByHour.get(key);
      if (!wind) continue;

      const { score, tailwindMs } = scoreWind(
        { buckets: profile.buckets, total_m: profile.total_m },
        { ts: wind.ts, dir_deg: wind.dir_deg, speed_ms: wind.speed_ms },
      );

      if (tailwindMs > bestTailMs) {
        bestTailMs = tailwindMs;
        bestScore = score;
        bestKey = key;
      }
    }

    // ≥0.4 m/s of felt tailwind at cyclist height — minimum noticeable assist
    if (bestKey === null || bestTailMs < 0.4) continue;

    const bestWind = forecastByHour.get(bestKey)!;
    scored.push({
      ...route,
      wind_score: Math.round(bestScore * 100) / 100,
      wind_speed_ms: bestWind.speed_ms,
      best_wind_hour: bestWind.ts,
      _wRank: bestTailMs,
      comfort: {
        temp_c: bestWind.temp_c,
        precip_pct: bestWind.precip_pct,
        label: comfortLabel(bestWind.temp_c, bestWind.precip_pct),
        hour_iso: bestWind.ts,
      },
    });
  }

  return scored
    .sort((a, b) => b._wRank - a._wRank)
    .slice(0, 6)
    .map(({ _wRank: _, ...rest }) => rest);
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
    forecast = await fetchForecastCached(lat, lng);
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

/**
 * Fetches regional weather for the target time slot and attaches comfort
 * to each route in-place. Silent on failure — routes are returned as-is.
 */
async function attachWeatherComfort(
  routes: RouteResult[],
  filters: RouteFilters,
  query: string,
): Promise<RouteResult[]> {
  if (routes.length === 0) return routes;

  const regionName = filters.region ?? "Москва";
  const regionEntry =
    REGION_CENTERS.find(([name]) => name === regionName) ??
    REGION_CENTERS.find(([name]) => name === "Москва")!;
  const [, lat, lng] = regionEntry;

  try {
    const forecast = await fetchForecastCached(lat, lng);
    const forecastByHour = new Map<string, WindPoint>();
    for (const w of forecast) {
      const d = new Date(w.ts);
      const key = new Date(Date.UTC(
        d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(),
      )).toISOString();
      forecastByHour.set(key, w);
    }

    const targetSlots = getWindTargetSlots(query);
    // Pick the first matching slot for regional comfort
    let bestPoint: WindPoint | null = null;
    for (const slot of targetSlots) {
      const key = new Date(Date.UTC(
        slot.getUTCFullYear(), slot.getUTCMonth(), slot.getUTCDate(), slot.getUTCHours(),
      )).toISOString();
      const w = forecastByHour.get(key);
      if (w) { bestPoint = w; break; }
    }
    if (!bestPoint) return routes;

    const comfort = {
      temp_c: bestPoint.temp_c,
      precip_pct: bestPoint.precip_pct,
      label: comfortLabel(bestPoint.temp_c, bestPoint.precip_pct),
      hour_iso: bestPoint.ts,
    };
    return routes.map((r) => ({ ...r, comfort }));
  } catch (err) {
    console.warn("[ai-search] attachWeatherComfort failed:", err instanceof Error ? err.message : String(err));
    return routes;
  }
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

// ─── Personal profile ────────────────────────────────────────────────────────

function modeOf<T>(arr: (T | null | undefined)[]): T | null {
  const counts = new Map<T, number>();
  for (const v of arr) {
    if (v == null) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: T | null = null; let bestN = 0;
  for (const [k, n] of counts) { if (n > bestN) { best = k; bestN = n; } }
  return best;
}

function avgOf(nums: (number | null | undefined)[]): number | null {
  const valid = nums.filter((n): n is number => n != null);
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/**
 * Fetches the user's recent rides and builds a RouteFilters object
 * representing their riding preferences.
 * Returns null when there's not enough data (fewer than 3 rides).
 */
async function buildUserProfile(userId: string): Promise<RouteFilters | null> {
  const { data: rows } = await getSupabase()
    .from("route_rides")
    .select("routes(distance_km, elevation_m, difficulty, region, surface, bike_types)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);

  const ridden = (rows ?? [])
    .map((r: { routes: { distance_km: number | null; elevation_m: number | null; difficulty: string | null; region: string | null; surface: string[] | null; bike_types: string[] | null } | null }) => r.routes)
    .filter((r): r is NonNullable<typeof r> => r != null);

  if (ridden.length < 3) return null;

  const avgDist = avgOf(ridden.map((r) => r.distance_km));
  const topDifficulty = modeOf(ridden.map((r) => r.difficulty));
  const topRegion = modeOf(ridden.map((r) => r.region));
  const allSurfaces = ridden.flatMap((r) => r.surface ?? []);
  const topSurface = modeOf(allSurfaces);

  const profile: RouteFilters = {};
  if (avgDist != null) {
    profile.distance_target = Math.round(avgDist / 5) * 5;
    profile.distance_min = Math.max(1, Math.round(avgDist * 0.7));
    profile.distance_max = Math.round(avgDist * 1.3);
  }
  if (topDifficulty) profile.difficulty = topDifficulty;
  if (topRegion) profile.region = topRegion;
  if (topSurface && topSurface !== "mixed") profile.surface = [topSurface];

  return profile;
}

// ─── Analytics: fire-and-forget search log ───────────────────────────────────

function logSearch(
  userId: string,
  query: string,
  filters: RouteFilters,
  nResults: number,
  entityType: EntityType,
  relaxed: boolean,
): void {
  // Intentionally not awaited — analytics must never delay the response.
  // Strip internal coord fields before serialising to keep the log readable.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { near_lat, near_lng, ...loggableFilters } = filters;
  getSupabase()
    .from("ai_search_log")
    .insert({
      user_id: userId,
      query,
      parsed_filters: loggableFilters as Record<string, unknown>,
      n_results: nResults,
      entity_type: entityType,
      relaxed,
    })
    .then(() => {})
    .catch((e: unknown) => {
      console.warn("[ai-search] logSearch failed:", e instanceof Error ? e.message : String(e));
    });
}

// ─── SSE helpers ──────────────────────────────────────────────────────────────

function sseEvent(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
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

  // 30 searches per user per minute. Each call hits Ollama + Open-Meteo +
  // OpenRouter — without a cap a single client can drain budgets.
  if (!(await checkRateLimit(rateLimitKey("ai-search", req, user.id), 30, 60))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const query: string = typeof body.query === "string" ? body.query.trim() : "";
  const lat: number | undefined = typeof body.lat === "number" ? body.lat : undefined;
  const lng: number | undefined = typeof body.lng === "number" ? body.lng : undefined;

  if (!query) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      // Start embedding immediately — runs in parallel with LLM filter parsing.
      // The promise-based cache in embedQuery deduplicates the second call
      // inside runMatchRoutes, so no extra Ollama request is made.
      void embedQuery(query);

      try {
        let filters: RouteFilters;

        // Chip refinement: client sends pre-built filters, skip LLM parsing entirely.
        if (body.filters && typeof body.filters === "object") {
          filters = body.filters as RouteFilters;
          // Still emit parsed event so client shows the active filter summary
          controller.enqueue(sseEvent({ type: "parsed", filters }));

        } else if (body.baseFilters && typeof body.baseFilters === "object") {
          // ── Conversational refinement: parse only the delta ───────────────
          controller.enqueue(sseEvent({ type: "parsing", hint: "refine" }));
          const base = body.baseFilters as RouteFilters;
          const [delta, regexDelta] = await Promise.all([
            parseRefinement(query, base),
            Promise.resolve(extractFromText(query)),
          ]);
          // Regex delta wins for explicit values; LLM delta fills the rest
          const merged = applyRefinementDelta(base, mergeFilters(delta, regexDelta));
          filters = merged;
          controller.enqueue(sseEvent({ type: "parsed", filters, hint: "refine" }));

        } else {
          // ── 1. Parse in parallel ──────────────────────────────────────────
          controller.enqueue(sseEvent({ type: "parsing" }));

          const regexFilters = extractFromText(query);
          const isPersonal = regexFilters.personal_intent;

          const [aiFilters, personalProfile] = await Promise.all([
            parseAI(query),
            isPersonal ? buildUserProfile(user.id) : Promise.resolve(null),
          ]);
          filters = mergeFilters(aiFilters, regexFilters);

          // If coordinates provided:
          //  • near_km set by query → attach actual coords for PostGIS filter
          //  • always set region for wind-forecast regional center (if not already set)
          if (lat !== undefined && lng !== undefined) {
            if (filters.near_km) {
              filters.near_lat = lat;
              filters.near_lng = lng;
            }
            if (!filters.region) {
              filters.region = closestRegion(lat, lng);
            }
          }

          // Merge personal profile as defaults (explicit query values win)
          if (personalProfile) {
            if (!filters.distance_target && personalProfile.distance_target) {
              filters.distance_target = personalProfile.distance_target;
              filters.distance_min = personalProfile.distance_min;
              filters.distance_max = personalProfile.distance_max;
            }
            if (!filters.difficulty && personalProfile.difficulty) filters.difficulty = personalProfile.difficulty;
            if (!filters.region && personalProfile.region) filters.region = personalProfile.region;
            if (!filters.surface?.length && personalProfile.surface?.length) filters.surface = personalProfile.surface;
          }

          controller.enqueue(sseEvent({
            type: "parsed",
            filters,
            ...(personalProfile ? { hint: "personal" } : {}),
          }));
        }

        // ── 2. Search ─────────────────────────────────────────────────────
        const entityType: EntityType = filters.entity_type ?? "routes";

        if (entityType === "events") {
          controller.enqueue(sseEvent({ type: "searching" }));
          const events = await searchEvents(query);
          logSearch(user.id, query, filters, events.length, "events", false);
          controller.enqueue(sseEvent({ type: "result", entity_type: "events", events, filters }));
        } else if (entityType === "clubs") {
          controller.enqueue(sseEvent({ type: "searching" }));
          const clubs = await searchClubs(query);
          logSearch(user.id, query, filters, clubs.length, "clubs", false);
          controller.enqueue(sseEvent({ type: "result", entity_type: "clubs", clubs, filters }));
        } else {
          // ── routes (default) ───────────────────────────────────────────
          const searchingEvent = filters.wind_intent
            ? { type: "searching", hint: "wind" }
            : { type: "searching" };
          controller.enqueue(sseEvent(searchingEvent));

          let routes = await searchRoutes(filters, query);

          // ── 3. Smart fallback: relax tightest filter once if empty ──────
          let relaxedReason: string | null = null;
          if (routes.length === 0 && !body.filters) {
            const relaxed = relaxFilters(filters);
            if (relaxed) {
              controller.enqueue(sseEvent({ type: "relaxing", reason: relaxed.reason }));
              const fallback = await searchRoutes(relaxed.filters, query);
              if (fallback.length > 0) {
                routes = fallback;
                filters = relaxed.filters;
                relaxedReason = relaxed.reason;
              }
            }
          }

          // ── 4. Weather comfort (when time reference in query, no wind) ──
          if (routes.length > 0 && filters.weather_intent && !filters.wind_intent) {
            routes = await attachWeatherComfort(routes, filters, query);
          }

          // ── 5. Send routes immediately, then stream why-explanations async ──
          logSearch(user.id, query, filters, routes.length, "routes", !!relaxedReason);
          controller.enqueue(sseEvent({ type: "result", entity_type: "routes", routes, filters, relaxedReason }));

          // Fire generateWhys after result is already sent so the user sees
          // routes instantly. The why-texts arrive as a follow-up "why_update"
          // event (typically +1–3 s) and the frontend merges them in.
          if (routes.length > 0 && !body.filters) {
            controller.enqueue(sseEvent({ type: "reranking" }));
            generateWhys(routes, query).then((whys) => {
              if (whys.size > 0) {
                const updated = routes.map((r) =>
                  whys.has(r.id) ? { ...r, why: whys.get(r.id) } : r,
                );
                controller.enqueue(sseEvent({ type: "why_update", routes: updated }));
              }
            }).catch(() => {}).finally(() => { controller.close(); });
            return; // controller will be closed inside the promise above
          }
        }
      } catch (err) {
        console.error("[ai-search] stream error:", err instanceof Error ? err.message : String(err));
        controller.enqueue(sseEvent({ type: "error", message: "Не удалось выполнить поиск" }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
