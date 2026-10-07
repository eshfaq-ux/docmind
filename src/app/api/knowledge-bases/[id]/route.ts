import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { knowledgeBases } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";

async function getKB(id: string, tenantId: string) {
  return db.query.knowledgeBases.findFirst({
    where: and(eq(knowledgeBases.id, id), eq(knowledgeBases.tenantId, tenantId)),
  });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const kb = await getKB(params.id, session.user.tenantId);
  if (!kb) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(kb);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const kb = await getKB(params.id, session.user.tenantId);
  if (!kb) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const schema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const [updated] = await db
    .update(knowledgeBases)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(knowledgeBases.id, params.id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const kb = await getKB(params.id, session.user.tenantId);
  if (!kb) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(knowledgeBases).where(eq(knowledgeBases.id, params.id));
  return new NextResponse(null, { status: 204 });
}
