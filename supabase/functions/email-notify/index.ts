/**
 * email-notify — продуктовые email через Beget SMTP.
 *
 * Парный канал к tg-notify: туда же кладём проверки прав, такую же
 * идемпотентность и debounce. In-app строки пишут DB-триггеры; здесь
 * только email-сторона.
 *
 * Дисциплина каждого режима:
 *   1. Достать актора (caller JWT) и проверить, что у него есть право
 *      инициировать это действие (организатор события, владелец клуба
 *      и т.п.).
 *   2. Для каждого получателя:
 *      a) проверить флаг opt-in (`profiles.email_notify_*`);
 *      b) проверить идемпотентность по `email_deliveries`
 *         (тип × related_id × окно);
 *      c) отправить, записать строку в email_deliveries
 *         со статусом sent/failed/skipped.
 *   3. Вернуть сводку { sent, skipped, failed }.
 *
 * Режимы (расширяем итеративно):
 *   - "event_cancelled"   { eventId, reason? }   — реализован
 *   - "event_rescheduled" { eventId, oldStartDate } — TODO
 *   - "event_new_rsvp"    { eventId } — TODO (бэтчится cron-ом)
 *   - "club_join_request" { clubId, applicantId } — TODO
 *   - "club_join_approved"{ clubId, memberId } — TODO
 *   - "club_join_rejected"{ clubId, memberId } — TODO
 *   - "route_report_for_interest" { reportId } — TODO
 *   - "event_rsvp_confirmation"   { eventId } — TODO
 *   - "weekly_digest"     { userId } — TODO (cron-only)
 *   - "strava_token_expired" { userId } — TODO
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// ── env ──────────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL     = Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "https://cycleconnect.cc";

const SMTP_HOST       = Deno.env.get("SMTP_HOST") ?? "smtp.beget.com";
const SMTP_PORT       = Number(Deno.env.get("SMTP_PORT") ?? "465");
const SMTP_USER       = Deno.env.get("SMTP_USER")!;
const SMTP_PASS       = Deno.env.get("SMTP_PASS")!;
const SMTP_FROM_NAME  = Deno.env.get("SMTP_FROM_NAME")  ?? "CycleConnect";
const SMTP_FROM_EMAIL = Deno.env.get("SMTP_FROM_EMAIL") ?? "noreply@cycleconnect.cc";

const adminDb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// SMTP-клиент держим лениво — создаём при первой реальной отправке.
// Так dispatch-режим без получателей не тратит коннект и можно сделать
// dry-run, не задев Beget.
let smtpClient: SMTPClient | null = null;
function getSmtp(): SMTPClient {
  if (smtpClient) return smtpClient;
  smtpClient = new SMTPClient({
    connection: {
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      tls: SMTP_PORT === 465,             // 465 = implicit TLS, 587/2525 = STARTTLS
      auth: { username: SMTP_USER, password: SMTP_PASS },
    },
  });
  return smtpClient;
}

// ── основной обработчик ──────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "").trim();
  if (!jwt) return json({ error: "unauthorized" }, 401);

  const { data: { user }, error: authErr } = await adminDb.auth.getUser(jwt);
  if (authErr || !user) return json({ error: "unauthorized" }, 401);

  let body: {
    mode?: string;
    eventId?: string;
    reason?: string;
  };
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const { mode, eventId, reason } = body;

  // ── event_cancelled ────────────────────────────────────────────────────────
  if (mode === "event_cancelled") {
    if (!eventId) return json({ error: "eventId required" }, 400);

    const { data: event } = await adminDb
      .from("events")
      .select("id, title, start_date, meet_point, organizer_id, organizer:profiles!organizer_id(name)")
      .eq("id", eventId)
      .single();
    if (!event) return json({ error: "event not found" }, 404);
    if (event.organizer_id !== user.id) return json({ error: "forbidden" }, 403);

    const organizer = event.organizer as { name?: string } | null;
    const organizerName = organizer?.name ?? "Организатор";
    const title    = String(event.title ?? "поездка");
    const dateStr  = event.start_date ? formatDateTime(event.start_date as string) : "";
    const meetPoint = (event.meet_point as string | null) ?? null;
    const reasonClean = (reason ?? "").trim().slice(0, 500) || null;

    // Получатели — все участники, кроме организатора.
    // Берём auth.email из auth.users через service-role JOIN.
    const { data: participants } = await adminDb
      .from("event_participants")
      .select("user_id, profile:profiles!user_id(name, email_notify_events, email_notify_account)")
      .eq("event_id", eventId)
      .neq("user_id", user.id);

    const userIds = (participants ?? []).map((p) => p.user_id as string);
    const emailByUser = await loadEmails(userIds);

    let sent = 0, skipped = 0, failed = 0;
    const deliveries: DeliveryRow[] = [];

    for (const p of participants ?? []) {
      const uid = p.user_id as string;
      const prof = p.profile as { name?: string | null; email_notify_events?: boolean; email_notify_account?: boolean } | null;
      const email = emailByUser.get(uid);

      // event_cancelled — транзакционка. Шлём, если включён ХОТЯ БЫ один из
      // флагов account/events. (Account отключить нельзя — всегда true. Флаг
      // events отдельно, потому что отмена — это про event-канал.)
      const allow = (prof?.email_notify_account !== false) || (prof?.email_notify_events !== false);

      if (!email || !allow) {
        deliveries.push(makeDelivery(uid, "event_cancelled", eventId, "skipped",
          !email ? "no email" : "opted out"));
        skipped++;
        continue;
      }

      // Идемпотентность: уже отправляли отмену по этому event этому юзеру?
      const { count } = await adminDb
        .from("email_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("type", "event_cancelled")
        .eq("related_id", eventId)
        .eq("status", "sent");
      if ((count ?? 0) > 0) {
        deliveries.push(makeDelivery(uid, "event_cancelled", eventId, "skipped", "already sent"));
        skipped++;
        continue;
      }

      const firstName = firstNameOf(prof?.name);
      const subject   = `Поездку «${title}» отменили`;
      const html = renderEventCancelled({
        firstName,
        title,
        dateStr,
        meetPoint,
        organizerName,
        reason: reasonClean,
        eventUrl: `${SITE_URL}/events/${eventId}`,
        settingsUrl: `${SITE_URL}/profile/settings`,
      });

      const ok = await sendEmail(email, subject, html);
      if (ok) {
        sent++;
        deliveries.push(makeDelivery(uid, "event_cancelled", eventId, "sent"));
      } else {
        failed++;
        deliveries.push(makeDelivery(uid, "event_cancelled", eventId, "failed", "smtp error"));
      }
    }

    if (deliveries.length) await adminDb.from("email_deliveries").insert(deliveries);
    return json({ sent, skipped, failed });
  }

  // TODO: остальные режимы добавляем по тому же шаблону:
  //   1. permission check
  //   2. собрать получателей с их прoфайл-флагами и email
  //   3. opt-in + идемпотентность по email_deliveries
  //   4. send + лог
  return json({ error: "unknown or not-yet-implemented mode" }, 400);
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const client = getSmtp();
    await client.send({
      from: `${SMTP_FROM_NAME} <${SMTP_FROM_EMAIL}>`,
      to,
      subject,
      content: stripHtml(html),  // plain-text fallback
      html,
    });
    return true;
  } catch (err) {
    console.error("[email-notify] SMTP send failed:", err);
    return false;
  }
}

async function loadEmails(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  // auth.users доступен только service role — adminDb это умеет.
  const { data } = await adminDb.auth.admin.listUsers({ perPage: 1000 });
  const map = new Map<string, string>();
  for (const u of data?.users ?? []) {
    if (userIds.includes(u.id) && u.email) map.set(u.id, u.email);
  }
  return map;
}

type DeliveryRow = {
  user_id: string;
  type: string;
  related_id: string | null;
  status: "sent" | "failed" | "skipped" | "queued";
  error: string | null;
  sent_at: string | null;
};

function makeDelivery(
  userId: string,
  type: string,
  relatedId: string | null,
  status: DeliveryRow["status"],
  error: string | null = null,
): DeliveryRow {
  return {
    user_id: userId,
    type,
    related_id: relatedId,
    status,
    error,
    sent_at: status === "sent" ? new Date().toISOString() : null,
  };
}

function firstNameOf(name?: string | null): string {
  if (!name) return "привет";
  const first = name.trim().split(/\s+/)[0];
  return first || "привет";
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Moscow",
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "")
             .replace(/<[^>]+>/g, "")
             .replace(/\n{3,}/g, "\n\n")
             .trim();
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── шаблоны ──────────────────────────────────────────────────────────────────
// Шаг 3 плана: вынести в supabase/email-templates/*.html и грузить через
// Deno.readTextFile. Пока инлайним — это позволяет ускорить итерации
// и не требует деплоя ассетов отдельно.

interface EventCancelledVars {
  firstName: string;
  title: string;
  dateStr: string;
  meetPoint: string | null;
  organizerName: string;
  reason: string | null;
  eventUrl: string;
  settingsUrl: string;
}

function renderEventCancelled(v: EventCancelledVars): string {
  return baseLayout({
    title: `Поездку «${v.title}» отменили`,
    body: `
      <h1 style="font-size:22px;line-height:1.3;color:#1C1C1E;margin:0 0 16px;">
        Поездку отменили
      </h1>
      <p style="font-size:15px;line-height:1.5;color:#3F3F46;margin:0 0 20px;">
        ${escapeHtml(v.firstName === "привет" ? "Привет" : "Привет, " + v.firstName)}!
        Организатор отменил поездку, на которую ты записан${"ассистент" === "" ? "а" : ""}.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F4F1;border-radius:12px;padding:16px;margin:0 0 20px;">
        <tr><td style="font-size:14px;color:#1C1C1E;line-height:1.6;">
          📅 <b>${escapeHtml(v.title)}</b><br/>
          ${v.dateStr ? `🗓 ${escapeHtml(v.dateStr)}<br/>` : ""}
          ${v.meetPoint ? `📍 ${escapeHtml(v.meetPoint)}<br/>` : ""}
          👤 Организатор: ${escapeHtml(v.organizerName)}
        </td></tr>
      </table>

      ${v.reason ? `
        <p style="font-size:14px;line-height:1.5;color:#71717A;margin:0 0 20px;">
          <b style="color:#3F3F46;">Причина:</b> ${escapeHtml(v.reason)}
        </p>
      ` : ""}

      <p style="font-size:14px;line-height:1.5;color:#71717A;margin:0 0 24px;">
        Если хочется покатать всё равно — посмотри, что есть рядом.
      </p>

      ${ctaButton("Найти поездки рядом", `${SITE_URL}/events`)}

      <p style="font-size:12px;line-height:1.5;color:#A1A1AA;margin:24px 0 0;">
        Это письмо нельзя отключить — оно про твои планы.
        <a href="${v.settingsUrl}" style="color:#F4632A;text-decoration:none;">Настроить остальные уведомления →</a>
      </p>
    `,
  });
}

function ctaButton(text: string, href: string): string {
  return `
    <table cellpadding="0" cellspacing="0">
      <tr><td style="background:#F4632A;border-radius:10px;">
        <a href="${href}" style="display:inline-block;padding:12px 24px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">
          ${escapeHtml(text)}
        </a>
      </td></tr>
    </table>
  `;
}

function baseLayout(o: { title: string; body: string }): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(o.title)}</title>
</head>
<body style="margin:0;padding:0;background:#F5F4F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F4F1;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="font-size:20px;font-weight:700;color:#1C1C1E;">Cycle</span><span style="font-size:20px;font-weight:700;color:#F4632A;">Connect</span>
        </td></tr>
        <tr><td style="background:#fff;border-radius:20px;border:1px solid #E4E4E7;padding:32px;">
          ${o.body}
        </td></tr>
        <tr><td align="center" style="padding-top:16px;font-size:12px;color:#A1A1AA;">
          CycleConnect — сообщество велоспорта
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
