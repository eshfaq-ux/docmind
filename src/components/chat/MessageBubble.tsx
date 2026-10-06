"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Bot, User, FileText, Info, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface Citation {
  rank: number;
  documentId: string;
  docName: string;
  pageNumber: number | null;
  excerpt: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  confidence?: "high" | "medium" | "low" | "none";
  citations?: Citation[];
  streaming?: boolean;
  createdAt?: string;
}

// ── Citation pill with popover ────────────────────────────────────────────────

function CitationPill({ citation }: { citation: Citation }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block align-middle mx-0.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="citation-pill"
        title={citation.excerpt}
        aria-expanded={open}
        aria-label={`Citation ${citation.rank}: ${citation.docName}`}
      >
        <FileText className="w-2.5 h-2.5" aria-hidden="true" />
        {citation.rank}
      </button>
      {open && (
        <>
          {/* Backdrop */}
          <span
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="tooltip"
            className="absolute bottom-full left-0 mb-2 z-50 w-80 glass-strong rounded-xl p-3.5 shadow-2xl animate-scale-in"
          >
            <div className="flex items-start gap-2 mb-2">
              <FileText className="w-3.5 h-3.5 text-primary/70 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[11.5px] font-semibold text-foreground/90 truncate">
                  {citation.docName}
                </p>
                {citation.pageNumber && (
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    Page {citation.pageNumber}
                  </p>
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-5 pl-5 border-l border-white/[0.08]">
              {citation.excerpt}
            </p>
          </div>
        </>
      )}
    </span>
  );
}

// ── Confidence badge ──────────────────────────────────────────────────────────

const CONFIDENCE_INFO: Record<
  "high" | "medium" | "low" | "none",
  { label: string; cls: string; dot: string; explanation: string }
> = {
  high: {
    label: "High",
    cls: "confidence-high",
    dot: "bg-emerald-400",
    explanation:
      "Top chunk similarity ≥ 0.70 with 2+ supporting chunks. Answer is well-grounded in your documents.",
  },
  medium: {
    label: "Medium",
    cls: "confidence-medium",
    dot: "bg-amber-400",
    explanation:
      "Top chunk similarity 0.50–0.70, or ≥ 0.70 with only one chunk. Verify important claims.",
  },
  low: {
    label: "Low",
    cls: "confidence-low",
    dot: "bg-orange-400",
    explanation:
      "Top chunk similarity 0.30–0.50. Context may be loosely related. Treat with caution.",
  },
  none: {
    label: "No context",
    cls: "confidence-none",
    dot: "bg-rose-400",
    explanation:
      "Similarity < 0.30. LLM was not called — answer refused to prevent hallucination.",
  },
};

function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" | "none" }) {
  const [showInfo, setShowInfo] = useState(false);
  const info = CONFIDENCE_INFO[confidence];

  return (
    <div className="relative inline-flex items-center gap-1.5">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-medium",
          info.cls
        )}
      >
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", info.dot)} aria-hidden="true" />
        {info.label} confidence
      </span>
      <button
        onClick={() => setShowInfo((v) => !v)}
        className="text-muted-foreground/40 hover:text-muted-foreground transition-colors duration-150"
        aria-label="How is this confidence score calculated?"
        aria-expanded={showInfo}
      >
        <Info className="w-3 h-3" aria-hidden="true" />
      </button>
      {showInfo && (
        <>
          <span className="fixed inset-0 z-40" onClick={() => setShowInfo(false)} aria-hidden="true" />
          <div
            role="tooltip"
            className="absolute bottom-full left-0 mb-2 z-50 w-64 glass-strong rounded-xl p-3 shadow-2xl animate-scale-in"
          >
            <p className="text-[11px] font-semibold text-foreground/80 mb-1.5">Confidence scoring</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{info.explanation}</p>
            <p className="text-[10px] text-muted-foreground/40 mt-2 pt-2 border-t border-white/[0.06]">
              Derived from retrieval signals, not LLM self-reporting.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sources panel ─────────────────────────────────────────────────────────────

function SourcesPanel({ citations }: { citations: Citation[] }) {
  const [open, setOpen] = useState(false);
  if (!citations.length) return null;

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors duration-150 group"
        aria-expanded={open}
      >
        <FileText className="w-3 h-3" aria-hidden="true" />
        <span>{citations.length} source{citations.length !== 1 ? "s" : ""}</span>
        {open
          ? <ChevronUp className="w-3 h-3 opacity-60" aria-hidden="true" />
          : <ChevronDown className="w-3 h-3 opacity-60" aria-hidden="true" />
        }
      </button>

      {open && (
        <div className="mt-2 space-y-1.5 animate-fade-up">
          {citations.map((c) => (
            <div
              key={c.rank}
              className="flex gap-2.5 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-colors duration-150"
            >
              <span className="shrink-0 w-5 h-5 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center text-[10px] font-semibold text-primary/80">
                {c.rank}
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-foreground/80 truncate">
                  {c.docName}
                  {c.pageNumber ? <span className="text-muted-foreground/50 font-normal"> · p.{c.pageNumber}</span> : null}
                </p>
                <p className="text-[10.5px] text-muted-foreground/60 leading-relaxed mt-0.5 line-clamp-2">
                  {c.excerpt}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Citation injection into markdown ─────────────────────────────────────────

function injectCitations(text: string, citations: Citation[]): React.ReactNode[] {
  if (!citations.length || !text.includes("[")) return [text];
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/);
    if (m) {
      const c = citations.find((c) => c.rank === parseInt(m[1], 10));
      if (c) return <CitationPill key={i} citation={c} />;
    }
    return part;
  });
}

function processChildren(children: React.ReactNode, citations: Citation[]): React.ReactNode {
  if (!citations.length) return children;

  if (typeof children === "string") {
    const nodes = injectCitations(children, citations);
    return nodes.length === 1 ? nodes[0] : nodes;
  }

  if (Array.isArray(children)) {
    return children.flatMap((child, i) => {
      if (typeof child === "string") {
        return injectCitations(child, citations).map((n, j) =>
          typeof n === "string" ? n : <React.Fragment key={`${i}-${j}`}>{n}</React.Fragment>
        );
      }
      return [child];
    });
  }

  return children;
}

function stripTrailingCitationLines(content: string): string {
  const lines = content.trimEnd().split("\n");
  let cutAt = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (/^(\[\d+\]\s*)+$/.test(trimmed)) {
      cutAt = i;
    } else if (
      /^(\*{0,2})(sources|references|citations|see also)(\*{0,2}):?\s*$/i.test(trimmed) &&
      cutAt < lines.length
    ) {
      cutAt = i;
    } else if (/^[-*]{3,}$/.test(trimmed) && cutAt < lines.length) {
      cutAt = i;
    } else {
      break;
    }
  }
  const result = lines.slice(0, cutAt).join("\n").trimEnd();
  return result || content.trimEnd();
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — silently ignore
    }
  }

  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors duration-150"
      title="Copy response"
      aria-label="Copy response to clipboard"
    >
      {copied ? (
        <>
          <Check className="w-3 h-3 text-emerald-400" aria-hidden="true" />
          <span className="text-emerald-400">Copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" aria-hidden="true" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const citations = message.citations ?? [];
  const displayContent =
    isUser || message.streaming
      ? message.content
      : stripTrailingCitationLines(message.content);

  return (
    <div className={cn("flex gap-3 animate-fade-up group/row", isUser && "flex-row-reverse")}>

      {/* Avatar */}
      <div
        className={cn(
          "shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5",
          isUser
            ? "bg-primary/20 ring-1 ring-primary/30"
            : "bg-accent/10 ring-1 ring-accent/20"
        )}
        aria-hidden="true"
      >
        {isUser
          ? <User className="w-3.5 h-3.5 text-primary" />
          : <Bot  className="w-3.5 h-3.5 text-accent" />
        }
      </div>

      <div className={cn("flex flex-col gap-1.5 max-w-[80%]", isUser && "items-end")}>

        {/* Bubble */}
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-[13.5px] leading-[1.7] transition-colors",
            isUser
              ? "bg-primary/15 border border-primary/20 text-foreground rounded-tr-sm"
              : "bg-white/[0.04] border border-white/[0.08] rounded-tl-sm",
            message.streaming && "streaming-cursor"
          )}
        >
          {isUser ? (
            <span className="whitespace-pre-wrap break-words">{message.content}</span>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => (
                  <p className="mb-2.5 last:mb-0">
                    {message.streaming ? children : processChildren(children, citations)}
                  </p>
                ),
                code: ({ className, children, ...props }) => {
                  const isBlock = !!className?.startsWith("language-");
                  return isBlock ? (
                    <pre className="my-2.5 rounded-xl bg-black/30 border border-white/[0.08] p-3.5 overflow-x-auto">
                      <code
                        className={cn("text-[12px] font-mono text-foreground/90", className)}
                        {...props}
                      >
                        {children}
                      </code>
                    </pre>
                  ) : (
                    <code
                      className="text-[12px] font-mono bg-white/[0.08] rounded px-1.5 py-0.5 text-primary/90"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                ul: ({ children }) => (
                  <ul className="list-disc list-inside mb-2.5 space-y-1 pl-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside mb-2.5 space-y-1 pl-1">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="text-foreground/90">
                    {message.streaming ? children : processChildren(children, citations)}
                  </li>
                ),
                h1: ({ children }) => (
                  <h1 className="text-[15px] font-bold mt-4 mb-1.5 text-foreground">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-[13.5px] font-semibold mt-3 mb-1 text-foreground">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-[13px] font-semibold mt-2.5 mb-0.5 text-foreground/90">{children}</h3>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-primary/40 pl-3.5 my-2.5 text-muted-foreground italic">
                    {children}
                  </blockquote>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-foreground">{children}</strong>
                ),
                em: ({ children }) => (
                  <em className="italic text-foreground/80">{children}</em>
                ),
                hr: () => <hr className="my-3 border-white/[0.08]" />,
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary/80 hover:text-primary underline underline-offset-2 transition-colors"
                  >
                    {children}
                  </a>
                ),
                table: ({ children }) => (
                  <div className="overflow-x-auto my-2.5 rounded-lg border border-white/[0.08]">
                    <table className="text-[12px] w-full border-collapse">{children}</table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border-b border-white/[0.10] px-3 py-2 text-left font-semibold bg-white/[0.04] text-foreground/80">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border-b border-white/[0.05] px-3 py-2 last:border-b-0">
                    {children}
                  </td>
                ),
              }}
            >
              {displayContent}
            </ReactMarkdown>
          )}
        </div>

        {/* Sources panel — collapsible, shown after streaming completes */}
        {!isUser && !message.streaming && citations.length > 0 && (
          <SourcesPanel citations={citations} />
        )}

        {/* Footer row: confidence + copy */}
        {!isUser && !message.streaming && (
          <div className="flex items-center gap-3 px-0.5">
            {message.confidence && (
              <ConfidenceBadge confidence={message.confidence} />
            )}
            {message.content && (
              <CopyButton text={message.content} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
