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

// ── шаблоны: загрузка при старте ────────────────────────────────────────────
const TEMPLATES = new Map<string, string>();
for (const n of [
  "_base", "event-cancelled", "event-rescheduled", "event-rsvp-confirmation",
  "event-new-rsvp", "announcement", "club-join-request", "club-join-approved",
  "club-join-rejected", "event-hour-reminder", "event-post-report",
]) {
  TEMPLATES.set(n, await Deno.readTextFile(
    new URL(`./templates/${n}.html`, import.meta.url).pathname,
  ));
}

// ── основной обработчик ──────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "").trim();
  if (!jwt) return json({ error: "unauthorized" }, 401);

  // Cron calls arrive with the service role key as the Bearer token.
  // Detect this so cron modes can bypass user-level permission checks.
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const isCron = jwt === SERVICE_KEY;

  let user: { id: string } | null = null;
  if (!isCron) {
    const { data, error: authErr } = await adminDb.auth.getUser(jwt);
    if (authErr || !data.user) return json({ error: "unauthorized" }, 401);
    user = data.user;
  }

  let body: {
    mode?: string;
    eventId?: string;
    reason?: string;
    oldStartDate?: string;
    announcementId?: string;
    clubId?: string;
    memberId?: string;
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

  // ── event_rescheduled ──────────────────────────────────────────────────────
  if (mode === "event_rescheduled") {
    if (!eventId || !body.oldStartDate) return json({ error: "eventId and oldStartDate required" }, 400);

    const { data: event } = await adminDb
      .from("events")
      .select("id, title, start_date, meet_point, organizer_id, organizer:profiles!organizer_id(name)")
      .eq("id", eventId).single();
    if (!event) return json({ error: "event not found" }, 404);
    if (event.organizer_id !== user.id) return json({ error: "forbidden" }, 403);

    const title     = String(event.title ?? "поездка");
    const newDate   = event.start_date ? formatDateTime(event.start_date as string) : "";
    const oldDate   = formatDateTime(body.oldStartDate as string);
    const meetPoint = (event.meet_point as string | null) ?? null;
    const organizer = event.organizer as { name?: string } | null;

    const { data: participants } = await adminDb
      .from("event_participants")
      .select("user_id, profile:profiles!user_id(name, email_notify_events)")
      .eq("event_id", eventId).neq("user_id", user.id);

    const emailByUser = await loadEmails((participants ?? []).map((p) => p.user_id as string));
    let sent = 0, skipped = 0, failed = 0;
    const deliveries: DeliveryRow[] = [];

    for (const p of participants ?? []) {
      const uid  = p.user_id as string;
      const prof = p.profile as { name?: string | null; email_notify_events?: boolean } | null;
      const email = emailByUser.get(uid);
      if (!email || prof?.email_notify_events === false) {
        deliveries.push(makeDelivery(uid, "event_rescheduled", eventId, "skipped", !email ? "no email" : "opted out"));
        skipped++; continue;
      }
      const { count } = await adminDb.from("email_deliveries").select("id", { count: "exact", head: true })
        .eq("user_id", uid).eq("type", "event_rescheduled").eq("related_id", eventId)
        .eq("status", "sent").gte("created_at", new Date(Date.now() - 3600_000).toISOString());
      if ((count ?? 0) > 0) {
        deliveries.push(makeDelivery(uid, "event_rescheduled", eventId, "skipped", "already sent"));
        skipped++; continue;
      }
      const firstName = firstNameOf(prof?.name);
      const html = renderEventRescheduled({ firstName, title, oldDate, newDate, meetPoint,
        organizerName: organizer?.name ?? "Организатор",
        eventUrl: `${SITE_URL}/events/${eventId}`, settingsUrl: `${SITE_URL}/profile/settings` });
      const ok = await sendEmail(email, `Поездка «${title}» — новое время`, html);
      ok ? (sent++, deliveries.push(makeDelivery(uid, "event_rescheduled", eventId, "sent")))
         : (failed++, deliveries.push(makeDelivery(uid, "event_rescheduled", eventId, "failed", "smtp error")));
    }

    if (deliveries.length) await adminDb.from("email_deliveries").insert(deliveries);
    return json({ sent, skipped, failed });
  }

  // ── event_rsvp_confirmation ────────────────────────────────────────────────
  // Отправляем тому, кто только что нажал «Иду».
  // Вызывается с JWT этого же пользователя — он и есть получатель.
  if (mode === "event_rsvp_confirmation") {
    if (!eventId) return json({ error: "eventId required" }, 400);

    const { data: profile } = await adminDb
      .from("profiles")
      .select("name, email_notify_events")
      .eq("id", user.id).single();
    if (profile?.email_notify_events === false) return json({ sent: 0, skipped: 1 });

    // Идемпотентность: одно подтверждение на (user × event)
    const { count } = await adminDb.from("email_deliveries").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("type", "event_rsvp_confirmation").eq("related_id", eventId).eq("status", "sent");
    if ((count ?? 0) > 0) return json({ sent: 0, skipped: 1, reason: "already sent" });

    const { data: event } = await adminDb
      .from("events")
      .select("id, title, start_date, meet_point, organizer_id, organizer:profiles!organizer_id(name), event_participants(user_id)")
      .eq("id", eventId).single();
    if (!event) return json({ error: "event not found" }, 404);

    const emails = await loadEmails([user.id]);
    const email  = emails.get(user.id);
    if (!email) return json({ sent: 0, skipped: 1, reason: "no email" });

    const title      = String(event.title ?? "поездка");
    const dateStr    = event.start_date ? formatDateTime(event.start_date as string) : "";
    const meetPoint  = (event.meet_point as string | null) ?? null;
    const organizer  = event.organizer as { name?: string } | null;
    const totalCount = (event.event_participants as { user_id: string }[] | null)?.length ?? 1;
    const firstName  = firstNameOf(profile?.name);

    const html = renderEventRsvpConfirmation({
      firstName, title, dateStr, meetPoint,
      organizerName: organizer?.name ?? "Организатор",
      participantsCount: totalCount,
      eventUrl: `${SITE_URL}/events/${eventId}`,
      settingsUrl: `${SITE_URL}/profile/settings`,
    });

    const ok = await sendEmail(email, `Ты записан на «${title}»`, html);
    const delivery = makeDelivery(user.id, "event_rsvp_confirmation", eventId, ok ? "sent" : "failed", ok ? null : "smtp error");
    await adminDb.from("email_deliveries").insert(delivery);
    return json({ sent: ok ? 1 : 0, failed: ok ? 0 : 1 });
  }

  // ── event_new_rsvp ─────────────────────────────────────────────────────────
  // Уведомление организатору о новом участнике.
  // actor = тот, кто записался; получатель = organizer.
  if (mode === "event_new_rsvp") {
    if (!eventId) return json({ error: "eventId required" }, 400);

    const { data: event } = await adminDb
      .from("events")
      .select("id, title, organizer_id, event_participants(user_id)")
      .eq("id", eventId).single();
    if (!event) return json({ error: "event not found" }, 404);
    if (event.organizer_id === user.id) return json({ sent: 0, skipped: 1 }); // сам организатор

    const orgId = event.organizer_id as string;

    const { data: orgProfile } = await adminDb
      .from("profiles")
      .select("name, email_notify_events")
      .eq("id", orgId).single();
    if (orgProfile?.email_notify_events === false) return json({ sent: 0, skipped: 1 });

    // Дебаунс 30 мин: не слать отдельное письмо за каждый клик «Иду»
    const { count } = await adminDb.from("email_deliveries").select("id", { count: "exact", head: true })
      .eq("user_id", orgId).eq("type", "event_new_rsvp").eq("related_id", eventId).eq("status", "sent")
      .gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString());
    if ((count ?? 0) > 0) return json({ sent: 0, skipped: 1, reason: "debounced" });

    const { data: actorProfile } = await adminDb.from("profiles").select("name").eq("id", user.id).single();
    const actorName  = actorProfile?.name ?? "Участник";
    const title      = String(event.title ?? "поездка");
    const totalCount = (event.event_participants as { user_id: string }[] | null)?.length ?? 1;

    const emails = await loadEmails([orgId]);
    const email  = emails.get(orgId);
    if (!email) return json({ sent: 0, skipped: 1, reason: "no email" });

    const html = renderEventNewRsvp({
      organizerName: firstNameOf(orgProfile?.name),
      actorName, title, participantsCount: totalCount,
      eventUrl: `${SITE_URL}/events/${eventId}`,
      settingsUrl: `${SITE_URL}/profile/settings`,
    });
    const ok = await sendEmail(email, `+1 на «${title}»: ${actorName}`, html);
    await adminDb.from("email_deliveries").insert(
      makeDelivery(orgId, "event_new_rsvp", eventId, ok ? "sent" : "failed", ok ? null : "smtp error")
    );
    return json({ sent: ok ? 1 : 0 });
  }

  // ── event_announcement_email ───────────────────────────────────────────────
  // Дублёр TG-объявления для участников без Telegram.
  // tg-notify уже создал запись в event_announcements и пометил no_tg;
  // мы находим этих участников по announcement_deliveries и дублируем email.
  if (mode === "event_announcement_email") {
    const annId = body.announcementId;
    if (!annId || !eventId) return json({ error: "announcementId and eventId required" }, 400);

    const { data: ann } = await adminDb
      .from("event_announcements")
      .select("id, body, is_urgent, event_id, author_id, event:events!event_id(title, organizer_id)")
      .eq("id", annId).single();
    if (!ann) return json({ error: "announcement not found" }, 404);
    const annEvent = ann.event as { title?: string; organizer_id?: string } | null;
    if (annEvent?.organizer_id !== user.id) return json({ error: "forbidden" }, 403);

    // Получатели = те, у кого status='no_tg' в deliveries этого объявления
    const { data: noTgDeliveries } = await adminDb
      .from("announcement_deliveries")
      .select("user_id")
      .eq("announcement_id", annId)
      .eq("status", "no_tg");

    const noTgIds = (noTgDeliveries ?? []).map((d: { user_id: string }) => d.user_id);
    if (noTgIds.length === 0) return json({ sent: 0, skipped: 0 });

    const { data: profRows } = await adminDb
      .from("profiles")
      .select("id, name, email_notify_events")
      .in("id", noTgIds);
    const profMap = new Map((profRows ?? []).map((p: { id: string; name: string; email_notify_events?: boolean }) => [p.id, p]));

    const emailByUser = await loadEmails(noTgIds);
    const title   = String(annEvent?.title ?? "поездка");
    const annText = String(ann.body ?? "");

    let sent = 0, skipped = 0, failed = 0;
    const deliveries: DeliveryRow[] = [];

    for (const uid of noTgIds) {
      const prof  = profMap.get(uid) as { name?: string; email_notify_events?: boolean } | undefined;
      const email = emailByUser.get(uid);
      if (!email || prof?.email_notify_events === false) { skipped++; continue; }

      // Идемпотентность по announcement
      const { count } = await adminDb.from("email_deliveries").select("id", { count: "exact", head: true })
        .eq("user_id", uid).eq("type", "event_announcement_email").eq("related_id", annId).eq("status", "sent");
      if ((count ?? 0) > 0) { skipped++; continue; }

      const html = renderAnnouncement({
        firstName: firstNameOf(prof?.name),
        eventTitle: title, body: annText,
        isUrgent: !!ann.is_urgent,
        eventUrl: `${SITE_URL}/events/${eventId}`,
        settingsUrl: `${SITE_URL}/profile/settings`,
      });
      const subj = ann.is_urgent ? `🚨 ${title}: важное сообщение` : `📢 ${title}`;
      const ok = await sendEmail(email, subj, html);
      ok ? (sent++, deliveries.push(makeDelivery(uid, "event_announcement_email", annId, "sent")))
         : (failed++, deliveries.push(makeDelivery(uid, "event_announcement_email", annId, "failed", "smtp error")));
    }
    if (deliveries.length) await adminDb.from("email_deliveries").insert(deliveries);
    return json({ sent, skipped, failed });
  }

  // ── club_join_request ─────────────────────────────────────────────────────
  // Вызывается, когда пользователь подал заявку в клуб с visibility='request'.
  // Уведомляем всех owners и admins.
  if (mode === "club_join_request") {
    if (!body.clubId) return json({ error: "clubId required" }, 400);
    const clubId = body.clubId as string;

    const { data: club } = await adminDb
      .from("clubs")
      .select("id, name, slug")
      .eq("id", clubId).single();
    if (!club) return json({ error: "club not found" }, 404);

    const { data: applicantProfile } = await adminDb
      .from("profiles")
      .select("name, km_total, created_at")
      .eq("id", user.id).single();
    const applicantName = applicantProfile?.name ?? "Участник";

    // Все owners+admins, кроме самого заявителя
    const { data: admins } = await adminDb
      .from("club_members")
      .select("user_id, profile:profiles!user_id(name, email_notify_clubs)")
      .eq("club_id", clubId)
      .in("role", ["owner", "admin"])
      .eq("status", "active")
      .neq("user_id", user.id);

    const adminIds = (admins ?? []).map((a) => a.user_id as string);
    const emailByUser = await loadEmails(adminIds);
    let sent = 0, skipped = 0, failed = 0;
    const deliveries: DeliveryRow[] = [];
    const relatedId = `${clubId}:${user.id}` as unknown as string;

    for (const a of admins ?? []) {
      const uid  = a.user_id as string;
      const prof = a.profile as { name?: string; email_notify_clubs?: boolean } | null;
      const email = emailByUser.get(uid);
      if (!email || prof?.email_notify_clubs === false) {
        deliveries.push(makeDelivery(uid, "club_join_request", clubId, "skipped", !email ? "no email" : "opted out"));
        skipped++; continue;
      }
      // Идемпотентность: уже уведомили этого admin об этой заявке?
      const { count } = await adminDb.from("email_deliveries").select("id", { count: "exact", head: true })
        .eq("user_id", uid).eq("type", "club_join_request").eq("related_id", clubId).eq("status", "sent")
        .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
      if ((count ?? 0) > 0) { skipped++; continue; }

      const html = renderClubJoinRequest({
        adminName: firstNameOf(prof?.name),
        applicantName,
        clubName: String(club.name),
        kmTotal: applicantProfile?.km_total ?? 0,
        memberSince: applicantProfile?.created_at ? new Date(applicantProfile.created_at as string).getFullYear().toString() : "—",
        clubUrl: `${SITE_URL}/clubs/${club.slug}`,
        settingsUrl: `${SITE_URL}/profile/settings`,
      });
      const ok = await sendEmail(email, `Заявка в «${club.name}» — ${applicantName}`, html);
      ok ? (sent++, deliveries.push(makeDelivery(uid, "club_join_request", clubId, "sent")))
         : (failed++, deliveries.push(makeDelivery(uid, "club_join_request", clubId, "failed", "smtp error")));
    }
    if (deliveries.length) await adminDb.from("email_deliveries").insert(deliveries);
    return json({ sent, skipped, failed });
  }

  // ── club_join_approved ────────────────────────────────────────────────────
  if (mode === "club_join_approved") {
    if (!body.clubId || !body.memberId) return json({ error: "clubId and memberId required" }, 400);
    const { clubId, memberId } = body as { clubId: string; memberId: string };

    const { data: club } = await adminDb.from("clubs").select("id, name, slug").eq("id", clubId).single();
    if (!club) return json({ error: "club not found" }, 404);

    // Проверяем, что вызывающий — admin/owner этого клуба
    const { data: callerMembership } = await adminDb.from("club_members")
      .select("role").eq("club_id", clubId).eq("user_id", user.id).eq("status", "active").single();
    if (!callerMembership || !["owner", "admin"].includes(callerMembership.role as string))
      return json({ error: "forbidden" }, 403);

    const { data: memberProfile } = await adminDb
      .from("profiles").select("name, email_notify_clubs").eq("id", memberId).single();
    if (memberProfile?.email_notify_clubs === false) return json({ sent: 0, skipped: 1 });

    const { count } = await adminDb.from("email_deliveries").select("id", { count: "exact", head: true })
      .eq("user_id", memberId).eq("type", "club_join_approved").eq("related_id", clubId).eq("status", "sent");
    if ((count ?? 0) > 0) return json({ sent: 0, skipped: 1, reason: "already sent" });

    const emails = await loadEmails([memberId]);
    const email  = emails.get(memberId);
    if (!email) return json({ sent: 0, skipped: 1, reason: "no email" });

    const html = renderClubJoinApproved({
      firstName: firstNameOf(memberProfile?.name),
      clubName: String(club.name),
      clubUrl: `${SITE_URL}/clubs/${club.slug}`,
      settingsUrl: `${SITE_URL}/profile/settings`,
    });
    const ok = await sendEmail(email, `Ты в клубе «${club.name}»`, html);
    await adminDb.from("email_deliveries").insert(
      makeDelivery(memberId, "club_join_approved", clubId, ok ? "sent" : "failed", ok ? null : "smtp error")
    );
    return json({ sent: ok ? 1 : 0 });
  }

  // ── club_join_rejected ────────────────────────────────────────────────────
  if (mode === "club_join_rejected") {
    if (!body.clubId || !body.memberId) return json({ error: "clubId and memberId required" }, 400);
    const { clubId, memberId } = body as { clubId: string; memberId: string };

    const { data: club } = await adminDb.from("clubs").select("id, name, slug").eq("id", clubId).single();
    if (!club) return json({ error: "club not found" }, 404);

    const { data: callerMembership } = await adminDb.from("club_members")
      .select("role").eq("club_id", clubId).eq("user_id", user.id).eq("status", "active").single();
    if (!callerMembership || !["owner", "admin"].includes(callerMembership.role as string))
      return json({ error: "forbidden" }, 403);

    const { data: memberProfile } = await adminDb
      .from("profiles").select("name, email_notify_clubs").eq("id", memberId).single();
    if (memberProfile?.email_notify_clubs === false) return json({ sent: 0, skipped: 1 });

    const { count } = await adminDb.from("email_deliveries").select("id", { count: "exact", head: true })
      .eq("user_id", memberId).eq("type", "club_join_rejected").eq("related_id", clubId).eq("status", "sent");
    if ((count ?? 0) > 0) return json({ sent: 0, skipped: 1, reason: "already sent" });

    const emails = await loadEmails([memberId]);
    const email  = emails.get(memberId);
    if (!email) return json({ sent: 0, skipped: 1, reason: "no email" });

    const html = renderClubJoinRejected({
      firstName: firstNameOf(memberProfile?.name),
      clubName: String(club.name),
      clubsUrl: `${SITE_URL}/clubs`,
      settingsUrl: `${SITE_URL}/profile/settings`,
    });
    const ok = await sendEmail(email, `Заявка в «${club.name}» не одобрена`, html);
    await adminDb.from("email_deliveries").insert(
      makeDelivery(memberId, "club_join_rejected", clubId, ok ? "sent" : "failed", ok ? null : "smtp error")
    );
    return json({ sent: ok ? 1 : 0 });
  }

  // ── event_hour_reminder ───────────────────────────────────────────────────
  // Cron-only. Finds events starting in 50–70 min, emails participants.
  // Cron runs every 30 min so the ±10 min margin guarantees each event
  // is caught exactly once even with scheduling drift.
  if (mode === "event_hour_reminder") {
    if (!isCron) return json({ error: "cron only" }, 403);

    const now = new Date();
    const from = new Date(now.getTime() + 50 * 60_000).toISOString();
    const to   = new Date(now.getTime() + 70 * 60_000).toISOString();

    const { data: events } = await adminDb
      .from("events")
      .select("id, title, start_date, meet_point, organizer_id, organizer:profiles!organizer_id(name), event_participants(user_id, profile:profiles!user_id(name, email_notify_events))")
      .gte("start_date", from)
      .lte("start_date", to)
      .eq("is_private", false);

    let totalSent = 0, totalSkipped = 0, totalFailed = 0;

    for (const ev of events ?? []) {
      const title    = String(ev.title ?? "поездка");
      const dateStr  = ev.start_date ? formatDateTime(ev.start_date as string) : "";
      const meetPoint = (ev.meet_point as string | null) ?? null;
      const organizer = ev.organizer as { name?: string } | null;
      const eventId   = ev.id as string;
      const participants = (ev.event_participants as { user_id: string; profile: { name?: string | null; email_notify_events?: boolean } | null }[] | null) ?? [];
      const uids = participants.filter((p) => p.user_id !== ev.organizer_id).map((p) => p.user_id);
      const emailByUser = await loadEmails(uids);
      const deliveries: DeliveryRow[] = [];

      for (const p of participants) {
        if (p.user_id === ev.organizer_id) continue;
        const uid   = p.user_id as string;
        const prof  = p.profile;
        const email = emailByUser.get(uid);
        if (!email || prof?.email_notify_events === false) {
          deliveries.push(makeDelivery(uid, "event_hour_reminder", eventId, "skipped", !email ? "no email" : "opted out"));
          totalSkipped++; continue;
        }
        // Идемпотентность: одно напоминание на (user × event)
        const { count } = await adminDb.from("email_deliveries").select("id", { count: "exact", head: true })
          .eq("user_id", uid).eq("type", "event_hour_reminder").eq("related_id", eventId).eq("status", "sent");
        if ((count ?? 0) > 0) { totalSkipped++; continue; }

        const html = renderEventHourReminder({
          firstName: firstNameOf(prof?.name),
          title, dateStr, meetPoint,
          organizerName: organizer?.name ?? "Организатор",
          eventUrl: `${SITE_URL}/events/${eventId}`,
          settingsUrl: `${SITE_URL}/profile/settings`,
        });
        const ok = await sendEmail(email, `Через час поездка «${title}»`, html);
        ok ? (totalSent++, deliveries.push(makeDelivery(uid, "event_hour_reminder", eventId, "sent")))
           : (totalFailed++, deliveries.push(makeDelivery(uid, "event_hour_reminder", eventId, "failed", "smtp error")));
      }
      if (deliveries.length) await adminDb.from("email_deliveries").insert(deliveries);
    }
    return json({ sent: totalSent, skipped: totalSkipped, failed: totalFailed, events: events?.length ?? 0 });
  }

  // ── event_post_report ─────────────────────────────────────────────────────
  // Cron-only. Finds events that ended 22–26 h ago, invites participants
  // who haven't yet posted a ride_report to share theirs.
  if (mode === "event_post_report") {
    if (!isCron) return json({ error: "cron only" }, 403);

    const now = new Date();
    const from = new Date(now.getTime() - 26 * 3600_000).toISOString();
    const to   = new Date(now.getTime() - 22 * 3600_000).toISOString();

    const { data: events } = await adminDb
      .from("events")
      .select("id, title, start_date, route_id, organizer_id, event_participants(user_id, profile:profiles!user_id(name, email_notify_events))")
      .gte("start_date", from)
      .lte("start_date", to);

    let totalSent = 0, totalSkipped = 0, totalFailed = 0;

    for (const ev of events ?? []) {
      const title    = String(ev.title ?? "поездка");
      const eventId  = ev.id as string;
      const routeId  = ev.route_id as string | null;
      const participants = (ev.event_participants as { user_id: string; profile: { name?: string | null; email_notify_events?: boolean } | null }[] | null) ?? [];
      const uids = participants.map((p) => p.user_id);
      const emailByUser = await loadEmails(uids);

      // Кто уже написал отчёт за вчера (дата поездки)?
      const eventDate = ev.start_date ? (ev.start_date as string).slice(0, 10) : null;
      let reportedSet = new Set<string>();
      if (routeId && eventDate) {
        const { data: reports } = await adminDb
          .from("ride_reports")
          .select("user_id")
          .eq("route_id", routeId)
          .eq("ridden_at", eventDate)
          .in("user_id", uids);
        reportedSet = new Set((reports ?? []).map((r: { user_id: string }) => r.user_id));
      }

      const deliveries: DeliveryRow[] = [];

      for (const p of participants) {
        const uid  = p.user_id as string;
        const prof = p.profile;
        if (reportedSet.has(uid)) { totalSkipped++; continue; }  // уже написал
        const email = emailByUser.get(uid);
        if (!email || prof?.email_notify_events === false) {
          deliveries.push(makeDelivery(uid, "event_post_report", eventId, "skipped", !email ? "no email" : "opted out"));
          totalSkipped++; continue;
        }
        // Идемпотентность
        const { count } = await adminDb.from("email_deliveries").select("id", { count: "exact", head: true })
          .eq("user_id", uid).eq("type", "event_post_report").eq("related_id", eventId).eq("status", "sent");
        if ((count ?? 0) > 0) { totalSkipped++; continue; }

        const html = renderEventPostReport({
          firstName: firstNameOf(prof?.name),
          title,
          reportUrl: routeId ? `${SITE_URL}/routes/${routeId}/report/new` : `${SITE_URL}/routes`,
          settingsUrl: `${SITE_URL}/profile/settings`,
        });
        const ok = await sendEmail(email, `Как покаталось на «${title}»?`, html);
        ok ? (totalSent++, deliveries.push(makeDelivery(uid, "event_post_report", eventId, "sent")))
           : (totalFailed++, deliveries.push(makeDelivery(uid, "event_post_report", eventId, "failed", "smtp error")));
      }
      if (deliveries.length) await adminDb.from("email_deliveries").insert(deliveries);
    }
    return json({ sent: totalSent, skipped: totalSkipped, failed: totalFailed, events: events?.length ?? 0 });
  }

  return json({ error: "unknown mode" }, 400);
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

