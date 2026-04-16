/**
 * tg-notify — Telegram notifications for ride intents.
 *
 * Supports two modes via request body:
 *
 *  mode "joined"    — someone joined an intent; notify the creator.
 *                     Body: { mode: "joined", intentId: string, joinerId: string }
 *                     Auth: the joiner's JWT.
 *
 *  mode "broadcast" — creator broadcasts to all participants.
 *                     Body: { mode: "broadcast", intentId: string }
 *                     Auth: must be the creator's JWT.
 *
 * Returns { sent: number, skipped: number }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "https://cycleconnect.ru";

const adminDb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function sendTg(chatId: number, text: string): Promise<boolean> {
  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    }
  );
  return res.ok;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Verify caller JWT using the service-role client (no ANON_KEY needed).
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "").trim();
  if (!jwt) return json({ error: "unauthorized" }, 401);

  const { data: { user }, error: authErr } = await adminDb.auth.getUser(jwt);
  if (authErr || !user) return json({ error: "unauthorized" }, 401);

  let body: { mode?: string; intentId?: string; joinerId?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const { mode = "broadcast", intentId, joinerId } = body;
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

  // ── MODE: joined ──────────────────────────────────────────────────────────
  if (mode === "joined") {
    // Load joiner's profile
    const joinerId_ = joinerId ?? user.id;
    const { data: joiner } = await adminDb
      .from("profiles")
      .select("name")
      .eq("id", joinerId_)
      .single();
    const joinerName = (joiner?.name as string | null) ?? "Участник";

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
      `📍 <b>${routeTitle}</b>\n` +
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
  const creatorName = (creatorProfile?.name as string | null) ?? "Организатор";

  const { data: participants } = await adminDb
    .from("ride_intent_participants")
    .select("user_id, profile:profiles!user_id(telegram_chat_id, tg_notify_intents, name)")
    .eq("intent_id", intentId)
    .neq("user_id", user.id);

  const text =
    `🚴 <b>${creatorName}</b> зовёт на покатушку!\n\n` +
    `📍 <b>${routeTitle}</b>\n` +
    `📅 ${date}\n` +
    (intent.note ? `💬 ${intent.note as string}\n` : "") +
    `\n<a href="${routeUrl}">Открыть маршрут</a>`;

  let sent = 0, skipped = 0;
  for (const p of participants ?? []) {
    const prof = p.profile as { telegram_chat_id?: number | null; tg_notify_intents?: boolean } | null;
    if (!prof?.telegram_chat_id || prof.tg_notify_intents === false) { skipped++; continue; }
    (await sendTg(prof.telegram_chat_id, text)) ? sent++ : skipped++;
  }

  return json({ sent, skipped });
});

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
