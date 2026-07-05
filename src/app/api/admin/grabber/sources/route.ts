import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

const ALLOWED_TYPES = ["telegram-preview", "ips-forum"];

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) return { supabase, error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };

  return { supabase, error: null };
}

/**
 * POST /api/admin/grabber/sources — { type, identifier, label? }
 *
 * Adds a source for /admin/grabber's "Проверить" button and the hourly/
 * daily cron to pick up. New sources start with an empty cursor, so their
 * first run backfills whatever's on the first page.
 */
export async function POST(req: NextRequest) {
  const { supabase, error } = await requireAdmin();
  if (error) return error;

  let body: { type?: string; identifier?: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const type = body.type;
  const identifier = body.identifier?.trim();
  const label = body.label?.trim() || null;

  if (!type || !ALLOWED_TYPES.includes(type)) {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }
  if (!identifier) {
    return NextResponse.json({ error: "identifier required" }, { status: 400 });
  }

  const { data, error: insertErr } = await supabase
    .from("grabber_sources")
    .insert({ type, identifier, label })
    .select("id, type, identifier, label, enabled, cursor, last_run_at, last_error")
    .single();

  if (insertErr) {
    const status = insertErr.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: insertErr.message }, { status });
  }

  return NextResponse.json({ source: data });
}
