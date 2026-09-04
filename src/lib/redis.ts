import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { env } from "@/lib/env";

/**
 * Upstash Redis client.
 * Used for:
 *   1. Conversation memory (last 10 turns per conversation)
 *   2. Rate limiting (chat: 20/min, upload: 10/hr)
 *
 * Key namespacing:
 *   conv:{tenantId}:{conversationId}  → conversation history (list)
 *   rl:{action}:{userId}              → rate limit counters (managed by Ratelimit)
 */
export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

/** Chat: 20 requests per minute per user */
export const chatRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 m"),
  prefix: "rl:chat",
});

/** Upload URL: 10 requests per hour per user */
export const uploadRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"),
  prefix: "rl:upload",
});

// ─── Conversation memory helpers ─────────────────────────────────────────────

const MAX_TURNS = 10;
const MAX_CONTENT_CHARS = 500; // cap per message to stay within Redis 1MB limit

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
}

function convKey(tenantId: string, conversationId: string): string {
  return `conv:${tenantId}:${conversationId}`;
}

/** Append a message to conversation history and trim to last MAX_TURNS turns. */
export async function appendMessage(
  tenantId: string,
  conversationId: string,
  message: StoredMessage
): Promise<void> {
  const key = convKey(tenantId, conversationId);
  const truncated: StoredMessage = {
    ...message,
    content: message.content.slice(0, MAX_CONTENT_CHARS),
  };
  await redis.rpush(key, JSON.stringify(truncated));
  // Keep only the last MAX_TURNS * 2 entries (user + assistant per turn)
  await redis.ltrim(key, -(MAX_TURNS * 2), -1);
  await redis.expire(key, 60 * 60 * 24 * 7); // 7-day TTL
}

/** Load conversation history for context injection. */
export async function loadHistory(
  tenantId: string,
  conversationId: string
): Promise<StoredMessage[]> {
  const key = convKey(tenantId, conversationId);
  const raw = await redis.lrange<string>(key, 0, -1);
  return raw.map((item) => {
    try {
      return JSON.parse(item) as StoredMessage;
    } catch {
      return { role: "user", content: String(item) };
    }
  });
}

/** Clear conversation history (new conversation / re-index). */
export async function clearHistory(
  tenantId: string,
  conversationId: string
): Promise<void> {
  await redis.del(convKey(tenantId, conversationId));
}
