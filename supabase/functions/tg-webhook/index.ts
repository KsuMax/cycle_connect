/**
 * tg-webhook — Telegram Bot webhook handler.
 *
 * Handles two cases:
 *  1. /start <code>  — links the sender's chat_id to a CycleConnect profile.
 *  2. Anything else  — politely ignores (no echo bot behaviour).
 *
 * Environment secrets (set via `supabase secrets set`):
 *   TELEGRAM_BOT_TOKEN   — from @BotFather
 *   SUPABASE_SERVICE_ROLE_KEY  — auto-injected by Supabase Edge Runtime
 *   SUPABASE_URL               — auto-injected
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function sendMessage(chatId: number, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

Deno.serve(async (req: Request) => {
  // Telegram sends POST updates.
  if (req.method !== "POST") {
    return new Response("ok", { status: 200 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const message = update.message;
  if (!message?.text) {
    return new Response("ok");
  }

  const chatId = message.chat.id;
  const text = message.text.trim();

  // /start <code>  — link flow
  if (text.startsWith("/start")) {
    const parts = text.split(" ");
    const code = parts[1]?.trim();

    if (!code) {
      await sendMessage(
        chatId,
        "Привет! 👋 Чтобы привязать аккаунт, перейди по ссылке из настроек профиля CycleConnect."
      );
      return new Response("ok");
    }

    // Look up the code
    const now = new Date().toISOString();
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, name, tg_link_code, tg_link_code_exp, telegram_chat_id")
      .eq("tg_link_code", code)
      .gt("tg_link_code_exp", now)
      .maybeSingle();

    if (error || !profile) {
      await sendMessage(
        chatId,
        "Ссылка не найдена или устарела. Сгенерируй новую в настройках профиля."
      );
      return new Response("ok");
    }

    // Bind chat_id and clear the one-time code
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        telegram_chat_id: chatId,
        tg_link_code: null,
        tg_link_code_exp: null,
      })
      .eq("id", profile.id);

    if (updateError) {
      await sendMessage(chatId, "Произошла ошибка. Попробуй ещё раз.");
      return new Response("ok");
    }

    const name = (profile.name as string | null) ?? "велосипедист";
    await sendMessage(
      chatId,
      `✅ Аккаунт привязан! Привет, ${name}!\n\nТеперь буду присылать уведомления о поездках. Отключить можно в настройках профиля.`
    );

    return new Response("ok");
  }

  // All other messages — silent
  return new Response("ok");
});

// ─── Telegram Update types (minimal) ─────────────────────────────────────────

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: { id: number; username?: string; first_name?: string };
  text?: string;
}
