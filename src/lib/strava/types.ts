/**
 * Minimal set of Strava API types used by the integration.
 *
 * These mirror the fields documented at
 * https://developers.strava.com/docs/reference/ — we intentionally keep a
 * narrow subset rather than auto-generating the full schema, so that:
 *   1. The type surface stays readable and easy to review for security.
 *   2. Unknown fields from Strava don't silently break our code.
 *
 * Anything we care about but haven't typed yet should be read via
 * the `raw` jsonb column in `public.strava_activities`.
 */

/** Response from POST /oauth/token (both authorization_code and refresh_token). */
export interface StravaTokenResponse {
  token_type: "Bearer";
  access_token: string;
  refresh_token: string;
  /** Unix timestamp in seconds. */
  expires_at: number;
  /** Seconds until expiry, informational. */
  expires_in: number;
  /** Only present on authorization_code exchange. */
  athlete?: StravaAthleteSummary;
  /** Space-separated list of granted scopes. Present on initial grant. */
  scope?: string;
}

export interface StravaAthleteSummary {
  id: number;
  username: string | null;
  firstname: string | null;
  lastname: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  profile: string | null;        // avatar URL (large)
  profile_medium: string | null; // avatar URL (medium)
}

/** Subset of the Strava activity payload we persist. */
export interface StravaActivity {
  id: number;
  athlete: { id: number };
  name: string;
  type: string;             // e.g. "Ride"
  sport_type?: string;      // newer canonical field, e.g. "GravelRide"
  distance: number;         // meters
  moving_time: number;      // seconds
  elapsed_time: number;     // seconds
  total_elevation_gain: number;
  start_date: string;       // ISO 8601
  start_date_local: string;
  timezone?: string;
  start_latlng?: [number, number] | null;
  end_latlng?: [number, number] | null;
  average_speed?: number;   // m/s
  max_speed?: number;       // m/s
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  kudos_count?: number;
  manual: boolean;
  private: boolean;
  commute: boolean;
  trainer: boolean;
  map?: {
    id: string;
    summary_polyline?: string | null;
    polyline?: string | null;
  };
}

/** Payload from POST webhook events. */
export interface StravaWebhookEvent {
  object_type: "activity" | "athlete";
  object_id: number;
  aspect_type: "create" | "update" | "delete";
  owner_id: number;
  subscription_id: number;
  event_time: number;
  updates?: Record<string, string>;
}
