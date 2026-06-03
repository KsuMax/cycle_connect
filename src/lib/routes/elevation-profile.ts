/**
 * Elevation profile analysis for cycling routes.
 *
 * Takes trackpoints with optional elevations and emits:
 *   - smoothed totals (gain/loss) tolerant of GPS noise
 *   - detected climbs with gradient and category
 *   - overall profile type (flat → mountainous)
 *
 * No I/O, no network — pure.
 */

import { cumulativeDistancesM, type LatLng } from "./geometry";

export interface ElePoint extends LatLng {
  ele?: number;
}

export type ProfileType = "flat" | "rolling" | "hilly" | "mountainous";
export type ClimbCategory = "easy" | "moderate" | "hard" | "extreme";

export interface Climb {
  startKm: number;
  endKm: number;
  lengthKm: number;
  gainM: number;
  avgGradientPct: number;
  maxGradientPct: number;
  category: ClimbCategory;
}

export interface ElevationProfile {
  /** True if the GPX actually had elevations. */
  hasElevation: boolean;
  /** True if absolute values look suspect (e.g., uncalibrated barometric altimeter). */
  elevationUncalibrated: boolean;
  totalGainM: number;
  totalLossM: number;
  /** Null when uncalibrated — only deltas (gain/loss) are trustworthy. */
  minEleM: number | null;
  maxEleM: number | null;
  profile: ProfileType;
  climbs: Climb[];
  longestClimbKm: number;
  steepestGradientPct: number;
  /** Sum of climb gain divided by total distance — used to classify profile. */
  gainPerKm: number;
}

const CLIMB_MIN_GRADIENT_PCT = 2;
const CLIMB_MIN_LENGTH_M = 500;
const CLIMB_MIN_GAIN_M = 30;
const END_CLIMB_GRADIENT_PCT = 0.8;
const SMOOTH_WINDOW_M = 100; // physical distance over which to smooth elevation
/** Resample interval — elevation profile is reconstructed at this spacing
 * regardless of how dense or sparse the original GPX is. */
const RESAMPLE_INTERVAL_M = 50;
/** Gradient window — how far ahead/behind to look when computing a gradient. */
const GRADIENT_WINDOW_M = 200;

function rollingMean(values: number[], windowSamples: number): number[] {
  const out = new Array<number>(values.length);
  const half = Math.floor(windowSamples / 2);
  for (let i = 0; i < values.length; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(values.length - 1, i + half);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += values[j];
    out[i] = sum / (hi - lo + 1);
  }
  return out;
}

/**
 * Resample raw (cumM, ele) pairs onto a uniform grid spaced `intervalM` apart.
 * Returns elevation values along the grid; index i corresponds to distance
 * `i * intervalM` from start.
 */
function resampleElevation(cumM: number[], ele: number[], intervalM: number): number[] {
  const total = cumM[cumM.length - 1];
  const numSamples = Math.max(2, Math.floor(total / intervalM) + 1);
  const out = new Array<number>(numSamples);
  let j = 0;
  for (let i = 0; i < numSamples; i++) {
    const targetM = i * intervalM;
    while (j < cumM.length - 1 && cumM[j + 1] < targetM) j++;
    if (j >= cumM.length - 1) {
      out[i] = ele[ele.length - 1];
      continue;
    }
    const segLen = cumM[j + 1] - cumM[j];
    const t = segLen > 0 ? (targetM - cumM[j]) / segLen : 0;
    out[i] = ele[j] + t * (ele[j + 1] - ele[j]);
  }
  return out;
}

function categorizeClimb(gainM: number, avgGradientPct: number): ClimbCategory {
  // Simple heuristic mirroring road-cycling intuition.
  const score = gainM * avgGradientPct;
  if (score < 200) return "easy";
  if (score < 800) return "moderate";
  if (score < 2500) return "hard";
  return "extreme";
}

function classifyProfile(gainPerKm: number): ProfileType {
  if (gainPerKm < 6) return "flat";
  if (gainPerKm < 15) return "rolling";
  if (gainPerKm < 28) return "hilly";
  return "mountainous";
}

