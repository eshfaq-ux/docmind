import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents, knowledgeBases, tenants } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { env } from "@/lib/env";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const finalizeSchema = z.object({
  documentId: z.string().uuid(),
});

/**
 * GET /api/documents?kbId=...
 * List documents for a knowledge base (tenant-scoped).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const kbId = searchParams.get("kbId");
  if (!kbId) return NextResponse.json({ error: "kbId required" }, { status: 400 });

  const docs = await db.query.documents.findMany({
    where: and(eq(documents.kbId, kbId), eq(documents.tenantId, session.user.tenantId)),
    orderBy: [desc(documents.uploadedAt)],
    columns: {
      id: true,
      name: true,
      sourceType: true,
      status: true,
      chunkCount: true,
      pageCount: true,
      fileSizeBytes: true,
      errorMessage: true,
      uploadedAt: true,
      indexedAt: true,
    },
  });

  return NextResponse.json(docs);
}

/**
 * POST /api/documents
 *
 * "Finalize upload" — called by the client after the R2 PUT succeeds.
 * Triggers the backend ingestion pipeline and bumps storage quota.
 *
 * Why separate from /api/upload-url?
 *   upload-url creates the DB row + returns a presigned URL.
 *   The client uploads directly to R2. Only after R2 confirms success does
 *   the client POST here to trigger ingestion. This prevents ingestion jobs
 *   from starting on files that never actually uploaded.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = finalizeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const { documentId } = parsed.data;
  const { tenantId } = session.user;

  // Verify ownership and current status
  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, documentId), eq(documents.tenantId, tenantId)),
    columns: { id: true, status: true, kbId: true, fileSizeBytes: true },
  });

  if (!doc) {
    return NextResponse.json({ error: "Document not found", code: "NOT_FOUND" }, { status: 404 });
  }

  // Idempotent: if already triggered, just return current state
  if (doc.status !== "pending") {
    return NextResponse.json({ status: doc.status, documentId });
  }

  // Atomically update KB doc_count and tenant storage_bytes
  try {
    await Promise.all([
      db
        .update(knowledgeBases)
        .set({ docCount: sql`doc_count + 1`, updatedAt: new Date() })
        .where(eq(knowledgeBases.id, doc.kbId)),
      db.execute(
        sql`UPDATE tenants SET storage_bytes = storage_bytes + ${doc.fileSizeBytes} WHERE id = ${tenantId}::uuid`
      ),
    ]);
  } catch (err) {
    // Unique constraint on (tenant_id, content_hash) → duplicate document
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("documents_tenant_hash_idx") || msg.includes("unique")) {
      // Clean up the pending row and its R2 object
      await db.delete(documents).where(eq(documents.id, documentId)).catch(() => {});
      return NextResponse.json(
        { error: "This document has already been uploaded to this workspace.", code: "DUPLICATE" },
        { status: 409 }
      );
    }
    throw err;
  }

  // Fire-and-forget — client polls /api/documents/[id]/status for progress
  fetch(`${env.BACKEND_URL}/ingest/${documentId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.BACKEND_SECRET}`,
    },
    body: JSON.stringify({ tenant_id: tenantId }),
  }).catch((err) =>
    console.error("[ingest trigger] failed for", documentId, err)
  );

  return NextResponse.json({ status: "processing", documentId }, { status: 202 });
}
