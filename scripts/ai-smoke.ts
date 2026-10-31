import { embedQuery } from "../src/lib/embeddings/jina";
import { chatJSON, chatText } from "../src/lib/llm/ollama-chat";

async function main() {
  const vector = await embedQuery("Веломаршрут вдоль озера");
  if (vector.length !== 1024) throw new Error("Embedding dimension mismatch");
  console.log("Gemini embedding: PASS (1024)");
  const parsed = await chatJSON([
    { role: "system", content: "Return only JSON: {\"ok\":true}." },
    { role: "user", content: "Проверка подключения" },
  ], 15000, 1024, 512);
  if (parsed.ok !== true) throw new Error("Gemini JSON check failed");
  console.log("Gemini JSON generation: PASS");
  const answer = await chatText([{ role: "user", content: "Ответь одним словом: готово" }], { timeoutMs: 15000, maxTokens: 256 });
  if (!answer.text.trim()) throw new Error("Gemini text check failed");
  console.log("Gemini text generation: PASS");
}
main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : "AI check failed");
  process.exitCode = 1;
});
