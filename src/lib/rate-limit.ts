import "server-only";

import { createAdminSupabase } from "@/lib/supabase-admin";
import type { NextRequest } from "next/server";

/**
 * Token-bucket-ish limiter backed by public.rate_limits + check_rate_limit RPC.
 *
 * Returns true if the call is within budget, false if it should be rejected.
 * Fail-open on DB errors — refusing real users when rate-limit infra breaks
 * is worse than letting through a few extras.
 */
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
      console.warn("[rate-limit] rpc failed, allowing:", error.message);
      return true;
    }
    return data === true;
  } catch (err) {
    console.warn("[rate-limit] threw, allowing:", err instanceof Error ? err.message : String(err));
    return true;
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
