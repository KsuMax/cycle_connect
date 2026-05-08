/**
 * tg-notify — Telegram notifications for ride intents and event announcements.
 *
 * Modes:
 *  "joined"             — someone joined an intent; notify the creator.
 *  "broadcast"          — creator broadcasts to all intent participants.
 *  "club_event"         — post event announcement to club TG channel.
 *  "event_announcement" — organizer sends announcement DM to all event participants.
 *                         Body: { mode, eventId, body, isUrgent? }
 *                         Saves to event_announcements, tracks delivery.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TG_API_BASE = (Deno.env.get("TELEGRAM_API_BASE") ?? "https://api.telegram.org").replace(/\/$/, "");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "https://cycleconnect.cc";

const adminDb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function sendTg(chatId: number, text: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${TG_API_BASE}/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
        signal: AbortSignal.timeout(5000),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function sendTgWithOptout(
  chatId: number,
  text: string,
  eventId: string,
  urgent: boolean,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${TG_API_BASE}/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_notification: !urgent,
          reply_markup: {
            inline_keyboard: [[{
              text: "🔕 Не получать уведомления от этого события",
              callback_data: `optout_event_${eventId}`,
            }]],
          },
        }),
        signal: AbortSignal.timeout(5000),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Verify caller JWT using the service-role client (no ANON_KEY needed).
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "").trim();
  if (!jwt) return json({ error: "unauthorized" }, 401);

  const { data: { user }, error: authErr } = await adminDb.auth.getUser(jwt);
  if (authErr || !user) return json({ error: "unauthorized" }, 401);

  // joinerId is intentionally NOT read from the body anymore — see joined mode below.
  let body: { mode?: string; intentId?: string; eventId?: string; body?: string; isUrgent?: boolean };
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const { mode = "broadcast", intentId, eventId } = body;

  // ── MODE: club_event — post announcement to club's Telegram channel ────────
  if (mode === "club_event") {
    if (!eventId) return json({ error: "eventId required" }, 400);

    const { data: event } = await adminDb
      .from("events")
      .select("id, title, start_date, description, club_id, organizer_id, organizer:profiles!organizer_id(name), club:clubs!club_id(name, telegram_channel)")
      .eq("id", eventId)
      .single();

    if (!event) return json({ error: "event not found" }, 404);

    // Authz: only the event organizer (or, in future, a club admin) may
    // broadcast to the club channel. Without this check any authenticated
    // user could spam any club's Telegram channel by passing an arbitrary
    // eventId.
    if (event.organizer_id !== user.id) {
      return json({ error: "forbidden" }, 403);
    }

    const club = event.club as { name?: string; telegram_channel?: string | null } | null;
    const channel = club?.telegram_channel?.trim();
    if (!channel) return json({ sent: 0, skipped: 1, reason: "no telegram_channel" });

    const organizer = event.organizer as { name?: string } | null;
    const eventUrl = `${SITE_URL}/events/${eventId}`;
    const dateStr = event.start_date ? formatDate(event.start_date as string) : "";

    const text =
      `📅 <b>${escapeHtml(event.title as string)}</b>\n` +
      (dateStr ? `🗓 ${dateStr}\n` : "") +
      `👤 Организатор: ${escapeHtml(organizer?.name ?? "Участник")}\n` +
      `\n<a href="${eventUrl}">Записаться на поездку →</a>`;

    const ok = await sendTg(channel as unknown as number, text);
    return json({ sent: ok ? 1 : 0, skipped: ok ? 0 : 1 });
  }

  // ── MODE: event_announcement — DM all TG-linked participants ─────────────────
  if (mode === "event_announcement") {
    const annBody = body.body;
    const isUrgent = !!body.isUrgent;
    const evId = eventId;
    if (!evId || !annBody?.trim()) return json({ error: "eventId and body required" }, 400);

    const { data: event } = await adminDb
      .from("events")
      .select("organizer_id, title")
      .eq("id", evId)
      .single();
    if (!event) return json({ error: "event not found" }, 404);
    if (event.organizer_id !== user.id) return json({ error: "forbidden" }, 403);

    // Persist announcement
    const { data: announcement } = await adminDb
      .from("event_announcements")
      .insert({ event_id: evId, author_id: user.id, body: annBody.trim(), is_urgent: isUrgent })
      .select("id")
      .single();
    if (!announcement) return json({ error: "failed to save announcement" }, 500);

    // Get participants excluding organizer
    const { data: participants } = await adminDb
      .from("event_participants")
      .select("user_id, profile:profiles!user_id(telegram_chat_id)")
      .eq("event_id", evId)
      .neq("user_id", user.id);

    // Get optouts
    const { data: optouts } = await adminDb
      .from("announcement_optouts")
      .select("user_id")
      .eq("event_id", evId);
    const optoutSet = new Set((optouts ?? []).map((o: { user_id: string }) => o.user_id));

    const text =
      `📢 <b>${escapeHtml(event.title as string)}</b>\n\n${escapeHtml(annBody.trim())}`;

    type DeliveryRow = {
      announcement_id: string;
      user_id: string;
      status: string;
      delivered_at: string | null;
    };
    const deliveries: DeliveryRow[] = [];
    let sent = 0, noTg = 0, skipped = 0;

    for (const p of participants ?? []) {
      const prof = p.profile as { telegram_chat_id?: number | null } | null;
      const uid = p.user_id as string;

      if (optoutSet.has(uid)) {
        skipped++;
        continue;
      }
      if (!prof?.telegram_chat_id) {
        noTg++;
        deliveries.push({ announcement_id: announcement.id, user_id: uid, status: "no_tg", delivered_at: null });
        continue;
      }

      const ok = await sendTgWithOptout(prof.telegram_chat_id, text, evId, isUrgent);
      sent += ok ? 1 : 0;
      deliveries.push({
        announcement_id: announcement.id,
        user_id: uid,
        status: ok ? "sent" : "failed",
        delivered_at: ok ? new Date().toISOString() : null,
      });
    }

    if (deliveries.length > 0) {
      await adminDb.from("announcement_deliveries").insert(deliveries);
    }

    return json({ sent, skipped, no_tg: noTg, announcement_id: announcement.id });
  }

  if (!intentId) return json({ error: "intentId required" }, 400);

  // Load intent + route
  const { data: intent, error: intentErr } = await adminDb
    .from("ride_intents")
    .select("id, route_id, creator_id, planned_date, note, route:routes(id, title)")
    .eq("id", intentId)
    .single();
  if (intentErr || !intent) return json({ error: "intent not found" }, 404);

  const routeTitle = (intent.route as { title?: string } | null)?.title ?? "маршрут";
  const routeId = intent.route_id as string;
  const date = formatDate(intent.planned_date as string);
  const routeUrl = `${SITE_URL}/routes/${routeId}`;
  const safeRouteTitle = escapeHtml(routeTitle);
  const safeNote = intent.note ? escapeHtml(intent.note as string) : "";

  // ── MODE: joined ──────────────────────────────────────────────────────────
  if (mode === "joined") {
    // Verify caller actually joined this intent. Without this check any
    // authenticated user could pass any intentId and trigger a join
    // notification to the creator (spam / harassment vector).
    const { data: membership } = await adminDb
      .from("ride_intent_participants")
      .select("user_id")
      .eq("intent_id", intentId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) return json({ error: "not a participant" }, 403);

    // Joiner identity comes from the session — never from the body.
    const { data: joiner } = await adminDb
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .single();
    const joinerName = escapeHtml((joiner?.name as string | null) ?? "Участник");

    // Load creator's chat_id
    const { data: creator } = await adminDb
      .from("profiles")
      .select("telegram_chat_id, tg_notify_intents, name")
      .eq("id", intent.creator_id as string)
      .single();

    if (!creator?.telegram_chat_id || creator.tg_notify_intents === false) {
      return json({ sent: 0, skipped: 1 });
    }

    const text =
      `🚴 <b>${joinerName}</b> хочет поехать вместе!\n\n` +
      `📍 <b>${safeRouteTitle}</b>\n` +
      `📅 ${date}\n` +
      `\n<a href="${routeUrl}">Открыть маршрут</a>`;

    const ok = await sendTg(creator.telegram_chat_id as number, text);
    return json({ sent: ok ? 1 : 0, skipped: ok ? 0 : 1 });
  }

  // ── MODE: broadcast ───────────────────────────────────────────────────────
  // Only the creator can broadcast
  if (intent.creator_id !== user.id) return json({ error: "forbidden" }, 403);

  const { data: creatorProfile } = await adminDb
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();
  const creatorName = escapeHtml((creatorProfile?.name as string | null) ?? "Организатор");

  const { data: participants } = await adminDb
    .from("ride_intent_participants")
    .select("user_id, profile:profiles!user_id(telegram_chat_id, tg_notify_intents, name)")
    .eq("intent_id", intentId)
    .neq("user_id", user.id);

  const text =
    `🚴 <b>${creatorName}</b> зовёт на покатушку!\n\n` +
    `📍 <b>${safeRouteTitle}</b>\n` +
    `📅 ${date}\n` +
    (safeNote ? `💬 ${safeNote}\n` : "") +
    `\n<a href="${routeUrl}">Открыть маршрут</a>`;

  let sent = 0, skipped = 0;
  for (const p of participants ?? []) {
    const prof = p.profile as { telegram_chat_id?: number | null; tg_notify_intents?: boolean } | null;
    if (!prof?.telegram_chat_id || prof.tg_notify_intents === false) { skipped++; continue; }
    (await sendTg(prof.telegram_chat_id, text)) ? sent++ : skipped++;
  }

  return json({ sent, skipped });
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric", month: "long", year: "numeric",
  });
}
