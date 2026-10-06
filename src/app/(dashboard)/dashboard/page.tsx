"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Plus, BookOpen, MessageSquare, FileText,
  Trash2, ArrowRight, Layers, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface KB {
  id: string;
  name: string;
  description?: string;
  docCount: number;
  chunkCount: number;
  updatedAt: string;
}

function timeAgo(d: string) {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function KBCardSkeleton() {
  return (
    <div className="glass rounded-2xl p-5 space-y-4 shimmer">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-white/[0.05] shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 bg-white/[0.05] rounded-lg" />
          <div className="h-3 w-full bg-white/[0.04] rounded-lg" />
        </div>
      </div>
      <div className="h-px bg-white/[0.05]" />
      <div className="flex gap-2">
        <div className="h-8 flex-1 bg-white/[0.04] rounded-lg" />
        <div className="h-8 flex-1 bg-white/[0.04] rounded-lg" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [kbs, setKbs] = useState<KB[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    fetch("/api/knowledge-bases")
      .then((r) => r.json())
      .then(setKbs)
      .catch(() => toast.error("Failed to load knowledge bases"))
      .finally(() => setLoading(false));
  }, []);

  async function createKB(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await fetch("/api/knowledge-bases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    const kb = await res.json();
    setCreating(false);
    if (!res.ok) { toast.error(kb.error); return; }
    setKbs((prev) => [kb, ...prev]);
    setOpen(false);
    setName("");
    setDescription("");
    toast.success("Knowledge base created");
  }

  async function deleteKB(id: string, kbName: string) {
    if (!confirm(`Delete "${kbName}" and all its documents?`)) return;
    await fetch(`/api/knowledge-bases/${id}`, { method: "DELETE" });
    setKbs((prev) => prev.filter((k) => k.id !== id));
    toast.success("Deleted");
  }

  return (
    <div className="max-w-6xl space-y-8 animate-fade-up">

      {/* Page header */}
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Knowledge Bases</h1>
          <p className="text-sm text-muted-foreground">
            Upload documents and chat with them using AI
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button className="gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 text-sm h-9 px-4">
                <Plus className="w-4 h-4" /> New KB
              </Button>
            }
          />
          <DialogContent className="glass-strong border-white/[0.12] rounded-2xl max-w-md shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">Create Knowledge Base</DialogTitle>
            </DialogHeader>
            <form onSubmit={createKB} className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input
                  placeholder="e.g. Product Docs, Legal Contracts…"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="bg-white/[0.04] border-white/[0.10] h-9 text-sm placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-0"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Description <span className="opacity-50">(optional)</span>
                </Label>
                <Textarea
                  placeholder="What kind of documents will you upload?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="bg-white/[0.04] border-white/[0.10] text-sm placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-0 min-h-[72px] resize-none"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 h-9 text-sm shadow-lg shadow-primary/20"
                disabled={creating || !name.trim()}
              >
                {creating ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating…
                  </span>
                ) : "Create Knowledge Base"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats bar */}
      {!loading && kbs.length > 0 && (
        <div className="flex items-center gap-6 text-[13px] text-muted-foreground">
          <span>
            <span className="text-foreground font-semibold tabular-nums">{kbs.length}</span> knowledge base{kbs.length !== 1 ? "s" : ""}
          </span>
          <span>
            <span className="text-foreground font-semibold tabular-nums">
              {kbs.reduce((s, k) => s + k.docCount, 0)}
            </span> documents
          </span>
          <span>
            <span className="text-foreground font-semibold tabular-nums">
              {kbs.reduce((s, k) => s + k.chunkCount, 0).toLocaleString()}
            </span> chunks indexed
          </span>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <KBCardSkeleton key={i} />)}
        </div>
      ) : kbs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-28 text-center space-y-5">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-primary/70" />
            </div>
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
              <Plus className="w-3 h-3 text-white" />
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="font-semibold text-lg">No knowledge bases yet</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Create your first KB and start chatting with your documents in minutes
            </p>
          </div>
          <Button
            onClick={() => setOpen(true)}
            className="gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 mt-2"
          >
            <Plus className="w-4 h-4" /> Create Knowledge Base
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {kbs.map((kb, idx) => (
            <div
              key={kb.id}
              className="group relative glass rounded-2xl overflow-hidden transition-all duration-200 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 animate-fade-up"
              style={{ animationDelay: `${idx * 40}ms` }}
            >
              {/* Subtle top accent */}
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              <div className="p-5 space-y-4">
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <BookOpen className="w-4 h-4 text-primary/80" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-[14px] leading-snug truncate">{kb.name}</p>
                      {kb.description ? (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
                          {kb.description}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground/50 mt-0.5">No description</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteKB(kb.id, kb.name)}
                    className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 text-muted-foreground/50 hover:text-rose-400 hover:bg-rose-500/10 transition-all duration-150"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3 h-3 opacity-60" />
                    <span className="font-medium text-foreground/80">{kb.docCount}</span> docs
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3 h-3 opacity-60" />
                    <span className="font-medium text-foreground/80">{kb.chunkCount.toLocaleString()}</span> chunks
                  </span>
                  <span className="flex items-center gap-1.5 ml-auto">
                    <Clock className="w-3 h-3 opacity-40" />
                    {timeAgo(kb.updatedAt)}
                  </span>
                </div>

                {/* Divider */}
                <div className="h-px bg-white/[0.06]" />

                {/* CTA buttons */}
                <div className="flex gap-2">
                  <Link href={`/kb/${kb.id}`} className="flex-1">
                    <button className="w-full h-8 rounded-xl text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.06] border border-white/[0.08] hover:border-white/[0.14] transition-all duration-150 flex items-center justify-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" /> Documents
                    </button>
                  </Link>
                  <Link href={`/kb/${kb.id}/chat`} className="flex-1">
                    <button className="w-full h-8 rounded-xl text-[12px] font-medium text-primary bg-primary/12 hover:bg-primary/20 border border-primary/20 hover:border-primary/35 transition-all duration-150 flex items-center justify-center gap-1.5 group/btn">
                      <MessageSquare className="w-3.5 h-3.5" /> Chat
                      <ArrowRight className="w-3 h-3 opacity-0 -ml-1 group-hover/btn:opacity-100 group-hover/btn:ml-0 transition-all duration-150" />
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
