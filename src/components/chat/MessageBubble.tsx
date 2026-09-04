import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Bot, User, FileText, Info } from "lucide-react";
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
}

function CitationPill({ citation }: { citation: Citation }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block align-middle">
      <button
        onClick={() => setOpen((v) => !v)}
        className="citation-pill"
        title={citation.excerpt}
        aria-expanded={open}
        aria-label={`Citation ${citation.rank}: ${citation.docName}`}
      >
        <FileText className="w-2.5 h-2.5" aria-hidden="true" />
        [{citation.rank}]
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute bottom-full left-0 mb-2 z-50 w-72 glass-strong border-white/[0.14] rounded-xl p-3 shadow-2xl text-left animate-scale-in"
          onClick={() => setOpen(false)}
        >
          <p className="text-[11px] font-semibold text-primary/90 mb-1 truncate">
            {citation.docName}
            {citation.pageNumber ? ` · p.${citation.pageNumber}` : ""}
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-5">
            {citation.excerpt}
          </p>
        </div>
      )}
    </span>
  );
}

const CONFIDENCE_INFO: Record<
  "high" | "medium" | "low" | "none",
  { label: string; cls: string; explanation: string }
> = {
  high: {
    label: "High confidence",
    cls: "confidence-high",
    explanation:
      "Top retrieved chunk similarity ≥ 0.70 with 2+ supporting chunks. The answer is well-grounded in your documents.",
  },
  medium: {
    label: "Medium confidence",
    cls: "confidence-medium",
    explanation:
      "Top chunk similarity 0.50–0.70, or ≥ 0.70 with only one supporting chunk. Verify important claims against the source.",
  },
  low: {
    label: "Low confidence",
    cls: "confidence-low",
    explanation:
      "Top chunk similarity 0.30–0.50. The retrieved context may be only loosely related. Treat this answer with caution.",
  },
  none: {
    label: "No context found",
    cls: "confidence-none",
    explanation:
      "No sufficiently relevant chunks found (similarity < 0.30). The LLM was not called — the answer was refused to prevent hallucination.",
  },
};

function ConfidenceBadge({
  confidence,
}: {
  confidence: "high" | "medium" | "low" | "none";
}) {
  const [showInfo, setShowInfo] = useState(false);
  const info = CONFIDENCE_INFO[confidence];

  return (
    <div className="relative inline-flex items-center gap-1">
      <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", info.cls)}>
        {info.label}
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
        <div
          role="tooltip"
          className="absolute bottom-full left-0 mb-2 z-50 w-64 glass-strong border-white/[0.14] rounded-xl p-3 shadow-2xl animate-scale-in"
          onClick={() => setShowInfo(false)}
        >
          <p className="text-[11px] font-semibold text-foreground/80 mb-1.5">
            How confidence is scored
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {info.explanation}
          </p>
          <p className="text-[10px] text-muted-foreground/40 mt-2 leading-relaxed border-t border-white/[0.06] pt-2">
            Scores are derived from retrieval signals, not LLM self-reporting.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Replace [N] citation tokens in a string with CitationPill components.
 * Returns an array of React nodes (strings + CitationPills).
 */
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

/**
 * Walk react-markdown children and inject CitationPills into text nodes.
 */
function processChildren(
  children: React.ReactNode,
  citations: Citation[]
): React.ReactNode {
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

/**
 * Strip trailing lines that are *only* citation tokens like "[1]\n[2]\n[3]",
 * optionally preceded by a "Sources:" / "References:" header the LLM emits.
 * These are redundant with the source list rendered below the bubble.
 */
function stripTrailingCitationLines(content: string): string {
  const lines = content.trimEnd().split("\n");
  let cutAt = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    // Pure citation line: "[1]", "[1] [2]", "  [3]  ", etc.
    if (/^(\[\d+\]\s*)+$/.test(trimmed)) {
      cutAt = i;
    }
    // Header line immediately above citation list
    else if (/^(\*{0,2})(sources|references|citations)(\*{0,2}):?\s*$/i.test(trimmed) && cutAt < lines.length) {
      cutAt = i;
    }
    else {
      break;
    }
  }
  return lines.slice(0, cutAt).join("\n").trimEnd() || content.trimEnd();
}

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const citations = message.citations ?? [];
  // Strip trailing standalone [N] lines only after streaming completes.
  // During streaming the content may legitimately start with or only contain
  // citation tokens as the model warms up — stripping mid-stream produces
  // a blank bubble.
  const displayContent = isUser || message.streaming
    ? message.content
    : stripTrailingCitationLines(message.content);

  return (
    <div className={cn("flex gap-3 animate-fade-up", isUser && "flex-row-reverse")}>

      {/* Avatar */}
      <div
        className={cn(
          "shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5",
          isUser ? "bg-primary/20 ring-1 ring-primary/30" : "bg-accent/10 ring-1 ring-accent/20"
        )}
        aria-hidden="true"
      >
        {isUser
          ? <User className="w-3.5 h-3.5 text-primary" />
          : <Bot  className="w-3.5 h-3.5 text-accent" />
        }
      </div>

      <div className={cn("flex flex-col gap-2 max-w-[78%]", isUser && "items-end")}>

        {/* Bubble */}
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-[13.5px] leading-[1.65] transition-colors",
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
                  <p className="mb-2 last:mb-0">
                    {message.streaming ? children : processChildren(children, citations)}
                  </p>
                ),
                code: ({ className, children, ...props }) => {
                  const isBlock = !!className?.startsWith("language-");
                  return isBlock ? (
                    <pre className="my-2 rounded-lg bg-black/30 border border-white/[0.08] p-3 overflow-x-auto">
                      <code
                        className={cn("text-[12px] font-mono text-foreground/90", className)}
                        {...props}
                      >
                        {children}
                      </code>
                    </pre>
                  ) : (
                    <code
                      className="text-[12px] font-mono bg-white/[0.08] rounded px-1 py-0.5 text-primary/90"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                ul: ({ children }) => (
                  <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="text-foreground/90">{message.streaming ? children : processChildren(children, citations)}</li>
                ),
                h1: ({ children }) => (
                  <h1 className="text-base font-bold mt-3 mb-1">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-sm font-semibold mt-2 mb-1">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-[13px] font-semibold mt-2 mb-0.5">{children}</h3>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-muted-foreground italic">
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
                  <div className="overflow-x-auto my-2">
                    <table className="text-[12px] w-full border-collapse">{children}</table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border border-white/[0.10] px-2 py-1 text-left font-semibold bg-white/[0.04]">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border border-white/[0.08] px-2 py-1">
                    {children}
                  </td>
                ),
              }}
            >
              {displayContent}
            </ReactMarkdown>
          )}
        </div>

        {/* Citation source list — shown below the bubble */}
        {!isUser && !message.streaming && citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-0.5" aria-label="Sources">
            {citations.map((c) => (
              <CitationPill key={c.rank} citation={c} />
            ))}
          </div>
        )}

        {/* Confidence badge with explanation tooltip */}
        {!isUser && !message.streaming && message.confidence && (
          <div className="px-0.5">
            <ConfidenceBadge confidence={message.confidence} />
          </div>
        )}
      </div>
    </div>
  );
}
