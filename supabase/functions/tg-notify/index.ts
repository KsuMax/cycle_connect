/**
 * tg-notify — Telegram notifications.
 *
 * In-app notifications are written by DB triggers; this function
 * only handles the TG side. It mirrors the same debounce / idempotency
 * rules the triggers use so the two channels stay consistent.
 *
 * Modes:
 *   "route_interest_new" { routeId }
 *     Actor = caller (from JWT). Pings the rest of the pool.
 *     Debounced: each recipient hears about each route at most
 *     once per hour (matches the trigger in migration 049).
 *
 *   "event_for_pool" { eventId }
 *     Organizer-only. Pings everyone in the pool of the event's
 *     route. Idempotent via events.pool_notified_at (set by the
 *     trigger before this runs, so we use the row's pre-insert
 *     state by checking that the trigger already ran).
 *
 *   "club_event"         { eventId } — post to club's TG channel.
 *   "event_announcement" { eventId, body, isUrgent } — DM participants.
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

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "").trim();
  if (!jwt) return json({ error: "unauthorized" }, 401);

  // Local JWT verification — avoids the slow GoTrue auth.getUser() round-trip
  // which was causing wall-clock early-termination (same fix as email-notify).
  let user: { id: string };
  try {
    const jwtSecret = Deno.env.get("JWT_SECRET")!;
    const [hb, pb, sb] = jwt.split(".");
    if (!hb || !pb || !sb) throw new Error("invalid jwt");
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC", key,
      Uint8Array.from(atob(sb.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
      new TextEncoder().encode(`${hb}.${pb}`),
    );
    if (!valid) throw new Error("bad sig");
    const payload = JSON.parse(atob(pb.replace(/-/g, "+").replace(/_/g, "/")));
    if (!payload.sub) throw new Error("no sub");
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error("expired");
    user = { id: payload.sub as string };
  } catch {
    return json({ error: "unauthorized" }, 401);
  }

  let body: {
    mode?: string;
    routeId?: string;
    eventId?: string;
    body?: string;
    isUrgent?: boolean;
  };
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const { mode, routeId, eventId } = body;

  // ── route_interest_new ────────────────────────────────────────────────
  if (mode === "route_interest_new") {
    if (!routeId) return json({ error: "routeId required" }, 400);

    // Confirm the caller is actually in the pool — otherwise anyone
    // could spam pings for any route.
    const { data: membership } = await adminDb
      .from("route_interests")
      .select("user_id")
      .eq("route_id", routeId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) return json({ error: "not in pool" }, 403);

    const { data: route } = await adminDb
      .from("routes")
      .select("title")
      .eq("id", routeId)
      .single();
    const routeTitle = escapeHtml((route?.title as string | null) ?? "маршрут");
    const routeUrl = `${SITE_URL}/routes/${routeId}`;

    const { data: actor } = await adminDb
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .single();
    const actorName = escapeHtml((actor?.name as string | null) ?? "Катальщик");

    // Pool minus caller
    const { data: pool } = await adminDb
      .from("route_interests")
      .select("user_id, profile:profiles!user_id(telegram_chat_id, tg_notify_interests)")
      .eq("route_id", routeId)
      .neq("user_id", user.id);

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const text =
      `🚴 <b>${actorName}</b> хочет проехать «${routeTitle}»\n\n` +
      `<a href="${routeUrl}">Открыть маршрут</a>`;

    // Filter to TG-linked users who haven't opted out
    const tgPool = (pool ?? []).filter((p) => {
      const prof = p.profile as { telegram_chat_id?: number | null; tg_notify_interests?: boolean } | null;
      return prof?.telegram_chat_id && prof.tg_notify_interests !== false;
    });

    if (tgPool.length === 0) return json({ sent: 0, skipped: (pool ?? []).length });

    // Batch debounce check: one query for all recipients instead of N queries
    const tgUids = tgPool.map((p) => p.user_id as string);
    const { data: recentNotifs } = await adminDb
      .from("notifications")
      .select("user_id")
      .in("user_id", tgUids)
      .eq("type", "route_interest_new")
      .eq("data->>route_id", routeId)
      .gt("created_at", since);
    const notifiedSet = new Set((recentNotifs ?? []).map((n: { user_id: string }) => n.user_id));

    // Send TG messages in parallel
    const results = await Promise.all(
      tgPool.map(async (p) => {
        const prof = p.profile as { telegram_chat_id?: number | null } | null;
        const uid = p.user_id as string;
        if (!notifiedSet.has(uid)) return "skipped";
        return (await sendTg(prof!.telegram_chat_id!, text)) ? "sent" : "skipped";
      })
    );

    const sent = results.filter((r) => r === "sent").length;
    const skipped = results.filter((r) => r === "skipped").length;
    return json({ sent, skipped });
  }

  // ── event_for_pool ────────────────────────────────────────────────────
  if (mode === "event_for_pool") {
    if (!eventId) return json({ error: "eventId required" }, 400);

    const { data: event } = await adminDb
      .from("events")
      .select("id, title, start_date, route_id, organizer_id, is_private, route:routes(title)")
      .eq("id", eventId)
      .single();
    if (!event) return json({ error: "event not found" }, 404);
    if (event.organizer_id !== user.id) return json({ error: "forbidden" }, 403);
    if (!event.route_id || event.is_private) return json({ sent: 0, skipped: 0 });

    const routeTitle = escapeHtml(((event.route as { title?: string } | null)?.title) ?? "маршрут");
    const safeTitle = escapeHtml(event.title as string);
    const dateStr = event.start_date ? formatDate(event.start_date as string) : "";
    const eventUrl = `${SITE_URL}/events/${eventId}`;

    const { data: pool } = await adminDb
      .from("route_interests")
      .select("user_id, profile:profiles!user_id(telegram_chat_id, tg_notify_interests)")
      .eq("route_id", event.route_id as string)
      .neq("user_id", user.id);

    const text =
      `📅 На маршруте «${routeTitle}», который ты хотел проехать, открыто мероприятие!\n\n` +
      `<b>${safeTitle}</b>\n` +
      (dateStr ? `🗓 ${dateStr}\n` : "") +
      `\n<a href="${eventUrl}">Открыть мероприятие →</a>`;

    let sent = 0, skipped = 0;
    for (const p of pool ?? []) {
      const prof = p.profile as { telegram_chat_id?: number | null; tg_notify_interests?: boolean } | null;
      if (!prof?.telegram_chat_id || prof.tg_notify_interests === false) { skipped++; continue; }
      (await sendTg(prof.telegram_chat_id, text)) ? sent++ : skipped++;
    }

    return json({ sent, skipped });
  }

  // ── club_event — post to club's Telegram channel ─────────────────────
  if (mode === "club_event") {
    if (!eventId) return json({ error: "eventId required" }, 400);

    const { data: event } = await adminDb
      .from("events")
      .select("id, title, start_date, description, club_id, organizer_id, organizer:profiles!organizer_id(name), club:clubs!club_id(name, telegram_channel)")
      .eq("id", eventId)
      .single();
    if (!event) return json({ error: "event not found" }, 404);
    if (event.organizer_id !== user.id) return json({ error: "forbidden" }, 403);

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

  // ── event_announcement — DM TG-linked participants ───────────────────
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

    const { data: announcement } = await adminDb
      .from("event_announcements")
      .insert({ event_id: evId, author_id: user.id, body: annBody.trim(), is_urgent: isUrgent })
      .select("id")
      .single();
    if (!announcement) return json({ error: "failed to save announcement" }, 500);

    const { data: participants } = await adminDb
      .from("event_participants")
      .select("user_id, profile:profiles!user_id(telegram_chat_id)")
      .eq("event_id", evId)
      .neq("user_id", user.id);

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

      if (optoutSet.has(uid)) { skipped++; continue; }
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

  return json({ error: "unknown mode" }, 400);
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
