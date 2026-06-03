/**
 * Assemble the structured narrative context that gets fed to the LLM.
 *
 * The schema is intentionally human-readable JSON — small enough to fit in a
 * short prompt, ordered by distance from start so the model can write the
 * description top-to-bottom without re-sorting.
 */

import type { Climb, ElevationProfile, ProfileType } from "./elevation-profile";
import type { ElevationSource } from "./enrich-elevation";
import { cumulativeDistancesM, projectDistanceFromStartM, type LatLng } from "./geometry";
import type { OsmFeature, OsmFeatureKind } from "./osm-context";

const SEGMENT_LENGTH_KM = 5;

export type DominantLandscape =
  | "forest"
  | "open_farmland"
  | "meadow"
  | "water_dominant"
  | "settlement"
  | "wetland"
  | "mountain"
  | "mixed";

export interface NamedFeature {
  km: number;
  kind: OsmFeatureKind;
  name: string;
  /** Raw subtype, e.g. "viewpoint", "monastery", "river". */
  subtype?: string;
}

/**
 * Author-curated marker from the GPX (`<wpt>` element). Higher trust than OSM
 * because the route author placed it themselves. Comes in via MapMagic exports
 * with types like Viewpoint, Ford, Attention, Marker.
 */
export type AuthorWaypointKind =
  | "viewpoint"
  | "hazard"
  | "ford"
  | "landmark"
  | "marker";

export interface AuthorWaypoint {
  km: number;
  kind: AuthorWaypointKind;
  name?: string;
  description?: string;
  /** Raw <type> string from the GPX, kept verbatim for diagnostics. */
  rawType?: string;
}

export interface Segment {
  fromKm: number;
  toKm: number;
  dominantLandscape: DominantLandscape;
  /** Counts per landscape kind in this segment — lets LLM see if it's "mostly forest" or "mixed". */
  landscapeCounts: Partial<Record<DominantLandscape, number>>;
  settlements: string[];
  namedFeatures: NamedFeature[];
  climbsInSegment: Array<Pick<Climb, "startKm" | "endKm" | "gainM" | "avgGradientPct" | "category">>;
}

export interface NarrativeContext {
  language: string;
  summary: {
    distanceKm: number;
    gainM: number;
    lossM: number;
    minEleM: number | null;
    maxEleM: number | null;
    profile: ProfileType;
    hasElevation: boolean;
    elevationUncalibrated: boolean;
    elevationSource: ElevationSource;
  };
  climbs: Climb[];
  segments: Segment[];
  amenities: {
    waterSources: NamedFeature[];
    cafesAndFood: NamedFeature[];
    shelters: NamedFeature[];
  };
  /** All settlements in order of first appearance along the route. */
  settlementsAlongRoute: Array<{ name: string; km: number; place: string }>;
  /** Named waterways crossed/followed. */
  namedWaterways: Array<{ name: string; km: number }>;
  /** Author-placed waypoints from the GPX, projected onto the route. */
  authorWaypoints: AuthorWaypoint[];
  warnings: string[];
}

export interface RawAuthorWaypoint {
  lat: number;
  lng: number;
  name?: string;
  description?: string;
  rawType?: string;
}

export interface BuildContextInput {
  trackpoints: LatLng[];
  elevation: ElevationProfile;
  osmFeatures: OsmFeature[];
  /** Author-placed waypoints from the GPX (`<wpt>` elements). */
  authorWaypoints?: RawAuthorWaypoint[];
  language?: string;
  /** Optional total distance override (km). Defaults to computed cumulative distance. */
  totalDistanceKm?: number;
  /** Where the elevation data came from. Defaults to 'gpx' if hasElevation else 'none'. */
  elevationSource?: ElevationSource;
}

interface FeatureWithKm extends OsmFeature {
  km: number;
}

