import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/conversations/[id]
 * Returns full conversation with messages and citations.
 * Used to restore chat history on page reload.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const conv = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, params.id),
      eq(conversations.tenantId, session.user.tenantId),
      eq(conversations.userId, session.user.id)
    ),
    columns: { id: true, kbId: true, title: true, createdAt: true, lastActive: true },
  });

  if (!conv) {
    return NextResponse.json({ error: "Conversation not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const msgs = await db.query.messages.findMany({
    where: eq(messages.conversationId, params.id),
    orderBy: [asc(messages.createdAt)],
    with: {
      citations: {
        columns: {
          rank: true,
          documentId: true,
          docName: true,
          pageNumber: true,
          excerpt: true,
          score: true,
        },
      },
    },
    columns: {
      id: true,
      role: true,
      content: true,
      confidence: true,
      confidenceScore: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ ...conv, messages: msgs });
}

/**
 * DELETE /api/conversations/[id]
 * Deletes a conversation and all its messages (cascade).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const conv = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, params.id),
      eq(conversations.tenantId, session.user.tenantId),
      eq(conversations.userId, session.user.id)
    ),
    columns: { id: true },
  });

  if (!conv) {
    return NextResponse.json({ error: "Conversation not found", code: "NOT_FOUND" }, { status: 404 });
  }

  await db.delete(conversations).where(eq(conversations.id, params.id));

  return new NextResponse(null, { status: 204 });
}
