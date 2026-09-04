import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents, chunks, knowledgeBases } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { deleteR2Object } from "@/lib/r2";

export const runtime = "nodejs";

/**
 * GET /api/documents/[id]
 * Returns document details including chunk count and status.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const doc = await db.query.documents.findFirst({
    where: (d, { eq, and }) =>
      and(eq(d.id, params.id), eq(d.tenantId, session.user.tenantId)),
  });

  if (!doc) {
    return NextResponse.json({ error: "Document not found", code: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json(doc);
}

/**
 * DELETE /api/documents/[id]
 *
 * Deletion order (critical — never deviate):
 *   1. Verify ownership
 *   2. Delete from R2 (if fails, abort — don't create orphaned DB rows)
 *   3. Delete from DB (CASCADE deletes chunks + citations)
 *   4. Decrement KB counters atomically
 *   5. Decrement tenant storage_bytes atomically
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const doc = await db.query.documents.findFirst({
    where: (d, { eq, and }) =>
      and(eq(d.id, params.id), eq(d.tenantId, session.user.tenantId)),
    columns: { id: true, r2Key: true, fileSizeBytes: true, chunkCount: true, kbId: true, tenantId: true },
  });

  if (!doc) {
    return NextResponse.json({ error: "Document not found", code: "NOT_FOUND" }, { status: 404 });
  }

  // Step 1: Delete from R2 first (idempotent — R2 returns 204 even if key doesn't exist)
  if (doc.r2Key) {
    await deleteR2Object(doc.r2Key);
  }

  // Step 2: Delete from DB (chunks cascade)
  await db.delete(documents).where(eq(documents.id, doc.id));

  // Step 3: Decrement KB counters atomically (never read-modify-write)
  await db
    .update(knowledgeBases)
    .set({
      docCount: sql`doc_count - 1`,
      chunkCount: sql`chunk_count - ${doc.chunkCount}`,
      updatedAt: new Date(),
    })
    .where(eq(knowledgeBases.id, doc.kbId));

  // Step 4: Release storage quota
  // Using atomic SQL to avoid race conditions with concurrent uploads
  await db.execute(
    sql`UPDATE tenants SET storage_bytes = GREATEST(0, storage_bytes - ${doc.fileSizeBytes}) WHERE id = ${doc.tenantId}::uuid`
  );

  return new NextResponse(null, { status: 204 });
}

// POST /api/documents/[id]/reingest is handled by
// src/app/api/documents/[id]/reingest/route.ts