export function buildNarrativeContext(input: BuildContextInput): NarrativeContext {
  const { trackpoints, elevation, osmFeatures } = input;
  const language = input.language ?? "ru";

  const cumM = cumulativeDistancesM(trackpoints);
  const totalKm = input.totalDistanceKm ?? cumM[cumM.length - 1] / 1000;

  // Project every feature onto the route once.
  const projected: FeatureWithKm[] = osmFeatures
    .map((f) => ({
      ...f,
      km: round1(projectDistanceFromStartM({ lat: f.lat, lng: f.lng }, trackpoints, cumM) / 1000),
    }))
    .filter((f) => f.km >= 0 && f.km <= totalKm + 0.5);

  const authorWaypoints = projectAuthorWaypoints(
    input.authorWaypoints ?? [],
    trackpoints,
    cumM,
    totalKm
  );

  const warnings: string[] = [];
  if (!elevation.hasElevation) warnings.push("no_elevation_data");
  if (projected.length < 5 && authorWaypoints.length < 3) warnings.push("sparse_osm_coverage");

  const segments = bucketSegments(projected, elevation.climbs, totalKm);

  const amenities = collectAmenities(projected);
  const settlementsAlongRoute = collectSettlements(projected);
  const namedWaterways = collectWaterways(projected);

  return {
    language,
    summary: {
      distanceKm: round1(totalKm),
      gainM: elevation.totalGainM,
      lossM: elevation.totalLossM,
      minEleM: elevation.minEleM,
      maxEleM: elevation.maxEleM,
      profile: elevation.profile,
      hasElevation: elevation.hasElevation,
      elevationUncalibrated: elevation.elevationUncalibrated,
      elevationSource: input.elevationSource ?? (elevation.hasElevation ? "gpx" : "none"),
    },
    climbs: elevation.climbs,
    segments,
    amenities,
    settlementsAlongRoute,
    namedWaterways,
    authorWaypoints,
    warnings,
  };
}

function classifyAuthorWaypoint(rawType: string | undefined, name: string | undefined): AuthorWaypointKind {
  const t = (rawType ?? "").toLowerCase();
  const n = (name ?? "").toLowerCase();
  if (t === "viewpoint" || /вид|обзор|панорам/.test(n)) return "viewpoint";
  if (t === "ford" || /брод|переправ/.test(n)) return "ford";
  if (t === "attention" || t === "warning" || t === "hazard" || /осторожн|опасн|грязь/.test(n)) return "hazard";
  if (name) return "landmark";
  return "marker";
}

