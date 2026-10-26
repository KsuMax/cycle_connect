import { NextRequest } from "next/server";
import { createHash } from "crypto";

/** Hash UA + first IP from x-forwarded-for. Stable per-browser, not user-identifying. */
export function clientFingerprint(req: NextRequest): string {
  const ua = req.headers.get("user-agent") ?? "";
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const ip = xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  return createHash("sha256").update(`${ua}|${ip}`).digest("base64url");
}
