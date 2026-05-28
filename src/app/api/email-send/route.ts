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
 */

import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const dynamic = "force-dynamic";

function checkSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("x-email-secret") === secret;
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

  let body: { to?: string; subject?: string; html?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { to, subject, html } = body;
  if (!to || !subject || !html) {
    return NextResponse.json({ error: "to, subject and html required" }, { status: 400 });
  }

  // Return 200 immediately — SMTP runs in background.
  // On this VPS the Node process stays alive, so void promise is safe.
  void sendMail(to, subject, html).then(() => {
    console.log("[email-send] sent ok to", to, "|", subject);
  }).catch((err) => {
    console.error("[email-send] SMTP failed to", to, ":", err?.message ?? err);
  });

  return NextResponse.json({ ok: true });
}
