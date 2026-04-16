/**
 * POST /api/tg-notify
 *
 * Calls Telegram Bot API directly from the server — no edge function
 * involved, which avoids the JWT forwarding issues.
 *
 * Body:
 *   { mode: "joined",    intentId: string }   — notify creator
 *   { mode: "broadcast", intentId: string }   — notify all participants (creator only)
 *
 * Env vars (server-side, NOT prefixed with NEXT_PUBLIC_):
 *   TELEGRAM_BOT_TOKEN
 *   NEXT_PUBLIC_SITE_URL  (used for the route link in the message)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cycleconnect.cc";

async function sendTg(chatId: number, text: string): Promise<boolean> {
  if (!BOT_TOKEN) return false;
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  return res.ok;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(req: NextRequest) {
  // Auth check via session cookie
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: { mode?: string; intentId?: string };
  try { body = await req.json(); }
  catch { return json({ error: "invalid json" }, 400); }

  const { mode = "broadcast", intentId } = body;
  if (!intentId) return json({ error: "intentId required" }, 400);

  // Use service role for DB queries (bypasses RLS)
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Load intent + route title
  const { data: intent, error: intentErr } = await admin
    .from("ride_intents")
    .select("id, route_id, creator_id, planned_date, note, route:routes(title)")
    .eq("id", intentId)
    .single();
  if (intentErr || !intent) return json({ error: "intent not found" }, 404);

  const routeTitle = (intent.route as { title?: string } | null)?.title ?? "маршрут";
  const date = formatDate(intent.planned_date as string);
  const routeUrl = `${SITE_URL}/routes/${intent.route_id}`;

  // ── MODE: joined — notify the creator ──────────────────────────────────────
  if (mode === "joined") {
    // Load joiner name
    const { data: joiner } = await admin.from("profiles").select("name").eq("id", user.id).single();
    const joinerName = (joiner?.name as string) ?? "Участник";

    // Load creator TG chat_id
    const { data: creator } = await admin
      .from("profiles")
      .select("telegram_chat_id, tg_notify_intents")
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

  // ── MODE: broadcast — creator notifies all participants ────────────────────
  if (intent.creator_id !== user.id) return json({ error: "forbidden" }, 403);

  const { data: creatorProfile } = await admin.from("profiles").select("name").eq("id", user.id).single();
  const creatorName = (creatorProfile?.name as string) ?? "Организатор";

  const { data: participants } = await admin
    .from("ride_intent_participants")
    .select("user_id, profile:profiles!user_id(telegram_chat_id, tg_notify_intents)")
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
}
