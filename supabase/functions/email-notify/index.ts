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

// ── новые шаблоны ─────────────────────────────────────────────────────────────

function renderEventRescheduled(v: {
  firstName: string; title: string; oldDate: string; newDate: string;
  meetPoint: string | null; organizerName: string; eventUrl: string; settingsUrl: string;
}): string {
  return baseLayout({ title: `Поездка «${v.title}» — новое время`, body: `
    <h1 style="font-size:22px;line-height:1.3;color:#1C1C1E;margin:0 0 16px;">Поездка перенесена</h1>
    <p style="font-size:15px;line-height:1.5;color:#3F3F46;margin:0 0 20px;">
      Привет${v.firstName !== "привет" ? ", " + escapeHtml(v.firstName) : ""}! У поездки поменялись детали.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F4F1;border-radius:12px;padding:16px;margin:0 0 24px;">
      <tr><td style="font-size:14px;color:#1C1C1E;line-height:1.8;">
        📅 <b>${escapeHtml(v.title)}</b><br/>
        ❌ <span style="text-decoration:line-through;color:#A1A1AA;">Было: ${escapeHtml(v.oldDate)}</span><br/>
        ✅ Стало: <b>${escapeHtml(v.newDate)}</b><br/>
        ${v.meetPoint ? `📍 ${escapeHtml(v.meetPoint)}<br/>` : ""}
        👤 Организатор: ${escapeHtml(v.organizerName)}
      </td></tr>
    </table>
    ${ctaButton("Открыть поездку", v.eventUrl)}
    <p style="font-size:12px;color:#A1A1AA;margin:24px 0 0;">
      <a href="${v.settingsUrl}" style="color:#F4632A;text-decoration:none;">Настроить уведомления →</a>
    </p>
  `});
}

function renderEventRsvpConfirmation(v: {
  firstName: string; title: string; dateStr: string; meetPoint: string | null;
  organizerName: string; participantsCount: number; eventUrl: string; settingsUrl: string;
}): string {
  return baseLayout({ title: `Ты записан на «${v.title}»`, body: `
    <h1 style="font-size:22px;line-height:1.3;color:#1C1C1E;margin:0 0 16px;">Готово — до встречи!</h1>
    <p style="font-size:15px;line-height:1.5;color:#3F3F46;margin:0 0 20px;">
      ${v.firstName !== "привет" ? escapeHtml(v.firstName) + ", ты" : "Ты"} записан${""} на поездку:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F4F1;border-radius:12px;padding:16px;margin:0 0 24px;">
      <tr><td style="font-size:14px;color:#1C1C1E;line-height:1.8;">
        📅 <b>${escapeHtml(v.title)}</b><br/>
        ${v.dateStr ? `🗓 ${escapeHtml(v.dateStr)}<br/>` : ""}
        ${v.meetPoint ? `📍 ${escapeHtml(v.meetPoint)}<br/>` : ""}
        👤 Организатор: ${escapeHtml(v.organizerName)}<br/>
        👥 Уже едут: ${v.participantsCount}
      </td></tr>
    </table>
    ${ctaButton("Открыть поездку", v.eventUrl)}
    <p style="font-size:12px;color:#A1A1AA;margin:24px 0 0;">
      <a href="${v.settingsUrl}" style="color:#F4632A;text-decoration:none;">Настроить уведомления →</a>
    </p>
  `});
}

function renderEventNewRsvp(v: {
  organizerName: string; actorName: string; title: string;
  participantsCount: number; eventUrl: string; settingsUrl: string;
}): string {
  return baseLayout({ title: `+1 на «${v.title}»: ${v.actorName}`, body: `
    <h1 style="font-size:22px;line-height:1.3;color:#1C1C1E;margin:0 0 16px;">
      Новый участник 🎉
    </h1>
    <p style="font-size:15px;line-height:1.5;color:#3F3F46;margin:0 0 20px;">
      ${v.organizerName !== "привет" ? escapeHtml(v.organizerName) + ", к" : "К"} твоей поездке
      «${escapeHtml(v.title)}» присоединился <b>${escapeHtml(v.actorName)}</b>.
    </p>
    <p style="font-size:14px;color:#71717A;margin:0 0 24px;">
      Сейчас участников: <b>${v.participantsCount}</b>
    </p>
    ${ctaButton("Список участников →", v.eventUrl)}
    <p style="font-size:12px;color:#A1A1AA;margin:24px 0 0;">
      <a href="${v.settingsUrl}" style="color:#F4632A;text-decoration:none;">Настроить уведомления →</a>
    </p>
  `});
}

