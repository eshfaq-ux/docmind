import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailTokens, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createHash } from "crypto";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().length(64), // 32 random bytes = 64 hex chars
});

/**
 * POST /api/auth/verify-email
 *
 * Verifies an email token and flips emailVerified = true.
 * Marks the token as used to prevent replay.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid token", code: "INVALID_TOKEN" }, { status: 400 });
  }

  const tokenSha256 = createHash("sha256").update(parsed.data.token).digest("hex");

  const tokenRow = await db.query.emailTokens.findFirst({
    where: and(
      eq(emailTokens.tokenSha256, tokenSha256),
      eq(emailTokens.type, "verify")
    ),
  });

  if (!tokenRow) {
    return NextResponse.json({ error: "Invalid or expired link", code: "INVALID_TOKEN" }, { status: 400 });
  }

  if (tokenRow.used) {
    return NextResponse.json({ error: "This link has already been used", code: "TOKEN_USED" }, { status: 400 });
  }

  if (tokenRow.expiresAt < new Date()) {
    return NextResponse.json({ error: "This link has expired. Please register again.", code: "TOKEN_EXPIRED" }, { status: 400 });
  }

  // Mark verified + consume token atomically
  await Promise.all([
    db.update(users).set({ emailVerified: true }).where(eq(users.id, tokenRow.userId)),
    db.update(emailTokens).set({ used: true }).where(eq(emailTokens.id, tokenRow.id)),
  ]);

  return NextResponse.json({ success: true });
}
