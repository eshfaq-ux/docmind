import OpenAI from "openai";
import { env } from "@/lib/env";

// OpenAI client — for fallback
export const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// OpenRouter client — used for chat completions (free tier)
export const chatClient = env.OPENROUTER_API_KEY
  ? new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": env.NEXTAUTH_URL,
        "X-Title": "DocMind",
      },
    })
  : openai;

// ─── Model constants ──────────────────────────────────────────────────────────
export const EMBED_MODEL = "nomic-embed-text";
export const CHAT_MODEL = env.OPENROUTER_API_KEY
  ? "openrouter/auto"
  : "gpt-4o-mini";

const OLLAMA_URL = "http://localhost:11434/api/embeddings";

// Pricing per 1M tokens (USD)
const PRICING: Record<string, { input: number; output: number }> = {
  "nomic-embed-text": { input: 0, output: 0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "openrouter/auto": { input: 0, output: 0 },
};

export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens = 0
): number {
  const p = PRICING[model] ?? { input: 0, output: 0 };
  return (promptTokens * p.input + completionTokens * p.output) / 1_000_000;
}

// ─── Embedding via Ollama ─────────────────────────────────────────────────────

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const embeddings: number[][] = [];
  for (const text of texts) {
    const res = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
    });
    if (!res.ok) throw new Error(`Ollama embedding failed: ${res.status}`);
    const data = await res.json() as { embedding: number[] };
    embeddings.push(data.embedding);
  }
  return embeddings;
}

export async function embedAll(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += 15) {
    const batch = texts.slice(i, i + 15);
    const embeddings = await embedBatch(batch);
    results.push(...embeddings);
  }
  return results;
}

export async function embedQuery(query: string): Promise<number[]> {
  const [embedding] = await embedBatch([query]);
  return embedding;
}