function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => vars[k] ?? "");
}

function render(name: string, vars: Record<string, string>, pageTitle: string): string {
  const body = fillTemplate(TEMPLATES.get(name)!, vars);
  return fillTemplate(TEMPLATES.get("_base")!, { PAGE_TITLE: pageTitle, BODY: body });
}

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
  const greeting = v.firstName === "привет"
    ? "Привет! Организатор отменил поездку, на которую ты записан."
    : `Привет, ${escapeHtml(v.firstName)}! Организатор отменил поездку, на которую ты записан.`;
  const reasonBlock = v.reason
    ? `<p style="font-size:14px;line-height:1.5;color:#71717A;margin:0 0 20px;"><b style="color:#3F3F46;">Причина:</b> ${escapeHtml(v.reason)}</p>`
    : "";
  return render("event-cancelled", {
    GREETING: greeting,
    TITLE: escapeHtml(v.title),
    DATE_ROW: v.dateStr ? `🗓 ${escapeHtml(v.dateStr)}<br/>` : "",
    MEET_POINT_ROW: v.meetPoint ? `📍 ${escapeHtml(v.meetPoint)}<br/>` : "",
    ORGANIZER_NAME: escapeHtml(v.organizerName),
    REASON_BLOCK: reasonBlock,
    EVENTS_URL: `${SITE_URL}/events`,
    SETTINGS_URL: v.settingsUrl,
  }, escapeHtml(`Поездку «${v.title}» отменили`));
}

