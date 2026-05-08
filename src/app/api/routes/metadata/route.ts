/**
 * POST /api/routes/metadata
 *
 * Extracts POI tags and season months from a route's description via LLM
 * and writes them back to the `routes` table.
 *
 * Body:
 *   { id: string }        — enrich a single route (caller must own it)
 *   { all: true }         — backfill all routes with empty poi_tags (admin only)
 *   { limit?: number }    — batch size for backfill (default 50, max 200)
 *
 * Auth:
 *   Single-route:  authenticated user who owns the route.
 *   Backfill:      admin only (profiles.is_admin = true).
 *
 * This endpoint mirrors the pattern of /api/routes/embed intentionally.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { extractRouteMetadata } from "@/lib/metadata/extract";
import { warmUpOllama } from "@/lib/llm/ollama-chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // backfill batches can take a while

// ─── Supabase helpers ─────────────────────────────────────────────────────────

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getCaller() {
  const cookieStore = await cookies();
  const auth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await auth.auth.getUser();
  return user;
}

// ─── Row type ─────────────────────────────────────────────────────────────────

interface RouteRow {
  id: string;
  author_id: string;
  title: string | null;
  description: string | null;
  tags: string[] | null;
}

const COLUMNS = "id, author_id, title, description, tags";

// ─── Core enrichment ──────────────────────────────────────────────────────────

async function enrichRows(rows: RouteRow[]): Promise<{ count: number; skipped: number }> {
  if (!rows.length) return { count: 0, skipped: 0 };

  // Warm up Ollama before the loop so the first real call doesn't pay the
  // cold-load cost (~5 s on this VPS) and then timeout.
  warmUpOllama();
  // Give the model 6 s to load before we start sending extraction prompts.
  await new Promise((r) => setTimeout(r, 6_000));

  const sb = admin();
  let count = 0;
  let skipped = 0;

  for (const row of rows) {
    const meta = await extractRouteMetadata(
      row.title ?? "",
      row.description ?? "",
      row.tags ?? [],
    );

    // Skip update if LLM returned nothing useful (avoids overwriting with empty data)
    if (meta.poi_tags.length === 0 && meta.season_months === null) {
      skipped++;
      continue;
    }

    const { error } = await sb
      .from("routes")
      .update({
        poi_tags:      meta.poi_tags,
        season_months: meta.season_months,
      })
      .eq("id", row.id);

    if (error) {
      console.error(`[metadata] update failed for ${row.id}:`, error.message);
      skipped++;
    } else {
      count++;
    }
  }

  return { count, skipped };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getCaller();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as {
    id?: string;
    all?: boolean;
    limit?: number;
  };
  const sb = admin();

  // ── Backfill mode — admin only ──────────────────────────────────────────────
  if (body.all === true) {
    const { data: profile } = await sb
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.is_admin) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const limit = typeof body.limit === "number" ? Math.min(body.limit, 200) : 50;

    // Select routes that have never been processed (empty poi_tags array)
    const { data, error } = await sb
      .from("routes")
      .select(COLUMNS)
      .eq("poi_tags", "{}")   // Supabase: matches empty array literal
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    try {
      const result = await enrichRows((data ?? []) as RouteRow[]);
      return NextResponse.json({ ...result, mode: "backfill", total: (data ?? []).length });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "extraction failed" },
        { status: 500 },
      );
    }
  }

  // ── Single-route mode — caller must own the route ───────────────────────────
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: route, error } = await sb
    .from("routes")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error || !route) {
    return NextResponse.json({ error: "route not found" }, { status: 404 });
  }
  if ((route as RouteRow).author_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const { count, skipped } = await enrichRows([route as RouteRow]);
    return NextResponse.json({ ok: true, count, skipped });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "extraction failed" },
      { status: 500 },
    );
  }
}
