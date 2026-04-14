import { NextResponse, type NextRequest } from "next/server";

import { createAdminSupabase } from "@/lib/supabase-admin";
import {
  getConnectionByAthleteId,
  StravaRateLimitError,
} from "@/lib/strava/client";
import {
  backfillActivities,
  deleteActivity,
  handleAthleteDeauth,
  recomputeStats,
  syncActivity,
} from "@/lib/strava/sync";

/**
 * Queue drainer for Strava webhook events.
 *
 * Invoked once a minute by pg_cron via pg_net (see migration 006). The
 * database-side tick passes a Bearer token from Vault; we compare it
 * against process.env.CRON_SECRET before doing anything. Anyone who
 * can GET/POST this endpoint without the secret gets a flat 401.
 *
 * On each run:
 *   1. Pull up to BATCH_SIZE unprocessed events, oldest first.
 *   2. For each, resolve the Strava athlete_id → our user_id via
 *      private.strava_connections. Events for unknown athletes are
 *      dropped (marked processed with an error note) — they're almost
 *      always stragglers after a user disconnected.
 *   3. Dispatch on (event_type, aspect_type):
 *        activity.create / update  → fetch + upsert
 *        activity.delete           → delete local row
 *        activity.backfill         → run N-day backfill (pseudo event
 *                                    enqueued by /connect/callback)
 *        athlete.update + updates.authorized=false → mark disconnected
 *   4. Mark the event processed on success, otherwise bump retry_count
 *      and persist the short error string.
 *   5. Stop early if we hit 429 from Strava — the next minute's tick
 *      will retry and the queue will catch up.
 *   6. After the batch, recompute_strava_stats once per touched user.
 *
 * Notes:
 * - Batch size is small (BATCH_SIZE=20) to stay well inside Vercel's
 *   request budget; pg_cron fires every minute, so 20/min = 1200/hour
 *   which is far more than a realistic fleet of athletes will produce.
 * - We never log raw tokens or raw activity payloads. Error strings
 *   are truncated before being written back to the queue row.
 */

export const dynamic = "force-dynamic";

// TODO: Strava integration is temporarily disabled.
//       Set to true and configure env vars to re-enable.
const STRAVA_ENABLED = false;

const BATCH_SIZE = 20;
const MAX_RETRIES = 5;

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function checkAuth(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  return header.slice(prefix.length) === secret;
}

interface PendingEvent {
  id: number;
  event_type: string;
  aspect_type: string;
  object_id: number;
  owner_id: number;
  updates: Record<string, string> | null;
  retry_count: number;
}

async function handler(request: NextRequest): Promise<NextResponse> {
  if (!checkAuth(request)) return unauthorized();

  const admin = createAdminSupabase();

  const { data: events, error: selectError } = await admin
    .from("strava_events_pending")
    .select(
      "id, event_type, aspect_type, object_id, owner_id, updates, retry_count",
    )
    .is("processed_at", null)
    .lt("retry_count", MAX_RETRIES)
    .order("received_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (selectError) {
    return NextResponse.json(
      { error: "queue_read_failed", detail: selectError.message },
      { status: 500 },
    );
  }

  if (!events || events.length === 0) {
    return NextResponse.json({ processed: 0, remaining: 0 });
  }

  const touchedUserIds = new Set<string>();
  let processed = 0;
  let rateLimited = false;

  for (const event of events as PendingEvent[]) {
    if (rateLimited) break;

    try {
      // Resolve athlete → connection for every event type except
      // athlete-deauth (where we still need to find the row by athlete
      // id, but via a different helper that doesn't early-return on
      // disconnected_at).
      const isAthleteDeauth =
        event.event_type === "athlete" &&
        event.aspect_type === "update" &&
        event.updates?.authorized === "false";

      if (isAthleteDeauth) {
        await handleAthleteDeauth(event.owner_id);
        await markProcessed(event.id);
        processed++;
        continue;
      }

      const conn = await getConnectionByAthleteId(event.owner_id);
      if (!conn) {
        // Straggler — user disconnected. Mark processed so we stop
        // retrying; leave a note for debugging.
        await markProcessed(event.id, "no_active_connection");
        processed++;
        continue;
      }

      if (event.event_type === "activity") {
        if (event.aspect_type === "backfill") {
          // object_id is the number of days (set by /callback).
          await backfillActivities(conn, event.object_id);
          touchedUserIds.add(conn.user_id);
        } else if (
          event.aspect_type === "create" ||
          event.aspect_type === "update"
        ) {
          await syncActivity(conn, event.object_id);
          touchedUserIds.add(conn.user_id);
        } else if (event.aspect_type === "delete") {
          await deleteActivity(conn.user_id, event.object_id);
          touchedUserIds.add(conn.user_id);
        } else {
          await markProcessed(event.id, `unknown_aspect:${event.aspect_type}`);
          processed++;
          continue;
        }
      } else {
        // athlete.* events we don't care about (e.g. athlete profile
        // updates). Just ack.
        await markProcessed(event.id, "ignored_athlete_event");
        processed++;
        continue;
      }

      await markProcessed(event.id);
      processed++;
    } catch (err) {
      if (err instanceof StravaRateLimitError) {
        // Strava is telling us to back off. Don't mark this event
        // processed — it'll be picked up on the next tick.
        rateLimited = true;
        break;
      }
      const message = err instanceof Error ? err.message : "unknown";
      await bumpRetry(event.id, event.retry_count, message);
    }
  }

  // Recompute once per touched user, not once per event — cheaper and
  // avoids thrashing profiles.strava_synced_km on multi-event bursts.
  for (const userId of touchedUserIds) {
    try {
      await recomputeStats(userId);
    } catch {
      // Don't fail the whole tick over a recompute error — the stats
      // will be corrected on the next successful event for that user.
    }
  }

  return NextResponse.json({
    processed,
    rate_limited: rateLimited,
    touched_users: touchedUserIds.size,
  });
}

async function markProcessed(id: number, errorNote?: string): Promise<void> {
  const admin = createAdminSupabase();
  await admin
    .from("strava_events_pending")
    .update({
      processed_at: new Date().toISOString(),
      error: errorNote ?? null,
    })
    .eq("id", id);
}

async function bumpRetry(
  id: number,
  currentRetries: number,
  message: string,
): Promise<void> {
  const admin = createAdminSupabase();
  const next = currentRetries + 1;
  await admin
    .from("strava_events_pending")
    .update({
      retry_count: next,
      error: message.slice(0, 500),
      // Mark as processed (final failure) once we hit MAX_RETRIES so
      // the row stops getting picked up.
      processed_at: next >= MAX_RETRIES ? new Date().toISOString() : null,
    })
    .eq("id", id);
}

// pg_cron's http_post hits us with POST. We also accept GET so an
// operator can manually drain the queue with curl during incident
// response — still gated by CRON_SECRET.
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!STRAVA_ENABLED) return NextResponse.json({ ok: true, skipped: "strava_disabled" });
  return handler(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!STRAVA_ENABLED) return NextResponse.json({ ok: true, skipped: "strava_disabled" });
  return handler(request);
}
