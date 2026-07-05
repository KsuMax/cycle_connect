import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as https from "node:https";
import { SocksProxyAgent } from "socks-proxy-agent";
import { createAdminSupabase } from "@/lib/supabase-admin";

interface OpenMeteoResponse {
  hourly?: {
    time?: string[];
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
  };
}

interface CacheRow {
  forecast_hour: string;
  wind_dir_deg: number;
  wind_speed_ms: number;
}

interface BearingRow {
  buckets: number[];
  total_m: number;
  lat: number;
  lng: number;
}

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const OPEN_METEO_TIMEOUT_MS = 8000;        // 8 s – fail fast on network issues
const FORECAST_DAYS = 7;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

// api.open-meteo.com is unreachable via direct TCP from the prod VPS (and
// from RU generally — Hetzner ranges are blocked, DNS resolves fine but the
// connection just hangs). Reuses the same backup-tunnel SOCKS5 proxy set up
// for Telegram egress (see src/lib/grabber/proxied-fetch.ts). Unset locally,
// so dev machines outside the block fall back to a direct fetch.
const SOCKS_PROXY_URL = process.env.TELEGRAM_SOCKS_PROXY;
let socksAgent: SocksProxyAgent | undefined;
function getSocksAgent(): SocksProxyAgent | undefined {
  if (!SOCKS_PROXY_URL) return undefined;
  if (!socksAgent) socksAgent = new SocksProxyAgent(SOCKS_PROXY_URL);
  return socksAgent;
}

function fetchViaSocks(url: string, agent: SocksProxyAgent, timeoutMs: number): Promise<OpenMeteoResponse> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent, timeout: timeoutMs }, (res) => {
      const status = res.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        res.resume();
        reject(new Error(`open-meteo ${status}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as OpenMeteoResponse);
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("open-meteo timeout")));
    req.on("error", reject);
  });
}

async function fetchOpenMeteo(lat: number, lng: number): Promise<{
  hours: string[];
  dirs: number[];
  speeds: number[];
}> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lng.toFixed(4));
  url.searchParams.set("hourly", "wind_speed_10m,wind_direction_10m");
  url.searchParams.set("forecast_days", String(FORECAST_DAYS));
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("wind_speed_unit", "ms");

  const agent = getSocksAgent();
  let body: OpenMeteoResponse;
  if (agent) {
    body = await fetchViaSocks(url.toString(), agent, OPEN_METEO_TIMEOUT_MS);
  } else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OPEN_METEO_TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), { signal: controller.signal });
      if (!res.ok) throw new Error(`open-meteo ${res.status}`);
      body = (await res.json()) as OpenMeteoResponse;
    } finally {
      clearTimeout(timer);
    }
  }

  const time = body.hourly?.time ?? [];
  const speeds = body.hourly?.wind_speed_10m ?? [];
  const dirs = body.hourly?.wind_direction_10m ?? [];
  if (time.length === 0 || time.length !== speeds.length || time.length !== dirs.length) {
    throw new Error("open-meteo malformed response");
  }

  // Open-Meteo emits "2026-04-29T14:00" UTC; normalise to full ISO-8601.
  const hours = time.map((t) => {
    const iso = t.endsWith("Z") ? t : `${t}:00Z`;
    return iso.replace(/:00:00Z$/, ":00:00.000Z");
  });
  return { hours, dirs, speeds };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ routeId: string }> },
) {
  const { routeId } = await ctx.params;
  if (!routeId || typeof routeId !== "string") {
    return json({ error: "routeId required" }, 400);
  }

  let admin;
  try {
    admin = createAdminSupabase();
  } catch (err) {
    console.error("[wind] admin client init failed:", err);
    return json({ error: "server config" }, 503);
  }

  // ── 1. Fetch bearing profile + centroid ────────────────────────────────────
  const { data: bearingRows, error: bearingErr } = await admin.rpc(
    "route_bearing_with_centroid",
    { rid: routeId },
  );
  if (bearingErr) {
    console.error("[wind] bearing RPC error for", routeId, bearingErr.message);
    return json({ error: bearingErr.message }, 500);
  }
  const bearing = (bearingRows as BearingRow[] | null)?.[0];
  if (!bearing || bearing.total_m === 0) {
    // Route has no geometry → not an error, just no data.
    return json({ error: "no geometry" }, 404);
  }

  // ── 2. Check cache freshness ───────────────────────────────────────────────
  const nowMs = Date.now();
  const horizonIso = new Date(nowMs - 60 * 60 * 1000).toISOString();

  const { data: freshness } = await admin
    .from("wind_forecast_cache")
    .select("fetched_at")
    .eq("route_id", routeId)
    .gte("forecast_hour", horizonIso)
    .order("fetched_at", { ascending: false })
    .limit(1);

  const lastFetchedMs = freshness?.[0]?.fetched_at
    ? new Date(freshness[0].fetched_at).getTime()
    : 0;
  const stale = nowMs - lastFetchedMs > CACHE_TTL_MS;

  // ── 3. Refresh cache from Open-Meteo if needed ────────────────────────────
  if (stale) {
    try {
      const fc = await fetchOpenMeteo(bearing.lat, bearing.lng);
      const rows = fc.hours.map((h, i) => ({
        route_id: routeId,
        forecast_hour: h,
        wind_dir_deg: Math.round(((fc.dirs[i] % 360) + 360) % 360),
        wind_speed_ms: Number(fc.speeds[i].toFixed(1)),
      }));
      const { error: upsertErr } = await admin
        .from("wind_forecast_cache")
        .upsert(rows, { onConflict: "route_id,forecast_hour" });
      if (upsertErr) {
        console.warn("[wind] cache upsert failed:", upsertErr.message);
      }
    } catch (err) {
      // Open-Meteo unreachable or timed out.
      // If we have *any* cached data (even stale), serve it anyway.
      // Only hard-fail if the cache is completely empty.
      console.warn("[wind] open-meteo unavailable:", err instanceof Error ? err.message : err);
      if (lastFetchedMs === 0) {
        return json({ error: "forecast unavailable" }, 503);
      }
      // Fall through → serve stale cache below.
    }
  }

  // ── 4. Read cache and return ───────────────────────────────────────────────
  const { data: rows, error: rowsErr } = await admin
    .from("wind_forecast_cache")
    .select("forecast_hour, wind_dir_deg, wind_speed_ms")
    .eq("route_id", routeId)
    .gte("forecast_hour", horizonIso)
    .order("forecast_hour", { ascending: true });

  if (rowsErr) {
    console.error("[wind] cache read error:", rowsErr.message);
    return json({ error: rowsErr.message }, 500);
  }

  const forecast = ((rows ?? []) as CacheRow[]).map((r) => ({
    ts: new Date(r.forecast_hour).toISOString(),
    dir_deg: r.wind_dir_deg,
    speed_ms: Number(r.wind_speed_ms),
  }));

  return json({
    profile: { buckets: bearing.buckets, total_m: bearing.total_m },
    centroid: { lat: bearing.lat, lng: bearing.lng },
    forecast,
    stale: stale && lastFetchedMs > 0,
  });
}
