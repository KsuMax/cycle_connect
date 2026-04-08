import "server-only";

import { createAdminSupabase } from "@/lib/supabase-admin";
import { refreshAccessToken } from "./oauth";

const STRAVA_API_BASE = "https://www.strava.com/api/v3";

/**
 * Rows from private.strava_connections. We keep the shape narrow and
 * explicit here because the table lives in a schema the normal typing
 * codegen won't see.
 */
export interface StravaConnection {
  user_id: string;
  athlete_id: number;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string;
  backfill_status: "pending" | "running" | "done" | "error";
}

export class StravaNotConnectedError extends Error {
  constructor(userId: string) {
    super(`Strava is not connected for user ${userId}`);
    this.name = "StravaNotConnectedError";
  }
}

export class StravaRateLimitError extends Error {
  constructor() {
    super("Strava rate limit reached (HTTP 429)");
    this.name = "StravaRateLimitError";
  }
}

export class StravaApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Strava API error ${status}: ${body}`);
    this.name = "StravaApiError";
  }
}

/**
 * Fetches the connection row for a given CycleConnect user. Returns null
 * when the user has never connected Strava or has been disconnected.
 */
export async function getConnectionByUserId(
  userId: string,
): Promise<StravaConnection | null> {
  const admin = createAdminSupabase();

  const { data, error } = await admin
    .schema("private")
    .from("strava_connections")
    .select(
      "user_id, athlete_id, access_token, refresh_token, expires_at, scope, backfill_status, disconnected_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read strava_connections: ${error.message}`);
  }

  if (!data || data.disconnected_at !== null) return null;

  return data as StravaConnection;
}

/**
 * Looks up a connection by Strava athlete id. Used by the webhook
 * handler, which only knows the athlete id (owner_id in the event).
 */
export async function getConnectionByAthleteId(
  athleteId: number,
): Promise<StravaConnection | null> {
  const admin = createAdminSupabase();

  const { data, error } = await admin
    .schema("private")
    .from("strava_connections")
    .select(
      "user_id, athlete_id, access_token, refresh_token, expires_at, scope, backfill_status, disconnected_at",
    )
    .eq("athlete_id", athleteId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read strava_connections: ${error.message}`);
  }

  if (!data || data.disconnected_at !== null) return null;

  return data as StravaConnection;
}

/**
 * Ensures the connection row has a non-expired access token. If the token
 * expires within the next minute, we refresh it via Strava and persist the
 * new pair (Strava rotates refresh tokens on every refresh).
 *
 * Returns the fresh access token that the caller should use.
 */
export async function ensureFreshAccessToken(
  conn: StravaConnection,
): Promise<string> {
  const expiresAtMs = Date.parse(conn.expires_at);
  const now = Date.now();
  const earlyRefreshWindowMs = 60_000; // 1 minute

  if (expiresAtMs - now > earlyRefreshWindowMs) {
    return conn.access_token;
  }

  const refreshed = await refreshAccessToken(conn.refresh_token);
  const admin = createAdminSupabase();

  const { error } = await admin
    .schema("private")
    .from("strava_connections")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
    })
    .eq("user_id", conn.user_id);

  if (error) {
    throw new Error(
      `Failed to persist refreshed Strava tokens: ${error.message}`,
    );
  }

  // Keep the in-memory object consistent for the current call stack.
  conn.access_token = refreshed.access_token;
  conn.refresh_token = refreshed.refresh_token;
  conn.expires_at = new Date(refreshed.expires_at * 1000).toISOString();

  return refreshed.access_token;
}

interface StravaFetchOptions extends Omit<RequestInit, "body"> {
  /** Optional JSON body (will be serialised and content-type set). */
  json?: unknown;
  /** Search params to append to the URL. */
  query?: Record<string, string | number | undefined>;
}

/**
 * Authenticated fetch against the Strava API for a specific user.
 * Automatically refreshes expired tokens, retries exactly once on 401.
 *
 * Throws {@link StravaNotConnectedError} if the user has no active
 * connection, {@link StravaRateLimitError} on 429, or
 * {@link StravaApiError} on any other non-2xx.
 *
 * IMPORTANT: this function never logs request/response headers or bodies
 * to avoid leaking tokens through error reporters.
 */
export async function stravaFetch<T = unknown>(
  userId: string,
  path: string,
  options: StravaFetchOptions = {},
): Promise<T> {
  const conn = await getConnectionByUserId(userId);
  if (!conn) throw new StravaNotConnectedError(userId);

  return stravaFetchWithConnection<T>(conn, path, options);
}

/**
 * Same as {@link stravaFetch} but accepts an already-loaded connection.
 * Useful in the webhook processor where we already fetched the connection
 * by athlete id.
 */
export async function stravaFetchWithConnection<T = unknown>(
  conn: StravaConnection,
  path: string,
  options: StravaFetchOptions = {},
): Promise<T> {
  const { json, query, headers: extraHeaders, ...rest } = options;

  const url = new URL(STRAVA_API_BASE + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const doFetch = async (accessToken: string) => {
    const headers = new Headers(extraHeaders as HeadersInit | undefined);
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("Accept", "application/json");
    if (json !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    return fetch(url, {
      ...rest,
      headers,
      body: json !== undefined ? JSON.stringify(json) : undefined,
      cache: "no-store",
    });
  };

  let accessToken = await ensureFreshAccessToken(conn);
  let res = await doFetch(accessToken);

  if (res.status === 401) {
    // Access token may have been revoked out-of-band. Force a refresh
    // and retry exactly once.
    conn.expires_at = new Date(0).toISOString();
    accessToken = await ensureFreshAccessToken(conn);
    res = await doFetch(accessToken);
  }

  if (res.status === 429) {
    throw new StravaRateLimitError();
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    throw new StravaApiError(res.status, body);
  }

  // Route handlers typically expect JSON; callers that don't should
  // check the content-type themselves via a plain fetch.
  return (await res.json()) as T;
}
