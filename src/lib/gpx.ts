export interface GpxPoint {
  lat: number;
  lng: number;
}

export interface GpxGeometry {
  startPoint: GpxPoint | null;
  trackpoints: GpxPoint[];
}

/** Parse a GPX file and extract all trackpoints. */
export async function parseGpxFile(file: File): Promise<GpxGeometry> {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, "application/xml");

  const trkpts = Array.from(doc.querySelectorAll("trkpt, rtept, wpt"));
  const trackpoints: GpxPoint[] = trkpts
    .map((pt) => ({
      lat: parseFloat(pt.getAttribute("lat") ?? ""),
      lng: parseFloat(pt.getAttribute("lon") ?? ""),
    }))
    .filter((pt) => isFinite(pt.lat) && isFinite(pt.lng));

  return {
    startPoint: trackpoints[0] ?? null,
    trackpoints,
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
