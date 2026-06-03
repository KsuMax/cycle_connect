/**
 * POST /api/routes/generate-description
 *
 * Generates an AI draft description for a route. Pipeline:
 *   GPX bytes (Supabase Storage) → elevation + SRTM + OSM → narrative CONTEXT
 *   → few-shot prompt → LLM (OpenRouter Nemotron → DeepSeek fallback)
 *   → guardrails (proper-noun whitelist) → cache row.
 *
 * Body (either form):
 *   { routeId: string, existingDraft?: string }                 — generate for a saved route; caches result.
 *   { gpx: string, existingDraft?: string }                     — generate from raw GPX bytes (route not yet saved). No cache write.
 *
 * Auth:
 *   `routeId` form: authenticated user who owns the route (or admin).
 *   `gpx`     form: any authenticated user. Anti-abuse: 8 KB ≤ size ≤ 5 MB.
 *
 * Response (200):
 *   {
 *     description: string,        // raw model output (markdown-free prose)
 *     model: string,
 *     provider: "openrouter" | "ollama" | "deepseek",
 *     guardrails: GuardrailReport,
 *     sources: { ... },
 *     cached: boolean,            // true if returned from route_descriptions_cache
 *     durationMs: number,
 *   }
 *
 * Error responses follow the project convention: { error: string }.
 */

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { generateRouteDescription } from "@/lib/routes/generate-description";
import type { OsmFeature } from "@/lib/routes/osm-context";

export const dynamic = "force-dynamic";
export const maxDuration = 180; // free Nemotron sometimes drags to 2-3 min on congested free pool

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GPX_BUCKET = "route-gpx";
const LANGUAGE = "ru";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function getCaller() {
  const cookieStore = await cookies();
  const auth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await auth.auth.getUser();
  return user;
}

export async function POST(req: NextRequest) {
  const user = await getCaller();
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: { routeId?: string; gpx?: string; existingDraft?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const existingDraft = typeof body.existingDraft === "string" ? body.existingDraft : undefined;

  const supa = admin();

  let gpxXml: string;
  let routeId: string | null = null;

  if (typeof body.gpx === "string") {
    // Pre-creation flow: GPX provided inline.
    if (body.gpx.length < 8 * 1024 || body.gpx.length > 5 * 1024 * 1024) {
      return json({ error: "invalid_gpx_size" }, 400);
    }
    if (!/<gpx\b/i.test(body.gpx.slice(0, 4096))) {
      return json({ error: "invalid_gpx_content" }, 400);
    }
    gpxXml = body.gpx;
  } else {
    // Saved-route flow: routeId references storage.
    if (!body.routeId || !UUID_RE.test(body.routeId)) {
      return json({ error: "invalid_route_id" }, 400);
    }
    routeId = body.routeId;

    const { data: route, error: routeErr } = await supa
      .from("routes")
      .select("id, author_id, gpx_path")
      .eq("id", routeId)
      .single();

    if (routeErr || !route) return json({ error: "route_not_found" }, 404);

    const { data: profile } = await supa
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    const isAdmin = profile?.is_admin === true;

    if (route.author_id !== user.id && !isAdmin) {
      return json({ error: "forbidden" }, 403);
    }
    if (!route.gpx_path) {
      return json({ error: "no_gpx_attached" }, 409);
    }

    const dl = await supa.storage.from(GPX_BUCKET).download(route.gpx_path);
    if (dl.error || !dl.data) {
      return json({ error: `gpx_download_failed: ${dl.error?.message ?? "unknown"}` }, 500);
    }
    gpxXml = await dl.data.text();
  }

  // ── Run the pipeline ──────────────────────────────────────────────────────
  let result;
  try {
    result = await generateRouteDescription({
      gpxXml,
      language: LANGUAGE,
      existingDraft,
      cache: {
        getOsm: async (hash) => {
          const { data } = await supa
            .from("osm_context_cache")
            .select("features")
            .eq("geometry_hash", hash)
            .single();
          return (data?.features as OsmFeature[] | undefined) ?? null;
        },
        putOsm: async (hash, features, endpoint) => {
          await supa.from("osm_context_cache").upsert({
            geometry_hash: hash,
            buffer_meters: 200,
            features,
            feature_count: features.length,
            endpoint_used: endpoint,
            fetched_at: new Date().toISOString(),
          });
        },
      },
    });
  } catch (err) {
    return json(
      { error: `generation_failed: ${err instanceof Error ? err.message : String(err)}` },
      500
    );
  }

  // ── Persist into route_descriptions_cache (for telemetry + re-display) ────
  // Only cache when we have a saved route — pre-creation flow stays ephemeral.
  // Errors are swallowed: the user already has a usable draft, losing the
  // cache write is recoverable on the next generation.
  if (routeId) {
    try {
      await supa.from("route_descriptions_cache").upsert(
        {
          route_id: routeId,
          language: LANGUAGE,
          description: result.description,
          geometry_hash: result.geometryHash,
          model_used: result.model,
          provider_used: result.provider,
          context_sources: result.sources,
          guardrail_ok: result.guardrails.ok,
          guardrail_warnings: result.guardrails.ok
            ? null
            : {
                unknownQuoted: result.guardrails.unknownQuoted,
                unknownCapitalised: result.guardrails.unknownCapitalised,
              },
          generated_at: new Date().toISOString(),
        },
        { onConflict: "route_id,language" }
      );
    } catch (err) {
      console.warn(
        "[generate-description] cache write failed (non-fatal):",
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return json({
    description: result.description,
    model: result.model,
    provider: result.provider,
    guardrails: result.guardrails,
    sources: result.sources,
    cached: false,
    durationMs: result.totalDurationMs,
  });
}
