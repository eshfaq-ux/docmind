import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { usageEvents } from "@/lib/db/schema";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

/**
 * GET /api/usage
 *
 * Returns usage aggregates for the authenticated tenant.
 * Query param: ?days=30 (1–90, default 30)
 *
 * Response shape:
 * {
 *   totals: { promptTokens, completionTokens, totalTokens, costUsd, chatCount, embedCount },
 *   daily: [{ date, totalTokens, costUsd, chatCount }],          // one row per day
 *   byModel: [{ model, totalTokens, costUsd, count }],
 *   confidence: { high, medium, low, none },                     // message distribution
 * }
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({ days: searchParams.get("days") ?? 30 });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { days } = parsed.data;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const tenantId = session.user.tenantId;

  const [totals, daily, byModel, confidence] = await Promise.all([
    // Aggregate totals
    db
      .select({
        promptTokens: sql<number>`COALESCE(SUM(${usageEvents.promptTokens}), 0)::int`,
        completionTokens: sql<number>`COALESCE(SUM(${usageEvents.completionTokens}), 0)::int`,
        totalTokens: sql<number>`COALESCE(SUM(${usageEvents.totalTokens}), 0)::int`,
        costUsd: sql<string>`COALESCE(SUM(${usageEvents.costUsd}), 0)::numeric(10,4)`,
        chatCount: sql<number>`COUNT(*) FILTER (WHERE ${usageEvents.eventType} = 'chat')::int`,
        embedCount: sql<number>`COUNT(*) FILTER (WHERE ${usageEvents.eventType} = 'embed')::int`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.tenantId, tenantId),
          gte(usageEvents.createdAt, since)
        )
      ),

    // Daily breakdown
    db
      .select({
        date: sql<string>`DATE(${usageEvents.createdAt})::text`,
        totalTokens: sql<number>`COALESCE(SUM(${usageEvents.totalTokens}), 0)::int`,
        costUsd: sql<string>`COALESCE(SUM(${usageEvents.costUsd}), 0)::numeric(10,4)`,
        chatCount: sql<number>`COUNT(*) FILTER (WHERE ${usageEvents.eventType} = 'chat')::int`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.tenantId, tenantId),
          gte(usageEvents.createdAt, since)
        )
      )
      .groupBy(sql`DATE(${usageEvents.createdAt})`)
      .orderBy(sql`DATE(${usageEvents.createdAt})`),

    // By model
    db
      .select({
        model: usageEvents.model,
        totalTokens: sql<number>`COALESCE(SUM(${usageEvents.totalTokens}), 0)::int`,
        costUsd: sql<string>`COALESCE(SUM(${usageEvents.costUsd}), 0)::numeric(10,4)`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.tenantId, tenantId),
          gte(usageEvents.createdAt, since)
        )
      )
      .groupBy(usageEvents.model)
      .orderBy(desc(sql`SUM(${usageEvents.totalTokens})`)),

    // Confidence distribution from messages via join
    db.execute(
      sql`
        SELECT
          m.confidence,
          COUNT(*)::int AS count
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE c.tenant_id = ${tenantId}::uuid
          AND m.role = 'assistant'
          AND m.created_at >= ${since}
          AND m.confidence IS NOT NULL
        GROUP BY m.confidence
      `
    ),
  ]);

  // Normalize confidence rows
  const confMap: Record<string, number> = { high: 0, medium: 0, low: 0, none: 0 };
  const confRows = (confidence as unknown as { rows: { confidence: string; count: number }[] }).rows;
  for (const row of confRows) {
    if (row.confidence in confMap) confMap[row.confidence] = row.count;
  }

  return NextResponse.json({
    totals: totals[0],
    daily,
    byModel,
    confidence: confMap,
  });
}
