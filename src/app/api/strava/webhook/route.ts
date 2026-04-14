import { NextResponse, type NextRequest } from "next/server";

import { getStravaEnv } from "@/lib/strava/env";
import { createAdminSupabase } from "@/lib/supabase-admin";
import type { StravaWebhookEvent } from "@/lib/strava/types";

/**
 * Strava Webhook endpoint.
 *
 * GET  — subscription verification handshake. Strava POSTs a
 *        subscription request (done once during setup via curl), and
 *        then GETs this endpoint with `?hub.mode=subscribe&hub.verify_token=
 *        ...&hub.challenge=...`. We must echo the challenge back as JSON
 *        when the verify token matches.
 *
 * POST — event delivery. Strava calls this for every activity create/
 *        update/delete on any connected athlete AND for athlete
 *        deauthorization events. This handler MUST respond in under
 *        2 seconds or Strava retries and eventually disables the
 *        subscription — so we do the absolute minimum (validate shape,
 *        insert into strava_events_pending) and let the cron worker
 *        drain the queue asynchronously.
 *
 * There is deliberately NO auth on POST: Strava doesn't sign requests,
 * and the only secret we share is the verify_token used on subscription
 * setup. Since the queue handler re-validates every event against our
 * own connection records, an attacker spamming junk events can at most
 * fill the queue (and that would be rate-limited at the cron side).
 */

export const dynamic = "force-dynamic";

// TODO: Strava integration is temporarily disabled.
//       Set to true and configure env vars to re-enable.
const STRAVA_ENABLED = false;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!STRAVA_ENABLED) {
    return NextResponse.json({ error: "strava_disabled" }, { status: 503 });
  }

  const env = getStravaEnv();
  const params = request.nextUrl.searchParams;

  const mode = params.get("hub.mode");
  const verifyToken = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode !== "subscribe" || !challenge) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Constant-time-ish string compare. String equality is fine here
  // because the verify token is non-secret once subscription is set up
  // (it's in Strava's dashboard), but we still avoid leaking which
  // half mismatched by returning the same status for any failure.
  if (verifyToken !== env.webhookVerifyToken) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({ "hub.challenge": challenge });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!STRAVA_ENABLED) {
    return NextResponse.json({ error: "strava_disabled" }, { status: 503 });
  }

  let event: StravaWebhookEvent;
  try {
    event = (await request.json()) as StravaWebhookEvent;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  // Minimal shape validation. Anything malformed gets dropped with 400
  // — Strava will retry a couple of times then give up, which is fine
  // because the only way to get here with a broken shape is a bug on
  // their side or a malicious caller.
  if (
    !event ||
    typeof event !== "object" ||
    (event.object_type !== "activity" && event.object_type !== "athlete") ||
    typeof event.object_id !== "number" ||
    typeof event.owner_id !== "number" ||
    (event.aspect_type !== "create" &&
      event.aspect_type !== "update" &&
      event.aspect_type !== "delete")
  ) {
    return NextResponse.json({ error: "bad_shape" }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const { error } = await admin.from("strava_events_pending").insert({
    event_type: event.object_type,
    aspect_type: event.aspect_type,
    object_id: event.object_id,
    owner_id: event.owner_id,
    updates: event.updates ?? null,
  });

  if (error) {
    // Return 500 so Strava retries — losing events silently would
    // mean km gaps on the user's profile.
    return NextResponse.json({ error: "enqueue_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
