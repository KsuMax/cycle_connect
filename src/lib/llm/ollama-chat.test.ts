import { afterEach, describe, expect, it, vi } from "vitest";

const { proxiedFetch } = vi.hoisted(() => ({ proxiedFetch: vi.fn() }));
vi.mock("@/lib/net/proxied-fetch", () => ({ proxiedFetch }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  proxiedFetch.mockReset();
});

describe("LOCAL_AI_ENABLED", () => {
  it("prevents Ollama requests and warm-up when false", async () => {
    vi.stubEnv("LOCAL_AI_ENABLED", "false");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GOOGLE_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.resetModules();

    const llm = await import("./ollama-chat");
    expect(await llm.chatJSON([{ role: "user", content: "hello" }])).toEqual({});
    await expect(llm.chatText([{ role: "user", content: "hello" }])).rejects.toThrow();
    llm.warmUpOllama();

    expect(fetch).not.toHaveBeenCalled();
    expect(proxiedFetch).not.toHaveBeenCalled();
  });

  it("does not log Gemini upstream response bodies", async () => {
    vi.stubEnv("LOCAL_AI_ENABLED", "false");
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    proxiedFetch.mockResolvedValue(new Response("private upstream detail", { status: 401 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();

    const llm = await import("./ollama-chat");
    await llm.chatJSON([{ role: "user", content: "hello" }]);

    expect(warn.mock.calls.flat().join(" ")).not.toContain("private upstream detail");
    expect(warn.mock.calls.flat().join(" ")).not.toContain("test-key");
  });
});

describe("Gemini native generateContent", () => {
  it("maps chat messages to native JSON and text requests", async () => {
    vi.stubEnv("LOCAL_AI_ENABLED", "false");
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODELS", "gemini-3.5-flash-lite");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    proxiedFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"region":"Карелия"}' }] } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          candidates: [{ content: { parts: [{ text: "Hello" }, { text: " there" }] } }],
        }),
      });
    vi.resetModules();

    const llm = await import("./ollama-chat");
    const messages = [
      { role: "system" as const, content: "system rules" },
      { role: "user" as const, content: "find a route" },
      { role: "assistant" as const, content: "prior answer" },
    ];
    expect(await llm.chatJSON(messages)).toEqual({ region: "Карелия" });
    expect((await llm.chatText(messages)).text).toBe("Hello there");

    const [url, init] = proxiedFetch.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    expect(init.headers).toEqual({ "x-goog-api-key": "test-key", "Content-Type": "application/json" });
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      systemInstruction: { parts: [{ text: "system rules" }] },
      contents: [
        { role: "user", parts: [{ text: "find a route" }] },
        { role: "model", parts: [{ text: "prior answer" }] },
      ],
      generationConfig: {
        maxOutputTokens: 256,
        temperature: 0,
        responseMimeType: "application/json",
      },
    });
    const textBody = JSON.parse(proxiedFetch.mock.calls[1][1].body);
    expect(textBody.generationConfig).toEqual({ maxOutputTokens: 1024, temperature: 0.3 });
    expect(textBody.systemInstruction).toEqual({ parts: [{ text: "system rules" }] });
    expect(textBody).not.toHaveProperty("reasoning_effort");
  });
});
