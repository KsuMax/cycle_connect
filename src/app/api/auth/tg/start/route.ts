/**
 * POST /api/auth/tg/start
 *
 * Starts a Telegram login flow. Generates a one-time nonce bound to the
 * client (UA+IP hash), stores it pending, and returns the deep-link URL.
 *
 * The poll endpoint will only release a session token if the polling client
 * matches this fingerprint — so even if the nonce leaks (URL share, screen
 * capture, malicious extension), it's useless from another browser.
 *
 * Returns: { nonce, url, botUsername }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

const NONCE_TTL_MS = 5 * 60 * 1000;

function makeNonce(): string {
  return randomBytes(16).toString("base64url");
}

/** Hash UA + first IP from x-forwarded-for. Stable per-browser, not user-identifying. */
export function clientFingerprint(req: NextRequest): string {
  const ua = req.headers.get("user-agent") ?? "";
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const ip = xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  return createHash("sha256").update(`${ua}|${ip}`).digest("base64url");
}

export async function POST(req: NextRequest) {
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "";
  if (!botUsername) {
    return NextResponse.json({ error: "bot not configured" }, { status: 500 });
  }

  // 10 nonces per IP per hour — far above any legitimate use, low enough to
  // make it unfun to flood tg_login_nonces.
  if (!(await checkRateLimit(rateLimitKey("tg-start", req), 10, 3600))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const nonce = makeNonce();
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS).toISOString();
  const fp = clientFingerprint(req);

  const { error } = await admin
    .from("tg_login_nonces")
    .insert({ nonce, status: "pending", expires_at: expiresAt, client_fp: fp });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    nonce,
    botUsername,
    url: `https://t.me/${botUsername}?start=login_${nonce}`,
  });
}
