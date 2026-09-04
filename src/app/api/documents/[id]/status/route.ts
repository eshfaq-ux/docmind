import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/documents/[id]/status
 *
 * Polling endpoint for document ingestion status.
 * Client polls every 2s until status is 'ready' or 'failed'.
 * Max 60 attempts (2 minutes), then show "check back later" message.
 *
 * Returns:
 *   { status, chunkCount, errorMessage? }
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
    columns: {
      id: true,
      status: true,
      chunkCount: true,
      pageCount: true,
      errorMessage: true,
      name: true,
      indexedAt: true,
    },
  });

  if (!doc) {
    return NextResponse.json({ error: "Document not found", code: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({
    id: doc.id,
    name: doc.name,
    status: doc.status,
    chunkCount: doc.chunkCount,
    pageCount: doc.pageCount,
    errorMessage: doc.errorMessage ?? null,
    indexedAt: doc.indexedAt ?? null,
  });
}
