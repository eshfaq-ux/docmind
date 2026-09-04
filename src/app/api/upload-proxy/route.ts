import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { r2, buildR2Key, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { uploadRatelimit } from "@/lib/redis";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

// Allow up to 55MB body (50MB file + overhead)
export const maxDuration = 60;

/**
 * POST /api/upload-proxy
 *
 * Proxy upload endpoint for S3-compatible providers that don't support
 * browser-side presigned PUT (e.g. Backblaze B2 private buckets).
 *
 * Accepts multipart/form-data with fields:
 *   - file: the file blob
 *   - kbId: UUID of the knowledge base
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const { success, reset } = await uploadRatelimit.limit(session.user.id);
  if (!success) {
    return NextResponse.json(
      { error: "Upload rate limit exceeded. Try again later.", code: "RATE_LIMIT" },
      { status: 429, headers: { "X-RateLimit-Reset": String(reset) } }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const kbId = formData.get("kbId") as string | null;

  if (!file || !kbId) {
    return NextResponse.json({ error: "Missing file or kbId", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  if (!(file.type in ALLOWED_MIME_TYPES)) {
    return NextResponse.json(
      { error: "Unsupported file type. Allowed: PDF, DOCX, TXT", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 50MB", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const { tenantId, id: userId } = session.user;

  // Verify KB belongs to tenant
  const kb = await db.query.knowledgeBases.findFirst({
    where: (kb, { eq, and }) => and(eq(kb.id, kbId), eq(kb.tenantId, tenantId)),
    columns: { id: true },
  });
  if (!kb) {
    return NextResponse.json({ error: "Knowledge base not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const documentId = randomUUID();
  const r2Key = buildR2Key(tenantId, documentId, file.name);
  const sourceType = ALLOWED_MIME_TYPES[file.type] as "pdf" | "docx" | "txt";

  // Read file into buffer and upload to storage
  const buffer = Buffer.from(await file.arrayBuffer());

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
      Key: r2Key,
      Body: buffer,
      ContentType: file.type,
      ContentLength: file.size,
    })
  );

  // Create document row in pending status
  await db.insert(documents).values({
    id: documentId,
    tenantId,
    kbId,
    uploadedBy: userId,
    name: file.name,
    sourceType,
    r2Key,
    fileSizeBytes: file.size,
    status: "pending",
  });

  return NextResponse.json({ documentId, r2Key });
}
