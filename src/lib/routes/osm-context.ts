/**
 * Fetch OSM features along a route via Overpass API.
 *
 * Strategy: sample the route into ≤ MAX_SAMPLES points, fire a single Overpass
 * query using the polyline `around:r,lat,lon,lat,lon,...` form so we get a
 * proper corridor (not just disjoint circles). We rotate across public
 * endpoints on failure.
 *
 * Output is raw features — callers project them onto the route for
 * distance_from_start.
 */

import type { LatLng } from "./geometry";
import {
  cumulativeDistancesM,
  haversineMeters,
  projectDistanceFromStartM,
  simplify,
} from "./geometry";

export type OsmFeatureKind =
  | "settlement"
  | "viewpoint"
  | "historic"
  | "amenity"
  | "natural_feature"
  | "landuse_area"
  | "water_area"
  | "waterway"
  | "man_made";

export interface OsmFeature {
  osmId: string;
  osmType: "node" | "way" | "relation";
  kind: OsmFeatureKind;
  lat: number;
  lng: number;
  name?: string;
  tags: Record<string, string>;
}

export interface OsmContext {
  features: OsmFeature[];
  endpoint: string;
  /** Total Overpass response size in bytes (for diagnostics). */
  responseBytes: number;
  durationMs: number;
}

const PUBLIC_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/cgi/interpreter",
];

const SIMPLIFY_TOLERANCE_M = 50;

export interface FetchOsmOptions {
  bufferM?: number;
  /** Overpass query-side timeout (seconds, sent in the query). */
  queryTimeoutS?: number;
  /** Hard client-side abort deadline per endpoint attempt (ms). */
  fetchDeadlineMs?: number;
  endpoints?: string[];
  /** Custom fetch (for tests). */
  fetchImpl?: typeof fetch;
  /** Called once per endpoint attempt with diagnostic info. */
  onAttempt?: (info: { endpoint: string; ok: boolean; ms: number; status?: number; error?: string }) => void;
}

