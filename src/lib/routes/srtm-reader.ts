/**
 * Read elevations from SRTM-style HGT tiles on local disk.
 *
 * HGT format (used by Viewfinder Panoramas SRTM3+ and NASA SRTM1):
 *   - one file per 1° × 1° tile, named e.g. N60E029.hgt
 *   - raw 16-bit signed big-endian elevation grid, no header
 *   - SRTM1  = 3601 × 3601 samples (1 arc-second, ~30 m)
 *   - SRTM3  = 1201 × 1201 samples (3 arc-second, ~90 m)
 *   - row 0 = northern edge, col 0 = western edge
 *   - voids = -32768
 *
 * Optionally tiles may be gzip-compressed (*.hgt.gz) — Viewfinder ships them
 * that way. We support both.
 *
 * No external deps; uses node:fs + node:zlib synchronously inside an async
 * facade so it's safe to call from server actions.
 */

import { readFile, stat } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";

export type HgtResolution = "srtm1" | "srtm3";

export interface SrtmReaderOptions {
  /** Directory containing tile files (recursively allowed via subdirs). */
  tileDir: string;
  /**
   * Tile resolution. SRTM3 (1201×1201) is the Viewfinder default.
   * SRTM1 (3601×3601) is NASA SRTMGL1.
   */
  resolution?: HgtResolution;
  /** In-memory tile cache size (parsed Int16 grids). Default 30. */
  cacheTiles?: number;
  /** Optional subdir lookup helper — e.g. Viewfinder organises tiles in 6°×6° folders. */
  resolveTilePath?: (filename: string) => string[];
}

interface CachedTile {
  grid: Int16Array;
  size: number; // edge length (e.g. 1201)
}

const VOID = -32768;

export class SrtmReader {
  private readonly tileDir: string;
  private readonly resolution: HgtResolution;
  private readonly edgeSize: number;
  private readonly expectedBytes: number;
  private readonly cache = new Map<string, CachedTile | null>();
  private readonly cacheLimit: number;
  private readonly resolveTilePath?: (filename: string) => string[];

  constructor(opts: SrtmReaderOptions) {
    this.tileDir = opts.tileDir;
    this.resolution = opts.resolution ?? "srtm3";
    this.edgeSize = this.resolution === "srtm1" ? 3601 : 1201;
    this.expectedBytes = this.edgeSize * this.edgeSize * 2;
    this.cacheLimit = opts.cacheTiles ?? 30;
    this.resolveTilePath = opts.resolveTilePath;
  }

  /**
   * Look up the bilinearly-interpolated elevation at a point. Returns null
   * when the tile is missing or all four neighbouring samples are voids.
   */
  async getElevation(lat: number, lng: number): Promise<number | null> {
    if (!isFinite(lat) || !isFinite(lng)) return null;

    // A point on the boundary line of two tiles belongs to both. Try the
    // primary tile first, then walk outwards through the (up to four)
    // adjacent tiles that share that boundary, falling back if missing.
    const floorLat = Math.floor(lat);
    const floorLng = Math.floor(lng);
    const onLatEdge = lat === floorLat;
    const onLngEdge = lng === floorLng;
    const candidates: Array<[number, number]> = [[floorLat, floorLng]];
    if (onLatEdge) candidates.push([floorLat - 1, floorLng]);
    if (onLngEdge) candidates.push([floorLat, floorLng - 1]);
    if (onLatEdge && onLngEdge) candidates.push([floorLat - 1, floorLng - 1]);

    let tile: CachedTile | null = null;
    let tileLat = floorLat;
    let tileLng = floorLng;
    for (const [tlat, tlng] of candidates) {
      tile = await this.loadTile(tlat, tlng);
      if (tile) {
        tileLat = tlat;
        tileLng = tlng;
        break;
      }
    }
    if (!tile) return null;

    const N = tile.size;
    const localLat = lat - tileLat; // 0 = south edge, 1 = north edge
    const localLng = lng - tileLng; // 0 = west edge, 1 = east edge
    const rowF = (1 - localLat) * (N - 1);
    const colF = localLng * (N - 1);

    const r0 = clamp(Math.floor(rowF), 0, N - 1);
    const c0 = clamp(Math.floor(colF), 0, N - 1);
    const r1 = clamp(r0 + 1, 0, N - 1);
    const c1 = clamp(c0 + 1, 0, N - 1);
    const fr = rowF - r0;
    const fc = colF - c0;

    const z00 = tile.grid[r0 * N + c0];
    const z01 = tile.grid[r0 * N + c1];
    const z10 = tile.grid[r1 * N + c0];
    const z11 = tile.grid[r1 * N + c1];

    return bilinearWithVoids(z00, z01, z10, z11, fr, fc);
  }

  /** Batch-fetch elevations preserving order. Tiles are cached, so adjacent calls share work. */
  async getElevations(points: Array<{ lat: number; lng: number }>): Promise<Array<number | null>> {
    const out = new Array<number | null>(points.length);
    for (let i = 0; i < points.length; i++) {
      out[i] = await this.getElevation(points[i].lat, points[i].lng);
    }
    return out;
  }

  /** Drop all cached tiles. Useful after deploying new tiles. */
  clearCache(): void {
    this.cache.clear();
  }

