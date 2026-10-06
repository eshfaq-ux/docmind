"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

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

// ─── Scroll reveal hook ───────────────────────────────────────────────────────
function useReveal(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true); // default true = no flash before JS

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Start hidden then animate in
    setVisible(false);

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold }
    );

    // Small delay so initial setVisible(false) paints before observer fires
    const t = setTimeout(() => obs.observe(el), 50);
    return () => { clearTimeout(t); obs.disconnect(); };
  }, [threshold]);

  return { ref, visible };
}

function Reveal({
  children, delay = 0, className, from = "bottom",
}: {
  children: React.ReactNode; delay?: number; className?: string; from?: "bottom" | "left" | "right" | "scale";
}) {
  const { ref, visible } = useReveal();
  const hidden = {
    bottom: "translateY(32px)",
    left:   "translateX(-32px)",
    right:  "translateX(32px)",
    scale:  "scale(0.92)",
  }[from];

  return (
    <div
      ref={ref}
      className={cn(className)}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : hidden,
        transition: `opacity 0.7s cubic-bezier(.22,1,.36,1) ${delay}ms, transform 0.7s cubic-bezier(.22,1,.36,1) ${delay}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}

// ─── Rotating word ────────────────────────────────────────────────────────────
const WORDS = ["PDFs", "contracts", "research", "manuals", "reports", "notes"];
function RotatingWord() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setIdx(i => (i + 1) % WORDS.length); setVisible(true); }, 280);
    }, 2400);
    return () => clearInterval(t);
  }, []);
  return (
    <span
      className="lp-word"
      style={{ opacity: visible ? 1 : 0, transform: visible ? "none" : "translateY(-10px)", transition: "opacity 0.28s ease, transform 0.28s ease" }}
    >
      {WORDS[idx]}
    </span>
  );
}

// ─── Streaming demo ───────────────────────────────────────────────────────────
const STREAM_TEXT = "Revenue grew 34% YoY to $142M [1]. The primary driver was enterprise expansion with net retention at 128% [2]. Operating margins improved to 18% from 11% in Q2 [3].";

function ChatDemo() {
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setCursor(true);
      let i = 0;
      const iv = setInterval(() => {
        i += 3;
        setText(STREAM_TEXT.slice(0, i));
        if (i >= STREAM_TEXT.length) { clearInterval(iv); setCursor(false); }
      }, 20);
      return () => clearInterval(iv);
    }, 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="lp-glass rounded-2xl overflow-hidden shadow-2xl" style={{ boxShadow: "0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)" }}>
      {/* Titlebar */}
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/[0.07]" style={{ background: "rgba(255,255,255,0.03)" }}>
        {["#ff5f57","#febc2e","#28c840"].map(c => <div key={c} className="w-3 h-3 rounded-full" style={{ background: c, opacity: 0.8 }} />)}
        <span className="ml-3 text-[11px] text-white/30 font-mono tracking-wide">DocMind — Q3 Earnings</span>
      </div>

      <div className="p-5 space-y-4">
        {/* User message */}
        <div className="flex justify-end">
          <div className="lp-user-bubble">What drove revenue growth in Q3?</div>
        </div>

        {/* Sources */}
        <div className="flex flex-wrap gap-1.5">
          {[["1","Q3 Report.pdf","#3b82f6"],["2","Earnings Call.docx","#8b5cf6"],["3","IR Deck.pdf","#06b6d4"]].map(([n,label,color]) => (
            <span key={n} className="lp-source-pill" style={{ "--pill-color": color } as React.CSSProperties}>
              <span className="lp-source-dot" style={{ background: color }} />[{n}] {label}
            </span>
          ))}
        </div>

        {/* Response */}
        <div className="lp-ai-bubble">
          {text || <span className="text-white/20">Searching 3 documents…</span>}
          {cursor && <span className="lp-cursor" />}
        </div>

        {/* Confidence */}
        {text.length > 30 && (
          <div className="flex items-center gap-2.5 pt-1 border-t border-white/[0.05]">
            <div className="flex gap-0.5">
              {[0,1,2,3].map(i => (
                <div key={i} className="h-1 w-5 rounded-full" style={{ background: i < 3 ? "#22c55e" : "rgba(255,255,255,0.1)", transition: `background 0.3s ${i*100}ms` }} />
              ))}
            </div>
            <span className="text-[10px] text-white/25 font-mono">HIGH · 3 sources · 138ms</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Features data ────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: Icon.Search,  title: "Hybrid Retrieval",     body: "Vector cosine + BM25 full-text fused with RRF. Catches exact keywords that cosine similarity misses.",     color: "#3b82f6" },
  { icon: Icon.Doc,     title: "Inline Citations",      body: "Every answer cites chunk, document, page, and excerpt. Verify exactly where each claim came from.",         color: "#8b5cf6" },
  { icon: Icon.Bolt,    title: "Sub-10ms Recall",       body: "HNSW index on pgvector. p95 retrieval under 10ms for up to 1 million vectors.",                            color: "#f59e0b" },
  { icon: Icon.Shield,  title: "Tenant Isolation",      body: "Every query filtered by tenantId at the database level. Zero cross-tenant leakage possible.",               color: "#22c55e" },
  { icon: Icon.Chart,   title: "Usage Analytics",       body: "Token spend, cost, confidence distribution, model breakdown. 7 / 30 / 90-day rolling views.",              color: "#ec4899" },
  { icon: Icon.Flask,   title: "Eval Harness",          body: "LLM-as-judge scoring: faithfulness, relevance, citation accuracy — automated on every run.",               color: "#06b6d4" },
];

const STEPS = [
  { n:"01", t:"Upload",      b:"Drag PDFs, Word docs, or plain text. Stored in Cloudflare R2 via presigned PUT — no server memory used." },
  { n:"02", t:"Chunk & Embed", b:"tiktoken-bounded chunks (512 tokens, 64 overlap). Batched embeddings via text-embedding-3-small into pgvector." },
  { n:"03", t:"Ask",         b:"Hybrid search retrieves top context. GPT-4o-mini streams a grounded answer with [N] citation references." },
  { n:"04", t:"Evaluate",    b:"Confidence score from retrieval signals. Run structured evals to track quality as your corpus grows." },
];

const PLANS = [
  { name:"Starter", price:"Free",  sub:"forever",   hot:false, features:["1 knowledge base","50 MB storage","100 chats / month","Basic analytics"],                         cta:"Get started",    href:"/register" },
  { name:"Pro",     price:"$29",   sub:"/ month",   hot:true,  features:["Unlimited KBs","10 GB storage","Unlimited chat","Eval harness","Priority support"],               cta:"Start free trial",href:"/register" },
  { name:"Enterprise",price:"Custom",sub:"contact", hot:false, features:["Custom storage","SSO / SAML","Dedicated infra","SLA guarantee","Onboarding"],                    cta:"Talk to us",     href:"mailto:hello@docmind.app" },
];

// ─── Nav ──────────────────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 transition-all duration-500", scrolled ? "lp-nav-scrolled" : "")}>
      <nav className="lp-container h-[64px] flex items-center justify-between" aria-label="Main navigation">
        <Link href="/" className="flex items-center gap-2.5 group" aria-label="DocMind">
          <div className="lp-logo-mark group-hover:scale-105 transition-transform duration-200">
            <Icon.Sparkles className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <span className="text-[15px] font-bold tracking-tight lp-font-heading">DocMind</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {[["#features","Features"],["#how-it-works","How it works"],["#pricing","Pricing"]].map(([h,l]) => (
            <a key={h} href={h} className="px-4 py-2 text-[13.5px] text-white/45 hover:text-white rounded-lg hover:bg-white/[0.05] transition-all duration-150">{l}</a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/login" className="text-[13px] text-white/40 hover:text-white px-4 py-2 rounded-lg hover:bg-white/[0.05] transition-all duration-150">Sign in</Link>
          <Link href="/register" className="lp-btn-primary text-[13px]">Get started free</Link>
        </div>

        <button className="md:hidden p-2 text-white/50 hover:text-white" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-label="Toggle menu">
          {open ? <Icon.X className="w-5 h-5" /> : <Icon.Menu className="w-5 h-5" />}
        </button>
      </nav>

      {open && (
        <div className="md:hidden lp-nav-mobile">
          {[["#features","Features"],["#how-it-works","How it works"],["#pricing","Pricing"]].map(([h,l]) => (
            <a key={h} href={h} onClick={() => setOpen(false)} className="block px-4 py-3 text-[14px] text-white/55 hover:text-white hover:bg-white/[0.05] rounded-xl transition-all">{l}</a>
          ))}
          <div className="flex flex-col gap-2 pt-3 mt-1 border-t border-white/[0.06]">
            <Link href="/login" className="text-center py-3 text-[13px] text-white/45 hover:text-white">Sign in</Link>
            <Link href="/register" className="lp-btn-primary text-center text-[13.5px]">Get started free</Link>
          </div>
        </div>
      )}
    </header>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="lp-root">
      <Nav />

      {/* ═══ HERO ═══════════════════════════════════════════════════════════ */}
      <section className="lp-hero">
        {/* Deep layered background */}
        <div className="lp-bg-base" aria-hidden="true" />
        <div className="lp-bg-grid" aria-hidden="true" />
        <div className="lp-orb lp-orb-1" aria-hidden="true" />
        <div className="lp-orb lp-orb-2" aria-hidden="true" />
        <div className="lp-orb lp-orb-3" aria-hidden="true" />

        <div className="lp-container relative flex flex-col lg:flex-row items-center gap-14 lg:gap-20 pt-28 pb-20">
          {/* Copy */}
          <div className="flex-1 text-center lg:text-left space-y-7">
            <div className="lp-badge" style={{ animationDelay: "0ms" }}>
              <Icon.Sparkles className="w-3 h-3" />
              GPT-4o-mini · pgvector · SSE streaming
            </div>

            <h1 className="lp-h1" style={{ animationDelay: "100ms" }}>
              Ask anything about<br />your <RotatingWord />
            </h1>

            <p className="lp-body-lg max-w-md mx-auto lg:mx-0" style={{ animationDelay: "220ms", opacity: 0, animation: "lp-up 0.7s cubic-bezier(.22,1,.36,1) 220ms forwards" }}>
              Upload documents. Get streaming answers with inline citations and a transparent confidence score. Built on production infrastructure.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3" style={{ animationDelay: "340ms", opacity: 0, animation: "lp-up 0.7s cubic-bezier(.22,1,.36,1) 340ms forwards" }}>
              <Link href="/register" className="lp-btn-primary lp-btn-lg group w-full sm:w-auto justify-center">
                Start for free
                <Icon.Arrow className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link href="#features" className="lp-btn-ghost lp-btn-lg w-full sm:w-auto justify-center">
                Explore features
              </Link>
            </div>

            <div className="flex items-center justify-center lg:justify-start gap-5" style={{ animationDelay: "440ms", opacity: 0, animation: "lp-up 0.7s cubic-bezier(.22,1,.36,1) 440ms forwards" }}>
              {["No credit card","Multi-tenant","Open source"].map(t => (
                <span key={t} className="flex items-center gap-1.5 text-[12px] text-white/25">
                  <Icon.Check className="w-3 h-3 text-emerald-500/70" />{t}
                </span>
              ))}
            </div>
          </div>

          {/* Visual */}
          <div className="flex-1 w-full max-w-[520px] mx-auto lg:mx-0" style={{ animationDelay: "180ms", opacity: 0, animation: "lp-right 0.8s cubic-bezier(.22,1,.36,1) 180ms forwards" }}>
            <ChatDemo />
          </div>
        </div>
      </section>

      {/* ═══ STATS ══════════════════════════════════════════════════════════ */}
      <section className="lp-stats-bar">
        <div className="lp-container grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { v:"< 10ms",  l:"p95 vector recall" },
            { v:"≥ 0.90",  l:"faithfulness score" },
            { v:"50 MB",   l:"max upload size" },
            { v:"2-stage", l:"vector + BM25 fusion" },
          ].map((s, i) => (
            <Reveal key={s.l} delay={i * 70} className="text-center">
              <div className="lp-stat-value">{s.v}</div>
              <div className="lp-stat-label">{s.l}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══ FEATURES ═══════════════════════════════════════════════════════ */}
      <section id="features" className="lp-section">
        <div className="lp-container">
          <Reveal className="text-center mb-16 space-y-3">
            <div className="lp-section-tag">Features</div>
            <h2 className="lp-h2">Production-grade RAG.<br />Not a prototype.</h2>
            <p className="lp-body-lg max-w-lg mx-auto">
              Hybrid retrieval, streaming citations, confidence scoring, and an eval harness — all in one platform.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 60} from="bottom">
                <div className="lp-feature-card group" style={{ "--card-color": f.color } as React.CSSProperties}>
                  <div className="lp-feature-icon" style={{ background: `${f.color}18`, border: `1px solid ${f.color}30` }}>
                    <span style={{ color: f.color, display:"flex" }}><f.icon className="w-4 h-4" /></span>
                  </div>
                  <div className="lp-feature-glow" aria-hidden="true" />
                  <h3 className="lp-h4 mb-2">{f.title}</h3>
                  <p className="text-[13px] text-white/40 leading-relaxed">{f.body}</p>
                </div>
              </Reveal>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 90}>
                <div className="relative">
                  {i < 3 && <div className="hidden lg:block lp-step-line" aria-hidden="true" />}
                  <div className="lp-step-num">{s.n}</div>
                  <h3 className="lp-h4 mt-3 mb-2">{s.t}</h3>
                  <p className="text-[13px] text-white/38 leading-relaxed">{s.b}</p>
                </div>
              </Reveal>
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
                  <h3 className="lp-h3">Built for production from day one</h3>
                  <p className="text-[14px] text-white/40 leading-relaxed">
                    Next.js 15 · FastAPI · PostgreSQL 16 + pgvector · Cloudflare R2 · Upstash Redis · Drizzle ORM · NextAuth v5
                  </p>
                  <Link href="/register" className="inline-flex items-center gap-1.5 text-[13px] text-blue-400 hover:text-blue-300 font-semibold group transition-colors">
                    Deploy in minutes
                    <Icon.Arrow className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>

                <div className="space-y-2.5">
                  {[
                    ["Upload",    "R2 presigned PUT · client-direct"],
                    ["Extract",   "pdfplumber / python-docx / txt"],
                    ["Chunk",     "tiktoken 512t · 64 overlap"],
                    ["Embed",     "text-embedding-3-small · batch 15"],
                    ["Retrieve",  "HNSW cosine + GIN BM25 → RRF"],
                    ["Stream",    "gpt-4o-mini · SSE · 15s heartbeat"],
                  ].map(([step, detail], idx) => (
                    <div key={step} className="flex items-center gap-3">
                      <div className="lp-step-badge">{idx + 1}</div>
                      <span className="text-[12px] font-mono text-white/65 shrink-0 w-16">{step}</span>
                      <span className="text-[11px] font-mono text-white/22 truncate">{detail}</span>
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
            <h2 className="lp-h2">Simple. Transparent. No surprises.</h2>
            <p className="lp-body-lg">Start free. Scale when you&apos;re ready.</p>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PLANS.map((p, i) => (
              <Reveal key={p.name} delay={i * 90}>
                <div className={cn("lp-pricing-card h-full flex flex-col", p.hot && "lp-pricing-card-hot")}>
                  {p.hot && <div className="lp-popular-badge">Most popular</div>}
                  <div className="mb-6">
                    <div className="text-[12px] font-semibold text-white/40 uppercase tracking-widest mb-2 lp-font-heading">{p.name}</div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-bold lp-font-heading">{p.price}</span>
                      <span className="text-[12px] text-white/30">{p.sub}</span>
                    </div>
                  </div>
                  <ul className="space-y-3 flex-1 mb-8">
                    {p.features.map(f => (
                      <li key={f} className="flex items-center gap-2.5 text-[13px] text-white/50">
                        <Icon.Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />{f}
                      </li>
                    ))}
                  </ul>
                  <Link href={p.href} className={cn("text-center py-3 rounded-xl text-[13.5px] font-semibold transition-all duration-200 lp-font-heading", p.hot ? "lp-btn-primary" : "lp-btn-ghost")}>
                    {p.cta}
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FINAL CTA ══════════════════════════════════════════════════════ */}
      <section className="lp-section lp-cta-section">
        <div className="lp-cta-orb" aria-hidden="true" />
        <div className="lp-bg-grid" style={{ opacity: 0.025 }} aria-hidden="true" />
        <Reveal className="lp-container text-center space-y-7 relative">
          <h2 className="lp-h1-cta">
            Build your knowledge<br />
            <span className="lp-gradient-text">base today.</span>
          </h2>
          <p className="lp-body-lg max-w-md mx-auto">
            Free forever on the Starter plan. No credit card. Self-host or use our cloud.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Link href="/register" className="lp-btn-primary lp-btn-lg group w-full sm:w-auto justify-center">
              Get started — it&apos;s free
              <Icon.Arrow className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link href="/login" className="lp-btn-ghost lp-btn-lg w-full sm:w-auto justify-center">
              Sign in
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ═══ FOOTER ═════════════════════════════════════════════════════════ */}
      <footer className="border-t border-white/[0.05] py-10">
        <div className="lp-container flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="lp-logo-mark" style={{ width: 20, height: 20 }}>
              <Icon.Sparkles className="w-2.5 h-2.5 text-blue-400" />
            </div>
            <span className="text-[13px] font-semibold text-white/50 lp-font-heading">DocMind</span>
          </div>
          <p className="text-[11.5px] text-white/20">© {new Date().getFullYear()} DocMind · Next.js · FastAPI · pgvector</p>
          <div className="flex gap-5">
            {[["Sign in","/login"],["Register","/register"]].map(([l,h]) => (
              <Link key={h} href={h} className="text-[12px] text-white/25 hover:text-white/55 transition-colors">{l}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
