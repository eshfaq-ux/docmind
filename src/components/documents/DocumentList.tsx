"use client";

import { useState, useEffect, useCallback } from "react";
import { StatusBadge } from "./StatusBadge";
import { useDocumentStatus } from "@/hooks/useDocumentStatus";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  FileText, FileWarning, Trash2, RefreshCw,
  ChevronDown, ChevronUp, File,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Doc {
  id: string;
  name: string;
  status: string;
  chunkCount: number;
  pageCount: number | null;
  fileSizeBytes: number;
  errorMessage: string | null;
  uploadedAt: string;
  indexedAt: string | null;
}

interface DocumentListProps {
  kbId: string;
  pendingIds?: string[];
}

function fmtBytes(b: number) {
  if (b < 1024)       return `${b} B`;
  if (b < 1024 ** 2)  return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 ** 2).toFixed(1)} MB`;
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ext(name: string | undefined | null) {
  if (!name) return "FILE";
  return name.split(".").pop()?.toUpperCase() ?? "FILE";
}

const EXT_COLORS: Record<string, string> = {
  PDF:  "text-rose-400   bg-rose-500/10   border-rose-500/20",
  DOCX: "text-blue-400   bg-blue-500/10   border-blue-500/20",
  TXT:  "text-slate-400  bg-slate-500/10  border-slate-500/20",
  MD:   "text-purple-400 bg-purple-500/10 border-purple-500/20",
};

function DocIcon({ name, status }: { name: string; status: string }) {
  if (status === "failed") {
    return (
      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-rose-500/10 border border-rose-500/20 shrink-0">
        <FileWarning className="w-4 h-4 text-rose-400" />
      </div>
    );
  }
  const e = ext(name);
  const cls = EXT_COLORS[e] ?? "text-muted-foreground bg-white/[0.05] border-white/[0.08]";
  return (
    <div className={cn("w-9 h-9 rounded-xl flex flex-col items-center justify-center border shrink-0", cls)}>
      <span className="text-[8px] font-black tracking-tight leading-none">{e}</span>
    </div>
  );
}

function PollingRow({
  doc,
  onUpdate,
  onDelete,
  onReingest,
}: {
  doc: Doc;
  onUpdate: (id: string, u: Partial<Doc>) => void;
  onDelete: (id: string) => void;
  onReingest: (id: string) => void;
}) {
  const terminal = doc.status === "ready" || doc.status === "failed";
  const [expanded, setExpanded] = useState(false);

  useDocumentStatus(terminal ? null : doc.id, (data) => {
    onUpdate(doc.id, { status: data.status, chunkCount: data.chunkCount, errorMessage: data.errorMessage ?? null });
  });

  return (
    <div className={cn(
      "group rounded-xl border transition-all duration-200",
      doc.status === "failed"
        ? "bg-rose-500/[0.04] border-rose-500/15"
        : "bg-white/[0.025] border-white/[0.07] hover:border-white/[0.12] hover:bg-white/[0.04]"
    )}>
      <div className="flex items-center gap-3 px-4 py-3">
        <DocIcon name={doc.name} status={doc.status} />

        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium truncate leading-snug">{doc.name}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {fmtBytes(doc.fileSizeBytes)}
            {doc.pageCount ? ` · ${doc.pageCount}p` : ""}
            {doc.status === "ready" ? ` · ${doc.chunkCount.toLocaleString()} chunks` : ""}
            <span className="opacity-50"> · {timeAgo(doc.uploadedAt)}</span>
          </p>
        </div>

        <StatusBadge status={doc.status} />

        {/* Actions — visible on hover */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0">
          {(doc.status === "failed" || doc.status === "ready") && (
            <button
              onClick={() => onReingest(doc.id)}
              title={doc.status === "failed" ? "Retry ingestion" : "Re-index document"}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 transition-colors duration-150"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          {doc.errorMessage && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors duration-150"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            onClick={() => onDelete(doc.id)}
            title="Delete"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors duration-150"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && doc.errorMessage && (
        <div className="px-4 pb-3 pt-0">
          <div className="rounded-lg bg-rose-500/8 border border-rose-500/15 px-3 py-2">
            <p className="text-[11px] text-rose-400/90 leading-relaxed">{doc.errorMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function DocumentList({ kbId, pendingIds = [] }: DocumentListProps) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents?kbId=${kbId}`);
      if (!res.ok) throw new Error();
      setDocs(await res.json());
    } catch {
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [kbId]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  useEffect(() => {
    if (!pendingIds.length) return;
    const id = pendingIds[pendingIds.length - 1];
    if (docs.some((d) => d.id === id)) return;
    fetch(`/api/documents/${id}`)
      .then((r) => r.json())
      .then((doc: Doc) => setDocs((p) => [doc, ...p]))
      .catch(() => {});
  }, [pendingIds, docs]);

  const handleUpdate = useCallback((id: string, u: Partial<Doc>) =>
    setDocs((p) => p.map((d) => d.id === id ? { ...d, ...u } : d)), []);

  const handleDelete = useCallback(async (id: string) => {
    const doc = docs.find((d) => d.id === id);
    if (!confirm(`Delete "${doc?.name}"? Cannot be undone.`)) return;
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setDocs((p) => p.filter((d) => d.id !== id));
      toast.success("Document deleted");
    } else toast.error("Delete failed");
  }, [docs]);

  const handleReingest = useCallback(async (id: string) => {
    const res = await fetch(`/api/documents/${id}/reingest`, { method: "POST" });
    if (res.ok) {
      setDocs((p) => p.map((d) => d.id === id ? { ...d, status: "pending", chunkCount: 0, errorMessage: null } : d));
      toast.success("Re-ingestion started");
    } else toast.error("Retry failed");
  }, []);

  if (loading) return (
    <div className="space-y-2">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-[60px] rounded-xl shimmer bg-white/[0.03] border border-white/[0.06]" />
      ))}
    </div>
  );

  if (!docs.length) return (
    <div className="flex flex-col items-center justify-center py-14 text-center space-y-3">
      <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
        <File className="w-5 h-5 text-muted-foreground/40" />
      </div>
      <div>
        <p className="text-[13px] font-medium text-muted-foreground/80">No documents yet</p>
        <p className="text-[12px] text-muted-foreground/50 mt-0.5">Upload files above to get started</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      {docs.map((doc) => (
        <PollingRow key={doc.id} doc={doc} onUpdate={handleUpdate} onDelete={handleDelete} onReingest={handleReingest} />
      ))}
    </div>
  );
}
