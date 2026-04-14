import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createServerSupabase } from "@/lib/supabase-server";
import { buildAuthorizeUrl } from "@/lib/strava/oauth";

/**
 * Starts the Strava OAuth flow.
 *
 * Accepts either GET (easy to trigger from a simple `<a>` link) or POST
 * (standard HTML form). Both behave identically:
 *
 *   1. Require a signed-in CycleConnect user.
 *   2. Generate a CSRF nonce, stash it in an httpOnly cookie.
 *   3. 302 to the Strava consent screen with the nonce as `state`.
 *
 * The companion handler at /api/strava/callback verifies the nonce on
 * the way back. If the cookie is missing or doesn't match, we treat the
 * callback as forged and bail out.
 */

export const dynamic = "force-dynamic";

// TODO: Strava integration is temporarily disabled.
//       Set to true and configure env vars (STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, etc.) to re-enable.
const STRAVA_ENABLED = false;

const STATE_COOKIE = "strava_oauth_state";
const STATE_COOKIE_MAX_AGE = 60 * 10; // 10 minutes

async function startOAuth(): Promise<NextResponse> {
  if (!STRAVA_ENABLED) {
    return NextResponse.json({ error: "strava_disabled" }, { status: 503 });
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    const loginUrl = new URL(
      "/auth/login",
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    );
    loginUrl.searchParams.set("redirect", "/profile/settings");
    return NextResponse.redirect(loginUrl);
  }

  // Crypto-strong nonce. We prefix with the user id so that if the
  // callback somehow arrives with a cookie that belongs to another
  // session, we can still detect the mismatch at verification time.
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const state = `${user.id}.${nonce}`;

  const authorizeUrl = buildAuthorizeUrl(state);

  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_COOKIE_MAX_AGE,
  });

  return NextResponse.redirect(authorizeUrl);
}

export async function GET(): Promise<NextResponse> {
  return startOAuth();
}

export async function POST(): Promise<NextResponse> {
  return startOAuth();
}
