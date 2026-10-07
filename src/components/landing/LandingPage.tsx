"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const Icon = {
  Sparkles: ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      <path d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
    </svg>
  ),
  Arrow: ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  ),
  Check: ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  ),
  Menu: ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  ),
  X: ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Search: ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" />
    </svg>
  ),
  Shield: ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  ),
  Bolt: ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  ),
  Doc: ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  Chart: ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  Flask: ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.798-1.172 2.798H4.172c-1.202 0-2.174-1.799-1.172-2.798L4.5 15.3" />
    </svg>
  ),
};

// ─── Rotating word ────────────────────────────────────────────────────────────
const WORDS = ["PDFs", "contracts", "research", "manuals", "reports", "notes"];

function RotatingWord() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % WORDS.length);
        setVisible(true);
      }, 300);
    }, 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <span
      className="lp-word"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateY(-12px)",
        transition: "opacity 0.3s ease, transform 0.3s ease",
      }}
    >
      {WORDS[idx]}
    </span>
  );
}

// ─── Streaming chat demo ──────────────────────────────────────────────────────
const STREAM_TEXT = `Revenue grew 34% YoY to $142M [1]. The primary driver was enterprise expansion with net retention at 128% [2]. Operating margins improved to 18% from 11% in Q2 [3].`;

function ChatDemo() {
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setCursor(true);
      let i = 0;
      const iv = setInterval(() => {
        i += 3;
        setText(STREAM_TEXT.slice(0, i));
        if (i >= STREAM_TEXT.length) {
          clearInterval(iv);
          setCursor(false);
          setDone(true);
        }
      }, 22);
      return () => clearInterval(iv);
    }, 1100);
    return () => clearTimeout(t);
  }, []);

  const renderText = (t: string) =>
    t.split(/(\[\d\])/).map((part, i) =>
      /^\[\d\]$/.test(part) ? (
        <span
          key={i}
          className="inline-flex items-center justify-center w-4 h-4 rounded text-[8px] font-bold text-white mx-0.5 align-middle"
          style={{
            background: "linear-gradient(135deg,#4F46E5,#6366F1)",
            boxShadow: "0 0 8px rgba(99,102,241,0.5)",
          }}
        >
          {part.slice(1, -1)}
        </span>
      ) : (
        <span key={i}>{part}</span>
      )
    );

  return (
    <div
      className="lp-glass rounded-2xl overflow-hidden"
      style={{
        boxShadow:
          "0 30px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.07), 0 0 60px rgba(99,102,241,0.10)",
      }}
    >
      {/* Titlebar */}
      <div
        className="flex items-center gap-1.5 px-4 py-3 border-b border-white/[0.06]"
        style={{ background: "rgba(255,255,255,0.02)" }}
      >
        {(["#ff5f57", "#febc2e", "#28c840"] as const).map(c => (
          <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c, opacity: 0.85 }} />
        ))}
        <span className="ml-3 text-[11px] text-white/25 font-mono tracking-wider select-none">
          DocMind — Q3 Earnings
        </span>
        <div className="ml-auto">
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded"
            style={{
              background: "rgba(34,197,94,0.12)",
              color: "#22c55e",
              border: "1px solid rgba(34,197,94,0.2)",
            }}
          >
            LIVE
          </span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Source pills */}
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["1", "Q3 Report.pdf", "#4F46E5"],
              ["2", "Earnings Call.docx", "#7C3AED"],
              ["3", "IR Deck.pdf", "#0891B2"],
            ] as const
          ).map(([n, label, color]) => (
            <span key={n} className="lp-source-pill">
              <span className="lp-source-dot" style={{ background: color }} />
              [{n}] {label}
            </span>
          ))}
        </div>

        {/* User message */}
        <div className="flex justify-end">
          <div className="lp-user-bubble">What drove revenue growth in Q3?</div>
        </div>

        {/* AI response */}
        <div className="lp-ai-bubble">
          {text ? (
            renderText(text)
          ) : (
            <span className="text-white/18 italic text-sm">Searching 3 documents…</span>
          )}
          {cursor && <span className="lp-cursor" />}
        </div>

        {/* Confidence bar */}
        {done && (
          <div
            className="flex items-center gap-3 pt-2 border-t border-white/[0.05]"
            style={{ animation: "lp-up 0.4s ease both" }}
          >
            <div className="flex gap-1">
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className="h-1 w-6 rounded-full"
                  style={{
                    background: i < 3 ? "#22c55e" : "rgba(255,255,255,0.08)",
                    boxShadow: i < 3 ? "0 0 6px rgba(34,197,94,0.5)" : "none",
                    transition: `background 0.4s ${i * 120}ms`,
                  }}
                />
              ))}
            </div>
            <span className="text-[10px] text-white/22 font-mono">HIGH · 3 sources · 138ms</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Floating decorative cards ────────────────────────────────────────────────
