import { beforeEach, describe, expect, it, vi } from "vitest";

const { proxiedFetch } = vi.hoisted(() => ({ proxiedFetch: vi.fn() }));
vi.mock("@/lib/net/proxied-fetch", () => ({ proxiedFetch }));

function response(values: unknown, status = 200, body?: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body ?? JSON.stringify({ embedding: { values } }),
  };
}

async function loadEmbeddings() {
  vi.resetModules();
  return import("./jina");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("EMBEDDING_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_API_KEY", "test-api-key");
  vi.stubEnv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-2");
  vi.stubEnv("GEMINI_EMBEDDING_TIMEOUT_MS", "15000");
});

describe("Gemini embeddings", () => {
  it("sends the configured request and returns an L2-normalized 1024-vector", async () => {
    proxiedFetch.mockResolvedValue(response(Array(1024).fill(2)));
    const { embedQuery } = await loadEmbeddings();

    const vector = await embedQuery("карельский лес");
    const [url, init] = proxiedFetch.mock.calls[0];
    const body = JSON.parse(init.body);

    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent");
    expect(init.headers["x-goog-api-key"]).toBe("test-api-key");
    expect(init.timeoutMs).toBe(15000);
    expect(body).toEqual({ content: { parts: [{ text: "карельский лес" }] }, outputDimensionality: 1024 });
    expect(body).not.toHaveProperty("taskType");
    expect(vector).toHaveLength(1024);
    expect(Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))).toBeCloseTo(1);
  });

  it("deduplicates concurrent normalized query keys in the cache", async () => {
    proxiedFetch.mockResolvedValue(response(Array(1024).fill(1)));
    const { embedQuery } = await loadEmbeddings();

    const [first, second] = await Promise.all([embedQuery("  Gravel  "), embedQuery("gravel")]);

    expect(first).toEqual(second);
    expect(proxiedFetch).toHaveBeenCalledTimes(1);
  });

  it("limits passage batches to two concurrent requests", async () => {
    let active = 0;
    let maxActive = 0;
    proxiedFetch.mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return response(Array(1024).fill(1));
    });
    const { embedPassages } = await loadEmbeddings();

    const vectors = await embedPassages(["a", "b", "c", "d", "e"]);

    expect(vectors).toHaveLength(5);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("does not expose upstream bodies, keys, or response content in HTTP errors", async () => {
    proxiedFetch.mockResolvedValue(response([], 403, "private upstream detail test-api-key"));
    const { embedQuery } = await loadEmbeddings();

    const error = await embedQuery("route query").catch((err: Error) => err);
    expect(error).toBeInstanceOf(Error);
    if (error instanceof Error) {
      expect(error.message).toBe("Gemini embedding HTTP 403");
      expect(error.message).not.toContain("private upstream detail");
      expect(error.message).not.toContain("test-api-key");
    }
    expect(proxiedFetch.mock.calls[0][1].headers["x-goog-api-key"]).toBe("test-api-key");
  });

  it.each([
    ["wrong dimensions", Array(1023).fill(1)],
    ["non-finite values", [Number.NaN, ...Array(1023).fill(1)]],
    ["zero norm", Array(1024).fill(0)],
  ])("rejects %s", async (_label, values) => {
    proxiedFetch.mockResolvedValue(response(values));
    const { embedQuery } = await loadEmbeddings();

    await expect(embedQuery("query")).rejects.toThrow();
  });

  it("uses a generic error for transport failures", async () => {
    proxiedFetch.mockRejectedValue(new Error("transport includes test-api-key"));
    const { embedQuery } = await loadEmbeddings();

    await expect(embedQuery("query")).rejects.toThrow("Gemini embedding request failed");
  });
});
