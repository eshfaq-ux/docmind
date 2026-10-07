import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";

/**
 * GET /api/knowledge-bases/[id]/graph
 * Returns all KG nodes + edges for a KB, with summary stats.
 * Used by the KG Explorer page.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tenantId } = session.user;
  const kbId = params.id;

  // Verify KB ownership
  const kb = await db.query.knowledgeBases.findFirst({
    where: (kb, { eq, and }) => and(eq(kb.id, kbId), eq(kb.tenantId, tenantId)),
    columns: { id: true },
  });
  if (!kb) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch nodes (exclude embedding — large + not needed in UI)
  const nodesResult = await db.execute(sql`
    SELECT
      id, type, title, description, tags, relationships,
      document_id, chunk_ids, confidence, retrieval_count,
      needs_review, review_reason, auto_generated,
      created_at, updated_at
    FROM kg_nodes
    WHERE tenant_id = ${tenantId}::uuid
      AND kb_id = ${kbId}::uuid
    ORDER BY retrieval_count DESC, created_at DESC
  `);

  // Fetch edges
  const edgesResult = await db.execute(sql`
    SELECT id, from_node_id, to_node_id, relationship, weight, created_at
    FROM kg_edges
    WHERE tenant_id = ${tenantId}::uuid
      AND kb_id = ${kbId}::uuid
  `);

  const nodes = ((nodesResult as unknown) as { rows: Record<string, unknown>[] }).rows;
  const edges = ((edgesResult as unknown) as { rows: Record<string, unknown>[] }).rows;

  // Build stats
  const nodesByType: Record<string, number> = {};
  let needsReview = 0;
  for (const n of nodes) {
    const t = (n.type as string) ?? "concept";
    nodesByType[t] = (nodesByType[t] ?? 0) + 1;
    if (n.needs_review) needsReview++;
  }

  return NextResponse.json({
    nodes,
    edges,
    stats: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      nodesByType,
      needsReview,
    },
  });
}
