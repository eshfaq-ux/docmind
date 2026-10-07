"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { UploadZone } from "@/components/documents/UploadZone";
import { DocumentList } from "@/components/documents/DocumentList";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ArrowLeft, MessageSquare, BookOpen, FileText, Layers, Brain } from "lucide-react";

interface KB {
  id: string;
  name: string;
  description?: string;
  docCount: number;
  chunkCount: number;
  nodeCount?: number;
}

export default function KBDetailPage() {
  const { kbId } = useParams<{ kbId: string }>();
  const [kb, setKb] = useState<KB | null>(null);
  const [loadingKb, setLoadingKb] = useState(true);
  const [uploadedIds, setUploadedIds] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/knowledge-bases/${kbId}`)
      .then((r) => r.json())
      .then(setKb)
      .catch(() => toast.error("Failed to load knowledge base"))
      .finally(() => setLoadingKb(false));
  }, [kbId]);

  return (
    <div className="max-w-3xl space-y-8 animate-fade-up">

      {/* Breadcrumb + header */}
      <div className="space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors duration-150"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Knowledge Bases
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <BookOpen className="w-5 h-5 text-primary/80" />
            </div>
            <div className="min-w-0">
              {loadingKb ? (
                <div className="space-y-2">
                  <Skeleton className="h-6 w-44 bg-white/[0.05]" />
                  <Skeleton className="h-3.5 w-64 bg-white/[0.04]" />
                </div>
              ) : (
                <>
                  <h1 className="text-xl font-bold tracking-tight truncate">{kb?.name}</h1>
                  {kb?.description && (
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{kb.description}</p>
                  )}
                </>
              )}
            </div>
          </div>

          <Link href={`/kb/${kbId}/chat`} className="shrink-0">
            <Button className="gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 h-9 px-4 text-sm">
              <MessageSquare className="w-4 h-4" /> Chat with KB
            </Button>
          </Link>
        </div>

        {/* Quick stats */}
        {kb && (
          <div className="flex items-center gap-5 text-[13px]">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <FileText className="w-3.5 h-3.5 opacity-60" />
              <span className="font-semibold text-foreground/90">{kb.docCount}</span>
              <span>documents</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-white/20" />
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Layers className="w-3.5 h-3.5 opacity-60" />
              <span className="font-semibold text-foreground/90">{kb.chunkCount.toLocaleString()}</span>
              <span>chunks indexed</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-white/20" />
            <Link
              href={`/kb/${kbId}/graph`}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-violet-400 transition-colors duration-150"
            >
              <Brain className="w-3.5 h-3.5 opacity-60" />
              <span className="font-semibold text-foreground/90">{kb.nodeCount ?? 0}</span>
              <span>knowledge nodes</span>
            </Link>
          </div>
        )}
      </div>

      {/* Upload section */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="label-xs">Upload Documents</span>
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>
        <UploadZone kbId={kbId} onUploaded={(id) => setUploadedIds((p) => [...p, id])} />
      </section>

      {/* Documents section */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="label-xs">Documents</span>
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>
        <DocumentList kbId={kbId} pendingIds={uploadedIds} />
      </section>
    </div>
  );
}
