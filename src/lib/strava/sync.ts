import "server-only";

import { createAdminSupabase } from "@/lib/supabase-admin";
import {
  stravaFetchWithConnection,
  StravaNotConnectedError,
  type StravaConnection,
} from "./client";
import type { StravaActivity } from "./types";

/**
 * Core sync routines called by the webhook queue processor and the
 * initial backfill. Kept in its own module so that the Route Handlers
 * stay thin (auth + dispatch) and the actual Strava-side logic can be
 * unit-tested independently later.
 *
 * Security note: nothing in here logs access tokens, raw request
 * headers, or the `raw` activity payload. Error messages are short
 * strings safe to persist in strava_events_pending.error.
 */

/**
 * Shapes a Strava API activity into the row we store in
 * public.strava_activities. Keeps the mapping in one place so the
 * webhook processor and the backfill produce identical rows.
 */
function mapActivityToRow(
  activity: StravaActivity,
  userId: string,
  athleteId: number,
) {
  return {
    id: activity.id,
    user_id: userId,
    athlete_id: athleteId,

    type: activity.type,
    sport_type: activity.sport_type ?? activity.type,
    name: activity.name,

    distance_m: activity.distance,
    moving_time_s: activity.moving_time,
    elapsed_time_s: activity.elapsed_time,
    total_elevation_gain_m: activity.total_elevation_gain ?? null,
    average_speed_ms: activity.average_speed ?? null,
    max_speed_ms: activity.max_speed ?? null,
    average_heartrate: activity.average_heartrate ?? null,
    max_heartrate: activity.max_heartrate ?? null,
    average_watts: activity.average_watts ?? null,
    kudos_count: activity.kudos_count ?? 0,

    start_date: activity.start_date,
    timezone: activity.timezone ?? null,
    start_latlng:
      activity.start_latlng && activity.start_latlng.length === 2
        ? activity.start_latlng
        : null,
    end_latlng:
      activity.end_latlng && activity.end_latlng.length === 2
        ? activity.end_latlng
        : null,
    summary_polyline: activity.map?.summary_polyline ?? null,

    is_manual: activity.manual,
    is_private: activity.private,
    is_commute: activity.commute,
    is_trainer: activity.trainer,

    // Indoor trainer rides are stored but not counted toward km totals.
    // Type filter (Ride / GravelRide) is applied inside recompute_strava_stats.
    is_counted: !activity.trainer,

    raw: activity as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Fetches a single activity from Strava and upserts it into
 * public.strava_activities. Returns the sport type so callers can
 * decide whether to log a feed entry etc.
 *
 * Does NOT call recompute_strava_stats — the caller is expected to
 * call it once per affected user after a batch of activity changes.
 */
export async function syncActivity(
  conn: StravaConnection,
  activityId: number,
): Promise<{ type: string; isCounted: boolean } | null> {
  const activity = await stravaFetchWithConnection<StravaActivity>(
    conn,
    `/activities/${activityId}`,
  );

  // Strava's activity owner should always match the connection athlete.
  // If it doesn't, something is very wrong — refuse to write, the cron
  // will retry or surface the error.
  if (activity.athlete?.id !== conn.athlete_id) {
    throw new Error(
      `activity ${activityId} owner ${activity.athlete?.id} != connection athlete ${conn.athlete_id}`,
    );
  }

  const row = mapActivityToRow(activity, conn.user_id, conn.athlete_id);

  const admin = createAdminSupabase();
  const { error } = await admin
    .from("strava_activities")
    .upsert(row, { onConflict: "id" });

  if (error) {
    throw new Error(`upsert strava_activities failed: ${error.message}`);
  }

  return { type: activity.type, isCounted: row.is_counted };
}

/**
 * Deletes a single activity from our cache. Strava sends
 * aspect_type='delete' events when a user deletes a ride on their end.
 */
export async function deleteActivity(
  userId: string,
  activityId: number,
): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("strava_activities")
    .delete()
    .eq("id", activityId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`delete strava_activities failed: ${error.message}`);
  }
}

/**
 * Pulls the athlete's activities from the last `days` days and upserts
 * each one. Used by the connect-time backfill so a fresh user sees
 * their recent history immediately instead of only rides going forward.
 *
 * We page through /athlete/activities with per_page=100 until we get
 * a short page. Activities older than the cutoff are discarded server-
 * side via the `after` param, so realistically we'll pull 1–3 pages
 * for a typical user.
 */
export async function backfillActivities(
  conn: StravaConnection,
  days: number,
): Promise<{ upserted: number }> {
  const admin = createAdminSupabase();

  // Mark the connection as running so the UI can show a spinner.
  await admin
    .from("strava_connections")
    .update({ backfill_status: "running", backfill_error: null })
    .eq("user_id", conn.user_id);

  const afterUnix = Math.floor((Date.now() - days * 86_400_000) / 1000);

  let upserted = 0;
  const perPage = 100;

  try {
    for (let page = 1; page <= 10; page++) {
      const activities = await stravaFetchWithConnection<StravaActivity[]>(
        conn,
        "/athlete/activities",
        { query: { after: afterUnix, per_page: perPage, page } },
      );

      if (!Array.isArray(activities) || activities.length === 0) break;

      const rows = activities.map((a) =>
        mapActivityToRow(a, conn.user_id, conn.athlete_id),
      );

      const { error } = await admin
        .from("strava_activities")
        .upsert(rows, { onConflict: "id" });

      if (error) {
        throw new Error(`backfill upsert failed: ${error.message}`);
      }

      upserted += rows.length;

      // Short page → we're done.
      if (activities.length < perPage) break;
    }

    await admin
      .from("strava_connections")
      .update({
        backfill_status: "done",
        last_sync_at: new Date().toISOString(),
      })
      .eq("user_id", conn.user_id);

    // Recompute aggregates once at the end.
    await recomputeStats(conn.user_id);

    return { upserted };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    await admin
      .from("strava_connections")
      .update({
        backfill_status: "error",
        backfill_error: message.slice(0, 500),
      })
      .eq("user_id", conn.user_id);
    throw err;
  }
}

/**
 * Runs the SQL helper that refreshes profiles.strava_synced_km /
 * strava_synced_rides / strava_last_activity_at for a single user.
 * Safe to call repeatedly — it's a straight UPDATE based on the
 * current rows in strava_activities.
 */
export async function recomputeStats(userId: string): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.rpc("recompute_strava_stats", {
    p_user_id: userId,
  });
  if (error) {
    throw new Error(`recompute_strava_stats failed: ${error.message}`);
  }
}

/**
 * Handles an `athlete` event with `authorized=false` — the user clicked
 * "Revoke access" in their Strava settings. We mark the connection
 * disconnected and flip the profile flag; we do NOT delete stored
 * activities (they remain so stats survive).
 */
export async function handleAthleteDeauth(athleteId: number): Promise<void> {
  const admin = createAdminSupabase();

  const { data: conn, error: selectError } = await admin
    .from("strava_connections")
    .select("user_id")
    .eq("athlete_id", athleteId)
    .maybeSingle();

  if (selectError) {
    throw new Error(`lookup connection failed: ${selectError.message}`);
  }
  if (!conn) {
    // Already gone — nothing to do.
    return;
  }

  await admin
    .from("strava_connections")
    .update({ disconnected_at: new Date().toISOString() })
    .eq("athlete_id", athleteId);

  await admin
    .from("profiles")
    .update({ strava_connected: false })
    .eq("id", conn.user_id);
}

export { StravaNotConnectedError };
