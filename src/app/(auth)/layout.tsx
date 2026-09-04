import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in" };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Layered ambient orbs — ui-ux-pro-max: glassmorphism + dark OLED */}
      <div className="absolute top-1/4 left-1/4  w-[480px] h-[480px] bg-primary/8  rounded-full blur-[96px]  pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[360px] h-[360px] bg-accent/7   rounded-full blur-[80px]  pointer-events-none" />
      <div className="absolute top-2/3  left-1/2   w-[280px] h-[280px] bg-primary/5  rounded-full blur-[64px]  pointer-events-none -translate-x-1/2" />

      {/* Brand watermark top-left */}
      <div className="absolute top-6 left-7 flex items-center gap-2 select-none">
        <div className="w-6 h-6 rounded-lg bg-primary/15 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <span className="text-[13px] font-bold gradient-text font-heading tracking-tight">DocMind</span>
      </div>

      <div className="relative z-10 w-full max-w-[400px] px-4">
        {children}
      </div>
    </div>
  );
}
