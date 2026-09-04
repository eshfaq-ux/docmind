import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents, chunks, knowledgeBases } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { env } from "@/lib/env";
import { clearHistory } from "@/lib/redis";

export const runtime = "nodejs";

/**
 * POST /api/documents/[id]/reingest
 *
 * Re-index a document:
 *   1. Delete all existing chunks (frees pgvector space immediately)
 *   2. Reset document status → pending, clear error + chunk count
 *   3. Decrement KB chunk counter (will be re-incremented when ready)
 *   4. Trigger backend ingestion
 *
 * Safe to call on documents in any status including 'ready'.
 * Conversations that referenced old chunks are unaffected (citations are
 * immutable snapshots — old chunks stay in citations table via FK).
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const doc = await db.query.documents.findFirst({
    where: and(
      eq(documents.id, params.id),
      eq(documents.tenantId, session.user.tenantId)
    ),
    columns: { id: true, status: true, kbId: true, tenantId: true, chunkCount: true },
  });

  if (!doc) {
    return NextResponse.json({ error: "Document not found", code: "NOT_FOUND" }, { status: 404 });
  }

  // Prevent concurrent re-index requests
  if (doc.status === "processing" || doc.status === "embedding") {
    return NextResponse.json(
      { error: "Document is currently being processed", code: "CONFLICT" },
      { status: 409 }
    );
  }

  // Delete existing chunks
  await db.delete(chunks).where(eq(chunks.documentId, doc.id));

  // Reset document
  await db
    .update(documents)
    .set({
      status: "pending",
      chunkCount: 0,
      errorMessage: null,
      indexedAt: null,
    })
    .where(eq(documents.id, doc.id));

  // Decrement KB chunk count only (doc count stays — document still exists)
  await db
    .update(knowledgeBases)
    .set({
      chunkCount: sql`GREATEST(0, chunk_count - ${doc.chunkCount})`,
      updatedAt: new Date(),
    })
    .where(eq(knowledgeBases.id, doc.kbId));

  // Trigger backend ingestion
  fetch(`${env.BACKEND_URL}/ingest/${doc.id}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.BACKEND_SECRET}`,
    },
    body: JSON.stringify({ tenant_id: doc.tenantId }),
  }).catch((err) =>
    console.error("[reingest trigger] failed for", doc.id, err)
  );

  return NextResponse.json({ status: "pending", documentId: doc.id });
}
