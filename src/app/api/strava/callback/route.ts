import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";

import { createServerSupabase } from "@/lib/supabase-server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { exchangeCodeForTokens } from "@/lib/strava/oauth";

/**
 * Finishes the Strava OAuth flow.
 *
 * Strava redirects the user's browser here with `?code=...&state=...` on
 * success, or `?error=access_denied` if they declined. We:
 *
 *   1. Verify the current session and pull the signed-in user.
 *   2. Verify the `state` parameter matches the httpOnly cookie we set
 *      in /api/strava/connect and that it belongs to THIS user.
 *   3. Exchange the code for tokens via Strava's /oauth/token endpoint.
 *   4. Store tokens in the private.strava_connections table using the
 *      service_role client (the normal client doesn't have access).
 *   5. Flip profiles.strava_connected to true and record athlete_id.
 *   6. Enqueue a "backfill" pseudo-event that the cron worker will pick
 *      up on the next tick to pull the last ~30 days of activities.
 *   7. Redirect to /profile?strava=connected with a friendly toast.
 *
 * All error paths redirect to /profile/settings?strava_error=<code> with
 * no stack traces exposed.
 */

export const dynamic = "force-dynamic";

const STATE_COOKIE = "strava_oauth_state";
const BACKFILL_DAYS = 30;

function errorRedirect(code: string): NextResponse {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL("/profile/settings", appUrl);
  url.searchParams.set("strava_error", code);
  return NextResponse.redirect(url);
}

function successRedirect(): NextResponse {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL("/profile", appUrl);
  url.searchParams.set("strava", "connected");
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;

  // 0. Short-circuit on "user declined" — Strava redirects with ?error=
  //    when the user clicks Cancel on the consent screen.
  const stravaError = searchParams.get("error");
  if (stravaError) {
    return errorRedirect(stravaError === "access_denied" ? "denied" : "strava");
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) {
    return errorRedirect("missing_params");
  }

  // 1. Who is calling? The callback runs in the browser's session, so
  //    the signed-in user should still be the one who initiated connect.
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return errorRedirect("not_signed_in");
  }

  // 2. Verify the state cookie matches — protects against CSRF and
  //    against a stale callback belonging to a different user.
  const cookieStore = await cookies();
  const storedState = cookieStore.get(STATE_COOKIE)?.value;
  if (!storedState || storedState !== state) {
    return errorRedirect("state_mismatch");
  }
  const [statePrefixUserId] = state.split(".");
  if (statePrefixUserId !== user.id) {
    return errorRedirect("state_user_mismatch");
  }

  // 3. Exchange the authorization code for tokens.
  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch {
    return errorRedirect("token_exchange");
  }

  if (!tokens.athlete) {
    return errorRedirect("no_athlete");
  }

  // 4 + 5. Persist tokens and flip the profile flag. Both writes go
  //         through the admin client because profiles.strava_connected
  //         is not writable by the user, and private.* is invisible to
  //         anon/authenticated roles.
  const admin = createAdminSupabase();

  const expiresAtIso = new Date(tokens.expires_at * 1000).toISOString();

  const { error: upsertError } = await admin
    .schema("private")
    .from("strava_connections")
    .upsert(
      {
        user_id: user.id,
        athlete_id: tokens.athlete.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAtIso,
        scope: tokens.scope ?? "read,activity:read",
        connected_at: new Date().toISOString(),
        disconnected_at: null,
        backfill_status: "pending",
        backfill_error: null,
      },
      { onConflict: "user_id" },
    );

  if (upsertError) {
    return errorRedirect("storage");
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      strava_connected: true,
      strava_athlete_id: tokens.athlete.id,
    })
    .eq("id", user.id);

  if (profileError) {
    return errorRedirect("profile_update");
  }

  // 6. Enqueue a backfill pseudo-event. The cron worker recognises
  //    aspect_type='backfill' and pulls the last ~30 days instead of a
  //    single activity. owner_id = athlete_id gives it a handle to
  //    resolve the connection later.
  const { error: enqueueError } = await admin
    .from("strava_events_pending")
    .insert({
      event_type: "activity",
      aspect_type: "backfill",
      object_id: BACKFILL_DAYS,
      owner_id: tokens.athlete.id,
      updates: null,
    });

  if (enqueueError) {
    // Backfill failing to enqueue shouldn't block connect — the user
    // is connected, new activities will flow via webhook anyway, and
    // they can hit "Sync now" later. Log nothing sensitive.
  }

  // 7. Clean up the state cookie and redirect home.
  cookieStore.set(STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return successRedirect();
}
