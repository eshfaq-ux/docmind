import { z } from "zod";

/**
 * Validated environment variables.
 * Any missing required var throws at startup — not at runtime.
 * Import `env` everywhere instead of `process.env` directly.
 */
const schema = z.object({
  // Database
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_UNPOOLED: z.string().min(1).optional(),

  // NextAuth
  NEXTAUTH_SECRET: z.string().min(32),
  NEXTAUTH_URL: z.string().url().default("http://localhost:3000"),

  // Google OAuth (optional for local dev — required for Google sign-in)
  GOOGLE_CLIENT_ID: z.string().min(1).optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional().default(""),

  // OpenAI (embeddings only)
  OPENAI_API_KEY: z.string().min(1),

  // OpenRouter (chat completions — optional, falls back to OpenAI if not set)
  OPENROUTER_API_KEY: z.string().min(1).optional(),

  // Upstash Redis
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),

  // Cloudflare R2 / S3-compatible storage
  CLOUDFLARE_R2_ACCOUNT_ID: z.string().min(1),
  CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().min(1),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().min(1),
  CLOUDFLARE_R2_BUCKET_NAME: z.string().min(1),
  CLOUDFLARE_R2_ENDPOINT: z.string().url(),
  CLOUDFLARE_R2_PUBLIC_URL: z.string().url().optional(),
  CLOUDFLARE_R2_REGION: z.string().optional(),

  // Backend
  BACKEND_URL: z.string().url().default("http://localhost:8000"),
  BACKEND_SECRET: z.string().min(32),

  // Misc
  CRON_SECRET: z.string().min(32).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

type Env = z.infer<typeof schema>;

function validateEnv(): Env {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`\n❌ Invalid environment variables:\n${missing}\n`);
  }
  return result.data;
}

// Singleton — validated once on first import
export const env = validateEnv();
