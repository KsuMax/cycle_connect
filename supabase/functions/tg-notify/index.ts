/**
 * tg-notify — Send a Telegram notification to all intent participants.
 *
 * Called from the CycleConnect frontend via a Supabase Edge Function invoke.
 * The caller must be authenticated (we verify via the Authorization header).
 *
 * Request body (JSON):
 *   { intentId: string }
 *
 * What it does:
 *   1. Validates the caller is the intent creator.
 *   2. Loads all participants + their telegram_chat_id (where tg_notify_intents=true).
 *   3. Sends a Telegram message to each linked participant.
 *   4. Returns { sent: number, skipped: number }.
 *
 * Environment secrets:
 *   TELEGRAM_BOT_TOKEN
 *   SUPABASE_SERVICE_ROLE_KEY  (auto-injected)
 *   SUPABASE_URL               (auto-injected)
 *   NEXT_PUBLIC_SITE_URL       — e.g. https://cycleconnect.ru
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
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  // Verify caller JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");
  if (!jwt) return json({ error: "unauthorized" }, 401);

  const userDb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: { user }, error: authErr } = await userDb.auth.getUser();
  if (authErr || !user) return json({ error: "unauthorized" }, 401);

  let body: { intentId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const { intentId } = body;
  if (!intentId) return json({ error: "intentId required" }, 400);

  // Load intent + route (to build the message)
  const { data: intent, error: intentErr } = await adminDb
    .from("ride_intents")
    .select("id, route_id, creator_id, planned_date, note, route:routes(id, title)")
    .eq("id", intentId)
    .single();

  if (intentErr || !intent) return json({ error: "intent not found" }, 404);

  // Only the creator can trigger a broadcast
  if (intent.creator_id !== user.id) {
    return json({ error: "forbidden" }, 403);
  }

  // Load participants with TG linked + notifications on, excluding creator
  const { data: participants } = await adminDb
    .from("ride_intent_participants")
    .select("user_id, profile:profiles!user_id(telegram_chat_id, tg_notify_intents, name)")
    .eq("intent_id", intentId)
    .neq("user_id", user.id);

  // Load creator name for the message
  const { data: creatorProfile } = await adminDb
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  const creatorName = (creatorProfile?.name as string | null) ?? "Организатор";
  const routeTitle = (intent.route as { title?: string } | null)?.title ?? "маршруту";
  const routeId = intent.route_id;
  const date = formatDate(intent.planned_date as string);
  const routeUrl = `${SITE_URL}/routes/${routeId}`;

  const messageText =
    `🚴 <b>${creatorName}</b> зовёт на покатушку!\n\n` +
    `📍 <b>${routeTitle}</b>\n` +
    `📅 ${date}\n` +
    (intent.note ? `💬 ${intent.note}\n` : "") +
    `\n<a href="${routeUrl}">Открыть маршрут</a>`;

  let sent = 0;
  let skipped = 0;

  for (const p of participants ?? []) {
    const profile = p.profile as {
      telegram_chat_id?: number | null;
      tg_notify_intents?: boolean;
      name?: string | null;
    } | null;

    if (!profile?.telegram_chat_id || profile.tg_notify_intents === false) {
      skipped++;
      continue;
    }

    const ok = await sendTg(profile.telegram_chat_id, messageText);
    ok ? sent++ : skipped++;
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
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
