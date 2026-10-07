"use client";

import { Brain, GitBranch, AlertTriangle } from "lucide-react";

interface KGStatsProps {
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<string, number>;
  needsReview: number;
}

const TYPE_COLORS: Record<string, string> = {
  concept:     "bg-violet-500/15 text-violet-400 border-violet-500/20",
  entity:      "bg-blue-500/15 text-blue-400 border-blue-500/20",
  definition:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  fact:        "bg-amber-500/15 text-amber-400 border-amber-500/20",
  procedure:   "bg-sky-500/15 text-sky-400 border-sky-500/20",
  requirement: "bg-rose-500/15 text-rose-400 border-rose-500/20",
};

export function KGStats({ totalNodes, totalEdges, nodesByType, needsReview }: KGStatsProps) {
  return (
    <div className="space-y-4">
      {/* Review alert */}
      {needsReview > 0 && (
        <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[12.5px] text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">{needsReview} node{needsReview !== 1 ? "s" : ""}</span>
            {" "}flagged for review — a newer document may contradict existing knowledge.
          </span>
        </div>
      )}

      {/* Top-level counts */}
      <div className="flex items-center gap-5 text-[13px]">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Brain className="w-3.5 h-3.5 opacity-60" aria-hidden="true" />
          <span className="font-semibold text-foreground/90">{totalNodes.toLocaleString()}</span>
          <span>knowledge nodes</span>
        </div>
        <div className="w-1 h-1 rounded-full bg-white/20" aria-hidden="true" />
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <GitBranch className="w-3.5 h-3.5 opacity-60" aria-hidden="true" />
          <span className="font-semibold text-foreground/90">{totalEdges.toLocaleString()}</span>
          <span>relationships</span>
        </div>
      </div>

      {/* Type breakdown */}
      {Object.keys(nodesByType).length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="list" aria-label="Node types">
          {Object.entries(nodesByType)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => (
              <span
                key={type}
                role="listitem"
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${TYPE_COLORS[type] ?? "bg-white/[0.06] text-muted-foreground border-white/[0.08]"}`}
              >
                {type}
                <span className="opacity-70">{count}</span>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
