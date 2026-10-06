"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare, Plus, Trash2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Conversation {
  id: string;
  kbId: string;
  title: string | null;
  lastActive: string;
  createdAt: string;
}

interface ConversationListProps {
  kbId: string;
  activeConversationId?: string | null;
  onNew: () => void;
}

const POLL_INTERVAL_MS = 30_000;

export function ConversationList({ kbId, activeConversationId, onNew }: ConversationListProps) {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConvs = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const r = await fetch(`/api/conversations?kbId=${kbId}`);
      if (r.ok) setConvs(await r.json());
    } catch {
      // silently ignore background poll failures
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [kbId]);

  // Initial load
  useEffect(() => { fetchConvs(); }, [fetchConvs]);

  // Poll every 30s + refresh on window focus
  useEffect(() => {
    const interval = setInterval(() => fetchConvs(true), POLL_INTERVAL_MS);
    const onFocus = () => fetchConvs(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchConvs]);

  // Re-fetch when a new conversation is created (activeConversationId changes)
  useEffect(() => {
    if (activeConversationId) fetchConvs(true);
  }, [activeConversationId, fetchConvs]);

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setConvs((prev) => prev.filter((c) => c.id !== id));
      toast.success("Conversation deleted");
    } catch {
      toast.error("Failed to delete conversation");
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          Conversations
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => fetchConvs()}
            disabled={refreshing}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground hover:bg-white/[0.06] transition-all duration-150 disabled:opacity-30"
            title="Refresh"
            aria-label="Refresh conversation list"
          >
            <RefreshCw className={cn("w-3 h-3", refreshing && "animate-spin")} />
          </button>
          <button
            onClick={onNew}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.06] transition-all duration-150"
            title="New conversation"
            aria-label="New conversation"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1.5 space-y-0.5 px-1.5">
        {loading ? (
          <div className="space-y-1.5 p-1">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-9 rounded-lg bg-white/[0.03] shimmer"
                style={{ opacity: 1 - i * 0.15 }}
              />
            ))}
          </div>
        ) : convs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center px-3">
            <MessageSquare className="w-6 h-6 text-muted-foreground/30 mb-2" />
            <p className="text-[11.5px] text-muted-foreground/50">No conversations yet</p>
          </div>
        ) : (
          convs.map((conv) => (
            <Link
              key={conv.id}
              href={`/kb/${kbId}/chat?conv=${conv.id}`}
              className={cn(
                "group flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-150 cursor-pointer",
                activeConversationId === conv.id
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
              )}
            >
              <MessageSquare
                className={cn(
                  "w-3.5 h-3.5 shrink-0 transition-colors",
                  activeConversationId === conv.id ? "text-primary/70" : "text-muted-foreground/40"
                )}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium truncate leading-tight">
                  {conv.title ?? "New conversation"}
                </p>
                <p className="text-[10.5px] text-muted-foreground/40 leading-tight mt-0.5">
                  {formatDistanceToNow(new Date(conv.lastActive), { addSuffix: true })}
                </p>
              </div>
              <button
                onClick={(e) => deleteConversation(conv.id, e)}
                className="shrink-0 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-rose-400 transition-all duration-150"
                title="Delete"
                aria-label={`Delete: ${conv.title ?? "New conversation"}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
