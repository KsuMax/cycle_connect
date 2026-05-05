/**
 * GET /api/auth/tg/poll?nonce=...
 *
 * Polled by the browser while the user is over in Telegram. States:
 *   pending  → { status: "pending" }
 *   ready    → mints a magiclink token_hash for the linked auth.user, marks the nonce
 *              consumed, returns { status: "ready", tokenHash, email }. The browser
 *              hands the token to /auth/callback, which calls verifyOtp to set the session.
 *   expired  → { status: "expired" }
 *   missing  → { status: "missing" }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const nonce = req.nextUrl.searchParams.get("nonce");
  if (!nonce) return NextResponse.json({ error: "nonce required" }, { status: 400 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: row } = await admin
    .from("tg_login_nonces")
    .select("status, user_id, expires_at")
    .eq("nonce", nonce)
    .maybeSingle();

  if (!row) return NextResponse.json({ status: "missing" });

  if (new Date(row.expires_at as string).getTime() < Date.now()) {
    return NextResponse.json({ status: "expired" });
  }

  if (row.status === "consumed") {
    return NextResponse.json({ status: "expired" });
  }

  if (row.status !== "ready" || !row.user_id) {
    return NextResponse.json({ status: "pending" });
  }

  const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(
    row.user_id as string
  );
  if (userErr || !userRes.user?.email) {
    return NextResponse.json({ status: "expired" });
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userRes.user.email,
  });
  if (linkErr || !linkData.properties?.hashed_token) {
    return NextResponse.json({ error: "could not mint session" }, { status: 500 });
  }

  await admin
    .from("tg_login_nonces")
    .update({ status: "consumed" })
    .eq("nonce", nonce);

  return NextResponse.json({
    status: "ready",
    tokenHash: linkData.properties.hashed_token,
    email: userRes.user.email,
  });
}
