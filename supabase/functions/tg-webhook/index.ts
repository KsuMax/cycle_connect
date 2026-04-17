/**
 * tg-webhook — Telegram Bot webhook handler.
 *
 * Handles:
 *  1. /start <code>  — links chat_id to a CycleConnect profile.
 *  2. Any text       — AI-powered route search via OpenRouter (Gemma 4 31B).
 *
 * Secrets (set via `supabase secrets set`):
 *   TELEGRAM_BOT_TOKEN
 *   OPENROUTER_API_KEY
 *   SITE_URL               (e.g. https://cycleconnect.cc)
 *   SUPABASE_SERVICE_ROLE_KEY  — auto-injected
 *   SUPABASE_URL               — auto-injected
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://cycleconnect.cc";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a cycling route assistant for CycleConnect, a Russian cycling community platform.
Parse the user's message (Russian or English) and extract route search filters.
Return ONLY a valid JSON object — no explanation, no markdown, no code blocks.

Possible fields (all optional):
{
  "difficulty": "easy" | "medium" | "hard",
  "distance_min": number (km),
  "distance_max": number (km),
  "elevation_max": number (meters),
  "surface": array of "asphalt" | "gravel" | "dirt" | "mixed",
  "route_types": array of "road" | "gravel" | "mtb" | "urban",
  "bike_types": array of "road" | "mountain" | "gravel",
  "region": string — choose closest match from [Карелия, Санкт-Петербург, Ленинградская область, Москва, Подмосковье, Краснодарский край, Крым, Алтай, Байкал, Урал],
  "search_text": string — keywords to search in title and description
}

Interpretation rules:
- лёгкий / несложный / начинающий / для новичка → difficulty: "easy"
- средний / умеренный / обычный → difficulty: "medium"
- сложный / тяжёлый / экстрим / профессиональный → difficulty: "hard"
- "2 часа" / "пару часов" → distance_max: 60
- "полдня" / "несколько часов" → distance_max: 80
- "на день" / "целый день" / "однодневный" → distance_max: 150
- "50 км" → distance_min: 45, distance_max: 55 (±10% tolerance)
- асфальт / шоссе / дорога → surface includes "asphalt"
- гравий / грунт / грунтовка → surface includes "gravel"
- грязь / бездорожье / лес → surface includes "dirt"
- шоссейный велосипед → bike_types: ["road"]
- горный велосипед / mtb / эндуро → bike_types: ["mountain"], route_types: ["mtb"]
- гравийный велосипед / гравел → bike_types: ["gravel"]
- город / городской / по городу → route_types: ["urban"]
- горы / горный маршрут → route_types: ["mtb"]
- Nature keywords (море, озеро, лес, горы, вода, природа) → add to search_text
- Omit any field you cannot confidently extract
- Return {} if no filters can be determined`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface RouteFilters {
  difficulty?: string;
  distance_min?: number;
  distance_max?: number;
  elevation_max?: number;
  surface?: string[];
  route_types?: string[];
  bike_types?: string[];
  region?: string;
  search_text?: string;
}

interface DbRoute {
  id: string;
  title: string;
  distance_km: number;
  elevation_m: number;
  difficulty: string;
  region: string;
}

// ─── AI filter parsing ────────────────────────────────────────────────────────

async function parseFilters(query: string): Promise<RouteFilters> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": SITE_URL,
        "X-Title": "CycleConnect",
      },
      body: JSON.stringify({
        model: "google/gemma-4-31b-it:free",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: query },
        ],
        max_tokens: 250,
        temperature: 0.1,
      }),
    });
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    // Strip markdown fences if the model wraps its output
    const cleaned = raw.replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return {};
  }
}

// ─── Supabase route query ─────────────────────────────────────────────────────

async function searchRoutes(filters: RouteFilters): Promise<DbRoute[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from("routes")
    .select("id, title, distance_km, elevation_m, difficulty, region")
    .order("created_at", { ascending: false })
    .limit(5);

  if (filters.difficulty) q = q.eq("difficulty", filters.difficulty);
  if (filters.distance_min) q = q.gte("distance_km", filters.distance_min);
  if (filters.distance_max) q = q.lte("distance_km", filters.distance_max);
  if (filters.elevation_max) q = q.lte("elevation_m", filters.elevation_max);
  if (filters.region) q = q.ilike("region", `%${filters.region}%`);
  if (filters.surface?.length) q = q.overlaps("surface", filters.surface);
  if (filters.route_types?.length) q = q.overlaps("route_types", filters.route_types);
  if (filters.bike_types?.length) q = q.overlaps("bike_types", filters.bike_types);
  if (filters.search_text) {
    q = q.or(
      `title.ilike.%${filters.search_text}%,description.ilike.%${filters.search_text}%`,
    );
  }

  const { data } = await q;
  return (data as DbRoute[]) ?? [];
}

// ─── Message formatting ───────────────────────────────────────────────────────

function difficultyLabel(d: string): string {
  if (d === "easy") return "🟢 Лёгкий";
  if (d === "medium") return "🟡 Средний";
  return "🔴 Сложный";
}

function formatResults(routes: DbRoute[], query: string): string {
  if (routes.length === 0) {
    return (
      `😔 По запросу "<b>${escapeHtml(query)}</b>" маршрутов не нашлось.\n\n` +
      `Попробуй другие слова или <a href="${SITE_URL}/routes">посмотри все маршруты</a>.`
    );
  }

  const suffix =
    routes.length === 1 ? "маршрут" : routes.length < 5 ? "маршрута" : "маршрутов";

  const lines = routes.map((r, i) => {
    const url = `${SITE_URL}/routes/${r.id}`;
    return (
      `${i + 1}. <a href="${url}"><b>${escapeHtml(r.title)}</b></a>\n` +
      `   📏 ${r.distance_km} км · ⛰ ${r.elevation_m} м · ${difficultyLabel(r.difficulty)}\n` +
      `   📍 ${escapeHtml(r.region)}`
    );
  });

  return (
    `🔍 Нашёл ${routes.length} ${suffix} по запросу "<b>${escapeHtml(query)}</b>":\n\n` +
    lines.join("\n\n") +
    `\n\n<a href="${SITE_URL}/routes">Смотреть все маршруты →</a>`
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Telegram helpers ─────────────────────────────────────────────────────────

async function sendMessage(chatId: number, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const message = update.message;
  if (!message?.text) return new Response("ok");

  const chatId = message.chat.id;
  const text = message.text.trim();

  // ── /start — account linking ──────────────────────────────────────────────
  if (text.startsWith("/start")) {
    const code = text.split(" ")[1]?.trim();

    if (!code) {
      await sendMessage(
        chatId,
        "Привет! 👋 Я бот CycleConnect.\n\n" +
          "🔍 <b>Умею искать маршруты</b> — просто напиши, что ищешь:\n" +
          '• "маршрут 50 км несложный"\n' +
          '• "горный маршрут в Карелии"\n' +
          '• "городская покатушка на 2 часа"\n\n' +
          "Чтобы привязать аккаунт и получать уведомления о поездках, " +
          "перейди по ссылке из настроек профиля.",
      );
      return new Response("ok");
    }

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
        "Ссылка не найдена или устарела. Сгенерируй новую в настройках профиля.",
      );
      return new Response("ok");
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ telegram_chat_id: chatId, tg_link_code: null, tg_link_code_exp: null })
      .eq("id", profile.id);

    if (updateError) {
      await sendMessage(chatId, "Произошла ошибка. Попробуй ещё раз.");
      return new Response("ok");
    }

    const name = (profile.name as string | null) ?? "велосипедист";
    await sendMessage(
      chatId,
      `✅ Аккаунт привязан! Привет, ${escapeHtml(name)}!\n\n` +
        "Теперь буду присылать уведомления о поездках. Отключить можно в настройках профиля.\n\n" +
        "🔍 Кстати, умею искать маршруты — просто напиши, что ищешь!",
    );
    return new Response("ok");
  }

  // ── Ignore other / commands ───────────────────────────────────────────────
  if (text.startsWith("/")) return new Response("ok");

  // ── All other text → AI route search ─────────────────────────────────────
  await sendMessage(chatId, "🔍 Ищу маршруты...");

  const filters = await parseFilters(text);
  const routes = await searchRoutes(filters);
  await sendMessage(chatId, formatResults(routes, text));

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
