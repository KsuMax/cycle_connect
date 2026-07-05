import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/secure-compare";
import { runGrabber, type GrabberMode } from "@/lib/grabber/run";

/**
 * Route grabber cron dispatcher.
 *
 * Called by pg_cron via pg_net (see migration 060). The database-side tick
 * passes a Bearer token from Vault (cron_secret); we verify it against
 * process.env.CRON_SECRET before doing anything. Mirrors /api/email-cron.
 *
 * Modes:
 *   "telegram" — poll public Telegram channel previews (hourly).
 *   "forum"    — poll configured IPS forum subforums (daily, crawl-delay 3s).
 *
 * All fetch → filter → LLM-extract → insert logic lives in
 * src/lib/grabber/run.ts; this route is auth + dispatch only.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300; // forum mode can take a few minutes (crawl-delay)

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function checkAuth(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  return safeEqual(header.slice("Bearer ".length), secret);
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
  if (mode !== "telegram" && mode !== "forum") {
    return NextResponse.json({ error: "unknown cron mode" }, { status: 400 });
  }

  try {
    const summary = await runGrabber(mode as GrabberMode);
    return NextResponse.json({ ok: true, mode, summary });
  } catch (err) {
    console.error("[grabber-cron] run failed:", err);
    return NextResponse.json(
      { error: `run failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
