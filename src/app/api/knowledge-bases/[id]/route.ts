import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { knowledgeBases } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
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

  // Sum node_count across all documents in this KB
  const nodeCountResult = await db.execute(sql`
    SELECT COALESCE(SUM(node_count), 0) AS total
    FROM documents
    WHERE kb_id = ${params.id}::uuid
      AND tenant_id = ${session.user.tenantId}::uuid
  `);
  const rows = ((nodeCountResult as unknown) as { rows: Record<string, unknown>[] }).rows;
  const nodeCount = Number(rows[0]?.total ?? 0);

  return NextResponse.json({ ...kb, nodeCount });
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
