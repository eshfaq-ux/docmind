import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { loginRatelimit } from "@/lib/redis";
import { Errors } from "@/lib/api-error";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

/**
 * POST /api/auth/login
 *
 * Pre-flight check before NextAuth's signIn("credentials"):
 *   1. Rate limit by IP (10 attempts / 15 min)
 *   2. Validate input shape
 *   3. Check email exists + password matches
 *   4. Distinguish "unverified email" from "wrong credentials"
 *      without leaking which emails are registered.
 *
 * Returns:
 *   200 { ok: true }            → safe to call signIn("credentials")
 *   400 { error, code }         → VALIDATION_ERROR
 *   401 { error, code }         → INVALID_CREDENTIALS
 *   403 { error, code }         → EMAIL_NOT_VERIFIED
 *   429 { error, code }         → RATE_LIMIT
 */
export async function POST(req: Request) {
  // 1. Rate limit by IP
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { success, reset } = await loginRatelimit.limit(ip);
  if (!success) {
    const retryAfterSec = Math.ceil((reset - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later.", code: "RATE_LIMIT" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSec) },
      }
    );
  }

  // 2. Validate input
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Errors.validation(parsed.error.issues[0].message);
  }

  const { email, password } = parsed.data;

  // 3. Look up user
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true, hashedPassword: true, emailVerified: true },
  });

  // User not found — return generic credentials error (don't reveal email existence)
  if (!user || !user.hashedPassword) {
    return Errors.invalidCredentials();
  }

  // 4. Verify password
  const { verify } = await import("@node-rs/argon2");
  const valid = await verify(user.hashedPassword, password);
  if (!valid) {
    return Errors.invalidCredentials();
  }

  // 5. Password correct but email not verified — tell them explicitly
  if (!user.emailVerified) {
    return Errors.emailNotVerified();
  }

  // All good — caller should now invoke signIn("credentials")
  return NextResponse.json({ ok: true });
}
