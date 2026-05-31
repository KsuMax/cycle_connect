import "server-only";

import { createAdminSupabase } from "@/lib/supabase-admin";
import type { NextRequest } from "next/server";

/**
 * Token-bucket-ish limiter backed by public.rate_limits + check_rate_limit RPC.
 *
 * Returns true if the call is within budget, false if it should be rejected.
 *
 * Two-tier strategy:
 *   1. Primary: Postgres RPC `check_rate_limit` (durable, shared across pods).
 *   2. Fallback: in-process token bucket with HALF the configured limit. This
 *      kicks in when the RPC errors or throws, so a DB outage no longer means
 *      "everything is free" — a malicious caller still gets capped by the
 *      local bucket on the single Next.js process. (We run only one pod on
 *      the VPS, so process-local state is effectively cluster-wide.)
 *
 * If both layers fail we fail-open with a warning — refusing real users
 * because both rate-limit infra and memory broke is worse than the abuse.
 */

interface BucketState {
  /** Calls in the current window. */
  count: number;
  /** epoch-ms when the window expires and we reset. */
  resetAt: number;
}

/**
 * Process-local bucket store. ~Few hundred entries at most before the GC
 * sweep (called inline below) drops anything past its window. The sweep
 * is O(n) but n stays small because each key has a short TTL.
 */
const localBuckets = new Map<string, BucketState>();
let lastSweepAt = 0;
const SWEEP_INTERVAL_MS = 60_000;

function sweepLocalBuckets(now: number) {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  for (const [key, state] of localBuckets) {
    if (state.resetAt <= now) localBuckets.delete(key);
  }
}

/**
 * In-memory fallback. Used only when the RPC fails.
 * Conservative: halves the limit so abuse can't burst as freely as via the
 * primary path. Floor at 1 so even {limit: 1} still works.
 */
function checkLocalBucket(key: string, limit: number, windowSeconds: number): boolean {
  const now = Date.now();
  sweepLocalBuckets(now);

  const effectiveLimit = Math.max(1, Math.floor(limit / 2));
  const state = localBuckets.get(key);

  if (!state || state.resetAt <= now) {
    localBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }
  if (state.count >= effectiveLimit) return false;
  state.count++;
  return true;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.warn("[rate-limit] rpc failed, falling back to local:", error.message);
      return checkLocalBucket(key, limit, windowSeconds);
    }
    return data === true;
  } catch (err) {
    console.warn(
      "[rate-limit] threw, falling back to local:",
      err instanceof Error ? err.message : String(err),
    );
    try {
      return checkLocalBucket(key, limit, windowSeconds);
    } catch (e) {
      console.warn(
        "[rate-limit] local fallback also threw, allowing:",
        e instanceof Error ? e.message : String(e),
      );
      return true;
    }
  }
}

/**
 * Best-effort caller fingerprint: prefer authenticated user id, fall back
 * to first IP in x-forwarded-for. Never returns empty.
 */
export function rateLimitKey(prefix: string, req: NextRequest, userId?: string | null): string {
  if (userId) return `${prefix}:u:${userId}`;
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const ip = xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  return `${prefix}:ip:${ip}`;
}
