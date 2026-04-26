export interface GpxPoint {
  lat: number;
  lng: number;
  ele?: number;
  time?: number; // Unix ms
}

export interface GpxGeometry {
  startPoint: GpxPoint | null;
  trackpoints: GpxPoint[];
}

export interface GpxStats {
  distanceKm: number;
  elevationM: number;
  durationMin: number;
}

/** Parse a GPX file and extract all trackpoints. */
export async function parseGpxFile(file: File): Promise<GpxGeometry> {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, "application/xml");

  // Prioritise one point type to avoid doubling distance when a GPX contains
  // both <trkpt> (recorded track) and <rtept> (route waypoints) for the same path.
  let ptEls = Array.from(doc.querySelectorAll("trkpt"));
  if (ptEls.length === 0) ptEls = Array.from(doc.querySelectorAll("rtept"));
  if (ptEls.length === 0) ptEls = Array.from(doc.querySelectorAll("wpt"));

  const trackpoints: GpxPoint[] = ptEls
    .map((pt) => {
      const lat = parseFloat(pt.getAttribute("lat") ?? "");
      const lng = parseFloat(pt.getAttribute("lon") ?? "");
      const eleEl = pt.querySelector("ele");
      const timeEl = pt.querySelector("time");
      return {
        lat,
        lng,
        ele: eleEl ? parseFloat(eleEl.textContent ?? "") : undefined,
        time: timeEl ? new Date(timeEl.textContent ?? "").getTime() : undefined,
      };
    })
    .filter((pt) => isFinite(pt.lat) && isFinite(pt.lng));

  return {
    startPoint: trackpoints[0] ?? null,
    trackpoints,
  };
}

function haversineKm(a: GpxPoint, b: GpxPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const c =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
}

/** Compute distance, elevation gain, and duration from trackpoints. */
export function computeGpxStats(trackpoints: GpxPoint[]): GpxStats {
  if (trackpoints.length < 2) return { distanceKm: 0, elevationM: 0, durationMin: 0 };

  let distanceKm = 0;
  let elevationM = 0;

  for (let i = 1; i < trackpoints.length; i++) {
    distanceKm += haversineKm(trackpoints[i - 1], trackpoints[i]);
    const prev = trackpoints[i - 1].ele;
    const curr = trackpoints[i].ele;
    if (prev !== undefined && curr !== undefined && isFinite(prev) && isFinite(curr)) {
      const diff = curr - prev;
      if (diff > 0) elevationM += diff;
    }
  }

  const first = trackpoints[0];
  const last = trackpoints[trackpoints.length - 1];
  let durationMin = 0;
  if (first.time !== undefined && last.time !== undefined && isFinite(first.time) && isFinite(last.time)) {
    durationMin = Math.round((last.time - first.time) / 60000);
  } else {
    // Estimate at 15 km/h average cycling speed
    durationMin = Math.round((distanceKm / 15) * 60);
  }

  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    elevationM: Math.round(elevationM),
    durationMin,
  };
}

/** WKT POINT string for PostGIS (longitude first per WKS convention). */
export function toWktPoint(lat: number, lng: number): string {
  return `POINT(${lng} ${lat})`;
}

/**
 * WKT LINESTRING sampled to at most maxPoints to keep payload small.
 * Returns null if fewer than 2 trackpoints.
 */
export function toWktLinestring(trackpoints: GpxPoint[], maxPoints = 300): string | null {
  if (trackpoints.length < 2) return null;

  const step = Math.max(1, Math.floor(trackpoints.length / maxPoints));
  const sampled: GpxPoint[] = trackpoints.filter((_, i) => i % step === 0);

  // Always include the last point so the route end is represented.
  const last = trackpoints[trackpoints.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);

  const coords = sampled.map((p) => `${p.lng} ${p.lat}`).join(", ");
  return `LINESTRING(${coords})`;
}
