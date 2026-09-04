"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPw, setShowPw]             = useState(false);
  const [loading, setLoading]           = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailError, setEmailError]     = useState("");

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl });
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setEmailError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setEmailError("Invalid email or password");
      toast.error("Invalid email or password");
    } else {
      router.push(callbackUrl);
    }
  }

  return (
    <div className="glass rounded-2xl p-8 space-y-6 animate-scale-in">
      {/* Brand */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-primary/15 glow-primary">
          <Sparkles className="w-5 h-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-heading text-xl font-bold">Welcome back</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Sign in to your DocMind workspace</p>
        </div>
      </div>

      {/* Google OAuth */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={googleLoading}
        aria-label="Continue with Google"
        className={cn(
          "w-full flex items-center justify-center gap-2.5 h-10 rounded-xl text-[13px] font-medium",
          "border border-white/[0.10] bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/[0.16]",
          "transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {googleLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
        )}
        {googleLoading ? "Redirecting…" : "Continue with Google"}
      </button>

      {/* Divider */}
      <div className="divider-label">or continue with email</div>

      {/* Credentials form */}
      <form onSubmit={handleCredentials} className="space-y-4" noValidate>
        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-[12px] text-muted-foreground font-medium">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
            required
            aria-invalid={!!emailError}
            aria-describedby={emailError ? "email-error" : undefined}
            className={cn(
              "h-10 bg-white/[0.04] border-white/[0.09] text-[13.5px]",
              "placeholder:text-muted-foreground/40 focus:ring-0 focus:border-primary/40",
              "transition-colors duration-150",
              emailError && "border-rose-500/60"
            )}
          />
          {emailError && (
            <p id="email-error" role="alert" className="text-[11.5px] text-rose-400 mt-1">
              {emailError}
            </p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-[12px] text-muted-foreground font-medium">
              Password
            </Label>
            <button
              type="button"
              className="text-[11.5px] text-primary/70 hover:text-primary transition-colors duration-150"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={cn(
                "h-10 bg-white/[0.04] border-white/[0.09] text-[13.5px] pr-10",
                "placeholder:text-muted-foreground/40 focus:ring-0 focus:border-primary/40",
                "transition-colors duration-150"
              )}
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
        </div>

        {/* Submit */}
        <Button
          type="submit"
          disabled={loading || !email || !password}
          className={cn(
            "w-full h-10 text-[13.5px] font-semibold font-heading",
            "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20",
            "transition-all duration-150 disabled:opacity-40"
          )}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Signing in…
            </span>
          ) : "Sign in"}
        </Button>
      </form>

      <p className="text-center text-[12.5px] text-muted-foreground">
        No account?{" "}
        <Link href="/register" className="text-primary hover:text-primary/80 font-medium transition-colors duration-150">
          Create one for free
        </Link>
      </p>
    </div>
  );
}
