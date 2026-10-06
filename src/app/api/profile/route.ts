import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, tenants, knowledgeBases, documents, chunks, conversations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().min(1).max(100),
});

/** PATCH /api/profile — update display name */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  await db.update(users)
    .set({ name: parsed.data.name })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ success: true });
}

/** DELETE /api/profile — permanently delete account + all tenant data */
export async function DELETE() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tenantId, id: userId } = session.user;

  // Cascade delete: tenant deletion removes all KBs, docs, chunks, conversations
  // via ON DELETE CASCADE defined in the schema.
  // Delete the user first (restrict FK), then the tenant.
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));

  return NextResponse.json({ success: true });
}