export async function fetchOsmContext(
  points: LatLng[],
  opts: FetchOsmOptions = {}
): Promise<OsmContext> {
  const bufferM = opts.bufferM ?? 200;
  const queryTimeoutS = opts.queryTimeoutS ?? 50;
  const fetchDeadlineMs = opts.fetchDeadlineMs ?? 55_000;
  const endpoints = opts.endpoints ?? PUBLIC_ENDPOINTS;
  const fetchImpl = opts.fetchImpl ?? fetch;

  // Strategy: bbox query (cheap on Overpass) + corridor filter in code.
  // Polyline `around:` is exponentially slower on the public servers.
  const simplified = simplify(points, SIMPLIFY_TOLERANCE_M);
  const cumM = cumulativeDistancesM(simplified);
  const bbox = boundingBox(simplified, bufferM);
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

  const queries = [
    buildOverpassPoiQuery(bboxStr, queryTimeoutS),
    buildOverpassLandscapeQuery(bboxStr, queryTimeoutS),
  ];

  const t0 = Date.now();
  const allFeatures: OsmFeature[] = [];
  let totalBytes = 0;
  let lastEndpoint = "";
  let lastErr: unknown = null;

  for (const query of queries) {
    const result = await runWithFallback(query, endpoints, fetchImpl, fetchDeadlineMs, opts.onAttempt);
    if (result.ok) {
      allFeatures.push(...result.features);
      totalBytes += result.bytes;
      lastEndpoint = result.endpoint;
    } else {
      lastErr = result.error;
    }
  }

  if (allFeatures.length === 0 && lastErr) {
    throw new Error(
      `All Overpass endpoints failed. Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
    );
  }

  // Bbox query brings features outside the corridor too — keep only those
  // whose projection onto the route is within bufferM.
  const corridorFiltered = filterToCorridor(allFeatures, simplified, cumM, bufferM);

  return {
    features: dedupeFeatures(corridorFiltered),
    endpoint: lastEndpoint,
    responseBytes: totalBytes,
    durationMs: Date.now() - t0,
  };
}

function boundingBox(points: LatLng[], padM: number): { south: number; west: number; north: number; east: number } {
  let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
  for (const p of points) {
    if (p.lat < south) south = p.lat;
    if (p.lat > north) north = p.lat;
    if (p.lng < west) west = p.lng;
    if (p.lng > east) east = p.lng;
  }
  const meanLat = (south + north) / 2;
  const padLat = padM / 111_320;
  const padLng = padM / (111_320 * Math.cos((meanLat * Math.PI) / 180));
  return { south: south - padLat, west: west - padLng, north: north + padLat, east: east + padLng };
}

function filterToCorridor(
  features: OsmFeature[],
  points: LatLng[],
  cumM: number[],
  bufferM: number
): OsmFeature[] {
  if (points.length < 2) return features;
  const out: OsmFeature[] = [];
  for (const f of features) {
    // distance from feature to route ≈ distance from feature to its projection
    const projAlongM = projectDistanceFromStartM({ lat: f.lat, lng: f.lng }, points, cumM);
    const projPoint = pointAtDistance(points, cumM, projAlongM);
    if (!projPoint) continue;
    const d = haversineMeters({ lat: f.lat, lng: f.lng }, projPoint);
    if (d <= bufferM) out.push(f);
  }
  return out;
}

function pointAtDistance(points: LatLng[], cumM: number[], targetM: number): LatLng | null {
  if (points.length === 0) return null;
  if (targetM <= 0) return points[0];
  const total = cumM[cumM.length - 1];
  if (targetM >= total) return points[points.length - 1];
  for (let i = 1; i < points.length; i++) {
    if (cumM[i] >= targetM) {
      const segLen = cumM[i] - cumM[i - 1];
      if (segLen === 0) return points[i];
      const t = (targetM - cumM[i - 1]) / segLen;
      return {
        lat: points[i - 1].lat + t * (points[i].lat - points[i - 1].lat),
        lng: points[i - 1].lng + t * (points[i].lng - points[i - 1].lng),
      };
    }
  }
  return points[points.length - 1];
}

interface AttemptResult {
  ok: boolean;
  features: OsmFeature[];
  bytes: number;
  endpoint: string;
  error?: unknown;
}

async function runWithFallback(
  query: string,
  endpoints: string[],
  fetchImpl: typeof fetch,
  fetchDeadlineMs: number,
  onAttempt: FetchOsmOptions["onAttempt"]
): Promise<AttemptResult> {
  const body = new URLSearchParams({ data: query }).toString();
  let lastErr: unknown = null;
  for (const endpoint of endpoints) {
    const tAttempt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), fetchDeadlineMs);
    try {
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
          "user-agent": "cycle-connect/1.0 (https://cycleconnect.cc; route-description-pipeline)",
        },
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        onAttempt?.({ endpoint, ok: false, ms: Date.now() - tAttempt, status: res.status });
        continue;
      }
      const text = await res.text();
      const json = JSON.parse(text);
      const features = parseOverpassElements(json);
      onAttempt?.({ endpoint, ok: true, ms: Date.now() - tAttempt, status: res.status });
      return { ok: true, features, bytes: text.length, endpoint };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastErr = err;
      onAttempt?.({ endpoint, ok: false, ms: Date.now() - tAttempt, error: msg });
      continue;
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, features: [], bytes: 0, endpoint: "", error: lastErr };
}

function dedupeFeatures(features: OsmFeature[]): OsmFeature[] {
  const seen = new Map<string, OsmFeature>();
  for (const f of features) {
    if (!seen.has(f.osmId)) seen.set(f.osmId, f);
  }
  return Array.from(seen.values());
}

function buildOverpassPoiQuery(bbox: string, timeoutS: number): string {
  return `
[out:json][timeout:${timeoutS}][bbox:${bbox}];
(
  node["place"~"^(city|town|village|hamlet|isolated_dwelling)$"];
  node["tourism"~"^(viewpoint|attraction|picnic_site|camp_site|wilderness_hut|alpine_hut)$"];
  node["historic"];
  node["amenity"~"^(cafe|restaurant|fast_food|drinking_water|shelter|bar|pub)$"];
  node["natural"~"^(peak|spring|cave_entrance|waterfall|volcano|saddle)$"];
  node["man_made"~"^(lighthouse|tower|windmill)$"];
  way["historic"]["name"];
  way["waterway"~"^(river|stream|canal)$"]["name"];
);
out center tags;
`.trim();
}

function buildOverpassLandscapeQuery(bbox: string, timeoutS: number): string {
  // Only named landscape features — unnamed forest/farmland polygons explode in
  // size in forested regions and the LLM can't say anything interesting about
  // them anyway ("you pass through forest" is implicit from settlement density).
  return `
[out:json][timeout:${timeoutS}][bbox:${bbox}];
(
  way["natural"~"^(water|wood|wetland|beach|bay|cliff)$"]["name"];
  way["landuse"~"^(forest|farmland|orchard|vineyard)$"]["name"];
  way["place"="island"]["name"];
  way["man_made"~"^(bridge|pier|breakwater)$"]["name"];
);
out center tags;
`.trim();
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function parseOverpassElements(json: unknown): OsmFeature[] {
  if (!json || typeof json !== "object") return [];
  const elements = (json as { elements?: OverpassElement[] }).elements;
  if (!Array.isArray(elements)) return [];

  const out: OsmFeature[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    if (Object.keys(tags).length === 0) continue;

    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat === undefined || lng === undefined) continue;

    const kind = classifyKind(tags);
    if (!kind) continue;

    out.push({
      osmId: `${el.type}/${el.id}`,
      osmType: el.type,
      kind,
      lat,
      lng,
      name: tags.name ?? tags["name:ru"] ?? tags["name:en"],
      tags,
    });
  }
  return out;
}

function classifyKind(tags: Record<string, string>): OsmFeatureKind | null {
  if (tags.place && /^(city|town|village|hamlet|isolated_dwelling)$/.test(tags.place)) {
    return "settlement";
  }
  if (tags.tourism === "viewpoint" || tags.tourism === "attraction" || tags.tourism === "picnic_site" || tags.tourism === "camp_site" || tags.tourism === "wilderness_hut" || tags.tourism === "alpine_hut") {
    return "viewpoint";
  }
  if (tags.historic) return "historic";
  if (tags.amenity && /^(cafe|restaurant|fast_food|drinking_water|shelter|bar|pub)$/.test(tags.amenity)) {
    return "amenity";
  }
  if (tags.natural && /^(peak|spring|cave_entrance|waterfall|volcano|saddle)$/.test(tags.natural)) {
    return "natural_feature";
  }
  if (tags.natural && /^(water|bay)$/.test(tags.natural)) return "water_area";
  if (tags.natural && /^(wood|forest|wetland|beach|cliff)$/.test(tags.natural)) {
    return "landuse_area";
  }
  if (tags.landuse) return "landuse_area";
  if (tags.waterway) return "waterway";
  if (tags.man_made && /^(lighthouse|tower|windmill|bridge|pier|breakwater)$/.test(tags.man_made)) {
    return "man_made";
  }
  return null;
}
