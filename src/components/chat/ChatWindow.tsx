"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MessageBubble, Message, Citation } from "./MessageBubble";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Send, Square, RotateCcw, Sparkles, ArrowDown, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatWindowProps {
  kbId: string;
  kbName: string;
  initialConversationId?: string;
}

interface SSEMeta {
  type: "meta";
  conversationId: string;
  confidence: "high" | "medium" | "low" | "none";
  score: number;
  citations: Citation[];
  kgNodesUsed?: number;
  hydeUsed?: boolean;
}

const STARTERS = [
  "Give me a summary of the key topics covered",
  "What are the main conclusions or findings?",
  "List any action items or recommendations",
  "What are the most important facts to know?",
];

const MAX_CHARS = 2000;

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex gap-3 animate-fade-up">
      <div
        className="shrink-0 w-7 h-7 rounded-full bg-accent/10 ring-1 ring-accent/20 flex items-center justify-center mt-0.5"
        aria-hidden="true"
      >
        <Bot className="w-3.5 h-3.5 text-accent" />
      </div>
      <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-tl-sm bg-white/[0.04] border border-white/[0.08]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40"
            style={{
              animation: "typing-dot 1.2s ease-in-out infinite",
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── ChatWindow ────────────────────────────────────────────────────────────────
export function ChatWindow({ kbId, kbName, initialConversationId }: ChatWindowProps) {
  const router = useRouter();

  const [messages, setMessages]           = useState<Message[]>([]);
  const [input, setInput]                 = useState("");
  const [loading, setLoading]             = useState(false);
  const [showTyping, setShowTyping]       = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [atBottom, setAtBottom]           = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId ?? null
  );

  const abortRef    = useRef<AbortController | null>(null);
  const scrollRef   = useRef<HTMLDivElement>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load history when switching conversation
  useEffect(() => {
    if (!initialConversationId) {
      setMessages([]);
      setConversationId(null);
      return;
    }
    setConversationId(initialConversationId);
    setHistoryLoading(true);
    fetch(`/api/conversations/${initialConversationId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((conv) => {
        if (!conv?.messages) return;
        setMessages(
          conv.messages.map((m: {
            id: string;
            role: string;
            content: string;
            confidence?: string;
            citations?: Citation[];
            createdAt?: string;
          }) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            confidence: m.confidence,
            citations: m.citations ?? [],
            createdAt: m.createdAt,
          }))
        );
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [initialConversationId]);

  // Sync conversationId into URL
  useEffect(() => {
    if (!conversationId || conversationId === initialConversationId) return;
    router.replace(`/kb/${kbId}/chat?conv=${conversationId}`, { scroll: false });
  }, [conversationId, initialConversationId, kbId, router]);

  // Track scroll position
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      setAtBottom(dist < 80);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll when near bottom
  useEffect(() => {
    if (atBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showTyping, atBottom]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  function resetConversation() {
    setMessages([]);
    setConversationId(null);
    setShowTyping(false);
    router.push(`/kb/${kbId}/chat`, { scroll: false });
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  const sendMessage = useCallback(
    async (e?: FormEvent, override?: string) => {
      e?.preventDefault();
      const text = (override ?? input).trim();
      if (!text || loading) return;

      setInput("");
      setLoading(true);
      setAtBottom(true);
      setShowTyping(true);

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      };
      const streamId = crypto.randomUUID();

      setMessages((prev) => [...prev, userMsg]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kbId,
            message: text,
            conversationId: conversationId ?? undefined,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "",
          meta: SSEMeta | null = null,
          fullContent = "",
          streamMsgAdded = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]" || !raw || raw.startsWith(":")) continue;

            let evt: {
              type: string;
              conversationId?: string;
              confidence?: string;
              score?: number;
              citations?: Citation[];
              content?: string;
              message?: string;
            };
            try {
              evt = JSON.parse(raw);
            } catch {
              console.warn("[chat] failed to parse SSE frame:", raw.slice(0, 100));
              continue;
            }

            if (evt.type === "meta") {
              meta = evt as unknown as SSEMeta;
              setConversationId(meta.conversationId);
              setShowTyping(false);
              // Don't add bubble yet — wait for first text token so content is never empty
            } else if (evt.type === "text" && evt.content) {
              fullContent += evt.content;
              if (!streamMsgAdded) {
                // First text token: add the bubble with content already in it
                streamMsgAdded = true;
                setShowTyping(false);
                setMessages((prev) => [
                  ...prev,
                  {
                    id: streamId,
                    role: "assistant",
                    content: fullContent,
                    streaming: true,
                    createdAt: new Date().toISOString(),
                  },
                ]);
              } else {
                // Subsequent tokens: update existing bubble
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === streamId ? { ...m, content: fullContent } : m
                  )
                );
              }
            } else if (evt.type === "error") {
              throw new Error(evt.message);
            }
          }
        }

        // Finalize the streaming bubble
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamId
              ? {
                  ...m,
                  content: fullContent,
                  streaming: false,
                  confidence: meta?.confidence,
                  citations: meta?.citations ?? [],
                  kgNodesUsed: meta?.kgNodesUsed,
                  hydeUsed: meta?.hydeUsed,
                }
              : m
          )
        );
      } catch (err) {
        setShowTyping(false);
        if ((err as Error).name === "AbortError") {
          setMessages((prev) =>
            prev.map((m) => (m.id === streamId ? { ...m, streaming: false } : m))
          );
        } else {
          toast.error((err as Error).message ?? "Something went wrong");
          setMessages((prev) => prev.filter((m) => m.id !== streamId));
        }
      } finally {
        setLoading(false);
        setShowTyping(false);
        abortRef.current = null;
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
    },
    [input, loading, kbId, conversationId]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  const charsLeft = MAX_CHARS - input.length;
  const nearLimit = charsLeft <= 200;

  return (
    <div className="flex flex-col h-full bg-background relative">

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 px-5 py-6">

        {historyLoading ? (
          // Skeleton while loading history
          <div className="space-y-5 max-w-3xl mx-auto">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={cn("flex gap-3", i % 2 !== 0 && "flex-row-reverse")}>
                <Skeleton className="w-7 h-7 rounded-full bg-white/[0.05] shrink-0" />
                <Skeleton
                  className="rounded-2xl bg-white/[0.04] shimmer"
                  style={{ height: 56 + (i % 3) * 20, width: `${45 + (i % 3) * 12}%` }}
                />
              </div>
            ))}
          </div>

        ) : messages.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center h-full text-center space-y-7 py-12 max-w-sm mx-auto">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-primary/70" />
              </div>
              <div className="absolute inset-0 rounded-2xl bg-primary/10 animate-ping opacity-15" />
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-[15px] font-heading">Chat with {kbName}</p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Ask anything — I&apos;ll search your documents and answer with cited sources.
              </p>
            </div>
            <div className="w-full space-y-2">
              {STARTERS.map((s, i) => (
                <button
                  key={s}
                  onClick={() => sendMessage(undefined, s)}
                  className={cn(
                    "w-full text-left text-[12.5px] px-4 py-2.5 rounded-xl",
                    "bg-white/[0.03] border border-white/[0.07]",
                    "hover:border-primary/25 hover:bg-primary/[0.06] hover:text-foreground",
                    "text-muted-foreground transition-all duration-150 animate-fade-up"
                  )}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

        ) : (
          // Messages
          <div className="space-y-5 max-w-3xl mx-auto">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {showTyping && <TypingIndicator />}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Scroll-to-bottom FAB */}
      {!atBottom && messages.length > 0 && (
        <div className="absolute bottom-[88px] right-5 z-10">
          <button
            onClick={scrollToBottom}
            className="w-8 h-8 rounded-full glass-strong flex items-center justify-center text-muted-foreground hover:text-foreground shadow-lg transition-all duration-150 hover:scale-105 animate-scale-in"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="shrink-0 border-t border-white/[0.06] bg-background/95 backdrop-blur-sm px-5 py-3.5">

        {messages.length > 0 && (
          <div className="flex justify-end mb-2">
            <button
              onClick={resetConversation}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors duration-150"
            >
              <RotateCcw className="w-3 h-3" />
              New conversation
            </button>
          </div>
        )}

        <form
          onSubmit={sendMessage}
          className="relative flex items-end gap-2.5 max-w-3xl mx-auto"
        >
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question… (↵ send, ⇧↵ newline)"
              rows={1}
              disabled={loading}
              className={cn(
                "resize-none min-h-[44px] max-h-[160px] w-full pr-3 pb-5",
                "bg-white/[0.04] border border-white/[0.09] rounded-xl",
                "text-[13.5px] placeholder:text-muted-foreground/40",
                "focus:border-primary/35 focus:ring-0 focus:bg-white/[0.055]",
                "transition-all duration-150 disabled:opacity-50"
              )}
            />
            {/* Character counter */}
            {input.length > 0 && (
              <span
                className={cn(
                  "absolute bottom-2 right-2.5 text-[10px] transition-colors duration-150",
                  nearLimit ? "text-amber-400/70" : "text-muted-foreground/30"
                )}
              >
                {charsLeft}
              </span>
            )}
          </div>

          {loading ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border border-rose-500/25 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-all duration-150"
              title="Stop generation"
              aria-label="Stop generation"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className={cn(
                "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150",
                input.trim()
                  ? "bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/30 hover:shadow-primary/40 hover:scale-105 active:scale-95"
                  : "bg-white/[0.05] text-muted-foreground/30 cursor-not-allowed"
              )}
              title="Send (Enter)"
              aria-label="Send message"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </form>

        <p className="text-[10px] text-muted-foreground/25 text-center mt-2.5">
          Answers sourced only from your documents · Always verify critical information
        </p>
      </div>
    </div>
  );
}
