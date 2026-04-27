/**
 * GET /api/ai-search/suggestions
 *
 * Returns up to 4 personalized search suggestion strings for the
 * authenticated user, derived from their ride history.
 *
 * Falls back to curated static suggestions when the user has no history
 * or fewer than 2 ridden routes.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const STATIC_SUGGESTIONS = [
  "Лёгкий маршрут на 50 км",
  "Горный MTB в Карелии",
  "Городская покатушка на 2 часа",
  "Гравийный маршрут с видами",
];

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function mode<T>(arr: (T | null | undefined)[]): T | null {
  const counts = new Map<T, number>();
  for (const v of arr) {
    if (v == null) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: T | null = null;
  let bestCount = 0;
  for (const [k, n] of counts) {
    if (n > bestCount) { best = k; bestCount = n; }
  }
  return best;
}

function avg(nums: (number | null | undefined)[]): number | null {
  const valid = nums.filter((n): n is number => n != null);
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

interface RiddenRoute {
  distance_km: number | null;
  elevation_m: number | null;
  difficulty: string | null;
  region: string | null;
  surface: string[] | null;
  bike_types: string[] | null;
}

export async function GET(req: NextRequest) {
  // Auth
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ suggestions: STATIC_SUGGESTIONS });
  }

  // Fetch user's ridden routes (limit to 30 most recent for perf)
  const { data: rows } = await getSupabase()
    .from("route_rides")
    .select("routes(distance_km, elevation_m, difficulty, region, surface, bike_types)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  const ridden: RiddenRoute[] = (rows ?? [])
    .map((r: { routes: RiddenRoute | null }) => r.routes)
    .filter((r): r is RiddenRoute => r != null);

  if (ridden.length < 2) {
    return NextResponse.json({ suggestions: STATIC_SUGGESTIONS });
  }

  // Build profile
  const avgDist = avg(ridden.map((r) => r.distance_km));
  const topRegion = mode(ridden.map((r) => r.region));
  const topDifficulty = mode(ridden.map((r) => r.difficulty));
  const avgElevation = avg(ridden.map((r) => r.elevation_m));
  const allSurfaces = ridden.flatMap((r) => r.surface ?? []);
  const topSurface = mode(allSurfaces);
  const allBikeTypes = ridden.flatMap((r) => r.bike_types ?? []);
  const topBikeType = mode(allBikeTypes);

  const riddenRegions = new Set(ridden.map((r) => r.region).filter(Boolean));
  const ALL_REGIONS = [
    "Санкт-Петербург", "Ленинградская область", "Карелия",
    "Москва", "Подмосковье", "Краснодарский край", "Крым", "Алтай", "Байкал", "Урал",
  ];
  const untriedRegion = ALL_REGIONS.find((r) => !riddenRegions.has(r)) ?? null;

  const suggestions: string[] = [];

  // 1. "Как обычно" — mirrors their typical ride
  if (avgDist != null && topRegion) {
    const roundedDist = Math.round(avgDist / 5) * 5;
    const diffStr = topDifficulty === "easy" ? " лёгкий" : topDifficulty === "hard" ? " сложный" : "";
    suggestions.push(`${topRegion},${diffStr} маршрут около ${roundedDist} км`);
  } else if (avgDist != null) {
    const roundedDist = Math.round(avgDist / 5) * 5;
    suggestions.push(`Маршрут около ${roundedDist} км`);
  }

  // 2. "Попробуй сложнее / легче" — push them outside comfort zone
  if (topDifficulty === "easy") {
    const distStr = avgDist ? ` ${Math.round(avgDist / 5) * 5} км` : "";
    suggestions.push(`Средний маршрут${distStr}`);
  } else if (topDifficulty === "hard") {
    suggestions.push("Лёгкая восстановительная покатушка");
  } else {
    // medium → suggest hard
    const elevStr = avgElevation && avgElevation < 400 ? " с набором 500м+" : "";
    suggestions.push(`Сложный маршрут${elevStr}`);
  }

  // 3. Surface variation — if they mostly ride asphalt, suggest gravel or vice versa
  if (topSurface === "asphalt") {
    const regionStr = topRegion ? ` в ${topRegion}` : "";
    suggestions.push(`Гравийный маршрут${regionStr}`);
  } else if (topSurface === "gravel" || topSurface === "dirt") {
    suggestions.push("Асфальтовый маршрут на скорость");
  } else if (topBikeType === "mountain") {
    suggestions.push("MTB с техничными спусками");
  } else {
    suggestions.push("Маршрут с красивыми видами");
  }

  // 4. Explore a new region
  if (untriedRegion) {
    const distStr = avgDist ? ` ${Math.round(avgDist / 5) * 5} км` : "";
    suggestions.push(`Маршруты в ${untriedRegion}${distStr}`);
  } else {
    suggestions.push("Маршруты рядом со мной");
  }

  return NextResponse.json({ suggestions: suggestions.slice(0, 4) });
}
