"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { ConversationList } from "@/components/chat/ConversationList";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ArrowLeft, FileText, BookOpen, Layers, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface KB {
  id: string;
  name: string;
  description?: string;
  docCount: number;
  chunkCount: number;
}

export default function KBChatPage() {
  const { kbId } = useParams<{ kbId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [kb, setKb] = useState<KB | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Active conversation from URL param ?conv=<id>
  const activeConvId = searchParams.get("conv") ?? undefined;

  useEffect(() => {
    fetch(`/api/knowledge-bases/${kbId}`)
      .then((r) => r.json())
      .then(setKb)
      .catch(() => toast.error("Failed to load knowledge base"))
      .finally(() => setLoading(false));
  }, [kbId]);

  function handleNewConversation() {
    // Navigate to chat without a conv param → fresh conversation
    router.push(`/kb/${kbId}/chat`);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] -m-7">

      {/* Slim header */}
      <div
        className="shrink-0 flex items-center gap-3 px-5 h-12 border-b border-white/[0.06] z-10"
        style={{ background: "rgba(6,11,24,0.85)", backdropFilter: "blur(20px)" }}
      >
        <Link
          href={`/kb/${kbId}`}
          className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors duration-150 shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </Link>

        <div className="w-px h-4 bg-white/[0.1]" />

        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.06] transition-all duration-150 shrink-0"
          title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        >
          {sidebarOpen
            ? <PanelLeftClose className="w-3.5 h-3.5" />
            : <PanelLeftOpen className="w-3.5 h-3.5" />}
        </button>

        <div className="w-px h-4 bg-white/[0.1]" />

        <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <BookOpen className="w-3.5 h-3.5 text-primary/70" />
        </div>

        <div className="min-w-0 flex-1">
          {loading ? (
            <Skeleton className="h-4 w-32 bg-white/[0.05]" />
          ) : (
            <p className="text-[13px] font-semibold truncate leading-none">{kb?.name}</p>
          )}
        </div>

        {kb && (
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground/50 shrink-0">
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" /> {kb.docCount}
            </span>
            <span className="flex items-center gap-1">
              <Layers className="w-3 h-3" /> {kb.chunkCount.toLocaleString()}
            </span>
          </div>
        )}

        <div className="w-px h-4 bg-white/[0.1]" />

        <Link
          href={`/kb/${kbId}`}
          className="flex items-center gap-1.5 text-[12px] text-muted-foreground/60 hover:text-muted-foreground transition-colors duration-150 shrink-0"
        >
          <FileText className="w-3.5 h-3.5" /> Manage
        </Link>
      </div>

      {/* Body: sidebar + chat */}
      <div className="flex flex-1 min-h-0">

        {/* Conversations sidebar */}
        <div
          className={cn(
            "shrink-0 border-r border-white/[0.06] overflow-hidden transition-all duration-200",
            sidebarOpen ? "w-56" : "w-0"
          )}
          style={{ background: "rgba(6,11,24,0.6)" }}
        >
          {sidebarOpen && (
            <ConversationList
              kbId={kbId}
              activeConversationId={activeConvId}
              onNew={handleNewConversation}
            />
          )}
        </div>

        {/* Chat area */}
        <div className="flex-1 min-w-0 relative">
          {kb ? (
            <ChatWindow
              kbId={kbId}
              kbName={kb.name}
              initialConversationId={activeConvId}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="space-y-3 w-full max-w-md px-4">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="h-12 rounded-2xl shimmer bg-white/[0.03]"
                    style={{ opacity: 1 - i * 0.2 }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
