import "server-only";

import { timingSafeEqual } from "crypto";

/**
 * Constant-time string compare for secrets (Bearer tokens, shared HMACs, etc.).
 *
 * Plain `===` short-circuits on the first differing byte, which leaks the
 * length of a matching prefix via timing. `timingSafeEqual` runs in time
 * proportional to the longer buffer.
 *
 * Returns false on length mismatch *before* calling timingSafeEqual (which
 * throws on length mismatch); the length-leak this introduces is irrelevant
 * because our secrets have fixed, known length.
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
