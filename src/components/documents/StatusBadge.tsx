import { Loader2, CheckCircle2, XCircle, Clock, Cpu, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "pending" | "processing" | "parsed" | "embedding" | "ready" | "failed";

const CONFIG: Record<Status, { label: string; cls: string; icon: React.ReactNode }> = {
  pending:    { label: "Pending",    cls: "text-slate-400  bg-slate-500/10  border-slate-500/20",  icon: <Clock     className="w-3 h-3" /> },
  processing: { label: "Parsing",   cls: "text-amber-400  bg-amber-500/10  border-amber-500/20",  icon: <Loader2   className="w-3 h-3 animate-spin" /> },
  parsed:     { label: "Parsed",    cls: "text-sky-400    bg-sky-500/10    border-sky-500/20",    icon: <Zap       className="w-3 h-3" /> },
  embedding:  { label: "Embedding", cls: "text-violet-400 bg-violet-500/10 border-violet-500/20", icon: <Cpu       className="w-3 h-3 animate-pulse" /> },
  ready:      { label: "Ready",     cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: <CheckCircle2 className="w-3 h-3" /> },
  failed:     { label: "Failed",    cls: "text-rose-400   bg-rose-500/10   border-rose-500/20",   icon: <XCircle   className="w-3 h-3" /> },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = CONFIG[status as Status] ?? CONFIG.pending;
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border shrink-0",
      cfg.cls
    )}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}
