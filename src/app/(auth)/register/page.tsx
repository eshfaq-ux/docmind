"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, Sparkles, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ui-ux-pro-max: password strength scoring
function getPasswordStrength(pw: string): { score: 0|1|2|3|4; label: string; cls: string } {
  if (!pw) return { score: 0, label: "", cls: "" };
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  score = Math.min(score, 4) as 0|1|2|3|4;
  const map: Record<number, { label: string; cls: string }> = {
    0: { label: "",        cls: "" },
    1: { label: "Weak",    cls: "pw-bar-weak" },
    2: { label: "Fair",    cls: "pw-bar-fair" },
    3: { label: "Good",    cls: "pw-bar-good" },
    4: { label: "Strong",  cls: "pw-bar-strong" },
  };
  return { score: score as 0|1|2|3|4, ...map[score] };
}

const REQUIREMENTS = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "Uppercase & lowercase",  test: (p: string) => /[A-Z]/.test(p) && /[a-z]/.test(p) },
  { label: "At least one number",    test: (p: string) => /[0-9]/.test(p) },
];

export default function RegisterPage() {
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [pwFocused, setPwFocused] = useState(false);
  const [done, setDone]         = useState(false);  // email sent state

  const strength = getPasswordStrength(password);
  const isPasswordValid = strength.score >= 2 && password.length >= 8;

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!isPasswordValid) {
      toast.error("Please choose a stronger password");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      toast.error(data.error ?? "Registration failed");
      return;
    }

    // Show "check your email" screen
    setDone(true);
  }

  // ── Email sent confirmation screen ──────────────────────────────────────────
  if (done) {
    return (
      <div className="glass rounded-2xl p-8 space-y-6 text-center animate-scale-in">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="font-heading text-xl font-bold">Check your email</h1>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            We sent a verification link to <strong className="text-foreground">{email}</strong>.
            Click the link to activate your account.
          </p>
          <p className="text-[12px] text-muted-foreground/50 mt-1">
            The link expires in 24 hours. Check your spam folder if you don&apos;t see it.
          </p>
        </div>
        <p className="text-center text-[12.5px] text-muted-foreground">
          Already verified?{" "}
          <Link href="/login" className="text-primary hover:text-primary/80 font-medium transition-colors duration-150">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-8 space-y-6 animate-scale-in">
      {/* Brand */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-primary/15 glow-primary">
          <Sparkles className="w-5 h-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-heading text-xl font-bold">Create your account</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Start building your knowledge base today</p>
        </div>
      </div>

      <form onSubmit={handleRegister} className="space-y-4" noValidate>
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-[12px] text-muted-foreground font-medium">
            Full name
          </Label>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            placeholder="Alex Chen"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="h-10 bg-white/[0.04] border-white/[0.09] text-[13.5px] placeholder:text-muted-foreground/40 focus:ring-0 focus:border-primary/40 transition-colors duration-150"
          />
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-[12px] text-muted-foreground font-medium">
            Work email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-10 bg-white/[0.04] border-white/[0.09] text-[13.5px] placeholder:text-muted-foreground/40 focus:ring-0 focus:border-primary/40 transition-colors duration-150"
          />
        </div>

        {/* Password + strength */}
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-[12px] text-muted-foreground font-medium">
            Password
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Create a strong password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setPwFocused(true)}
              required
              aria-describedby="pw-strength-desc"
              className="h-10 bg-white/[0.04] border-white/[0.09] text-[13.5px] pr-10 placeholder:text-muted-foreground/40 focus:ring-0 focus:border-primary/40 transition-colors duration-150"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors duration-150"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Strength bar */}
          {password.length > 0 && (
            <div className="space-y-1.5 animate-fade-up">
              <div className="flex gap-1" role="progressbar" aria-valuenow={strength.score} aria-valuemax={4} aria-label="Password strength">
                {[1,2,3,4].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex-1 h-1 rounded-full transition-all duration-300",
                      i <= strength.score
                        ? strength.score <= 1 ? "bg-rose-500"
                          : strength.score === 2 ? "bg-amber-400"
                          : strength.score === 3 ? "bg-sky-400"
                          : "bg-emerald-400"
                        : "bg-white/[0.08]"
                    )}
                  />
                ))}
              </div>
              {strength.label && (
                <p
                  id="pw-strength-desc"
                  className={cn(
                    "text-[11px] font-medium",
                    strength.score <= 1 ? "text-rose-400"
                    : strength.score === 2 ? "text-amber-400"
                    : strength.score === 3 ? "text-sky-400"
                    : "text-emerald-400"
                  )}
                >
                  {strength.label} password
                </p>
              )}
            </div>
          )}

          {/* Requirements checklist — shown when field focused or has value */}
          {(pwFocused || password.length > 0) && (
            <ul className="space-y-1 mt-2 animate-fade-up" aria-label="Password requirements">
              {REQUIREMENTS.map((req) => {
                const met = req.test(password);
                return (
                  <li key={req.label} className="flex items-center gap-1.5">
                    <Check
                      className={cn("w-3 h-3 shrink-0 transition-colors duration-150",
                        met ? "text-emerald-400" : "text-muted-foreground/30"
                      )}
                      aria-hidden="true"
                    />
                    <span className={cn("text-[11px] transition-colors duration-150",
                      met ? "text-foreground/70" : "text-muted-foreground/50"
                    )}>
                      {req.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Submit */}
        <Button
          type="submit"
          disabled={loading || !name || !email || !isPasswordValid}
          className={cn(
            "w-full h-10 text-[13.5px] font-semibold font-heading mt-2",
            "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20",
            "transition-all duration-150 disabled:opacity-40"
          )}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Creating account…
            </span>
          ) : "Create account"}
        </Button>
      </form>

      {/* Terms */}
      <p className="text-[11px] text-muted-foreground/50 text-center leading-relaxed">
        By creating an account you agree to our{" "}
        <span className="text-primary/60 cursor-pointer hover:text-primary transition-colors duration-150">Terms</span>
        {" "}and{" "}
        <span className="text-primary/60 cursor-pointer hover:text-primary transition-colors duration-150">Privacy Policy</span>
      </p>

      <p className="text-center text-[12.5px] text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-primary hover:text-primary/80 font-medium transition-colors duration-150">
          Sign in
        </Link>
      </p>
    </div>
  );
}
