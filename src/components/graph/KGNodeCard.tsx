"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Trash2, ChevronDown, ChevronUp, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface KGNodeData {
  id: string;
  type: string;
  title: string;
  description: string;
  tags: string[];
  relationships: { target_title: string; relationship: string }[];
  document_id: string | null;
  retrieval_count: number;
  confidence: number;
  needs_review: boolean;
  review_reason: string | null;
  auto_generated: boolean;
  created_at: string;
}

interface KGNodeCardProps {
  node: KGNodeData;
  kbId: string;
  onDeleted: (id: string) => void;
  onReviewed: (id: string) => void;
}

const TYPE_STYLES: Record<string, { dot: string; badge: string }> = {
  concept:     { dot: "bg-violet-400", badge: "bg-violet-500/15 text-violet-400 border-violet-500/20" },
  entity:      { dot: "bg-blue-400",   badge: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  definition:  { dot: "bg-emerald-400",badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  fact:        { dot: "bg-amber-400",  badge: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  procedure:   { dot: "bg-sky-400",    badge: "bg-sky-500/15 text-sky-400 border-sky-500/20" },
  requirement: { dot: "bg-rose-400",   badge: "bg-rose-500/15 text-rose-400 border-rose-500/20" },
};

export function KGNodeCard({ node, kbId, onDeleted, onReviewed }: KGNodeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const style = TYPE_STYLES[node.type] ?? {
    dot: "bg-white/40",
    badge: "bg-white/[0.06] text-muted-foreground border-white/[0.08]",
  };

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/knowledge-bases/${kbId}/graph/nodes/${node.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete node");
      onDeleted(node.id);
      toast.success("Node deleted");
    } catch {
      toast.error("Failed to delete node");
      setDeleting(false);
    }
  }

  async function handleDismissReview() {
    setDismissing(true);
    try {
      const res = await fetch(
        `/api/knowledge-bases/${kbId}/graph/nodes/${node.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ needsReview: false }),
        }
      );
      if (!res.ok) throw new Error("Failed to dismiss review");
      onReviewed(node.id);
      toast.success("Node marked as reviewed");
    } catch {
      toast.error("Failed to dismiss review flag");
      setDismissing(false);
    }
  }

  return (
    <article
      className={cn(
        "glass rounded-xl p-4 space-y-3 transition-all duration-150",
        node.needs_review && "border border-amber-500/30 bg-amber-500/[0.03]"
      )}
      aria-label={`Knowledge node: ${node.title}`}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", style.dot)} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[14px] font-semibold leading-snug">{node.title}</h3>
            <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border", style.badge)}>
              {node.type}
            </span>
            {node.needs_review && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20">
                <AlertTriangle className="w-2.5 h-2.5" aria-hidden="true" />
                needs review
              </span>
            )}
          </div>
          <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed line-clamp-2">
            {node.description}
          </p>
        </div>

        {/* Retrieval count badge */}
        {node.retrieval_count > 0 && (
          <div
            className="flex items-center gap-1 text-[11px] text-muted-foreground/60 shrink-0"
            title={`Retrieved ${node.retrieval_count} times`}
          >
            <TrendingUp className="w-3 h-3" aria-hidden="true" />
            <span>{node.retrieval_count}</span>
          </div>
        )}
      </div>

      {/* Review reason */}
      {node.needs_review && node.review_reason && (
        <p className="text-[11.5px] text-amber-400/80 pl-5 leading-relaxed">
          {node.review_reason}
        </p>
      )}

      {/* Tags */}
      {node.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-5" role="list" aria-label="Tags">
          {node.tags.map((tag) => (
            <span
              key={tag}
              role="listitem"
              className="px-1.5 py-0.5 rounded-md text-[10px] bg-white/[0.04] text-muted-foreground/70 border border-white/[0.06]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Expandable: relationships */}
      {node.relationships.length > 0 && (
        <div className="pl-5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-[11.5px] text-muted-foreground/60 hover:text-muted-foreground transition-colors duration-150"
            aria-expanded={expanded}
            aria-controls={`relations-${node.id}`}
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {node.relationships.length} relationship{node.relationships.length !== 1 ? "s" : ""}
          </button>
          {expanded && (
            <ul id={`relations-${node.id}`} className="mt-2 space-y-1">
              {node.relationships.map((r, i) => (
                <li key={i} className="text-[11.5px] text-muted-foreground/70 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-white/20 shrink-0" aria-hidden="true" />
                  <span className="text-muted-foreground/50 italic">{r.relationship}</span>
                  <span className="font-medium text-foreground/60">{r.target_title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pl-5 pt-1">
        {node.needs_review && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDismissReview}
            disabled={dismissing}
            className="h-7 px-2.5 text-[11.5px] gap-1.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
          >
            <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
            {dismissing ? "Saving…" : "Mark reviewed"}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={deleting}
          className="h-7 px-2.5 text-[11.5px] gap-1.5 text-muted-foreground/50 hover:text-rose-400 hover:bg-rose-500/10 ml-auto"
          aria-label={`Delete node ${node.title}`}
        >
          <Trash2 className="w-3 h-3" aria-hidden="true" />
          {deleting ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </article>
  );
}