function renderEventRescheduled(v: {
  firstName: string; title: string; oldDate: string; newDate: string;
  meetPoint: string | null; organizerName: string; eventUrl: string; settingsUrl: string;
}): string {
  const greeting = v.firstName !== "привет"
    ? `Привет, ${escapeHtml(v.firstName)}! У поездки поменялись детали.`
    : "Привет! У поездки поменялись детали.";
  return render("event-rescheduled", {
    GREETING: greeting,
    TITLE: escapeHtml(v.title),
    OLD_DATE: escapeHtml(v.oldDate),
    NEW_DATE: escapeHtml(v.newDate),
    MEET_POINT_ROW: v.meetPoint ? `📍 ${escapeHtml(v.meetPoint)}<br/>` : "",
    ORGANIZER_NAME: escapeHtml(v.organizerName),
    EVENT_URL: v.eventUrl,
    SETTINGS_URL: v.settingsUrl,
  }, escapeHtml(`Поездка «${v.title}» — новое время`));
}

function renderEventRsvpConfirmation(v: {
  firstName: string; title: string; dateStr: string; meetPoint: string | null;
  organizerName: string; participantsCount: number; eventUrl: string; settingsUrl: string;
}): string {
  const leadText = v.firstName !== "привет"
    ? `${escapeHtml(v.firstName)}, ты записан на поездку:`
    : "Ты записан на поездку:";
  return render("event-rsvp-confirmation", {
    LEAD_TEXT: leadText,
    TITLE: escapeHtml(v.title),
    DATE_ROW: v.dateStr ? `🗓 ${escapeHtml(v.dateStr)}<br/>` : "",
    MEET_POINT_ROW: v.meetPoint ? `📍 ${escapeHtml(v.meetPoint)}<br/>` : "",
    ORGANIZER_NAME: escapeHtml(v.organizerName),
    PARTICIPANTS_COUNT: String(v.participantsCount),
    EVENT_URL: v.eventUrl,
    SETTINGS_URL: v.settingsUrl,
  }, escapeHtml(`Ты записан на «${v.title}»`));
}