export function analyzeElevation(points: ElePoint[]): ElevationProfile {
  const empty: ElevationProfile = {
    hasElevation: false,
    elevationUncalibrated: false,
    totalGainM: 0,
    totalLossM: 0,
    minEleM: null,
    maxEleM: null,
    profile: "flat",
    climbs: [],
    longestClimbKm: 0,
    steepestGradientPct: 0,
    gainPerKm: 0,
  };

  if (points.length < 2) return empty;

  const hasEle = points.some((p) => typeof p.ele === "number" && isFinite(p.ele));
  if (!hasEle) return empty;

  // Fill missing elevations by linear interpolation between known neighbours.
  const ele = points.map((p) => (typeof p.ele === "number" && isFinite(p.ele) ? p.ele : NaN));
  for (let i = 0; i < ele.length; i++) {
    if (!isNaN(ele[i])) continue;
    let prev = i - 1;
    while (prev >= 0 && isNaN(ele[prev])) prev--;
    let next = i + 1;
    while (next < ele.length && isNaN(ele[next])) next++;
    if (prev < 0 && next >= ele.length) ele[i] = 0;
    else if (prev < 0) ele[i] = ele[next];
    else if (next >= ele.length) ele[i] = ele[prev];
    else {
      const t = (i - prev) / (next - prev);
      ele[i] = ele[prev] + t * (ele[next] - ele[prev]);
    }
  }

  const cumM = cumulativeDistancesM(points);
  const totalM = cumM[cumM.length - 1];

  // Resample onto a uniform 50 m grid — gives the climb detector consistent
  // behaviour regardless of original GPX point density.
  const grid = resampleElevation(cumM, ele, RESAMPLE_INTERVAL_M);
  const smoothWindow = Math.max(3, Math.round(SMOOTH_WINDOW_M / RESAMPLE_INTERVAL_M) | 1);
  const smoothed = rollingMean(grid, smoothWindow);

  let totalGainM = 0;
  let totalLossM = 0;
  let minEleM = Infinity;
  let maxEleM = -Infinity;
  for (let i = 0; i < smoothed.length; i++) {
    if (smoothed[i] < minEleM) minEleM = smoothed[i];
    if (smoothed[i] > maxEleM) maxEleM = smoothed[i];
    if (i === 0) continue;
    const d = smoothed[i] - smoothed[i - 1];
    if (d > 0) totalGainM += d;
    else totalLossM += -d;
  }

  // Uncalibrated barometric altimeters can report negative absolute heights
  // even on land. Deltas are still correct, but we don't trust min/max.
  const elevationUncalibrated = maxEleM < 0 || minEleM < -50;

  // Climb detection on the resampled grid using a fixed-distance gradient
  // window — independent of original trackpoint density.
  const climbs = detectClimbsOnGrid(smoothed, RESAMPLE_INTERVAL_M);

  const gainPerKm = totalM > 0 ? totalGainM / (totalM / 1000) : 0;
  const profile = classifyProfile(gainPerKm);
  const longestClimbKm = climbs.reduce((a, c) => Math.max(a, c.lengthKm), 0);
  const steepest = climbs.reduce((a, c) => Math.max(a, c.maxGradientPct), 0);

  return {
    hasElevation: true,
    elevationUncalibrated,
    totalGainM: Math.round(totalGainM),
    totalLossM: Math.round(totalLossM),
    minEleM: elevationUncalibrated ? null : Math.round(minEleM),
    maxEleM: elevationUncalibrated ? null : Math.round(maxEleM),
    profile,
    climbs,
    longestClimbKm,
    steepestGradientPct: steepest,
    gainPerKm: round1(gainPerKm),
  };
}

/**
 * Detect sustained climbs on a uniformly-spaced elevation grid. Uses a fixed
 * 200 m gradient window so the threshold has consistent meaning regardless of
 * how the source GPX was sampled.
 */
function detectClimbsOnGrid(grid: number[], intervalM: number): Climb[] {
  if (grid.length < 4) return [];

  const windowSamples = Math.max(2, Math.round(GRADIENT_WINDOW_M / intervalM));
  // gradient[i] = % gradient between sample i and sample i+windowSamples
  const gradient = new Array<number>(grid.length);
  for (let i = 0; i < grid.length; i++) {
    const j = Math.min(grid.length - 1, i + windowSamples);
    const dx = (j - i) * intervalM;
    const dy = grid[j] - grid[i];
    gradient[i] = dx > 0 ? (dy / dx) * 100 : 0;
  }

  const climbs: Climb[] = [];
  let i = 0;
  while (i < gradient.length) {
    if (gradient[i] < CLIMB_MIN_GRADIENT_PCT) {
      i++;
      continue;
    }
    const startIdx = i;
    let endIdx = i;
    let maxGrad = gradient[i];
    let belowExitRunM = 0;
    let j = i + 1;
    while (j < gradient.length) {
      if (gradient[j] > maxGrad) maxGrad = gradient[j];
      if (gradient[j] < END_CLIMB_GRADIENT_PCT) {
        belowExitRunM += intervalM;
        if (belowExitRunM > 300) break;
      } else {
        belowExitRunM = 0;
        endIdx = j;
      }
      j++;
    }

    const lengthM = (endIdx - startIdx) * intervalM;
    const gainM = grid[endIdx] - grid[startIdx];
    const avgGrad = lengthM > 0 ? (gainM / lengthM) * 100 : 0;

    if (lengthM >= CLIMB_MIN_LENGTH_M && gainM >= CLIMB_MIN_GAIN_M && avgGrad >= CLIMB_MIN_GRADIENT_PCT) {
      climbs.push({
        startKm: round1((startIdx * intervalM) / 1000),
        endKm: round1((endIdx * intervalM) / 1000),
        lengthKm: round1(lengthM / 1000),
        gainM: Math.round(gainM),
        avgGradientPct: round1(avgGrad),
        maxGradientPct: round1(maxGrad),
        category: categorizeClimb(gainM, avgGrad),
      });
    }

    i = endIdx + 1;
  }

  return climbs;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
