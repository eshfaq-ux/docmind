import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

/**
 * Cloudflare R2 client.
 * R2 is S3-compatible, so we use the AWS SDK with a custom endpoint.
 * Zero egress fees vs S3's per-GB egress cost.
 */
export const r2 = new S3Client({
  region: env.CLOUDFLARE_R2_REGION ?? "auto",
  endpoint: env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
  // Required for Backblaze B2 and other S3-compatible providers
  // that don't support virtual-hosted-style bucket URLs
  forcePathStyle: true,
});

const BUCKET = env.CLOUDFLARE_R2_BUCKET_NAME;

/**
 * Generate a presigned PUT URL for direct client-to-R2 upload.
 * Constraining Content-Type and Content-Length prevents the client
 * from uploading arbitrary content types or oversized files.
 *
 * Expiry: 1 hour — enough time for a large upload on slow connections.
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  fileSizeBytes: number
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: fileSizeBytes,
  });

  return getSignedUrl(r2, command, { expiresIn: 3600 });
}

/**
 * Delete an object from R2. Always call this BEFORE deleting the DB row.
 * If R2 delete fails, throw — caller should not delete from DB.
 */
export async function deleteR2Object(key: string): Promise<void> {
  await r2.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
}

/**
 * Build the R2 key for a document.
 * Namespaced by tenantId to enforce storage isolation.
 */
export function buildR2Key(tenantId: string, documentId: string, filename: string): string {
  // Sanitize filename: only allow safe characters
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
  return `tenants/${tenantId}/documents/${documentId}/${safe}`;
}

/**
 * Allowed MIME types for upload.
 * Mapped to source_type for DB storage.
 */
export const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
