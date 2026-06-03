#!/usr/bin/env npx tsx
/**
 * Smoke-test the SRTM HGT reader on a synthetic tile.
 *
 * Generates an N00E000.hgt with a known elevation function, then queries
 * a few points and checks bilinear interpolation behaves.
 *
 * Run: npx tsx scripts/srtm-smoke-test.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SrtmReader } from "../src/lib/routes/srtm-reader";

const dir = join(tmpdir(), `srtm-smoke-${Date.now()}`);
mkdirSync(dir, { recursive: true });

const N = 1201; // SRTM3 edge
const buf = Buffer.alloc(N * N * 2);

// Synthetic surface: elevation = 100 + 500 * lat + 300 * lng (lat, lng in [0,1])
// At (lat=0, lng=0) → 100 m, at (lat=1, lng=1) → 900 m.
for (let row = 0; row < N; row++) {
  const lat = 1 - row / (N - 1); // row 0 is north (lat=1)
  for (let col = 0; col < N; col++) {
    const lng = col / (N - 1);
    const z = Math.round(100 + 500 * lat + 300 * lng);
    buf.writeInt16BE(z, (row * N + col) * 2);
  }
}
writeFileSync(join(dir, "N00E000.hgt"), buf);

const reader = new SrtmReader({ tileDir: dir, resolution: "srtm3", cacheTiles: 4 });

async function check(lat: number, lng: number, expected: number, tol = 1) {
  const got = await reader.getElevation(lat, lng);
  const ok = got !== null && Math.abs(got - expected) <= tol;
  console.log(
    `lat=${lat.toFixed(3)} lng=${lng.toFixed(3)} → ${got?.toFixed(2) ?? "null"} (expected ~${expected}) ${ok ? "OK" : "FAIL"}`
  );
  if (!ok) process.exitCode = 1;
}

async function main() {
  // NW corner
  await check(1, 0, 600); // lat=1, lng=0 → 100 + 500 = 600
  // SE corner
  await check(0, 1, 400); // lat=0, lng=1 → 100 + 300 = 400
  // Center
  await check(0.5, 0.5, 500); // 100 + 250 + 150 = 500
  // Off-grid point requiring bilinear
  await check(0.2345, 0.7654, 100 + 500 * 0.2345 + 300 * 0.7654, 2);
  // Outside tile
  const missing = await reader.getElevation(45, 45);
  console.log(`outside tile → ${missing} ${missing === null ? "OK" : "FAIL"}`);
  if (missing !== null) process.exitCode = 1;

  // Void handling
  const voidBuf = Buffer.alloc(N * N * 2);
  for (let i = 0; i < N * N; i++) voidBuf.writeInt16BE(-32768, i * 2);
  writeFileSync(join(dir, "N01E000.hgt"), voidBuf);
  reader.clearCache();
  const allVoid = await reader.getElevation(1.5, 0.5);
  console.log(`all-void tile → ${allVoid} ${allVoid === null ? "OK" : "FAIL"}`);
  if (allVoid !== null) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
