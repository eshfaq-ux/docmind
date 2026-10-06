import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { Errors } from "@/lib/api-error";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").max(100, "Name is too long"),
});

/** PATCH /api/profile — update display name */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return Errors.unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Errors.validation(parsed.error.issues[0].message);

  await db.update(users)
    .set({ name: parsed.data.name })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ success: true });
}

/** DELETE /api/profile — permanently delete account + all tenant data */
export async function DELETE() {
  const session = await auth();
  if (!session) return Errors.unauthorized();

  const { tenantId, id: userId } = session.user;

  // Delete user first (FK), then tenant — cascade removes KBs/docs/chunks/conversations
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));

  return NextResponse.json({ success: true });
}
