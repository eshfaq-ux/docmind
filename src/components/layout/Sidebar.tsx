"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  BarChart3,
  FlaskConical,
  BookOpen,
  Sparkles,
} from "lucide-react";

interface KB {
  id: string;
  name: string;
  docCount: number;
}

const NAV = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/analytics",  icon: BarChart3,       label: "Analytics" },
  { href: "/eval",       icon: FlaskConical,     label: "Evaluation" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [kbs, setKbs] = useState<KB[]>([]);

  useEffect(() => {
    fetch("/api/knowledge-bases")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setKbs(Array.isArray(data) ? data.slice(0, 6) : []))
      .catch(() => {});
  }, []);

  return (
    <aside className="fixed left-0 top-0 h-full w-[220px] flex flex-col z-20 border-r border-white/[0.06]"
           style={{ background: "rgba(6,11,24,0.92)", backdropFilter: "blur(24px)" }}>

      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-white/[0.06] shrink-0">
        <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center glow-primary shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
        </div>
        <span className="font-bold text-[15px] tracking-tight gradient-text">DocMind</span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150",
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
              )}
            >
              <Icon className={cn("w-4 h-4 shrink-0 transition-colors", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
              {label}
              {active && <div className="ml-auto w-1 h-1 rounded-full bg-primary" />}
            </Link>
          );
        })}

        {/* KB section */}
        {kbs.length > 0 && (
          <>
            <div className="pt-4 pb-1.5 px-3">
              <span className="label-xs">Knowledge Bases</span>
            </div>
            {kbs.map((kb) => {
              const active = pathname.startsWith(`/kb/${kb.id}`);
              return (
                <Link
                  key={kb.id}
                  href={`/kb/${kb.id}`}
                  className={cn(
                    "group flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] transition-all duration-150",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
                  )}
                >
                  <BookOpen className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  <span className="truncate flex-1 font-medium">{kb.name}</span>
                  <span className="text-[11px] text-muted-foreground/60 shrink-0">{kb.docCount}</span>
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="px-2.5 py-3 border-t border-white/[0.06] shrink-0">
        <div className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <p className="text-[11px] font-medium text-muted-foreground/70">DocMind</p>
          <p className="text-[10px] text-muted-foreground/40 mt-0.5">v0.1.0 · Private beta</p>
        </div>
      </div>
    </aside>
  );
}