function renderEventNewRsvp(v: {
  organizerName: string; actorName: string; title: string;
  participantsCount: number; eventUrl: string; settingsUrl: string;
}): string {
  const leadPrefix = v.organizerName !== "привет" ? `${escapeHtml(v.organizerName)}, к` : "К";
  const leadText = `${leadPrefix} твоей поездке «${escapeHtml(v.title)}» присоединился <b>${escapeHtml(v.actorName)}</b>.`;
  return render("event-new-rsvp", {
    LEAD_TEXT: leadText,
    PARTICIPANTS_COUNT: String(v.participantsCount),
    EVENT_URL: v.eventUrl,
    SETTINGS_URL: v.settingsUrl,
  }, escapeHtml(`+1 на «${v.title}»: ${v.actorName}`));
}

function renderAnnouncement(v: {
  firstName: string; eventTitle: string; body: string;
  isUrgent: boolean; eventUrl: string; settingsUrl: string;
}): string {
  return render("announcement", {
    HEADING: v.isUrgent ? "🚨 Срочное объявление" : "📢 Объявление",
    EVENT_TITLE: escapeHtml(v.eventTitle),
    MESSAGE_TEXT: escapeHtml(v.body),
    EVENT_URL: v.eventUrl,
    SETTINGS_URL: v.settingsUrl,
  }, escapeHtml(`${v.isUrgent ? "🚨 " : "📢 "}${v.eventTitle}`));
}

