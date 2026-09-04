import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getPresignedUploadUrl, buildR2Key, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "@/lib/r2";
import { uploadRatelimit } from "@/lib/redis";
import { z } from "zod";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const requestSchema = z.object({
  filename: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z0-9 ._()-]+$/, "Filename contains invalid characters"),
  contentType: z.string().refine((v) => v in ALLOWED_MIME_TYPES, {
    message: "Unsupported file type. Allowed: PDF, DOCX, TXT",
  }),
  fileSizeBytes: z.number().int().min(1).max(MAX_FILE_SIZE_BYTES),
  kbId: z.string().uuid(),
});

/**
 * GET /api/upload-url
 *
 * Returns a presigned R2 PUT URL for direct client-to-R2 upload.
 * Also creates the document row in 'pending' status so we have an ID
 * to reference during ingestion.
 *
 * Flow:
 *   1. Client calls this endpoint with filename/contentType/size/kbId
 *   2. Server validates, rate-checks, creates document row
 *   3. Returns presigned URL + documentId
 *   4. Client PUTs file directly to R2 (no server memory usage)
 *   5. Client POSTs to /api/documents/[id]/ingest to start processing
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  // Rate limit: 10 uploads per hour per user
  const { success, reset } = await uploadRatelimit.limit(session.user.id);
  if (!success) {
    return NextResponse.json(
      { error: "Upload rate limit exceeded. Try again later.", code: "RATE_LIMIT" },
      {
        status: 429,
        headers: { "X-RateLimit-Reset": String(reset) },
      }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const { filename, contentType, fileSizeBytes, kbId } = parsed.data;
  const { tenantId, id: userId } = session.user;

  // Verify the KB belongs to this tenant
  const kb = await db.query.knowledgeBases.findFirst({
    where: (kb, { eq, and }) => and(eq(kb.id, kbId), eq(kb.tenantId, tenantId)),
  });
  if (!kb) {
    return NextResponse.json({ error: "Knowledge base not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const documentId = randomUUID();
  const r2Key = buildR2Key(tenantId, documentId, filename);
  const sourceType = ALLOWED_MIME_TYPES[contentType] as "pdf" | "docx" | "txt";

  // Create document row in pending status before upload starts
  await db.insert(documents).values({
    id: documentId,
    tenantId,
    kbId,
    uploadedBy: userId,
    name: filename,
    sourceType,
    r2Key,
    fileSizeBytes,
    status: "pending",
  });

  const uploadUrl = await getPresignedUploadUrl(r2Key, contentType, fileSizeBytes);

  return NextResponse.json({
    uploadUrl,
    documentId,
    r2Key,
  });
}
