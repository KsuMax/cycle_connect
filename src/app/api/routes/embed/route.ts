/**
 * POST /api/routes/embed
 *
 * Body: { id: string }            — single route (owner or admin)
 *       { all: true }             — backfill routes with no embedding (admin)
 *       { reindex: true }         — re-embed ALL routes, cursor-paginated (admin)
 *         optional: { limit: number, after_id: string }
 *
 * Auth: authenticated user must own the route, OR be admin for bulk modes.
 *       Service role is used for the actual write.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { embedPassages, routeEmbeddingText, toPgVector } from "@/lib/embeddings/jina";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface RouteRow {
  id: string;
  author_id: string;
  title: string | null;
  description: string | null;
  region: string | null;
  difficulty: string | null;
  tags: string[] | null;
  surface: string[] | null;
  route_types: string[] | null;
  bike_types: string[] | null;
  distance_km: number | null;
  elevation_m: number | null;
  poi_tags: string[] | null;
  season_months: number[] | null;
}

const COLUMNS =
  "id, author_id, title, description, region, difficulty, tags, surface, route_types, bike_types, distance_km, elevation_m, poi_tags, season_months";

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

async function embedRows(rows: RouteRow[]) {
  if (!rows.length) return { count: 0 };
  const texts = rows.map(routeEmbeddingText);
  const vectors = await embedPassages(texts);
  const sb = admin();
  const now = new Date().toISOString();

  for (let i = 0; i < rows.length; i++) {
    await sb
      .from("routes")
      .update({
        embedding: toPgVector(vectors[i]),
        embedding_updated_at: now,
      })
      .eq("id", rows[i].id);
  }
  return { count: rows.length };
}

export async function POST(req: NextRequest) {
  const user = await getCaller();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const sb = admin();

  // ── Admin bulk modes ──────────────────────────────────────────────────────
  if (body.all === true || body.reindex === true) {
    const { data: profile } = await sb
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.is_admin) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const limit = typeof body.limit === "number" ? Math.min(body.limit, 50) : 50;
    const afterId: string | null = typeof body.after_id === "string" ? body.after_id : null;

    let q = sb.from("routes").select(COLUMNS).order("id").limit(limit);

    if (body.reindex === true) {
      // Re-embed all routes in id order; caller advances cursor with after_id
      if (afterId) q = q.gt("id", afterId);
    } else {
      // Backfill: only routes missing an embedding
      q = q.is("embedding", null);
      if (afterId) q = q.gt("id", afterId);
    }

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as RouteRow[];
    if (!rows.length) {
      return NextResponse.json({ count: 0, done: true, mode: body.reindex ? "reindex" : "backfill" });
    }

    try {
      const result = await embedRows(rows);
      const lastId = rows[rows.length - 1].id;
      return NextResponse.json({
        ...result,
        done: rows.length < limit,
        next_after_id: rows.length === limit ? lastId : null,
        mode: body.reindex ? "reindex" : "backfill",
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "embed failed" },
        { status: 500 },
      );
    }
  }

  // ── Single-route mode — caller must own the route ─────────────────────────
  const id = typeof body.id === "string" ? body.id : "";
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
    await embedRows([route as RouteRow]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "embed failed" },
      { status: 500 },
    );
  }
}
