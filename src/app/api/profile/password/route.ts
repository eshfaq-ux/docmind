import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { Errors } from "@/lib/api-error";

export const runtime = "nodejs";

const schema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long"),
});

/** PATCH /api/profile/password — change password */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return Errors.unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Errors.validation(parsed.error.issues[0].message);

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { id: true, hashedPassword: true },
  });

  if (!user?.hashedPassword) {
    return Errors.validation("Password authentication is not available for your account");
  }

  const { verify, hash } = await import("@node-rs/argon2");
  const valid = await verify(user.hashedPassword, parsed.data.currentPassword);
  if (!valid) {
    return Errors.validation("Current password is incorrect");
  }

  const hashedPassword = await hash(parsed.data.newPassword, {
    timeCost: 2,
    memoryCost: 65536,
  });

  await db.update(users)
    .set({ hashedPassword })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ success: true });
}
