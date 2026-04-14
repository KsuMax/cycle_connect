import { NextResponse } from "next/server";

import { createServerSupabase } from "@/lib/supabase-server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { deauthorize } from "@/lib/strava/oauth";
import { getConnectionByUserId } from "@/lib/strava/client";

/**
 * Disconnects the current user's Strava account.
 *
 * Soft delete by design:
 *
 *   1. Call Strava's /oauth/deauthorize (best-effort — swallows failures
 *      because disconnect must still clean up our side even if Strava
 *      is temporarily unavailable or the token is already revoked).
 *   2. Set private.strava_connections.disconnected_at = now(). We keep
 *      the row (and the already-synced strava_activities) so that if
 *      the user reconnects later they don't lose their history.
 *   3. Flip profiles.strava_connected back to false.
 *
 * POST only — this is a state-changing action and we want CSRF protection
 * via the same-origin sameSite cookie (no GET from a random img tag).
 */

export const dynamic = "force-dynamic";

// TODO: Strava integration is temporarily disabled.
//       Set to true and configure env vars to re-enable.
const STRAVA_ENABLED = false;

export async function POST(): Promise<NextResponse> {
  if (!STRAVA_ENABLED) {
    return NextResponse.json({ error: "strava_disabled" }, { status: 503 });
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  // 1. Best-effort deauthorize on Strava's side. We read the current
  //    connection (if any) so we have an access token to hand to Strava.
  //    If there's no connection, we still proceed to clear our flags in
  //    case they got out of sync somehow.
  const conn = await getConnectionByUserId(user.id);
  if (conn) {
    await deauthorize(conn.access_token);
  }

  const admin = createAdminSupabase();

  // 2. Soft-delete the connection row. Keeps refresh_token for audit
  //    but disconnected_at != null makes getConnectionByUserId return
  //    null so subsequent API calls will 401 cleanly.
  const { error: updateError } = await admin
    .from("strava_connections")
    .update({
      disconnected_at: new Date().toISOString(),
      backfill_status: "done",
    })
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: "disconnect_failed" },
      { status: 500 },
    );
  }

  // 3. Flip the profile flag. We deliberately do NOT zero out
  //    strava_synced_km / strava_synced_rides — those numbers stay in
  //    the profile as a record of the rides the user actually did.
  //    Reconnecting will recompute them from the (retained) activities.
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      strava_connected: false,
    })
    .eq("id", user.id);

  if (profileError) {
    return NextResponse.json(
      { error: "profile_update_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
