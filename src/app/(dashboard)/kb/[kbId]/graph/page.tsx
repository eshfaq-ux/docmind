"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, Brain } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { KGStats } from "@/components/graph/KGStats";
import { KGNodeList } from "@/components/graph/KGNodeList";
import { toast } from "sonner";
import type { KGNodeData } from "@/components/graph/KGNodeCard";

interface GraphData {
  nodes: KGNodeData[];
  edges: unknown[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    nodesByType: Record<string, number>;
    needsReview: number;
  };
}

interface KB {
  id: string;
  name: string;
}

export default function KGExplorerPage() {
  const { kbId } = useParams<{ kbId: string }>();
  const [kb, setKb] = useState<KB | null>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/knowledge-bases/${kbId}`).then((r) => r.json()),
      fetch(`/api/knowledge-bases/${kbId}/graph`).then((r) => r.json()),
    ])
      .then(([kbData, graphData]) => {
        setKb(kbData);
        setGraph(graphData);
      })
      .catch(() => toast.error("Failed to load knowledge graph"))
      .finally(() => setLoading(false));
  }, [kbId]);

  return (
    <div className="max-w-3xl space-y-8 animate-fade-up">

      {/* Breadcrumb + header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
          <Link
            href="/"
            className="hover:text-foreground transition-colors duration-150"
          >
            Knowledge Bases
          </Link>
          <span>/</span>
          <Link
            href={`/kb/${kbId}`}
            className="hover:text-foreground transition-colors duration-150"
          >
            {kb?.name ?? "…"}
          </Link>
          <span>/</span>
          <span className="text-foreground/70">Knowledge Graph</span>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0 mt-0.5">
            <Brain className="w-5 h-5 text-violet-400/80" aria-hidden="true" />
          </div>
          <div>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-44 bg-white/[0.05]" />
                <Skeleton className="h-3.5 w-64 bg-white/[0.04]" />
              </div>
            ) : (
              <>
                <h1 className="text-xl font-bold tracking-tight">Knowledge Graph</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Structured concepts auto-distilled from{" "}
                  <span className="text-foreground/70 font-medium">{kb?.name}</span>
                </p>
              </>
            )}
          </div>
        </div>

        {/* Stats */}
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-56 bg-white/[0.04]" />
            <Skeleton className="h-5 w-72 bg-white/[0.04]" />
          </div>
        ) : graph && (
          <KGStats
            totalNodes={graph.stats.totalNodes}
            totalEdges={graph.stats.totalEdges}
            nodesByType={graph.stats.nodesByType}
            needsReview={graph.stats.needsReview}
          />
        )}
      </div>

      {/* Back link */}
      <Link
        href={`/kb/${kbId}`}
        className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors duration-150"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        Back to documents
      </Link>

      {/* Empty state */}
      {!loading && graph?.stats.totalNodes === 0 && (
        <div className="glass rounded-xl p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto">
            <Brain className="w-6 h-6 text-violet-400/60" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-[14px] font-medium">No knowledge nodes yet</p>
            <p className="text-[12.5px] text-muted-foreground leading-relaxed max-w-sm mx-auto">
              Upload and process documents to automatically build a structured knowledge graph.
              Nodes appear here after distillation completes.
            </p>
          </div>
          <Link
            href={`/kb/${kbId}`}
            className="inline-flex items-center gap-1.5 text-[12.5px] text-primary hover:text-primary/80 transition-colors duration-150"
          >
            <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
            Upload documents
          </Link>
        </div>
      )}

      {/* Node list */}
      {!loading && graph && graph.stats.totalNodes > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="label-xs">Knowledge Nodes</span>
            <div className="flex-1 h-px bg-white/[0.06]" aria-hidden="true" />
          </div>
          <KGNodeList nodes={graph.nodes} kbId={kbId} />
        </section>
      )}

      {/* Loading skeleton */}
      {loading && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-28 bg-white/[0.04]" />
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl bg-white/[0.03]" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