function projectAuthorWaypoints(
  raw: RawAuthorWaypoint[],
  trackpoints: LatLng[],
  cumM: number[],
  totalKm: number
): AuthorWaypoint[] {
  const result: AuthorWaypoint[] = [];
  const seen = new Set<string>();
  for (const w of raw) {
    const km = round1(projectDistanceFromStartM({ lat: w.lat, lng: w.lng }, trackpoints, cumM) / 1000);
    // Author may drop a waypoint slightly off-route; we keep it if it projects
    // anywhere within the route's km range (the projection itself snaps to the
    // nearest segment, so it's always inside).
    if (km < -0.5 || km > totalKm + 0.5) continue;
    const key = `${km.toFixed(2)}|${(w.name ?? "").trim().toLowerCase()}|${(w.rawType ?? "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      km: Math.max(0, km),
      kind: classifyAuthorWaypoint(w.rawType, w.name),
      name: w.name?.trim() || undefined,
      description: w.description?.trim() || undefined,
      rawType: w.rawType,
    });
  }
  return result.sort((a, b) => a.km - b.km);
}

function bucketSegments(
  features: FeatureWithKm[],
  climbs: Climb[],
  totalKm: number
): Segment[] {
  const segments: Segment[] = [];
  const numSegments = Math.max(1, Math.ceil(totalKm / SEGMENT_LENGTH_KM));

  for (let s = 0; s < numSegments; s++) {
    const fromKm = s * SEGMENT_LENGTH_KM;
    const toKm = Math.min(totalKm, (s + 1) * SEGMENT_LENGTH_KM);
    const inSeg = features.filter((f) => f.km >= fromKm && f.km < toKm + 0.001);

    const landscapeCounts: Partial<Record<DominantLandscape, number>> = {};
    const namedFeatures: NamedFeature[] = [];
    const settlements = new Set<string>();

    for (const f of inSeg) {
      const ls = landscapeFromFeature(f);
      if (ls) landscapeCounts[ls] = (landscapeCounts[ls] ?? 0) + 1;

      if (f.kind === "settlement" && f.name) {
        settlements.add(f.name);
      } else if (f.name) {
        namedFeatures.push({
          km: f.km,
          kind: f.kind,
          name: f.name,
          subtype: featureSubtype(f),
        });
      }
    }

    const climbsInSegment = climbs
      .filter((c) => c.startKm < toKm && c.endKm > fromKm)
      .map((c) => ({
        startKm: c.startKm,
        endKm: c.endKm,
        gainM: c.gainM,
        avgGradientPct: c.avgGradientPct,
        category: c.category,
      }));

    segments.push({
      fromKm: round1(fromKm),
      toKm: round1(toKm),
      dominantLandscape: pickDominant(landscapeCounts),
      landscapeCounts,
      settlements: Array.from(settlements),
      namedFeatures: namedFeatures.sort((a, b) => a.km - b.km),
      climbsInSegment,
    });
  }
  return segments;
}

function landscapeFromFeature(f: OsmFeature): DominantLandscape | null {
  const t = f.tags;
  if (f.kind === "water_area" || (t.natural && /^(water|bay)$/.test(t.natural))) return "water_dominant";
  if (t.natural === "wetland") return "wetland";
  if (t.natural === "wood" || t.landuse === "forest") return "forest";
  if (t.landuse === "farmland" || t.landuse === "orchard" || t.landuse === "vineyard") return "open_farmland";
  if (t.landuse === "meadow") return "meadow";
  if (t.landuse === "residential" || f.kind === "settlement") return "settlement";
  if (t.natural === "peak" || t.natural === "saddle" || t.natural === "cliff") return "mountain";
  return null;
}

function pickDominant(counts: Partial<Record<DominantLandscape, number>>): DominantLandscape {
  const entries = Object.entries(counts) as Array<[DominantLandscape, number]>;
  if (entries.length === 0) return "mixed";
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0];
  const total = entries.reduce((s, [, n]) => s + n, 0);
  if (top[1] / total >= 0.55) return top[0];
  return "mixed";
}

function featureSubtype(f: OsmFeature): string | undefined {
  const t = f.tags;
  return (
    t.historic ?? t.tourism ?? t.amenity ?? t.natural ?? t.waterway ?? t.man_made ?? t.landuse
  );
}

function collectAmenities(features: FeatureWithKm[]) {
  const waterSources: NamedFeature[] = [];
  const cafesAndFood: NamedFeature[] = [];
  const shelters: NamedFeature[] = [];
  for (const f of features) {
    const t = f.tags;
    if (t.amenity === "drinking_water" || t.natural === "spring") {
      waterSources.push({ km: f.km, kind: f.kind, name: f.name ?? "источник", subtype: t.amenity ?? t.natural });
    } else if (t.amenity && /^(cafe|restaurant|fast_food|bar|pub)$/.test(t.amenity)) {
      cafesAndFood.push({ km: f.km, kind: f.kind, name: f.name ?? t.amenity, subtype: t.amenity });
    } else if (t.amenity === "shelter" || t.tourism === "wilderness_hut" || t.tourism === "alpine_hut") {
      shelters.push({ km: f.km, kind: f.kind, name: f.name ?? "укрытие", subtype: t.amenity ?? t.tourism });
    }
  }
  return {
    waterSources: dedupeByName(waterSources),
    cafesAndFood: dedupeByName(cafesAndFood),
    shelters: dedupeByName(shelters),
  };
}

function collectSettlements(features: FeatureWithKm[]) {
  const seen = new Map<string, { name: string; km: number; place: string }>();
  for (const f of features) {
    if (f.kind !== "settlement" || !f.name) continue;
    const key = f.name.toLowerCase();
    const existing = seen.get(key);
    if (!existing || f.km < existing.km) {
      seen.set(key, { name: f.name, km: f.km, place: f.tags.place ?? "village" });
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.km - b.km);
}

function collectWaterways(features: FeatureWithKm[]) {
  const seen = new Map<string, { name: string; km: number }>();
  for (const f of features) {
    if (f.kind !== "waterway" || !f.name) continue;
    const key = f.name.toLowerCase();
    if (!seen.has(key)) seen.set(key, { name: f.name, km: f.km });
  }
  return Array.from(seen.values()).sort((a, b) => a.km - b.km);
}

function dedupeByName(items: NamedFeature[]): NamedFeature[] {
  const seen = new Map<string, NamedFeature>();
  for (const i of items) {
    const key = `${i.name.toLowerCase()}|${i.subtype ?? ""}`;
    if (!seen.has(key)) seen.set(key, i);
  }
  return Array.from(seen.values()).sort((a, b) => a.km - b.km);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
