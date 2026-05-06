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
 * shifts by 180°, and -cos(x−180°) = cos(x) = -(-cos(x))). The forward
 * score is returned as-is (signed); `reverseBetter` flags meaningfully
 * negative results so the UI can suggest flipping the route.
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
  /**
   * Tailwind component in m/s, corrected from 10 m forecast height down to
   * cyclist height (≈1.5 m) via a log-profile factor. Negative = headwind.
   * This is what the rider actually feels.
   */
  tailwindMs: number;
  /** Length share where the wind clearly helps (score > 0.3). */
  tailwindShare: number;
  /** Length share where the wind clearly fights (score < -0.3). */
  headwindShare: number;
  /** True when reversing the route gives a better forward-tailwind component. */
  reverseBetter: boolean;
}

const DEG_TO_RAD = Math.PI / 180;

// Pre-compute trig at the centre of each 10° bucket. Lets scoreWind expand
// cos(wind − seg) = cos(wind)·cos(seg) + sin(wind)·sin(seg) and use only
// two trig calls per invocation instead of one per non-empty bucket.
const BUCKET_COS = new Float64Array(36);
const BUCKET_SIN = new Float64Array(36);
for (let i = 0; i < 36; i++) {
  const a = (i * 10 + 5) * DEG_TO_RAD;
  BUCKET_COS[i] = Math.cos(a);
  BUCKET_SIN[i] = Math.sin(a);
}

// Threshold below which `reverseBetter` stays false: a tiny negative score
// is essentially crosswind, not a reason to flip the route.
const REVERSE_THRESHOLD = -0.1;

// Open-Meteo reports wind at 10 m. A cyclist's torso/handlebar sits near
// 1.5 m, where the wind is slower because of the log boundary layer.
// Using the log profile v(h) = v10·ln(h/z0)/ln(10/z0) with a typical
// mixed-terrain roughness z0 ≈ 0.1 m gives ≈ 0.6; over open fields
// (z0 ≈ 0.03) it's ≈ 0.67. We use 0.7 as a slightly optimistic but honest
// constant — `tailwindMs` (and bands derived from it) report what the
// rider actually feels, not the 10 m number.
const CYCLIST_HEIGHT_FACTOR = 0.7;

export function scoreWind(profile: BearingProfile, wind: HourlyWind): WindScore {
  const total = profile.total_m;
  if (total <= 0 || wind.speed_ms < 0.3) {
    return { score: 0, tailwindMs: 0, tailwindShare: 0, headwindShare: 0, reverseBetter: false };
  }

  const wRad = wind.dir_deg * DEG_TO_RAD;
  const cosW = Math.cos(wRad);
  const sinW = Math.sin(wRad);

  const buckets = profile.buckets;
  let weighted = 0;
  let tailwindM = 0;
  let headwindM = 0;

  for (let i = 0; i < 36; i++) {
    const segLen = buckets[i];
    if (!segLen) continue;

    // tailComponent = -cos(wind - seg) = -(cosW·cosS + sinW·sinS)
    const tailComponent = -(cosW * BUCKET_COS[i] + sinW * BUCKET_SIN[i]);

    weighted += tailComponent * segLen;
    if (tailComponent > 0.3) tailwindM += segLen;
    else if (tailComponent < -0.3) headwindM += segLen;
  }

  const score = weighted / total;
  return {
    score,
    tailwindMs: score * wind.speed_ms * CYCLIST_HEIGHT_FACTOR,
    tailwindShare: tailwindM / total,
    headwindShare: headwindM / total,
    reverseBetter: score < REVERSE_THRESHOLD,
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
 *
 * @deprecated Use `bandOfSlot` for the widget — it factors in wind speed.
 * This overload is kept for unit tests only.
 */
export type WindBand = "tailwind" | "favorable" | "neutral" | "unfavorable" | "headwind";

export function bandOf(score: number): WindBand {
  if (score >= 0.55) return "tailwind";
  if (score >= 0.2) return "favorable";
  if (score > -0.2) return "neutral";
  if (score > -0.55) return "unfavorable";
  return "headwind";
}

/**
 * Speed-weighted band for the heatmap widget.
 *
 * Pure directional score is dimensionless and ignores wind magnitude — a 0.4
 * score at 1 m/s is imperceptible while the same score at 8 m/s is a real
 * assist. We use `tailwindMs` (= score × speed × cyclist-height factor) so
 * bands reflect what the rider actually feels at handlebar height.
 *
 * Thresholds (m/s of felt tailwind component, ≈1.5 m above ground):
 *   tailwind    ≥  1.5   — clearly pushed forward
 *   favorable   ≥  0.6   — noticeable help
 *   neutral    -0.6..0.6 — minimal effect
 *   unfavorable ≤ -0.6   — noticeable drag
 *   headwind    ≤ -1.5   — clearly working against you
 *
 * Forecast wind < 1 m/s at 10 m → always neutral regardless of direction.
 */
export function bandOfSlot(slot: WindScore, speedMs: number): WindBand {
  if (speedMs < 1.0) return "neutral";
  const ms = slot.tailwindMs;
  if (ms >= 1.5) return "tailwind";
  if (ms >= 0.6) return "favorable";
  if (ms > -0.6) return "neutral";
  if (ms > -1.5) return "unfavorable";
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
