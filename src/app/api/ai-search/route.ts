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

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cycleconnect.cc";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SYSTEM_PROMPT = `You are a cycling route assistant for CycleConnect, a Russian cycling community platform.
Parse the user's message (Russian or English) and extract route search filters.
Return ONLY a valid JSON object — no explanation, no markdown, no code blocks.

Possible fields (all optional):
{
  "difficulty": "easy" | "medium" | "hard",
  "distance_min": number (km),
  "distance_max": number (km),
  "elevation_max": number (meters),
  "surface": array of "asphalt" | "gravel" | "dirt" | "mixed",
  "route_types": array of "road" | "gravel" | "mtb" | "urban",
  "bike_types": array of "road" | "mountain" | "gravel",
  "region": string — choose closest match from [Карелия, Санкт-Петербург, Ленинградская область, Москва, Подмосковье, Краснодарский край, Крым, Алтай, Байкал, Урал],
  "search_text": string — keywords to search in title and description
}

Interpretation rules:
- лёгкий / несложный / начинающий / для новичка → difficulty: "easy"
- средний / умеренный / обычный → difficulty: "medium"
- сложный / тяжёлый / экстрим / профессиональный → difficulty: "hard"
- "2 часа" / "пару часов" → distance_max: 60
- "полдня" / "несколько часов" → distance_max: 80
- "на день" / "целый день" / "однодневный" → distance_max: 150
- "50 км" → distance_min: 45, distance_max: 55 (±10% tolerance)
- асфальт / шоссе / дорога → surface includes "asphalt"
- гравий / грунт / грунтовка → surface includes "gravel"
- грязь / бездорожье / лес → surface includes "dirt"
- шоссейный велосипед → bike_types: ["road"]
- горный велосипед / mtb / эндуро → bike_types: ["mountain"], route_types: ["mtb"]
- гравийный велосипед / гравел → bike_types: ["gravel"]
- город / городской / по городу → route_types: ["urban"]
- горы / горный маршрут → route_types: ["mtb"]
- Nature keywords (море, озеро, лес, горы, вода, природа) → add to search_text
- Omit any field you cannot confidently extract
- Return {} if no filters can be determined`;

interface RouteFilters {
  difficulty?: string;
  distance_min?: number;
  distance_max?: number;
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

async function parseFilters(query: string): Promise<RouteFilters> {
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
        max_tokens: 250,
        temperature: 0.1,
      }),
    });
    const data = await res.json();
    const raw: string = data.choices?.[0]?.message?.content ?? "{}";
    const cleaned = raw.replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned) as RouteFilters;
  } catch {
    return {};
  }
}

async function searchRoutes(filters: RouteFilters): Promise<RouteResult[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from("routes")
    .select("id, title, distance_km, elevation_m, duration_min, difficulty, region, cover_url, tags")
    .order("created_at", { ascending: false })
    .limit(6);

  if (filters.difficulty) q = q.eq("difficulty", filters.difficulty);
  if (filters.distance_min) q = q.gte("distance_km", filters.distance_min);
  if (filters.distance_max) q = q.lte("distance_km", filters.distance_max);
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
  return (data as RouteResult[]) ?? [];
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const query: string = typeof body.query === "string" ? body.query.trim() : "";

  if (!query) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  const filters = await parseFilters(query);
  const routes = await searchRoutes(filters);

  return NextResponse.json({ routes, filters });
}
