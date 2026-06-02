/**
 * tg-webhook — Telegram Bot webhook handler.
 *
 * Handles:
 *  1. /start <code>  — links chat_id to a CycleConnect profile.
 *  2. Any text       — AI-powered route search via Ollama (llama3.2:3b).
 *
 * Secrets (set via `supabase secrets set`):
 *   TELEGRAM_BOT_TOKEN
 *   OLLAMA_URL             (e.g. http://host.docker.internal:11434)
 *   OPENROUTER_API_KEY     (fallback when Ollama is unavailable)
 *   SITE_URL               (e.g. https://cycleconnect.cc)
 *   SUPABASE_SERVICE_ROLE_KEY  — auto-injected
 *   SUPABASE_URL               — auto-injected
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TG_API_BASE = (Deno.env.get("TELEGRAM_API_BASE") ?? "https://api.telegram.org").replace(/\/$/, "");
const WEBHOOK_SECRET = Deno.env.get("TG_WEBHOOK_SECRET") ?? "";
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://cycleconnect.cc";
const OLLAMA_URL = (Deno.env.get("OLLAMA_URL") ?? "http://host.docker.internal:11434").replace(/\/$/, "");
const OLLAMA_CHAT_MODEL = Deno.env.get("OLLAMA_CHAT_MODEL") ?? "llama3.2:3b";
// DB_URL / DB_SERVICE_KEY allow overriding the auto-injected Supabase vars —
// used when the function runs on cloud Supabase but queries a self-hosted DB.
const SUPABASE_URL = Deno.env.get("DB_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("DB_SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

// ─── Geolocation: nearest region ─────────────────────────────────────────────

const REGION_CENTERS: [string, number, number][] = [
  ["Санкт-Петербург",       59.95,  30.32],
  ["Ленинградская область", 60.07,  30.58],
  ["Карелия",               62.50,  32.50],
  ["Москва",                55.75,  37.62],
  ["Подмосковье",           55.75,  37.20],
  ["Краснодарский край",    45.04,  38.98],
  ["Крым",                  45.30,  34.00],
  ["Алтай",                 52.00,  85.00],
  ["Байкал",                53.00, 107.00],
  ["Урал",                  56.50,  60.00],
];

function closestRegion(lat: number, lng: number): string {
  let best = REGION_CENTERS[0][0];
  let bestDist = Infinity;
  for (const [name, rlat, rlng] of REGION_CENTERS) {
    const d = Math.hypot(lat - rlat, lng - rlng);
    if (d < bestDist) { bestDist = d; best = name; }
  }
  return best;
}

function needsLocation(q: string): boolean {
  return /рядом|поблизости|около меня|возле меня|недалеко от меня/i.test(q);
}

// ─── Distance helper ──────────────────────────────────────────────────────────

function extractDistance(q: string, out: RouteFilters): boolean {
  const range = q.match(/от\s+(\d+)\s+до\s+(\d+)/);
  if (range) {
    out.distance_min = parseInt(range[1], 10);
    out.distance_max = parseInt(range[2], 10);
    return true;
  }

  const maxMatch =
    q.match(/(?:до|не\s*бол[её]е?|не\s*больше|максимум)\s+(\d+)\s*(?:км|километр\w*)?/) ||
    q.match(/(?:км|километр\w+)\s+до\s+(\d+)/);
  if (maxMatch) {
    out.distance_max = parseInt(maxMatch[1], 10);
    return true;
  }

  const target =
    q.match(/(\d+)\s*(?:км|километр\w*)/) ||
    q.match(/около\s+(\d+)/);
  if (target) {
    const n = parseInt(target[1], 10);
    out.distance_target = n;
    out.distance_min = Math.max(1, Math.round(n * 0.75));
    out.distance_max = Math.round(n * 1.25);
    return true;
  }

  return false;
}

function extractFromText(query: string): RouteFilters {
  const out: RouteFilters = {};
  const q = query.toLowerCase();

  const hasExplicitDist = extractDistance(q, out);

  if (!hasExplicitDist) {
    const hoursMatch = q.match(/(?:на\s+)?(\d+)\s*час/);
    if (hoursMatch) {
      out.distance_max = Math.min(parseInt(hoursMatch[1], 10) * 25, 150);
    } else if (/вечер|после работы|пару час|час-другой/.test(q)) {
      out.distance_max = 60;
    } else if (/полдня|несколько час/.test(q)) {
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

  // Bike intent → route type
  if (/горный вел|mtb|эндуро/.test(q)) {
    if (!out.route_types) out.route_types = ["mtb"];
  } else if (/шоссейн/.test(q)) {
    if (!out.route_types) out.route_types = ["road"];
  } else if (/гравийн|гравел/.test(q)) {
    if (!out.route_types) out.route_types = ["gravel"];
  }

  // Region — matched against all inflected forms
  const REGIONS: Array<[RegExp, string]> = [
    [/карел/i,                          "Карелия"],
    [/санкт.петербург|питер\b|спб\b/i,  "Санкт-Петербург"],
    [/ленинград|лен\.?\s*обл/i,         "Ленинградская область"],
    [/подмосков/i,                      "Подмосковье"],
    [/москв/i,                          "Москва"],
    [/краснодар|кубан/i,                "Краснодарский край"],
    [/крым/i,                           "Крым"],
    [/алтай/i,                          "Алтай"],
    [/байкал/i,                         "Байкал"],
    [/урал/i,                           "Урал"],
  ];
  for (const [pattern, region] of REGIONS) {
    if (pattern.test(q)) { out.region = region; break; }
  }

  return out;
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a cycling route search assistant for CycleConnect (Russian community).
Extract search filters from the user message. Return ONLY raw JSON, no markdown, no explanation.

Output schema (all fields optional):
{"difficulty":"easy"|"medium"|"hard","distance_min":number,"distance_max":number,"distance_target":number,"elevation_max":number,"surface":["asphalt"|"gravel"|"dirt"],"route_types":["road"|"gravel"|"mtb"|"urban"],"region":"Карелия"|"Санкт-Петербург"|"Ленинградская область"|"Москва"|"Подмосковье"|"Краснодарский край"|"Крым"|"Алтай"|"Байкал"|"Урал","search_text":"string"}

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

// ─── AI filter parsing: Ollama primary, OpenRouter fallback ──────────────────

async function parseAI(query: string): Promise<RouteFilters> {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: query },
  ];

  // ── Primary: Ollama local ────────────────────────────────────────────────
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_CHAT_MODEL,
        messages,
        stream: false,
        format: "json",
        options: { temperature: 0, num_ctx: 1024 },
        keep_alive: "10m",
      }),
    });
    if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
    const data = await res.json() as { error?: string; message?: { content?: string } };
    if (data.error) throw new Error(`ollama: ${data.error}`);
    const content: string = data.message?.content ?? "{}";
    return JSON.parse(content) as RouteFilters;
  } catch (err) {
    console.warn("[tg-webhook] Ollama unavailable, trying OpenRouter:", (err as Error).message);
  } finally {
    clearTimeout(timer);
  }

  // ── Fallback: OpenRouter ─────────────────────────────────────────────────
  if (!OPENROUTER_API_KEY) return {};
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
        model: "meta-llama/llama-3.2-3b-instruct:free",
        messages,
        max_tokens: 256,
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });
    const data = await res.json() as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
    };
    if (data.error) throw new Error(`openrouter: ${data.error?.message}`);
    const raw: string = data.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};
    return JSON.parse(match[0]) as RouteFilters;
  } catch (err) {
    console.error("[tg-webhook] OpenRouter fallback also failed:", (err as Error).message);
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
  if (regex.route_types?.length && !merged.route_types?.length) merged.route_types = regex.route_types;
  if (regex.region && !merged.region) merged.region = regex.region;

  return merged;
}

// ─── Supabase query ───────────────────────────────────────────────────────────

async function searchRoutes(filters: RouteFilters): Promise<DbRoute[]> {
  const hasTarget = filters.distance_target != null;

  // Conditional chain of .eq()/.gte()/etc. reassigns to narrowed builder
  // types — `any` is the pragmatic escape hatch the supabase-js docs use.
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  if (filters.search_text) {
    // PostgREST `.or()` is a string DSL — commas, parens, dots, percent
    // signs in user input would change the filter structure (PostgREST-side
    // filter injection). Strip everything that has special meaning before
    // interpolating. Final string still goes through ilike, so wildcards
    // come from us, not the user.
    const safe = String(filters.search_text)
      .replace(/[(),.*%]/g, " ")
      .trim()
      .slice(0, 64);
    if (safe) {
      q = q.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
    }
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
  await fetch(`${TG_API_BASE}/bot${BOT_TOKEN}/sendMessage`, {
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

/** Sends a reply keyboard with a "Share location" button. */
async function sendLocationRequest(chatId: number): Promise<void> {
  await fetch(`${TG_API_BASE}/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: "📍 Поделись своим местоположением, и я найду ближайшие маршруты:",
      reply_markup: {
        keyboard: [[{ text: "📍 Отправить местоположение", request_location: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }),
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  // Authenticate via Telegram secret-token header. Set with
  //   curl -F "url=https://…/tg-webhook" -F "secret_token=$TG_WEBHOOK_SECRET" \
  //        ${TG_API_BASE}/bot$TOKEN/setWebhook
  // Without this, anyone could POST a forged "Telegram update" to this URL
  // and (combined with the /start login_<nonce> flow) hijack any account
  // that has a linked Telegram chat_id.
  if (!WEBHOOK_SECRET) {
    console.error("[tg-webhook] TG_WEBHOOK_SECRET not configured — refusing all requests");
    return new Response("forbidden", { status: 403 });
  }
  if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  // ── callback_query — inline button presses ────────────────────────────────
  const cq = update.callback_query;
  if (cq) {
    const cqChatId = cq.message?.chat?.id;
    const data = cq.data ?? "";

    if (data.startsWith("optout_event_") && cqChatId) {
      const eventId = data.slice("optout_event_".length);

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("telegram_chat_id", cqChatId)
        .maybeSingle();

      if (profile) {
        await supabase
          .from("announcement_optouts")
          .upsert({ event_id: eventId, user_id: profile.id }, { onConflict: "event_id,user_id" });
      }

      await fetch(`${TG_API_BASE}/bot${BOT_TOKEN}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: cq.id,
          text: "Готово — уведомления от этого события отключены",
          show_alert: false,
        }),
      });
    }

    return new Response("ok");
  }

  const message = update.message;
  if (!message) return new Response("ok");

  const chatId = message.chat.id;

  // ── Location message → search by nearest region ───────────────────────────
  if (message.location) {
    const { latitude, longitude } = message.location;
    const region = closestRegion(latitude, longitude);
    await sendMessage(chatId,
      `📍 Местоположение получено. Ищу маршруты в регионе <b>${escapeHtml(region)}</b>...`
    );
    const routes = await searchRoutes({ region });
    await sendMessage(chatId, formatResults(routes, `рядом с тобой (${region})`));
    return new Response("ok");
  }

  if (!message.text) return new Response("ok");

  const text = message.text.trim();

  // ── /start — login or account linking ────────────────────────────────────
  if (text.startsWith("/start")) {
    const param = text.split(" ")[1]?.trim() ?? "";

    if (!param) {
      await sendMessage(
        chatId,
        "Привет! 👋 Я бот CycleConnect.\n\n" +
          "🔍 <b>Умею искать маршруты</b> — просто напиши, что ищешь:\n" +
          '• "маршрут 50 км несложный"\n' +
          '• "горный маршрут в Карелии"\n' +
          '• "городская покатушка на 2 часа"\n\n' +
          `<a href="${SITE_URL}/auth/login">Войти или зарегистрироваться →</a>`,
      );
      return new Response("ok");
    }

    // ── login_<nonce> — browser-initiated auth flow ───────────────────────
    // Login via Telegram works ONLY for profiles that have already linked
    // a telegram_chat_id (via /start link_<code> from the settings page).
    // We do NOT silently create an account here: that path is the lever for
    // the takeover attack — an attacker who learns a victim's nonce could
    // present a fresh Telegram identity, get a new auth.user minted, and
    // poison the victim's browser into adopting the attacker's session.
    // Account creation must originate from the website auth flow, never
    // from a Telegram message.
    if (param.startsWith("login_")) {
      const nonce = param.slice("login_".length);
      const from = message.from;

      const now = new Date().toISOString();
      const { data: nonceRow } = await supabase
        .from("tg_login_nonces")
        .select("status, expires_at")
        .eq("nonce", nonce)
        .maybeSingle();

      if (!nonceRow || nonceRow.status !== "pending" || nonceRow.expires_at < now) {
        await sendMessage(chatId, "Ссылка устарела или уже использована. Попробуй войти заново.");
        return new Response("ok");
      }

      const tgId = from?.id ?? chatId;
      const firstName = from?.first_name ?? "";
      const lastName = (from as { last_name?: string } | undefined)?.last_name ?? "";
      const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Велосипедист";

      // Look up existing profile by telegram_chat_id — must already be linked.
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("telegram_chat_id", tgId)
        .maybeSingle();

      if (!existingProfile) {
        await sendMessage(
          chatId,
          "Этот Telegram-аккаунт ещё не привязан к CycleConnect.\n\n" +
            `Сначала зарегистрируйся на <a href="${SITE_URL}/auth/login">сайте</a> ` +
            "и привяжи Telegram в настройках профиля.",
        );
        return new Response("ok");
      }

      const userId = existingProfile.id as string;

      // Mark nonce ready — the originating browser will pick it up via /poll.
      await supabase
        .from("tg_login_nonces")
        .update({ status: "ready", user_id: userId })
        .eq("nonce", nonce);

      await sendMessage(
        chatId,
        `✅ Готово, ${escapeHtml(fullName)}! Вернись в браузер — вход выполнится автоматически.\n\n` +
          "🔍 Кстати, умею искать маршруты — просто напиши, что ищешь!",
      );
      return new Response("ok");
    }

    // ── link_<code> — legacy account linking for existing users ──────────
    const code = param.startsWith("link_") ? param.slice("link_".length) : param;

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

  // ── Location request in text → ask to share via Telegram ─────────────────
  if (needsLocation(text)) {
    await sendLocationRequest(chatId);
    return new Response("ok");
  }

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
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number } };
  };
}

interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: { id: number; username?: string; first_name?: string };
  text?: string;
  location?: { latitude: number; longitude: number };
}
