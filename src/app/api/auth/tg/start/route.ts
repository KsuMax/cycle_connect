/**
 * POST /api/auth/tg/start
 *
 * Starts a Telegram login flow. Generates a one-time nonce, stores it pending,
 * and returns the deep-link URL the browser should open in a new tab.
 *
 * Returns: { nonce, url, botUsername }
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

const NONCE_TTL_MS = 5 * 60 * 1000;

function makeNonce(): string {
  return randomBytes(16).toString("base64url");
}

export async function POST() {
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "";
  if (!botUsername) {
    return NextResponse.json({ error: "bot not configured" }, { status: 500 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const nonce = makeNonce();
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS).toISOString();

  const { error } = await admin
    .from("tg_login_nonces")
    .insert({ nonce, status: "pending", expires_at: expiresAt });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    nonce,
    botUsername,
    url: `https://t.me/${botUsername}?start=login_${nonce}`,
  });
}
