import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { knowledgeBases } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const kbs = await db.query.knowledgeBases.findMany({
    where: eq(knowledgeBases.tenantId, session.user.tenantId),
    orderBy: [desc(knowledgeBases.updatedAt)],
    columns: { id: true, name: true, description: true, docCount: true, chunkCount: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json(kbs);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const [kb] = await db
    .insert(knowledgeBases)
    .values({
      tenantId: session.user.tenantId,
      createdBy: session.user.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    })
    .returning();

  return NextResponse.json(kb, { status: 201 });
}
