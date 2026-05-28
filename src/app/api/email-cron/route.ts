import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";

/**
 * Email cron dispatcher.
 *
 * Called by pg_cron via pg_net (see migration 053). The database-side tick
 * passes a Bearer token from Vault (cron_secret); we verify it against
 * process.env.CRON_SECRET before doing anything.
 *
 * Supported modes (passed as JSON body):
 *   - "event_hour_reminder" — emails to participants of events starting
 *     in ~60 min (cron runs every 30 min).
 *   - "event_post_report"   — emails to participants of events that ended
 *     ~24 h ago, prompting them to leave a ride report.
 *
 * This route is intentionally thin: auth + dispatch only. All business
 * logic (DB queries, idempotency, SMTP) lives in the email-notify edge
 * function so there's a single source of truth for email sending.
 */

export const dynamic = "force-dynamic";

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function checkAuth(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  return header.slice("Bearer ".length) === secret;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!checkAuth(request)) return unauthorized();

  let body: { mode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { mode } = body;
  if (!mode) return NextResponse.json({ error: "mode required" }, { status: 400 });

  const allowed = ["event_hour_reminder", "event_post_report", "weekly_digest"];
  if (!allowed.includes(mode)) {
    return NextResponse.json({ error: "unknown cron mode" }, { status: 400 });
  }

  // Invoke the email-notify edge function with the service role key.
  // The edge function detects that the Bearer token matches the service
  // role key and grants cron-level access (no user JWT needed).
  const admin = createAdminSupabase();
  const { data, error } = await admin.functions.invoke("email-notify", {
    body: { mode },
  });

  if (error) {
    console.error("[email-cron] edge function error:", error);
    return NextResponse.json({ error: "edge function failed", detail: String(error) }, { status: 500 });
  }

  return NextResponse.json(data ?? { ok: true });
}
