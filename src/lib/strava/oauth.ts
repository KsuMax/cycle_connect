import "server-only";

import { getStravaEnv } from "./env";
import type { StravaTokenResponse } from "./types";

const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/api/v3/oauth/token";
const STRAVA_DEAUTH_URL = "https://www.strava.com/oauth/deauthorize";

/**
 * Scopes we request for Sprint 1.
 *
 *  - `read`             base profile info (required)
 *  - `activity:read`    non-private activities the user has shared with
 *                       Everyone or Followers. NO private-activity access —
 *                       we deliberately keep Sprint 1 scope small so the
 *                       consent screen isn't scary for users.
 *
 * If we ever need private activities or writing activities, add
 * `activity:read_all` / `activity:write` here — but also update the
 * privacy-notice copy everywhere first.
 */
export const STRAVA_SCOPES = ["read", "activity:read"] as const;

/**
 * Builds the URL the browser should be redirected to in order to start
 * the Strava OAuth consent flow. The `state` parameter is a CSRF nonce
 * that MUST be verified on the way back by the callback route.
 */
export function buildAuthorizeUrl(state: string): string {
  const env = getStravaEnv();

  const url = new URL(STRAVA_AUTH_URL);
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", env.redirectUri);
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", STRAVA_SCOPES.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

/**
 * Exchanges the one-time authorization code from Strava's callback for
 * a long-lived refresh token and a short-lived access token.
 *
 * Throws on non-2xx so the caller can translate into a user-facing error.
 */
export async function exchangeCodeForTokens(
  code: string,
): Promise<StravaTokenResponse> {
  const env = getStravaEnv();

  const body = new URLSearchParams({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    code,
    grant_type: "authorization_code",
  });

  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    // Never cache token exchanges.
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "<unreadable>");
    throw new Error(
      `Strava token exchange failed: ${res.status} ${res.statusText} — ${text}`,
    );
  }

  return (await res.json()) as StravaTokenResponse;
}

/**
 * Uses a refresh_token to mint a new access_token / refresh_token pair.
 * Strava rotates refresh tokens on every refresh, so the caller MUST
 * persist the returned refresh_token back to storage.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<StravaTokenResponse> {
  const env = getStravaEnv();

  const body = new URLSearchParams({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "<unreadable>");
    throw new Error(
      `Strava token refresh failed: ${res.status} ${res.statusText} — ${text}`,
    );
  }

  return (await res.json()) as StravaTokenResponse;
}

/**
 * Tells Strava to revoke the access token so the user sees the app removed
 * from their authorized apps list. Best-effort: we don't fail disconnect
 * if the call 4xxs (the token may already be invalid).
 */
export async function deauthorize(accessToken: string): Promise<void> {
  try {
    await fetch(STRAVA_DEAUTH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });
  } catch {
    // Swallow — disconnect should still clean up our side even if
    // Strava's side is temporarily unavailable.
  }
}