function StatCard() {
  return (
    <div
      style={{
        background: "rgba(8,10,24,0.82)",
        border: "1px solid rgba(99,102,241,0.28)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 16px 40px rgba(0,0,0,0.5), 0 0 30px rgba(99,102,241,0.16)",
        borderRadius: 16,
        padding: "14px 16px",
        width: 178,
      }}
    >
      <div className="text-[10px] font-semibold text-white/28 uppercase tracking-widest mb-2 lp-font-display">
        Token Usage
      </div>
      <div
        className="text-[26px] font-bold text-white lp-font-display leading-none mb-0.5"
        style={{ letterSpacing: "-0.04em" }}
      >
        142K
      </div>
      <div className="text-[10px] text-white/22 mb-3 lp-font-body">tokens this month</div>
      <div className="flex items-end gap-1 h-8">
        {[40, 55, 38, 70, 60, 90, 100].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t"
            style={{
              height: `${h}%`,
              background:
                i >= 5
                  ? "linear-gradient(to top,#4F46E5,#818CF8)"
                  : "rgba(99,102,241,0.20)",
              boxShadow: i >= 5 ? "0 0 8px rgba(99,102,241,0.4)" : "none",
            }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1 mt-2">
        <svg width="8" height="8" fill="#22c55e" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
        </svg>
        <span className="text-[10px] text-emerald-400 font-semibold lp-font-body">
          +34% vs last month
        </span>
      </div>
    </div>
  );
}

function SourceCard() {
  return (
    <div
      style={{
        background: "rgba(8,10,24,0.88)",
        border: "1px solid rgba(255,255,255,0.09)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
        borderRadius: 14,
        padding: "12px 14px",
        width: 198,
      }}
    >
      <div className="flex items-center gap-2.5 mb-2.5">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: "rgba(8,182,216,0.12)",
            border: "1px solid rgba(8,182,216,0.22)",
          }}
          aria-hidden="true"
        >
          <Icon.Doc className="w-3.5 h-3.5 text-cyan-400" />
        </div>
        <div>
          <div className="text-[11px] font-semibold text-white/72 lp-font-display">
            Q3 Report.pdf
          </div>
          <div className="text-[9.5px] text-white/26 lp-font-body">47 pages · 3 chunks</div>
        </div>
      </div>
      <div className="flex gap-1.5 mb-2.5">
        <span
          className="text-[9.5px] px-2 py-0.5 rounded font-semibold lp-font-display"
          style={{
            background: "rgba(99,102,241,0.12)",
            color: "#818CF8",
            border: "1px solid rgba(99,102,241,0.2)",
          }}
        >
          Chunk 12
        </span>
        <span
          className="text-[9.5px] px-2 py-0.5 rounded font-semibold lp-font-display"
          style={{
            background: "rgba(8,182,216,0.12)",
            color: "#22D3EE",
            border: "1px solid rgba(8,182,216,0.2)",
          }}
        >
          p.34–36
        </span>
      </div>
      <div>
        <div className="text-[9px] text-white/20 mb-1 lp-font-body">Relevance score</div>
        <div className="h-1 rounded-full bg-white/[0.06]">
          <div
            className="h-1 rounded-full"
            style={{
              width: "72%",
              background: "linear-gradient(90deg,#6366F1,#06B6D4)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Features data ────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Icon.Search,
    title: "Hybrid Retrieval",
    body: "Vector cosine + BM25 full-text fused with RRF. Catches exact keywords that cosine similarity misses.",
    color: "#6366F1",
  },
  {
    icon: Icon.Doc,
    title: "Inline Citations",
    body: "Every answer cites chunk number, document, page, and excerpt. Verify exactly where each claim came from.",
    color: "#8B5CF6",
  },
  {
    icon: Icon.Bolt,
    title: "Sub-10ms Recall",
    body: "HNSW index on pgvector. p95 retrieval under 10ms for up to one million vectors without extra infra.",
    color: "#F59E0B",
  },
  {
    icon: Icon.Shield,
    title: "Tenant Isolation",
    body: "Every query filtered by tenantId at the database level. Zero cross-tenant leakage is architecturally enforced.",
    color: "#22C55E",
  },
  {
    icon: Icon.Chart,
    title: "Usage Analytics",
    body: "Token spend, cost, confidence distribution, model breakdown — 7 / 30 / 90-day rolling views.",
    color: "#EC4899",
  },
  {
    icon: Icon.Flask,
    title: "Eval Harness",
    body: "LLM-as-judge: faithfulness, answer relevance, retrieval relevance, citation accuracy — automated each run.",
    color: "#06B6D4",
  },
];

const STEPS = [
  {
    n: "01",
    t: "Upload",
    b: "Drag PDFs, Word docs, or plain text. Stored in Cloudflare R2 via presigned PUT — no server memory used.",
  },
  {
    n: "02",
    t: "Chunk & Embed",
    b: "tiktoken-bounded 512-token chunks (64 overlap). Batched embeddings via text-embedding-3-small into pgvector.",
  },
  {
    n: "03",
    t: "Ask",
    b: "Hybrid search retrieves top context. GPT-4o-mini streams a grounded answer with inline [N] citation markers.",
  },
  {
    n: "04",
    t: "Evaluate",
    b: "Confidence from retrieval signals. Run structured evals to track faithfulness as your corpus grows.",
  },
];

const PLANS = [
  {
    name: "Starter",
    price: "Free",
    sub: "forever",
    hot: false,
    features: ["1 knowledge base", "50 MB storage", "100 chats / month", "Basic analytics"],
    cta: "Get started",
    href: "/register",
  },
  {
    name: "Pro",
    price: "$29",
    sub: "/ month",
    hot: true,
    features: ["Unlimited KBs", "10 GB storage", "Unlimited chat", "Eval harness", "Priority support"],
    cta: "Start free trial",
    href: "/register",
  },
  {
    name: "Enterprise",
    price: "Custom",
    sub: "contact",
    hot: false,
    features: ["Custom storage", "SSO / SAML", "Dedicated infra", "SLA guarantee", "Onboarding"],
    cta: "Talk to us",
    href: "mailto:hello@docmind.app",
  },
];

// ─── Scroll-reveal wrapper (GSAP) ─────────────────────────────────────────────
function Reveal({
  children,
  delay = 0,
  className,
  from = "bottom",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  from?: "bottom" | "left" | "right" | "scale";
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const from_vars: gsap.TweenVars = {
        opacity: 0,
        duration: 0.65,
        ease: "power2.out",
        delay: delay / 1000,
      };
      if (from === "bottom") from_vars.y = 28;
      if (from === "left")   from_vars.x = -28;
      if (from === "right")  from_vars.x = 28;
      if (from === "scale")  { from_vars.scale = 0.93; from_vars.y = 14; }

      gsap.from(el, {
        ...from_vars,
        scrollTrigger: {
          trigger: el,
          start: "top 88%",
          toggleActions: "play none none none",
        },
      });
    });

    mm.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(el, { opacity: 1 });
    });

    return () => mm.revert();
  }, [delay, from]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(el, { y: -20, opacity: 0, duration: 0.7, ease: "power2.out", delay: 0.1 });
    });
    return () => mm.revert();
  }, []);

  const links: [string, string][] = [
    ["#features", "Features"],
    ["#how-it-works", "How it works"],
    ["#pricing", "Pricing"],
  ];

  return (
    <header
      ref={navRef}
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500",
        scrolled ? "lp-nav-scrolled" : ""
      )}
    >
      <nav
        className="lp-container h-16 flex items-center justify-between"
        aria-label="Main navigation"
      >
        <Link href="/" className="flex items-center gap-2.5 group" aria-label="DocMind home">
          <div className="lp-logo-mark group-hover:scale-105 transition-transform duration-200">
            <Icon.Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <span className="text-[15px] font-bold tracking-tight lp-font-display text-white/90">
            DocMind
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-0.5">
          {links.map(([h, l]) => (
            <a
              key={h}
              href={h}
              className="px-4 py-2 text-[13.5px] text-white/40 hover:text-white rounded-lg hover:bg-white/[0.05] transition-all duration-150 lp-font-body font-medium"
            >
              {l}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/login"
            className="text-[13px] text-white/38 hover:text-white px-4 py-2 rounded-lg hover:bg-white/[0.05] transition-all duration-150 lp-font-body font-medium"
          >
            Sign in
          </Link>
          <Link href="/register" className="lp-btn-primary text-[13px]">
            Get started free
          </Link>
        </div>

        <button
          className="md:hidden p-2 text-white/50 hover:text-white transition-colors"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-label="Toggle navigation menu"
        >
          {open ? <Icon.X className="w-5 h-5" /> : <Icon.Menu className="w-5 h-5" />}
        </button>
      </nav>

      {open && (
        <div className="md:hidden lp-nav-mobile" role="menu">
          {links.map(([h, l]) => (
            <a
              key={h}
              href={h}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-3 text-[14px] text-white/55 hover:text-white hover:bg-white/[0.05] rounded-xl transition-all lp-font-body"
            >
              {l}
            </a>
          ))}
          <div className="flex flex-col gap-2 pt-3 mt-2 border-t border-white/[0.06]">
            <Link
              href="/login"
              className="text-center py-3 text-[13px] text-white/40 hover:text-white lp-font-body"
            >
              Sign in
            </Link>
            <Link href="/register" className="lp-btn-primary text-center text-[14px]">
              Get started free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  // Refs for GSAP targets
  const heroRef      = useRef<HTMLDivElement>(null);
  const cardWrapRef  = useRef<HTMLDivElement>(null);
  const mainCardRef  = useRef<HTMLDivElement>(null);
  const statCardRef  = useRef<HTMLDivElement>(null);
  const srcCardRef   = useRef<HTMLDivElement>(null);
  const orb1Ref      = useRef<HTMLDivElement>(null);
  const orb2Ref      = useRef<HTMLDivElement>(null);
  const orb3Ref      = useRef<HTMLDivElement>(null);
  const ctaBtnRef    = useRef<HTMLAnchorElement>(null);
  const featuresRef  = useRef<HTMLDivElement>(null);
  const stepsRef     = useRef<HTMLDivElement>(null);
  const pricingRef   = useRef<HTMLDivElement>(null);
  const statsBarRef  = useRef<HTMLDivElement>(null);

  // ── All GSAP effects ──────────────────────────────────────────────────────
  useEffect(() => {
    const mm = gsap.matchMedia();

    // 1. Hero 3D card mouse-tracking tilt
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const hero     = heroRef.current;
      const mainCard = mainCardRef.current;
      const statCard = statCardRef.current;
      const srcCard  = srcCardRef.current;
      if (!hero || !mainCard) return;

      function onMove(e: MouseEvent) {
        const r  = hero!.getBoundingClientRect();
        const cx = (e.clientX - r.left)  / r.width  - 0.5;
        const cy = (e.clientY - r.top)   / r.height - 0.5;

        gsap.to(mainCard, {
          rotateY: cx * 10,
          rotateX: -cy * 6,
          duration: 0.55,
          ease: "power2.out",
          transformPerspective: 900,
        });
        if (statCard) {
          gsap.to(statCard, {
            x: cx * 18, y: cy * 12, rotateY: cx * 5,
            duration: 0.65, ease: "power2.out",
          });
        }
        if (srcCard) {
          gsap.to(srcCard, {
            x: -cx * 14, y: -cy * 10, rotateY: -cx * 4,
            duration: 0.75, ease: "power2.out",
          });
        }
      }
      function onLeave() {
        const targets = [mainCard, statCard, srcCard].filter(Boolean);
        gsap.to(targets, {
          x: 0, y: 0, rotateX: 0, rotateY: 0,
          duration: 0.9, ease: "elastic.out(1, 0.4)",
        });
      }

      hero.addEventListener("mousemove", onMove);
      hero.addEventListener("mouseleave", onLeave);
      return () => {
        hero.removeEventListener("mousemove", onMove);
        hero.removeEventListener("mouseleave", onLeave);
      };
    });

    // 2. Parallax orbs on scroll (background layers move at different rates)
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const heroEl = heroRef.current;
      [[orb1Ref, 12], [orb2Ref, -8], [orb3Ref, 16]].forEach(([ref, yPct]) => {
        const el = (ref as React.RefObject<HTMLDivElement>).current;
        if (!el || !heroEl) return;
        gsap.to(el, {
          yPercent: yPct as number,
          ease: "none",
          scrollTrigger: {
            trigger: heroEl,
            start: "top top",
            end: "bottom top",
            scrub: true,
          },
        });
      });
    });

    // 3. Card stack fades + scales as you scroll past hero
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const wrap = cardWrapRef.current;
      if (!wrap) return;
      gsap.to(wrap, {
        scale: 0.93,
        opacity: 0.55,
        y: 45,
        ease: "none",
        scrollTrigger: {
          trigger: heroRef.current,
          start: "center center",
          end: "bottom top",
          scrub: 0.5,
        },
      });
    });

    // 4. Stats bar numbers stagger in
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const bar = statsBarRef.current;
      if (!bar) return;
      gsap.from(bar.querySelectorAll(".lp-stat-value"), {
        opacity: 0, y: 18, duration: 0.5, stagger: 0.09, ease: "power2.out",
        scrollTrigger: { trigger: bar, start: "top 85%" },
      });
    });

    // 5. Feature cards stagger fade-up + scale
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const sec = featuresRef.current;
      if (!sec) return;
      gsap.from(sec.querySelectorAll(".lp-feature-card"), {
        opacity: 0, y: 36, scale: 0.95, duration: 0.6, stagger: 0.09,
        ease: "power2.out",
        scrollTrigger: { trigger: sec, start: "top 82%", toggleActions: "play none none none" },
      });
    });

    // 6. Steps slide-in from left
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const sec = stepsRef.current;
      if (!sec) return;
      gsap.from(sec.querySelectorAll(".lp-step-item"), {
        opacity: 0, x: -24, duration: 0.55, stagger: 0.10,
        ease: "power2.out",
        scrollTrigger: { trigger: sec, start: "top 85%", toggleActions: "play none none none" },
      });
    });

    // 7. Pricing cards rotateX perspective entrance
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const sec = pricingRef.current;
      if (!sec) return;
      gsap.from(sec.querySelectorAll(".lp-pricing-card"), {
        opacity: 0, y: 32, rotateX: 5, duration: 0.7, stagger: 0.10,
        ease: "power2.out",
        scrollTrigger: { trigger: sec, start: "top 82%", toggleActions: "play none none none" },
      });
    });

    return () => mm.revert();
  }, []);

  // ── Magnetic CTA button ───────────────────────────────────────────────────
  useEffect(() => {
    const btn = ctaBtnRef.current;
    if (!btn) return;
    const mm = gsap.matchMedia();
    const xTo = gsap.quickTo(btn, "x", { duration: 0.45, ease: "power3.out" });
    const yTo = gsap.quickTo(btn, "y", { duration: 0.45, ease: "power3.out" });

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const b = btn!;
      function onMove(e: MouseEvent) {
        const r = b.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width  / 2) * 0.3);
        yTo((e.clientY - r.top  - r.height / 2) * 0.3);
      }
      function onLeave() { xTo(0); yTo(0); }
      b.addEventListener("mousemove", onMove);
      b.addEventListener("mouseleave", onLeave);
      return () => {
        b.removeEventListener("mousemove", onMove);
        b.removeEventListener("mouseleave", onLeave);
      };
    });
    return () => mm.revert();
  }, []);

  return (
    <div className="lp-root">
      <Nav />

      {/* ═══ HERO ═══════════════════════════════════════════════════════════ */}
      <section
        ref={heroRef}
        className="lp-hero"
        style={{ perspective: "1200px" }}
      >
        <div className="lp-bg-base" aria-hidden="true" />
        <div className="lp-bg-grid" aria-hidden="true" />
        <div ref={orb1Ref} className="lp-orb lp-orb-1" aria-hidden="true" />
        <div ref={orb2Ref} className="lp-orb lp-orb-2" aria-hidden="true" />
        <div ref={orb3Ref} className="lp-orb lp-orb-3" aria-hidden="true" />

        <div className="lp-container relative flex flex-col lg:flex-row items-center gap-14 lg:gap-16 pt-24 pb-16 lg:pt-32 lg:pb-20">

          {/* ── Copy ── */}
          <div className="flex-1 text-center lg:text-left space-y-7 lg:max-w-[520px]">
            <div className="lp-badge" style={{ animationDelay: "0ms" }}>
              <Icon.Sparkles className="w-3 h-3 text-indigo-400" aria-hidden="true" />
              GPT-4o-mini · pgvector · SSE streaming
            </div>

            <h1 className="lp-h1">
              Ask anything about<br />your <RotatingWord />
            </h1>

            <p
              className="lp-body-lg max-w-md mx-auto lg:mx-0"
              style={{ opacity: 0, animation: "lp-up 0.7s cubic-bezier(.22,1,.36,1) 240ms forwards" }}
            >
              Upload documents. Get streaming answers with inline citations and a
              transparent confidence score — built on production infrastructure.
            </p>

            <div
              className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3"
              style={{ opacity: 0, animation: "lp-up 0.7s cubic-bezier(.22,1,.36,1) 360ms forwards" }}
            >
              <Link
                ref={ctaBtnRef}
                href="/register"
                className="lp-btn-primary lp-btn-lg group w-full sm:w-auto justify-center"
                style={{ willChange: "transform" }}
              >
                Start for free
                <Icon.Arrow
                  className="w-4 h-4 group-hover:translate-x-0.5 transition-transform"
                  aria-hidden="true"
                />
              </Link>
              <Link
                href="#features"
                className="lp-btn-ghost lp-btn-lg w-full sm:w-auto justify-center"
              >
                Explore features
              </Link>
            </div>

            <div
              className="flex items-center justify-center lg:justify-start gap-5 flex-wrap"
              style={{ opacity: 0, animation: "lp-up 0.7s cubic-bezier(.22,1,.36,1) 460ms forwards" }}
            >
              {["No credit card", "Multi-tenant", "Open source"].map(t => (
                <span
                  key={t}
                  className="flex items-center gap-1.5 text-[12px] text-white/22 lp-font-body"
                >
                  <Icon.Check
                    className="w-3 h-3 text-emerald-500/60"
                    aria-hidden="true"
                  />
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* ── 3D Visual stack ── */}
          <div
            ref={cardWrapRef}
            className="flex-1 w-full max-w-[540px] mx-auto lg:mx-0 relative"
            style={{
              opacity: 0,
              animation: "lp-right 0.85s cubic-bezier(.22,1,.36,1) 200ms forwards",
              transformStyle: "preserve-3d",
            }}
          >
            {/* Main chat card */}
            <div
              ref={mainCardRef}
              style={{ transformStyle: "preserve-3d", willChange: "transform" }}
            >
              <ChatDemo />
            </div>

            {/* Stat card — top-right, raised layer */}
            <div
              ref={statCardRef}
              className="absolute -top-8 -right-6 hidden xl:block"
              style={{ transformStyle: "preserve-3d", willChange: "transform" }}
              aria-hidden="true"
            >
              <StatCard />
            </div>

            {/* Source card — bottom-left, nearest layer */}
            <div
              ref={srcCardRef}
              className="absolute -bottom-8 -left-4 hidden xl:block"
              style={{ transformStyle: "preserve-3d", willChange: "transform" }}
              aria-hidden="true"
            >
              <SourceCard />
            </div>

            {/* Confidence badge — top-center floating */}
            <div
              className="absolute -top-5 left-1/2 -translate-x-1/2 hidden lg:flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{
                background: "rgba(34,197,94,0.10)",
                border: "1px solid rgba(34,197,94,0.22)",
                backdropFilter: "blur(12px)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
              }}
              aria-hidden="true"
            >
              <div
                className="w-2 h-2 rounded-full bg-emerald-400"
                style={{ boxShadow: "0 0 8px #22c55e" }}
              />
              <span className="text-[11px] font-bold text-emerald-400 lp-font-display">HIGH</span>
              <span className="text-[10px] text-white/28 lp-font-body">0.87 cosine</span>
            </div>
          </div>
        </div>

        {/* Scroll cue */}
        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          style={{ opacity: 0, animation: "lp-up 0.6s ease 1400ms forwards" }}
          aria-hidden="true"
        >
          <div
            className="w-5 h-8 rounded-full flex items-start justify-center pt-1.5"
            style={{ border: "1.5px solid rgba(255,255,255,0.12)" }}
          >
            <div
              className="w-1 h-2 rounded-full"
              style={{
                background: "rgba(255,255,255,0.3)",
                animation: "lp-scroll-dot 2s ease infinite",
              }}
            />
          </div>
          <span className="text-[10px] text-white/16 tracking-widest font-semibold lp-font-display">
            SCROLL
          </span>
        </div>
      </section>

      {/* ═══ STATS ══════════════════════════════════════════════════════════ */}
      <section ref={statsBarRef} className="lp-stats-bar">
        <div className="lp-container grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { v: "< 10ms",  l: "p95 vector recall" },
            { v: "≥ 0.90",  l: "faithfulness score" },
            { v: "50 MB",   l: "max upload size" },
            { v: "2-stage", l: "vector + BM25 fusion" },
          ].map(s => (
            <div key={s.l} className="text-center">
              <div className="lp-stat-value">{s.v}</div>
              <div className="lp-stat-label">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ FEATURES ═══════════════════════════════════════════════════════ */}
      <section id="features" className="lp-section">
        <div className="lp-container">
          <Reveal className="text-center mb-16 space-y-3">
            <div className="lp-section-tag">Features</div>
            <h2 className="lp-h2">
              Production-grade RAG.<br />
              <span className="lp-gradient-text">Not a prototype.</span>
            </h2>
            <p className="lp-body-lg max-w-lg mx-auto">
              Hybrid retrieval, streaming citations, confidence scoring, and an eval
              harness — all in one platform.
            </p>
          </Reveal>

          <div ref={featuresRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(f => (
              <div
                key={f.title}
                className="lp-feature-card"
                style={{ "--card-color": f.color } as React.CSSProperties}
              >
                <div
                  className="lp-feature-icon"
                  style={{ background: `${f.color}18`, border: `1px solid ${f.color}30` }}
                  aria-hidden="true"
                >
                  <span style={{ color: f.color, display: "flex" }}>
                    <f.icon className="w-4 h-4" />
                  </span>
                </div>
                <div className="lp-feature-glow" aria-hidden="true" />
                <h3 className="lp-h4 mb-2">{f.title}</h3>
                <p className="text-[13px] text-white/38 leading-relaxed lp-font-body">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══════════════════════════════════════════════════ */}
      <section id="how-it-works" className="lp-section lp-section-alt">
        <div className="lp-container">
          <Reveal className="text-center mb-16 space-y-3">
            <div className="lp-section-tag">How it works</div>
            <h2 className="lp-h2">Upload → Embed → Ask → Verify</h2>
          </Reveal>

          <div ref={stepsRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {STEPS.map((s, i) => (
              <div key={s.n} className="lp-step-item relative">
                {i < 3 && (
                  <div className="hidden lg:block lp-step-line" aria-hidden="true" />
                )}
                <div className="lp-step-num">{s.n}</div>
                <h3 className="lp-h4 mt-3 mb-2">{s.t}</h3>
                <p className="text-[13px] text-white/35 leading-relaxed lp-font-body">{s.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ STACK CALLOUT ══════════════════════════════════════════════════ */}
      <section className="lp-section">
        <div className="lp-container">
          <Reveal from="scale">
            <div className="lp-callout">
              <div className="lp-callout-orb" aria-hidden="true" />
              <div className="relative grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
                <div className="space-y-4">
                  <div className="lp-section-tag">Stack</div>
                  <h3 className="lp-h3">
                    Built for production<br />from day one
                  </h3>
                  <p className="text-[14px] text-white/38 leading-relaxed lp-font-body">
                    Next.js 15 · FastAPI · PostgreSQL 16 + pgvector · Cloudflare R2 ·
                    Upstash Redis · Drizzle ORM · NextAuth v5
                  </p>
                  <Link
                    href="/register"
                    className="inline-flex items-center gap-1.5 text-[13px] text-indigo-400 hover:text-indigo-300 font-semibold group transition-colors lp-font-display"
                  >
                    Deploy in minutes
                    <Icon.Arrow
                      className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform"
                      aria-hidden="true"
                    />
                  </Link>
                </div>

                <div className="space-y-2.5">
                  {[
                    ["Upload",   "R2 presigned PUT · client-direct"],
                    ["Extract",  "pdfplumber / python-docx / txt"],
                    ["Chunk",    "tiktoken 512t · 64 overlap"],
                    ["Embed",    "text-embedding-3-small · batch 15"],
                    ["Retrieve", "HNSW cosine + GIN BM25 → RRF"],
                    ["Stream",   "gpt-4o-mini · SSE · 15s heartbeat"],
                  ].map(([step, detail], idx) => (
                    <div key={step} className="flex items-center gap-3">
                      <div className="lp-step-badge" aria-hidden="true">{idx + 1}</div>
                      <span className="text-[12px] font-mono text-white/60 shrink-0 w-16 lp-font-display">
                        {step}
                      </span>
                      <span className="text-[11px] font-mono text-white/20 truncate lp-font-body">
                        {detail}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ PRICING ════════════════════════════════════════════════════════ */}
      <section id="pricing" className="lp-section lp-section-alt">
        <div className="lp-container">
          <Reveal className="text-center mb-14 space-y-3">
            <div className="lp-section-tag">Pricing</div>
            <h2 className="lp-h2">
              Simple. Transparent.<br />No surprises.
            </h2>
            <p className="lp-body-lg">Start free. Scale when you&apos;re ready.</p>
          </Reveal>

          <div ref={pricingRef} className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PLANS.map(p => (
              <div
                key={p.name}
                className={cn(
                  "lp-pricing-card h-full flex flex-col",
                  p.hot && "lp-pricing-card-hot"
                )}
              >
                {p.hot && (
                  <div className="lp-popular-badge" aria-label="Most popular plan">
                    Most popular
                  </div>
                )}
                <div className="mb-6">
                  <div className="text-[11px] font-semibold text-white/38 uppercase tracking-widest mb-2 lp-font-display">
                    {p.name}
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className="text-4xl font-bold lp-font-display"
                      style={{ letterSpacing: "-0.04em" }}
                    >
                      {p.price}
                    </span>
                    <span className="text-[12px] text-white/28 lp-font-body">{p.sub}</span>
                  </div>
                </div>
                <ul className="space-y-3 flex-1 mb-8" role="list">
                  {p.features.map(f => (
                    <li
                      key={f}
                      className="flex items-center gap-2.5 text-[13px] text-white/48 lp-font-body"
                    >
                      <Icon.Check
                        className="w-3.5 h-3.5 text-emerald-400 shrink-0"
                        aria-hidden="true"
                      />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={p.href}
                  className={cn(
                    "text-center py-3 rounded-xl text-[13.5px] font-semibold transition-all duration-200 lp-font-display",
                    p.hot ? "lp-btn-primary" : "lp-btn-ghost"
                  )}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FINAL CTA ══════════════════════════════════════════════════════ */}
      <section className="lp-section lp-cta-section">
        <div className="lp-cta-orb" aria-hidden="true" />
        <div className="lp-bg-grid" style={{ opacity: 0.022 }} aria-hidden="true" />
        <Reveal className="lp-container text-center space-y-7 relative">
          <h2 className="lp-h1-cta">
            Build your knowledge<br />
            <span className="lp-gradient-text">base today.</span>
          </h2>
          <p className="lp-body-lg max-w-md mx-auto">
            Free forever on the Starter plan. No credit card. Self-host or use our cloud.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Link
              href="/register"
              className="lp-btn-primary lp-btn-lg group w-full sm:w-auto justify-center"
            >
              Get started — it&apos;s free
              <Icon.Arrow
                className="w-4 h-4 group-hover:translate-x-0.5 transition-transform"
                aria-hidden="true"
              />
            </Link>
            <Link
              href="/login"
              className="lp-btn-ghost lp-btn-lg w-full sm:w-auto justify-center"
            >
              Sign in
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ═══ FOOTER ═════════════════════════════════════════════════════════ */}
      <footer className="border-t border-white/[0.05] py-10" role="contentinfo">
        <div className="lp-container flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div
              className="lp-logo-mark"
              style={{ width: 22, height: 22 }}
              aria-hidden="true"
            >
              <Icon.Sparkles className="w-2.5 h-2.5 text-indigo-400" />
            </div>
            <span className="text-[13px] font-semibold text-white/45 lp-font-display">
              DocMind
            </span>
          </div>
          <p className="text-[11.5px] text-white/18 lp-font-body">
            © {new Date().getFullYear()} DocMind · Next.js · FastAPI · pgvector
          </p>
          <nav aria-label="Footer navigation" className="flex gap-5">
            {[["Sign in", "/login"], ["Register", "/register"]].map(([l, h]) => (
              <Link
                key={h}
                href={h}
                className="text-[12px] text-white/22 hover:text-white/55 transition-colors lp-font-body"
              >
                {l}
              </Link>
            ))}
          </nav>
        </div>
      </footer>

      {/* Scroll-dot keyframe (scoped to avoid CSS order issues) */}
      <style>{`
        @keyframes lp-scroll-dot {
          0%   { opacity: 1; transform: translateY(0); }
          75%  { opacity: 0; transform: translateY(10px); }
          76%  { opacity: 0; transform: translateY(0); }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
