import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { conversations } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  kbId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * GET /api/conversations?kbId=...
 *
 * Lists conversations for the authenticated user, optionally filtered by KB.
 * Returns conversations sorted by last_active DESC for the sidebar list.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    kbId: searchParams.get("kbId") ?? undefined,
    limit: searchParams.get("limit") ?? 50,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { kbId, limit } = parsed.data;

  const convs = await db.query.conversations.findMany({
    where: and(
      eq(conversations.userId, session.user.id),
      eq(conversations.tenantId, session.user.tenantId),
      ...(kbId ? [eq(conversations.kbId, kbId)] : [])
    ),
    orderBy: [desc(conversations.lastActive)],
    limit,
    columns: {
      id: true,
      kbId: true,
      title: true,
      createdAt: true,
      lastActive: true,
    },
  });

  return NextResponse.json(convs);
}
