import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { runGrabberSource } from "@/lib/grabber/run";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";
export const maxDuration = 120; // a forum source can take ~45s (3s crawl-delay per topic)

/**
 * POST /api/admin/grabber/sources/[id]/run — "Проверить" button.
 *
 * Runs just this one source right now instead of waiting for the hourly/
 * daily cron. Auth check here (RLS on grabber_sources doesn't grant a
 * write path for this), the actual fetch/insert work reuses the same
 * service-role code path as the cron job (src/lib/grabber/run.ts).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const summary = await runGrabberSource(id);
  return NextResponse.json({ summary });
}
