import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import polyline from "@mapbox/polyline";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

type FailReason = "invalid_url" | "not_found" | "fetch_failed" | "no_geometry";

function fail(reason: FailReason) {
  return json({ ok: false, reason }, 200);
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildGpx(name: string, description: string, points: [number, number][]): string {
  const trkpts = points
    .map(([lat, lon]) => `<trkpt lat="${lat}" lon="${lon}"/>`)
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<gpx version="1.1" creator="cycleconnect.cc via MapMagic">` +
    `<metadata><name>${escapeXml(name)}</name><desc>${escapeXml(description)}</desc></metadata>` +
    `<trk><name>${escapeXml(name)}</name><trkseg>${trkpts}</trkseg></trk>` +
    `</gpx>`
  );
}

function extractIdTrack(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("mapmagic.app")) return null;
    const id = u.searchParams.get("routes");
    if (!id || !/^[A-Za-z0-9]{4,12}$/.test(id)) return null;
    return id;
  } catch {
    return null;
  }
}

// Seven-day cache TTL.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const idTrack = extractIdTrack(body.url ?? "");
  if (!idTrack) return fail("invalid_url");

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Check cache first.
  const { data: cached } = await admin
    .from("mapmagic_route_cache")
    .select("*")
    .eq("id_track", idTrack)
    .single();

  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    if (age < CACHE_TTL_MS) {
      return json({
        ok: true,
        gpx: cached.gpx_xml,
        name: cached.name,
        description: cached.description,
        distanceKm: cached.distance_km,
        elevationM: cached.elevation_m,
      });
    }
  }

  // Fetch from MapMagic.
  let mmData: Record<string, unknown>;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://mapmagic.app/api/v2/route?ids=${idTrack}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "cycleconnect.cc/1.0",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return fail("not_found");
    mmData = await res.json();
  } catch {
    return fail("fetch_failed");
  }

  const tracks = (mmData as { tracks?: unknown[] }).tracks;
  const track = Array.isArray(tracks) ? tracks[0] : null;
  if (!track) return fail("not_found");

  type MMPieces = {
    lines?: string[];
    ndigits?: number;
    elevations?: unknown;
    surfaces?: unknown;
  };

  type MMTrack = {
    id_track?: string;
    segments?: { simplified_line?: string; pieces?: MMPieces }[];
    constant_meta?: { distance?: number; elevation_gain?: number };
    variable_meta?: { title?: string };
    description?: string;
  };

  const t = track as MMTrack;
  const seg = t.segments?.[0];

  // MapMagic encodes polylines with ndigits precision (typically 6, not the
  // Google-standard 5). Reading it from pieces.ndigits avoids the 10× coord error.
  const pieces = seg?.pieces;
  const ndigits = pieces?.ndigits ?? 5;
  const pieceLines = pieces?.lines;

  let points: [number, number][];
  try {
    if (Array.isArray(pieceLines) && pieceLines.length > 0) {
      // Full track: concatenate all segment polylines decoded at correct precision.
      points = pieceLines.flatMap((line) => polyline.decode(line, ndigits));
    } else {
      // Fallback to simplified_line if pieces unavailable.
      const simplifiedLine = seg?.simplified_line;
      if (!simplifiedLine) return fail("no_geometry");
      points = polyline.decode(simplifiedLine, ndigits);
    }
    if (points.length === 0) return fail("no_geometry");
  } catch {
    return fail("no_geometry");
  }

  const name = t.variable_meta?.title ?? `MapMagic маршрут`;
  const description = (t as { description?: string }).description ?? "";
  const distanceKm = t.constant_meta?.distance
    ? Math.round(t.constant_meta.distance / 100) / 10
    : null;
  const elevationM = t.constant_meta?.elevation_gain ?? null;

  const gpxXml = buildGpx(name, description, points);

  // Upsert cache.
  await admin.from("mapmagic_route_cache").upsert({
    id_track: idTrack,
    gpx_xml: gpxXml,
    name,
    description,
    distance_km: distanceKm,
    elevation_m: elevationM,
    fetched_at: new Date().toISOString(),
  });

  return json({
    ok: true,
    gpx: gpxXml,
    name,
    description,
    distanceKm,
    elevationM,
  });
}
