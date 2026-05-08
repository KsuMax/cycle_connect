/**
 * Lightweight chat wrapper: DeepSeek → Ollama → OpenRouter.
 *
 * Env vars:
 *   DEEPSEEK_API_KEY   — primary; fast (~300–500 ms), accessible from Russia
 *   OLLAMA_URL         — secondary local fallback (default: http://localhost:11434)
 *   OLLAMA_CHAT_MODEL  — default llama3.2:3b
 *   OPENROUTER_API_KEY — last-resort fallback
 *   NEXT_PUBLIC_SITE_URL
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? "";
const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL ?? "llama3.2:3b";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cycleconnect.cc";
const OPENROUTER_FALLBACK_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Send messages and receive a JSON-parsed response object.
 * Chain: DeepSeek (if key set) → Ollama (local) → OpenRouter (last resort).
 *
 * @param numCtx  Ollama context window (tokens). Default 1024 is fine for
 *                short search-filter prompts. Use 2048+ for long descriptions.
 */
export async function chatJSON(
  messages: ChatMessage[],
  timeoutMs = 5_000,
  numCtx = 1024,
): Promise<Record<string, unknown>> {
  // ── Primary: DeepSeek ─────────────────────────────────────────────────────
  if (DEEPSEEK_API_KEY) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: "deepseek-chat",
          messages,
          max_tokens: 256,
          temperature: 0,
          response_format: { type: "json_object" },
        }),
      }).finally(() => clearTimeout(timer));
      if (!res.ok) throw new Error(`deepseek HTTP ${res.status}`);
      const data = await res.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };
      if (data.error) throw new Error(`deepseek: ${data.error.message}`);
      const raw = data.choices?.[0]?.message?.content ?? "{}";
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return {};
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch (err) {
      console.warn(
        "[ollama-chat] DeepSeek failed, trying Ollama:",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Secondary: Ollama local ───────────────────────────────────────────────
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
        options: { temperature: 0, num_ctx: numCtx },
        keep_alive: "24h",
      }),
    });
    if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
    const data = await res.json() as { message?: { content?: string }; error?: string };
    if (data.error) throw new Error(`ollama: ${data.error}`);
    const content = data.message?.content ?? "{}";
    return JSON.parse(content) as Record<string, unknown>;
  } catch (err) {
    console.warn(
      "[ollama-chat] Ollama unavailable, trying OpenRouter:",
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    clearTimeout(timer);
  }

  // ── Last resort: OpenRouter ───────────────────────────────────────────────
  if (!OPENROUTER_API_KEY) {
    console.error("[ollama-chat] No fallback configured, all LLM paths failed");
    return {};
  }
  try {
    const orController = new AbortController();
    const orTimer = setTimeout(() => orController.abort(), 10_000);
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": SITE_URL,
        "X-Title": "CycleConnect",
      },
      signal: orController.signal,
      body: JSON.stringify({
        model: OPENROUTER_FALLBACK_MODEL,
        messages,
        max_tokens: 256,
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    }).finally(() => clearTimeout(orTimer));
    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (data.error) throw new Error(`openrouter: ${data.error.message}`);
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch (err) {
    console.error(
      "[ollama-chat] OpenRouter also failed:",
      err instanceof Error ? err.message : String(err),
    );
    return {};
  }
}

/**
 * Fire-and-forget warm-up for Ollama. Only useful when Ollama is the active
 * provider — skipped automatically if DeepSeek is configured.
 */
export function warmUpOllama(): void {
  if (DEEPSEEK_API_KEY) return;
  fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_CHAT_MODEL,
      messages: [],
      stream: false,
      keep_alive: "24h",
    }),
  })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      console.log(`[ollama-chat] warm-up ok: ${OLLAMA_CHAT_MODEL} loaded`);
    })
    .catch((err) =>
      console.warn("[ollama-chat] warm-up failed (non-fatal):", err instanceof Error ? err.message : String(err)),
    );
}
