import { describe, it, expect } from "vitest";
import { scoreWind, bandOf, floorToHourUTC, type BearingProfile } from "./wind";

// Helper: profile with all length concentrated in a single bucket index.
function singleBucketProfile(bucketIdx: number, lengthM = 10000): BearingProfile {
  const buckets = Array(36).fill(0);
  buckets[bucketIdx] = lengthM;
  return { buckets, total_m: lengthM };
}

describe("scoreWind", () => {
  it("returns full tailwind when wind blows from behind", () => {
    // Heading east (bucket 9 covers [90°, 100°), centre 95°), wind from
    // west (270°) → effectively full tailwind. Bucket centring loses about
    // half a percent at the edges, hence the 0.99 vs 1.0 tolerance.
    const profile = singleBucketProfile(9);
    const r = scoreWind(profile, { ts: "", dir_deg: 270, speed_ms: 5 });
    expect(r.score).toBeGreaterThan(0.99);
    expect(r.tailwindMs).toBeGreaterThan(4.95);
    expect(r.reverseBetter).toBe(false);
  });

  it("returns full headwind when wind blows in face", () => {
    const profile = singleBucketProfile(9); // east
    const r = scoreWind(profile, { ts: "", dir_deg: 90, speed_ms: 5 });
    expect(r.score).toBeLessThan(-0.99);
    expect(r.tailwindMs).toBeLessThan(-4.95);
    expect(r.reverseBetter).toBe(true);
  });

  it("returns near-zero for crosswind", () => {
    const profile = singleBucketProfile(9); // east
    const r = scoreWind(profile, { ts: "", dir_deg: 0, speed_ms: 5 });
    expect(Math.abs(r.score)).toBeLessThan(0.2);
  });

  it("ignores trivial winds", () => {
    const profile = singleBucketProfile(9);
    const r = scoreWind(profile, { ts: "", dir_deg: 270, speed_ms: 0.1 });
    expect(r.score).toBe(0);
    expect(r.tailwindMs).toBe(0);
  });

  it("handles a balanced loop (closed route) ~ 0 score", () => {
    // Half east, half west — net zero regardless of wind.
    const buckets = Array(36).fill(0);
    buckets[9]  = 5000;  // east
    buckets[27] = 5000;  // west
    const profile: BearingProfile = { buckets, total_m: 10000 };
    const r = scoreWind(profile, { ts: "", dir_deg: 270, speed_ms: 8 });
    expect(Math.abs(r.score)).toBeLessThan(0.05);
  });

  it("counts shares correctly on a mixed route", () => {
    const buckets = Array(36).fill(0);
    buckets[9]  = 7000;  // east → tailwind under west wind
    buckets[27] = 3000;  // west → headwind under west wind
    const profile: BearingProfile = { buckets, total_m: 10000 };
    const r = scoreWind(profile, { ts: "", dir_deg: 270, speed_ms: 5 });
    expect(r.tailwindShare).toBeCloseTo(0.7, 5);
    expect(r.headwindShare).toBeCloseTo(0.3, 5);
    expect(r.score).toBeGreaterThan(0);
  });

  it("safe on empty profile", () => {
    const profile: BearingProfile = { buckets: Array(36).fill(0), total_m: 0 };
    const r = scoreWind(profile, { ts: "", dir_deg: 90, speed_ms: 5 });
    expect(r.score).toBe(0);
  });
});

describe("bandOf", () => {
  it("buckets scores into named bands", () => {
    expect(bandOf(0.9)).toBe("tailwind");
    expect(bandOf(0.3)).toBe("favorable");
    expect(bandOf(0)).toBe("neutral");
    expect(bandOf(-0.3)).toBe("unfavorable");
    expect(bandOf(-0.9)).toBe("headwind");
  });
});

describe("floorToHourUTC", () => {
  it("truncates minutes/seconds and emits UTC ISO", () => {
    expect(floorToHourUTC("2026-04-29T14:37:42.123Z")).toBe("2026-04-29T14:00:00.000Z");
  });
});
