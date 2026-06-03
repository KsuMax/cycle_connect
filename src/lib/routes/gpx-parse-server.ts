/**
 * Server-side GPX parser.
 *
 * The browser parser in src/lib/gpx.ts uses DOMParser. For Node (API routes,
 * CLI scripts) we walk the XML with regex instead — GPX has a strict, flat
 * structure and we only need trkpt/rtept (track) and wpt (author markers).
 *
 * Returns trackpoints with optional elevation and waypoints with name/type/desc.
 */

import type { ElePoint } from "./elevation-profile";
import type { RawAuthorWaypoint } from "./narrative-context";

export interface ParsedGpx {
  trackpoints: ElePoint[];
  authorWaypoints: RawAuthorWaypoint[];
}

export function parseGpxServer(xml: string): ParsedGpx {
  return {
    trackpoints: parseGpxTrack(xml),
    authorWaypoints: parseGpxWaypoints(xml),
  };
}

function parseGpxTrack(xml: string): ElePoint[] {
  let chosenTag: "trkpt" | "rtept" = "trkpt";
  if (!/<trkpt\b/i.test(xml) && /<rtept\b/i.test(xml)) chosenTag = "rtept";
  return collectElements(xml, chosenTag, (attrs, inner) => makePoint(attrs, inner));
}

function parseGpxWaypoints(xml: string): RawAuthorWaypoint[] {
  return collectElements(xml, "wpt", (attrs, inner) => {
    const lat = parseFloat(attrs.match(/\blat\s*=\s*"([^"]+)"/i)?.[1] ?? "");
    const lng = parseFloat(attrs.match(/\blon\s*=\s*"([^"]+)"/i)?.[1] ?? "");
    if (!isFinite(lat) || !isFinite(lng)) return null;
    const name = decodeXml(inner.match(/<name\b[^>]*>([\s\S]*?)<\/name>/i)?.[1]);
    const rawType = decodeXml(inner.match(/<type\b[^>]*>([\s\S]*?)<\/type>/i)?.[1]);
    const description = decodeXml(inner.match(/<desc\b[^>]*>([\s\S]*?)<\/desc>/i)?.[1]);
    return { lat, lng, name, rawType, description };
  });
}

function collectElements<T>(
  xml: string,
  tag: string,
  build: (attrs: string, inner: string) => T | null
): T[] {
  const pairedRe = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const selfRe = new RegExp(`<${tag}\\b([^/>]*)/>`, "gi");
  const ordered: Array<{ idx: number; value: T }> = [];
  for (const match of xml.matchAll(pairedRe)) {
    const v = build(match[1], match[2]);
    if (v != null) ordered.push({ idx: match.index ?? 0, value: v });
  }
  for (const match of xml.matchAll(selfRe)) {
    const v = build(match[1], "");
    if (v != null) ordered.push({ idx: match.index ?? 0, value: v });
  }
  ordered.sort((a, b) => a.idx - b.idx);
  return ordered.map((o) => o.value);
}

function makePoint(attrs: string, inner: string): ElePoint | null {
  const lat = parseFloat(attrs.match(/\blat\s*=\s*"([^"]+)"/i)?.[1] ?? "");
  const lng = parseFloat(attrs.match(/\blon\s*=\s*"([^"]+)"/i)?.[1] ?? "");
  if (!isFinite(lat) || !isFinite(lng)) return null;
  const eleStr = inner.match(/<ele\b[^>]*>([^<]+)<\/ele>/i)?.[1];
  const ele = eleStr !== undefined ? parseFloat(eleStr) : undefined;
  return { lat, lng, ele: ele !== undefined && isFinite(ele) ? ele : undefined };
}

function decodeXml(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  const trimmed = s.trim();
  if (!trimmed) return undefined;
  return trimmed
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