function renderClubJoinRequest(v: {
  adminName: string; applicantName: string; clubName: string;
  kmTotal: number; memberSince: string; clubUrl: string; settingsUrl: string;
}): string {
  const leadPrefix = v.adminName !== "привет" ? `${escapeHtml(v.adminName)}, в` : "В";
  const leadText = `${leadPrefix} клуб «${escapeHtml(v.clubName)}» хочет вступить <b>${escapeHtml(v.applicantName)}</b>.`;
  return render("club-join-request", {
    LEAD_TEXT: leadText,
    APPLICANT_NAME: escapeHtml(v.applicantName),
    KM_TOTAL: String(v.kmTotal),
    MEMBER_SINCE: escapeHtml(v.memberSince),
    CLUB_MEMBERS_URL: `${v.clubUrl}?tab=members`,
    SETTINGS_URL: v.settingsUrl,
  }, escapeHtml(`Заявка в «${v.clubName}» — ${v.applicantName}`));
}

function renderClubJoinApproved(v: {
  firstName: string; clubName: string; clubUrl: string; settingsUrl: string;
}): string {
  const leadText = v.firstName !== "привет"
    ? `${escapeHtml(v.firstName)}, твою заявку одобрили. Теперь ты часть клуба.`
    : "Твою заявку одобрили. Теперь ты часть клуба.";
  return render("club-join-approved", {
    CLUB_NAME: escapeHtml(v.clubName),
    LEAD_TEXT: leadText,
    CLUB_URL: v.clubUrl,
    SETTINGS_URL: v.settingsUrl,
  }, escapeHtml(`Ты в клубе «${v.clubName}»`));
}

