/**
 * /api/email-send — SMTP delivery endpoint for the email-notify edge function.
 *
 * The Supabase edge runtime v1.71.2 has a hard ~10 s wall-clock limit per
 * isolate. A full SMTP exchange over TLS (connect → greeting → AUTH → MAIL
 * FROM → RCPT TO → DATA → QUIT) takes 7–10 s on the Russian VPS, which
 * reliably hits early-termination.
 *
 * Solution: edge function handles auth + business logic (DB queries,
 * idempotency, opt-in checks) then fires a POST here. Next.js runs as a
 * long-lived Node process on the same machine — no isolate limits.
 *
 * The route responds with 200 immediately and does SMTP in the background
 * (fire-and-forget with `void`). On a VPS the process stays alive so this
 * is safe. The caller (edge function) gets a fast response without waiting
 * for the SMTP exchange to complete.
 *
 * Auth: X-Email-Secret header must match process.env.CRON_SECRET (re-uses
 * the same shared secret already in Vault for the pg_cron jobs — no new
 * env var needed).
 *
 * Defence in depth on top of the shared secret:
 *   • Strict input validation (RFC-ish email, no CR/LF in subject, length caps).
 *   • Per-IP and global rate limits so a leaked secret can't burst-mail
 *     thousands of recipients before we notice.
 *   • PII-redacted logs (no raw recipient address).
 */

import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createHash } from "crypto";
import { safeEqual } from "@/lib/secure-compare";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// ── Validation limits ────────────────────────────────────────────────────────

const MAX_TO_LEN = 254;          // RFC 5321 — practical max
const MAX_SUBJECT_LEN = 200;     // most clients truncate long subjects anyway
const MAX_HTML_BYTES = 200 * 1024; // 200 KB — our richest templates are < 30 KB

// RFC 5322 is huge; this regex covers everything we ever actually send to
// (no quoted local parts, no IP-literal domains). Good enough as a sanity check.
const EMAIL_RE = /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[^\s@<>"',;:]+$/;

function checkSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("x-email-secret");
  if (!provided) return false;
  return safeEqual(provided, secret);
}

/** Hash the recipient for log lines — keeps us GDPR-friendly. */
function redactEmail(addr: string): string {
  const hash = createHash("sha256").update(addr.toLowerCase()).digest("hex").slice(0, 10);
  const at = addr.lastIndexOf("@");
  const domain = at >= 0 ? addr.slice(at) : "";
  return `${hash}${domain}`;
}

async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const host  = process.env.SMTP_HOST  ?? "smtp.beget.com";
  const port  = Number(process.env.SMTP_PORT ?? "465");
  const user  = process.env.SMTP_USER!;
  const pass  = process.env.SMTP_PASS!;
  const from  = process.env.SMTP_FROM_NAME  ?? "CycleConnect";
  const email = process.env.SMTP_FROM_EMAIL ?? "noreply@cycleconnect.cc";

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `"${from}" <${email}>`,
    to,
    subject,
    html,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!checkSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Rate limits: per-IP (typical edge-function caller is localhost == one IP)
  // and a global cap. Even with a leaked secret, an attacker can't burst-mail
  // tens of thousands of recipients before we notice in dashboards.
  if (!(await checkRateLimit(rateLimitKey("email-send:ip", req), 120, 60))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  if (!(await checkRateLimit("email-send:global", 1000, 60))) {
    return NextResponse.json({ error: "rate_limited_global" }, { status: 429 });
  }

  let body: { to?: unknown; subject?: unknown; html?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { to, subject, html } = body;

  // ── Strict typing/shape ────────────────────────────────────────────────────
  if (typeof to !== "string" || typeof subject !== "string" || typeof html !== "string") {
    return NextResponse.json({ error: "to, subject, html must be strings" }, { status: 400 });
  }

  // ── `to` ───────────────────────────────────────────────────────────────────
  const toTrim = to.trim();
  if (toTrim.length === 0 || toTrim.length > MAX_TO_LEN || !EMAIL_RE.test(toTrim)) {
    return NextResponse.json({ error: "invalid to" }, { status: 400 });
  }

  // ── `subject` ──────────────────────────────────────────────────────────────
  // CR/LF in subject → SMTP header injection. Strip rather than allow.
  if (subject.length === 0 || subject.length > MAX_SUBJECT_LEN || /[\r\n]/.test(subject)) {
    return NextResponse.json({ error: "invalid subject" }, { status: 400 });
  }

  // ── `html` ─────────────────────────────────────────────────────────────────
  // Byte length check — UTF-8 can be up to 4× char length.
  if (html.length === 0 || Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    return NextResponse.json({ error: "invalid html" }, { status: 400 });
  }

  const subjectRedacted = subject.length > 60 ? `${subject.slice(0, 57)}…` : subject;
  const toRedacted = redactEmail(toTrim);

  // Return 200 immediately — SMTP runs in background.
  // On this VPS the Node process stays alive, so void promise is safe.
  void sendMail(toTrim, subject, html).then(() => {
    console.log("[email-send] sent ok to", toRedacted, "|", subjectRedacted);
  }).catch((err) => {
    console.error("[email-send] SMTP failed to", toRedacted, ":", err?.message ?? err);
  });

  return NextResponse.json({ ok: true });
}
