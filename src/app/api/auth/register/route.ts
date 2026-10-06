import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, tenants, emailTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/lib/redis";
import { randomBytes, createHash } from "crypto";
import { sendEmail, verificationEmailHtml } from "@/lib/email";
import { env } from "@/lib/env";
import { Errors } from "@/lib/api-error";

// 5 registrations per hour per IP — prevents signup spam
const registerRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 h"),
  prefix: "rl:register",
});

const schema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  // Rate limit by IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { success } = await registerRatelimit.limit(ip);
  if (!success) return Errors.rateLimit();

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Errors.validation(parsed.error.issues[0].message);

  const { name, email, password } = parsed.data;

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true },
  });
  if (existing) return Errors.conflict("Email");

  const { hash } = await import("@node-rs/argon2");
  const hashedPassword = await hash(password, { timeCost: 2, memoryCost: 65536 });

  // Create tenant + user atomically — emailVerified starts false
  const [tenant] = await db.insert(tenants).values({ name }).returning({ id: tenants.id });
  const [user] = await db.insert(users).values({
    tenantId: tenant.id,
    email,
    name,
    hashedPassword,
    role: "admin",
    emailVerified: false,
  }).returning({ id: users.id });

  // Generate a secure random token, store its SHA-256 hash
  const rawToken = randomBytes(32).toString("hex");
  const tokenSha256 = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  await db.insert(emailTokens).values({
    userId: user.id,
    tokenSha256,
    type: "verify",
    expiresAt,
  });

  const verifyUrl = `${env.NEXTAUTH_URL}/verify-email?token=${rawToken}`;

  await sendEmail({
    to: email,
    subject: "Verify your DocMind account",
    html: verificationEmailHtml(verifyUrl, name),
    text: `Hi ${name},\n\nVerify your DocMind account by visiting:\n${verifyUrl}\n\nThis link expires in 24 hours.`,
  });

  return NextResponse.json({ success: true, emailVerificationSent: true }, { status: 201 });
}
