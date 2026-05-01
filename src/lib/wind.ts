/**
 * Wind-aware route scoring.
 *
 * A route's `BearingProfile` is a 36-bucket histogram of how many meters of
 * the route head in each 10° slice of the compass (bucket i covers bearings
 * [i·10°, (i+1)·10°), measured clockwise from north).
 *
 * Wind direction follows meteorology: it is the direction the wind blows
 * FROM. So if the wind is `from = 270°` (a westerly) and you're heading
 * east (bearing 90°), the wind pushes you forward — full tailwind.
 *
 * The directional score in [-1, +1] is the length-weighted average of
 *
 *     -cos((windFrom − segmentBearing) · π/180)
 *
 * which evaluates to +1 for perfect tailwind, −1 for perfect headwind,
 * and 0 for pure crosswind.
 *
 * Identity: reversing the route negates the score (each segment's bearing
 * shifts by 180°, and -cos(x−180°) = cos(x) = -(-cos(x))). So we always
 * compute the forward score and report the absolute value plus a "reverse?"
 * hint when it's negative.
 */

export interface BearingProfile {
  /** Length 36, meters per 10° bucket starting from north and going clockwise. */
  buckets: number[];
  total_m: number;
}

export interface HourlyWind {
  /** ISO-8601 hour, UTC. */
  ts: string;
  /** Meteorological "from" direction, degrees 0..360. */
  dir_deg: number;
  /** 10-m wind speed in m/s. */
  speed_ms: number;
}

export interface WindScore {
  /** Directional alignment in [-1, +1]: +1 = full tailwind, -1 = full headwind. */
  score: number;
  /** Tailwind component in m/s (score · speed). Negative = headwind. */
  tailwindMs: number;
  /** Length share where the wind clearly helps (score > 0.3). */
  tailwindShare: number;
  /** Length share where the wind clearly fights (score < -0.3). */
  headwindShare: number;
  /** True when reversing the route gives a better forward-tailwind component. */
  reverseBetter: boolean;
}

const DEG_TO_RAD = Math.PI / 180;

export function scoreWind(profile: BearingProfile, wind: HourlyWind): WindScore {
  const total = profile.total_m;
  if (total <= 0 || wind.speed_ms < 0.3) {
    return { score: 0, tailwindMs: 0, tailwindShare: 0, headwindShare: 0, reverseBetter: false };
  }

  let weighted = 0;
  let tailwindM = 0;
  let headwindM = 0;

  for (let i = 0; i < 36; i++) {
    const segLen = profile.buckets[i] ?? 0;
    if (segLen === 0) continue;

    const segBearing = i * 10 + 5; // bucket center
    const tailComponent = -Math.cos((wind.dir_deg - segBearing) * DEG_TO_RAD);

    weighted += tailComponent * segLen;
    if (tailComponent > 0.3) tailwindM += segLen;
    else if (tailComponent < -0.3) headwindM += segLen;
  }

  const score = weighted / total;
  return {
    score,
    tailwindMs: score * wind.speed_ms,
    tailwindShare: tailwindM / total,
    headwindShare: headwindM / total,
    reverseBetter: score < 0,
  };
}

/**
 * Round an ISO time down to the hour for cache lookup.
 *
 * Forecast points are emitted on the hour in UTC; this lets us match
 * `start_time` to the matching forecast row without interpolation.
 */
export function floorToHourUTC(ts: Date | string): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  const floored = new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), 0, 0, 0,
  ));
  return floored.toISOString();
}

/**
 * Map a directional score to a discrete band for UI colour bucketing.
 * Bands chosen so that pure crosswind (~0) lands in `neutral` and only
 * meaningful headwinds/tailwinds register as red/green.
 */
export type WindBand = "tailwind" | "favorable" | "neutral" | "unfavorable" | "headwind";

export function bandOf(score: number): WindBand {
  if (score >= 0.55) return "tailwind";
  if (score >= 0.2) return "favorable";
  if (score > -0.2) return "neutral";
  if (score > -0.55) return "unfavorable";
  return "headwind";
}

/** UI tokens mirror the existing pastel palette used elsewhere in the app. */
export const BAND_COLORS: Record<WindBand, { bg: string; fg: string; label: string }> = {
  tailwind:    { bg: "#DCFCE7", fg: "#15803D", label: "Попутный" },
  favorable:   { bg: "#ECFCCB", fg: "#65A30D", label: "Скорее попутный" },
  neutral:     { bg: "#F4F4F5", fg: "#71717A", label: "Боковой" },
  unfavorable: { bg: "#FFEDD5", fg: "#C2410C", label: "Скорее встречный" },
  headwind:    { bg: "#FEE2E2", fg: "#B91C1C", label: "Встречный" },
};
