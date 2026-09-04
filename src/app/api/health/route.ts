import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/health
 *
 * Health check endpoint for uptime monitoring (UptimeRobot etc.).
 * Verifies DB connectivity with a lightweight query.
 * Does NOT verify OpenAI/R2/Redis to keep it fast (<100ms).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | "error"> = {};

  try {
    await db.execute({ sql: "SELECT 1", params: [] } as never);
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");

  return NextResponse.json(
    { status: allOk ? "ok" : "degraded", checks, ts: new Date().toISOString() },
    { status: allOk ? 200 : 503 }
  );
}
