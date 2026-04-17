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

// ─── Types ────────────────────────────────────────────────────────────────────

interface RouteFilters {
  difficulty?: string;
  distance_min?: number;
  distance_max?: number;
  /** Target distance for relevance sorting — not passed to SQL */
  distance_target?: number;
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

// ─── Regex extraction (always runs, reliable for explicit values) ──────────────

function extractFromText(query: string): RouteFilters {
  const out: RouteFilters = {};
  const q = query.toLowerCase();

  // Explicit distance: "50 км", "50км"
  const kmMatch = q.match(/(\d+)\s*км/);
  if (kmMatch) {
    const n = parseInt(kmMatch[1], 10);
    out.distance_target = n;
    out.distance_min = Math.max(1, Math.round(n * 0.75)); // −25%
    out.distance_max = Math.round(n * 1.25);              // +25%
  }

  // Time hints → cap distance_max (only when no explicit km)
  if (!kmMatch) {
    if (/вечер|часик|1[–\-–—]2\s*час|пару час|час-другой/.test(q)) {
      out.distance_max = 60;
    } else if (/полдня|несколько час|3[–\-–—]4\s*час/.test(q)) {
      out.distance_max = 80;
    } else if (/на день|целый день|однодневн/.test(q)) {
      out.distance_max = 150;
    }
  }

  // Urban / near-city hints
  if (/\bгород|\bпо городу|недалеко от город|рядом с город|окраин/.test(q)) {
    out.route_types = ["urban"];
  }

  // Difficulty
  if (/несложн|лёгк|легк|начинающ|для новичк|простой/.test(q)) {
    out.difficulty = "easy";
  } else if (/сложн|тяжёл|тяжел|экстрим/.test(q)) {
    out.difficulty = "hard";
  } else if (/средн|умеренн/.test(q)) {
    out.difficulty = "medium";
  }

  // Surface
  const surface: string[] = [];
  if (/асфальт|шоссе/.test(q)) surface.push("asphalt");
  if (/гравий|грунтовк|грунт/.test(q)) surface.push("gravel");
  if (/грязь|бездорожье/.test(q)) surface.push("dirt");
  if (surface.length) out.surface = surface;

  // Bike type
  if (/горный вел|mtb|эндуро/.test(q)) {
    out.bike_types = ["mountain"];
    if (!out.route_types) out.route_types = ["mtb"];
  } else if (/шоссейн/.test(q)) {
    out.bike_types = ["road"];
  } else if (/гравийн|гравел/.test(q)) {
    out.bike_types = ["gravel"];
  }

  return out;
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a cycling route search assistant for CycleConnect (Russian community).
Extract search filters from the user message. Return ONLY raw JSON, no markdown, no explanation.

Output schema (all fields optional):
{"difficulty":"easy"|"medium"|"hard","distance_min":number,"distance_max":number,"distance_target":number,"elevation_max":number,"surface":["asphalt"|"gravel"|"dirt"|"mixed"],"route_types":["road"|"gravel"|"mtb"|"urban"],"bike_types":["road"|"mountain"|"gravel"],"region":"Карелия"|"Санкт-Петербург"|"Ленинградская область"|"Москва"|"Подмосковье"|"Краснодарский край"|"Крым"|"Алтай"|"Байкал"|"Урал","search_text":"string"}

Rules (apply all that match):
1. If user says "N км" → distance_target=N, distance_min=N*0.75, distance_max=N*1.25
2. "вечером"/"часик"/"1-2 часа" → distance_max=60 (if no explicit km)
3. "полдня" → distance_max=80; "на день" → distance_max=150
4. "несложный"/"лёгкий"/"для новичка" → difficulty="easy"; "средний" → "medium"; "сложный" → "hard"
5. "по городу"/"городской"/"недалеко от города" → route_types=["urban"]
6. "горы"/"горный маршрут" → route_types=["mtb"]
7. "асфальт"/"шоссе" → surface=["asphalt"]; "гравий"/"грунт" → ["gravel"]
8. Region names → region field
9. Nature words (море, озеро, лес) → search_text
10. Return {} only if truly nothing can be extracted`;

// ─── AI filter parsing ────────────────────────────────────────────────────────

async function parseAI(query: string): Promise<RouteFilters> {
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
        max_tokens: 200,
        temperature: 0.1,
      }),
    });
    const data = await res.json();
    const raw: string = data.choices?.[0]?.message?.content ?? "";
    // Extract JSON object even if model wraps it in text/markdown
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};
    return JSON.parse(match[0]) as RouteFilters;
  } catch {
    return {};
  }
}

// ─── Merge: regex is authoritative for explicit values ────────────────────────

function mergeFilters(ai: RouteFilters, regex: RouteFilters): RouteFilters {
  const merged = { ...ai };

  // Regex wins for distance when the user explicitly said "N km"
  if (regex.distance_target) {
    merged.distance_target = regex.distance_target;
    merged.distance_min = regex.distance_min;
    merged.distance_max = regex.distance_max;
  } else if (regex.distance_max && !merged.distance_max) {
    merged.distance_max = regex.distance_max;
  }

  if (regex.difficulty && !merged.difficulty) merged.difficulty = regex.difficulty;
  if (regex.surface?.length && !merged.surface?.length) merged.surface = regex.surface;
  if (regex.bike_types?.length && !merged.bike_types?.length) merged.bike_types = regex.bike_types;
  if (regex.route_types?.length && !merged.route_types?.length) merged.route_types = regex.route_types;

  return merged;
}

// ─── Supabase query ───────────────────────────────────────────────────────────

async function searchRoutes(filters: RouteFilters): Promise<DbRoute[]> {
  const hasTarget = filters.distance_target != null;

  // deno-lint-ignore no-explicit-any
  let q: any = supabase
    .from("routes")
    .select("id, title, distance_km, elevation_m, difficulty, region")
    .limit(hasTarget ? 30 : 5)
    .order("created_at", { ascending: false });

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
  let results: DbRoute[] = (data as DbRoute[]) ?? [];

  // Re-rank by closeness to target distance, then take top 5
  if (hasTarget && results.length > 1) {
    const target = filters.distance_target!;
    results.sort((a, b) =>
      Math.abs(a.distance_km - target) - Math.abs(b.distance_km - target),
    );
    results = results.slice(0, 5);
  }

  return results;
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

  const [aiFilters, regexFilters] = await Promise.all([
    parseAI(text),
    Promise.resolve(extractFromText(text)),
  ]);
  const filters = mergeFilters(aiFilters, regexFilters);
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