  private async loadTile(tileLat: number, tileLng: number): Promise<CachedTile | null> {
    const key = tileKey(tileLat, tileLng);
    if (this.cache.has(key)) {
      const v = this.cache.get(key) ?? null;
      // touch for LRU
      this.cache.delete(key);
      this.cache.set(key, v);
      return v;
    }

    const tile = await this.readTileFromDisk(key);

    // Evict oldest if over limit.
    if (this.cache.size >= this.cacheLimit) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, tile);
    return tile;
  }

  private async readTileFromDisk(key: string): Promise<CachedTile | null> {
    const candidates = this.candidatePaths(key);
    for (const path of candidates) {
      const buf = await tryRead(path);
      if (!buf) continue;
      const decoded = await decodeHgt(path, buf);
      if (!decoded) continue;
      if (decoded.byteLength !== this.expectedBytes) {
        const inferredEdge = Math.round(Math.sqrt(decoded.byteLength / 2));
        if (inferredEdge !== this.edgeSize && inferredEdge * inferredEdge * 2 === decoded.byteLength) {
          // Tile resolution doesn't match what the caller declared — accept but
          // log so misconfigurations surface early.
          process.stderr?.write?.(
            `[srtm] tile ${key} edge=${inferredEdge} differs from configured ${this.edgeSize}; using tile's own dimensions\n`
          );
          return { grid: bufToInt16BE(decoded), size: inferredEdge };
        }
        process.stderr?.write?.(
          `[srtm] tile ${key} unexpected byte length ${decoded.byteLength}; skipping\n`
        );
        continue;
      }
      return { grid: bufToInt16BE(decoded), size: this.edgeSize };
    }
    return null;
  }

  private candidatePaths(key: string): string[] {
    const fname = `${key}.hgt`;
    const gz = `${key}.hgt.gz`;
    const fromHook = this.resolveTilePath?.(fname) ?? [];
    const latDir = key.slice(0, 3); // e.g. "N60"
    return [
      ...fromHook,
      join(this.tileDir, fname),
      join(this.tileDir, gz),
      // Mapzen / Skadi layout: tiles grouped under per-latitude subdir.
      join(this.tileDir, latDir, fname),
      join(this.tileDir, latDir, gz),
      // Viewfinder layout: 6°×6° letter-coded folders.
      ...viewfinderSubdirs(this.tileDir, key).flatMap((dir) => [join(dir, fname), join(dir, gz)]),
    ];
  }
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function bilinearWithVoids(
  z00: number,
  z01: number,
  z10: number,
  z11: number,
  fr: number,
  fc: number
): number | null {
  const w = [
    { z: z00, w: (1 - fr) * (1 - fc) },
    { z: z01, w: (1 - fr) * fc },
    { z: z10, w: fr * (1 - fc) },
    { z: z11, w: fr * fc },
  ].filter((p) => p.z !== VOID);
  if (w.length === 0) return null;
  const totalW = w.reduce((s, p) => s + p.w, 0);
  if (totalW === 0) {
    // All weight on void neighbours but at least one corner is valid: average them.
    const sum = w.reduce((s, p) => s + p.z, 0);
    return sum / w.length;
  }
  const sum = w.reduce((s, p) => s + p.z * p.w, 0);
  return sum / totalW;
}

function tileKey(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  const latStr = pad(Math.abs(lat), 2);
  const lngStr = pad(Math.abs(lng), 3);
  return `${ns}${latStr}${ew}${lngStr}`;
}

function pad(n: number, width: number): string {
  return Math.floor(n).toString().padStart(width, "0");
}

async function tryRead(path: string): Promise<Buffer | null> {
  try {
    const s = await stat(path);
    if (!s.isFile()) return null;
    return await readFile(path);
  } catch {
    return null;
  }
}

async function decodeHgt(path: string, buf: Buffer): Promise<Buffer | null> {
  if (path.endsWith(".gz")) {
    try {
      return gunzipSync(buf);
    } catch (err) {
      process.stderr?.write?.(
        `[srtm] failed to gunzip ${path}: ${err instanceof Error ? err.message : String(err)}\n`
      );
      return null;
    }
  }
  return buf;
}

function bufToInt16BE(buf: Buffer): Int16Array {
  const n = buf.byteLength / 2;
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = buf.readInt16BE(i * 2);
  }
  return out;
}

/**
 * Viewfinder organises SRTM3 tiles in 6°×6° folders named "L{idx}" where idx
 * is roughly the column index. We try a few plausible subdirs based on
 * tileLng / tileLat — callers can also pass resolveTilePath for explicit layouts.
 */
function viewfinderSubdirs(baseDir: string, key: string): string[] {
  // key is e.g. "N60E029". Viewfinder ships subfolders by 6° longitude blocks.
  // Common letter-index uses A=0…X=24 for 6° W→E starting at -180.
  const lng = parseInt(key.slice(4), 10);
  if (Number.isNaN(lng)) return [];
  const ewSign = key[3] === "E" ? 1 : -1;
  const trueLng = lng * ewSign;
  const blockIndex = Math.floor((trueLng + 180) / 6); // 0..59
  const letter = blockIndex >= 0 && blockIndex < 24 ? String.fromCharCode(65 + (blockIndex % 24)) : "";
  if (!letter) return [];
  // Try several plausible layouts
  return [
    join(baseDir, letter),
    join(baseDir, `L${letter}`),
    join(baseDir, key.slice(0, 3)), // e.g. N60/
  ];
}
