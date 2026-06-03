/**
 * Geometry helpers for route analysis: distance, simplification, projection.
 *
 * Self-contained — no external geo libs. All distances in meters unless
 * explicitly suffixed with Km.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Distance from start to each point, in meters. cum[0] === 0. */
export function cumulativeDistancesM(points: LatLng[]): number[] {
  const cum = new Array<number>(points.length);
  cum[0] = 0;
  for (let i = 1; i < points.length; i++) {
    cum[i] = cum[i - 1] + haversineMeters(points[i - 1], points[i]);
  }
  return cum;
}

/**
 * Douglas–Peucker simplification on lat/lng using a Cartesian approximation
 * (good enough for tolerances up to a few hundred meters at mid-latitudes).
 * Tolerance is in meters.
 */
export function simplify<T extends LatLng>(points: T[], toleranceM: number): T[] {
  if (points.length < 3) return points.slice();

  const meanLat = (points[0].lat + points[points.length - 1].lat) / 2;
  const cosLat = Math.cos(toRad(meanLat));
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * cosLat;

  const project = (p: LatLng) => ({
    x: p.lng * mPerDegLng,
    y: p.lat * mPerDegLat,
  });

  const projected = points.map(project);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    if (end - start < 2) continue;

    const a = projected[start];
    const b = projected[end];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLenSq = dx * dx + dy * dy;

    let maxDist = -1;
    let maxIdx = -1;
    for (let i = start + 1; i < end; i++) {
      const p = projected[i];
      let dist: number;
      if (segLenSq === 0) {
        const px = p.x - a.x;
        const py = p.y - a.y;
        dist = Math.sqrt(px * px + py * py);
      } else {
        const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / segLenSq;
        const tClamped = Math.max(0, Math.min(1, t));
        const projX = a.x + tClamped * dx;
        const projY = a.y + tClamped * dy;
        const ex = p.x - projX;
        const ey = p.y - projY;
        dist = Math.sqrt(ex * ex + ey * ey);
      }
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }

    if (maxDist > toleranceM && maxIdx !== -1) {
      keep[maxIdx] = 1;
      stack.push([start, maxIdx]);
      stack.push([maxIdx, end]);
    }
  }

  const out: T[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/**
 * Evenly sample the route by distance so neighbouring samples are at most
 * `maxSpacingM` apart. Always includes first and last point.
 */
export function sampleByDistance<T extends LatLng>(
  points: T[],
  cumM: number[],
  maxSpacingM: number
): T[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [points[0]];

  const total = cumM[cumM.length - 1];
  const steps = Math.max(1, Math.ceil(total / maxSpacingM));
  const stepM = total / steps;

  const out: T[] = [points[0]];
  let nextTarget = stepM;
  let i = 1;
  while (i < points.length && out.length <= steps) {
    if (cumM[i] >= nextTarget) {
      out.push(points[i]);
      nextTarget += stepM;
    }
    i++;
  }
  if (out[out.length - 1] !== points[points.length - 1]) {
    out.push(points[points.length - 1]);
  }
  return out;
}

/**
 * Project a single point onto the polyline and return the distance from the
 * start (meters) of the projection foot. Linear scan — fine for routes up to
 * a few thousand points.
 */
export function projectDistanceFromStartM(
  target: LatLng,
  points: LatLng[],
  cumM: number[]
): number {
  if (points.length === 0) return 0;
  if (points.length === 1) return 0;

  const meanLat = points[Math.floor(points.length / 2)].lat;
  const cosLat = Math.cos(toRad(meanLat));
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * cosLat;

  const tx = target.lng * mPerDegLng;
  const ty = target.lat * mPerDegLat;

  let bestDistSq = Infinity;
  let bestProjAlong = 0;

  for (let i = 1; i < points.length; i++) {
    const ax = points[i - 1].lng * mPerDegLng;
    const ay = points[i - 1].lat * mPerDegLat;
    const bx = points[i].lng * mPerDegLng;
    const by = points[i].lat * mPerDegLat;
    const dx = bx - ax;
    const dy = by - ay;
    const segLenSq = dx * dx + dy * dy;

    let t = 0;
    if (segLenSq > 0) {
      t = ((tx - ax) * dx + (ty - ay) * dy) / segLenSq;
      t = Math.max(0, Math.min(1, t));
    }
    const projX = ax + t * dx;
    const projY = ay + t * dy;
    const ex = tx - projX;
    const ey = ty - projY;
    const distSq = ex * ex + ey * ey;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      const segLen = Math.sqrt(segLenSq);
      bestProjAlong = cumM[i - 1] + t * segLen;
    }
  }

  return bestProjAlong;
}
