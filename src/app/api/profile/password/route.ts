import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

/** PATCH /api/profile/password — change password */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { id: true, hashedPassword: true },
  });

  if (!user?.hashedPassword) {
    return NextResponse.json(
      { error: "Password authentication is not available for your account" },
      { status: 400 }
    );
  }

  const { verify, hash } = await import("@node-rs/argon2");
  const valid = await verify(user.hashedPassword, parsed.data.currentPassword);
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const hashedPassword = await hash(parsed.data.newPassword, { timeCost: 2, memoryCost: 65536 });

  await db.update(users)
    .set({ hashedPassword })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ success: true });
}
