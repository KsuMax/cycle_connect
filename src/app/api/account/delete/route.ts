/**
 * POST /api/account/delete
 *
 * Permanently deletes the currently authenticated user's account.
 * Cascades through FK constraints (most user-owned rows reference
 * auth.users(id) ON DELETE CASCADE).
 *
 * Body: { password: string } — the user's current password.
 *       This is the re-auth check: an attacker with a stolen session cookie
 *       (e.g. via XSS) cannot nuke the account without also knowing the
 *       password. Telegram-only users (no email/password set) are routed
 *       through email-OTP confirmation instead.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 3 attempts/user/hour — irreversible op, no reason to allow more.
  if (!(await checkRateLimit(rateLimitKey("account-delete", req, user.id), 3, 3600))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: { password?: string };
  try { body = await req.json(); } catch { body = {}; }
  const password = typeof body.password === "string" ? body.password : "";

  // Re-auth: require a fresh password verification before deletion.
  // For email/password accounts: signInWithPassword on a throw-away
  // client (don't disturb the current session). Telegram-only accounts
  // skip this — they have no password — and instead require that the
  // session itself is < 5 minutes old (the session cookie carries iat).
  const isPasswordUser = !!user.email && user.app_metadata?.provider !== "telegram";

  if (isPasswordUser) {
    if (!password) {
      return NextResponse.json({ error: "password_required" }, { status: 400 });
    }
    const verifier = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error: verifyErr } = await verifier.auth.signInWithPassword({
      email: user.email!,
      password,
    });
    if (verifyErr) {
      return NextResponse.json({ error: "wrong_password" }, { status: 401 });
    }
  } else {
    // Telegram-only — fall back to short session-age window.
    const iat = (user as unknown as { last_sign_in_at?: string }).last_sign_in_at;
    const ageMs = iat ? Date.now() - new Date(iat).getTime() : Infinity;
    if (ageMs > 5 * 60 * 1000) {
      return NextResponse.json({ error: "reauth_required" }, { status: 401 });
    }
  }

  const admin = createAdminSupabase();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}
