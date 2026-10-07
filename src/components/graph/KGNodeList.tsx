"use client";

import { useState, useMemo } from "react";
import { Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { KGNodeCard, type KGNodeData } from "./KGNodeCard";
import { cn } from "@/lib/utils";

const ALL_TYPES = ["concept", "entity", "definition", "fact", "procedure", "requirement"];

interface KGNodeListProps {
  nodes: KGNodeData[];
  kbId: string;
}

export function KGNodeList({ nodes: initialNodes, kbId }: KGNodeListProps) {
  const [nodes, setNodes] = useState<KGNodeData[]>(initialNodes);
  const [query, setQuery] = useState("");
  const [activeType, setActiveType] = useState<string | null>(null);
  const [reviewOnly, setReviewOnly] = useState(false);

  const filtered = useMemo(() => {
    return nodes.filter((n) => {
      if (activeType && n.type !== activeType) return false;
      if (reviewOnly && !n.needs_review) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        return (
          n.title.toLowerCase().includes(q) ||
          n.description.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [nodes, query, activeType, reviewOnly]);

  function handleDeleted(id: string) {
    setNodes((prev) => prev.filter((n) => n.id !== id));
  }

  function handleReviewed(id: string) {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, needs_review: false, review_reason: null, confidence: 1.0 } : n
      )
    );
  }

  const reviewCount = nodes.filter((n) => n.needs_review).length;
  const availableTypes = Array.from(new Set(nodes.map((n) => n.type)));

  if (nodes.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground/50">
        <p className="text-[13px]">No knowledge nodes yet.</p>
        <p className="text-[12px] mt-1">Upload documents and they will be distilled automatically.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40 pointer-events-none"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search nodes…"
            aria-label="Search knowledge nodes"
            className="pl-8 h-9 bg-white/[0.04] border-white/[0.09] text-[13px] placeholder:text-muted-foreground/30 focus:ring-0 focus:border-primary/40"
          />
        </div>

        {/* Review filter */}
        {reviewCount > 0 && (
          <button
            type="button"
            onClick={() => setReviewOnly((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[12px] font-medium border transition-all duration-150",
              reviewOnly
                ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                : "bg-white/[0.04] text-muted-foreground border-white/[0.09] hover:bg-white/[0.07]"
            )}
            aria-pressed={reviewOnly}
          >
            <Filter className="w-3 h-3" aria-hidden="true" />
            Review ({reviewCount})
          </button>
        )}
      </div>

      {/* Type filter pills */}
      {availableTypes.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
          <button
            type="button"
            onClick={() => setActiveType(null)}
            className={cn(
              "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all duration-150",
              activeType === null
                ? "bg-primary/15 text-primary border-primary/30"
                : "bg-white/[0.04] text-muted-foreground/60 border-white/[0.07] hover:bg-white/[0.07]"
            )}
            aria-pressed={activeType === null}
          >
            All
          </button>
          {ALL_TYPES.filter((t) => availableTypes.includes(t)).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setActiveType(activeType === type ? null : type)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all duration-150",
                activeType === type
                  ? "bg-primary/15 text-primary border-primary/30"
                  : "bg-white/[0.04] text-muted-foreground/60 border-white/[0.07] hover:bg-white/[0.07]"
              )}
              aria-pressed={activeType === type}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      {/* Results count */}
      <p className="text-[11.5px] text-muted-foreground/50" aria-live="polite">
        {filtered.length === nodes.length
          ? `${nodes.length} node${nodes.length !== 1 ? "s" : ""}`
          : `${filtered.length} of ${nodes.length} nodes`}
      </p>

      {/* Node list */}
      {filtered.length === 0 ? (
        <p className="text-center py-8 text-[13px] text-muted-foreground/40">
          No nodes match your filters.
        </p>
      ) : (
        <ul className="space-y-3" aria-label="Knowledge nodes">
          {filtered.map((node) => (
            <li key={node.id}>
              <KGNodeCard
                node={node}
                kbId={kbId}
                onDeleted={handleDeleted}
                onReviewed={handleReviewed}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