function renderClubJoinRejected(v: {
  firstName: string; clubName: string; clubsUrl: string; settingsUrl: string;
}): string {
  return render("club-join-rejected", {
    CLUB_NAME: escapeHtml(v.clubName),
    CLUBS_URL: v.clubsUrl,
    SETTINGS_URL: v.settingsUrl,
  }, escapeHtml(`Заявка в «${v.clubName}» не одобрена`));
}

function renderEventHourReminder(v: {
  firstName: string; title: string; dateStr: string;
  meetPoint: string | null; organizerName: string; eventUrl: string; settingsUrl: string;
}): string {
  const leadText = v.firstName !== "привет"
    ? `${escapeHtml(v.firstName)}, не забудь — скоро поездка:`
    : "Не забудь — скоро поездка:";
  return render("event-hour-reminder", {
    LEAD_TEXT: leadText,
    TITLE: escapeHtml(v.title),
    DATE_STR: escapeHtml(v.dateStr),
    MEET_POINT_ROW: v.meetPoint ? `📍 ${escapeHtml(v.meetPoint)}<br/>` : "",
    ORGANIZER_NAME: escapeHtml(v.organizerName),
    EVENT_URL: v.eventUrl,
    SETTINGS_URL: v.settingsUrl,
  }, escapeHtml(`Через час поездка «${v.title}»`));
}

function renderEventPostReport(v: {
  firstName: string; title: string; reportUrl: string; settingsUrl: string;
}): string {
  const leadPrefix = v.firstName !== "привет" ? `${escapeHtml(v.firstName)}, в` : "В";
  const leadText = `${leadPrefix}чера была поездка «${escapeHtml(v.title)}». Оставь пару слов и фото — это поможет другим выбрать маршрут.`;
  return render("event-post-report", {
    LEAD_TEXT: leadText,
    REPORT_URL: v.reportUrl,
    SETTINGS_URL: v.settingsUrl,
  }, escapeHtml(`Как покаталось на «${v.title}»?`));
}