function renderAnnouncement(v: {
  firstName: string; eventTitle: string; body: string;
  isUrgent: boolean; eventUrl: string; settingsUrl: string;
}): string {
  return baseLayout({ title: `${v.isUrgent ? "🚨 " : "📢 "}${v.eventTitle}`, body: `
    <h1 style="font-size:22px;line-height:1.3;color:#1C1C1E;margin:0 0 8px;">
      ${v.isUrgent ? "🚨 Срочное объявление" : "📢 Объявление"}
    </h1>
    <p style="font-size:13px;color:#A1A1AA;margin:0 0 20px;">${escapeHtml(v.eventTitle)}</p>
    <div style="font-size:15px;line-height:1.6;color:#3F3F46;white-space:pre-line;margin:0 0 24px;">
      ${escapeHtml(v.body)}
    </div>
    ${ctaButton("Открыть поездку", v.eventUrl)}
    <p style="font-size:12px;color:#A1A1AA;margin:24px 0 0;">
      <a href="${v.settingsUrl}" style="color:#F4632A;text-decoration:none;">Настроить уведомления →</a>
    </p>
  `});
}

function renderClubJoinRequest(v: {
  adminName: string; applicantName: string; clubName: string;
  kmTotal: number; memberSince: string; clubUrl: string; settingsUrl: string;
}): string {
  return baseLayout({ title: `Заявка в «${v.clubName}» — ${v.applicantName}`, body: `
    <h1 style="font-size:22px;line-height:1.3;color:#1C1C1E;margin:0 0 16px;">Новая заявка</h1>
    <p style="font-size:15px;line-height:1.5;color:#3F3F46;margin:0 0 20px;">
      ${v.adminName !== "привет" ? escapeHtml(v.adminName) + ", в" : "В"} клуб
      «${escapeHtml(v.clubName)}» хочет вступить <b>${escapeHtml(v.applicantName)}</b>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F4F1;border-radius:12px;padding:16px;margin:0 0 24px;">
      <tr><td style="font-size:14px;color:#1C1C1E;line-height:1.8;">
        👤 <b>${escapeHtml(v.applicantName)}</b><br/>
        🚴 ${v.kmTotal} км накатано<br/>
        📅 На сервисе с ${escapeHtml(v.memberSince)}
      </td></tr>
    </table>
    ${ctaButton("Открыть заявки →", v.clubUrl + "?tab=members")}
    <p style="font-size:12px;color:#A1A1AA;margin:24px 0 0;">
      <a href="${v.settingsUrl}" style="color:#F4632A;text-decoration:none;">Настроить уведомления →</a>
    </p>
  `});
}

function renderClubJoinApproved(v: {
  firstName: string; clubName: string; clubUrl: string; settingsUrl: string;
}): string {
  return baseLayout({ title: `Ты в клубе «${v.clubName}»`, body: `
    <h1 style="font-size:22px;line-height:1.3;color:#1C1C1E;margin:0 0 16px;">
      Добро пожаловать в «${escapeHtml(v.clubName)}»! 🎉
    </h1>
    <p style="font-size:15px;line-height:1.5;color:#3F3F46;margin:0 0 24px;">
      ${v.firstName !== "привет" ? escapeHtml(v.firstName) + ", т" : "Т"}вою заявку одобрили.
      Теперь ты часть клуба.
    </p>
    <p style="font-size:14px;color:#71717A;margin:0 0 24px;">
      Загляни в клуб: посмотри календарь поездок и закреплённые маршруты.
    </p>
    ${ctaButton("Открыть клуб →", v.clubUrl)}
    <p style="font-size:12px;color:#A1A1AA;margin:24px 0 0;">
      <a href="${v.settingsUrl}" style="color:#F4632A;text-decoration:none;">Настроить уведомления →</a>
    </p>
  `});
}

function renderClubJoinRejected(v: {
  firstName: string; clubName: string; clubsUrl: string; settingsUrl: string;
}): string {
  return baseLayout({ title: `Заявка в «${v.clubName}» не одобрена`, body: `
    <h1 style="font-size:22px;line-height:1.3;color:#1C1C1E;margin:0 0 16px;">
      Заявку не одобрили
    </h1>
    <p style="font-size:15px;line-height:1.5;color:#3F3F46;margin:0 0 24px;">
      К сожалению, владелец клуба «${escapeHtml(v.clubName)}» не принял твою заявку. Это
      бывает — клуб мог быть закрыт по другим причинам.
    </p>
    <p style="font-size:14px;color:#71717A;margin:0 0 24px;">
      Рядом есть другие клубы — возможно, там найдёшь компанию для катания.
    </p>
    ${ctaButton("Найти клуб →", v.clubsUrl)}
    <p style="font-size:12px;color:#A1A1AA;margin:24px 0 0;">
      <a href="${v.settingsUrl}" style="color:#F4632A;text-decoration:none;">Настроить уведомления →</a>
    </p>
  `});
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
