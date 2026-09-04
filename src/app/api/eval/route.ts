import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { evalDatasets, evalCases } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";

const createSchema = z.object({
  kbId: z.string().uuid(),
  name: z.string().min(1).max(200),
  cases: z
    .array(
      z.object({
        question: z.string().min(1).max(2000),
        expectedAnswer: z.string().max(4000).optional(),
        expectedDocIds: z.array(z.string().uuid()).optional(),
      })
    )
    .min(1)
    .max(100),
});

/**
 * GET /api/eval
 * List all eval datasets for the tenant.
 */
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const datasets = await db.query.evalDatasets.findMany({
    where: eq(evalDatasets.tenantId, session.user.tenantId),
    orderBy: [desc(evalDatasets.createdAt)],
    columns: { id: true, kbId: true, name: true, createdAt: true },
    with: {
      cases: { columns: { id: true } },
      runs: {
        columns: {
          id: true,
          label: true,
          avgFaithfulness: true,
          avgAnswerRelevance: true,
          avgRetrievalRelevance: true,
          passedCount: true,
          totalCount: true,
          createdAt: true,
        },
        orderBy: (r, { desc }) => [desc(r.createdAt)],
        limit: 1,
      },
    },
  });

  // Flatten: add caseCount and latestRun
  const result = datasets.map((d) => ({
    id: d.id,
    kbId: d.kbId,
    name: d.name,
    createdAt: d.createdAt,
    caseCount: d.cases.length,
    latestRun: d.runs[0] ?? null,
  }));

  return NextResponse.json(result);
}

/**
 * POST /api/eval
 * Create a new eval dataset with cases.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const { kbId, name, cases } = parsed.data;

  // Verify KB belongs to tenant
  const kb = await db.query.knowledgeBases.findFirst({
    where: (kb, { eq, and }) =>
      and(eq(kb.id, kbId), eq(kb.tenantId, session.user.tenantId)),
    columns: { id: true },
  });
  if (!kb) {
    return NextResponse.json({ error: "Knowledge base not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const [dataset] = await db
    .insert(evalDatasets)
    .values({ tenantId: session.user.tenantId, kbId, name })
    .returning();

  const caseRows = cases.map((c) => ({
    datasetId: dataset.id,
    question: c.question,
    expectedAnswer: c.expectedAnswer ?? null,
    expectedDocIds: c.expectedDocIds ?? null,
  }));

  await db.insert(evalCases).values(caseRows);

  return NextResponse.json({ ...dataset, caseCount: caseRows.length }, { status: 201 });
}
