"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawCallback = searchParams.get("callbackUrl") ?? "/";
  // Prevent open redirect: only allow relative paths starting with /
  const callbackUrl = rawCallback.startsWith("/") && !rawCallback.startsWith("//") ? rawCallback : "/";

  const [email, setEmail]                 = useState("");
  const [password, setPassword]           = useState("");
  const [showPw, setShowPw]               = useState(false);
  const [loading, setLoading]             = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Field-level errors
  const [emailError, setEmailError]       = useState("");
  const [passwordError, setPasswordError] = useState("");
  // Form-level (generic) error shown in a banner above the submit button
  const [formError, setFormError]         = useState("");

  function clearErrors() {
    setEmailError("");
    setPasswordError("");
    setFormError("");
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl });
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    clearErrors();

    // Client-side sanity check before hitting the server
    if (!email) { setEmailError("Email is required"); return; }
    if (!password) { setPasswordError("Password is required"); return; }

    setLoading(true);

    try {
      // Pre-flight: rate limit + unverified email detection
      const preflight = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!preflight.ok) {
        const data = await preflight.json().catch(() => ({})) as {
          error?: string;
          code?: string;
        };

        switch (data.code) {
          case "RATE_LIMIT":
            setFormError(data.error ?? "Too many attempts. Try again later.");
            break;
          case "EMAIL_NOT_VERIFIED":
            setEmailError("Please verify your email before signing in.");
            break;
          case "INVALID_CREDENTIALS":
            // Keep both fields red but only one message to avoid leaking which is wrong
            setEmailError("Invalid email or password");
            setPasswordError(" "); // non-empty to trigger red border, no visible text
            break;
          case "VALIDATION_ERROR":
            setFormError(data.error ?? "Please check your input.");
            break;
          default:
            setFormError("Something went wrong. Please try again.");
        }
        setLoading(false);
        return;
      }

      // Pre-flight passed — now actually sign in via NextAuth
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        // NextAuth returned an error despite pre-flight passing (edge case)
        setFormError("Sign in failed. Please try again.");
      } else {
        router.push(callbackUrl);
      }
    } catch {
      setFormError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
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

        {/* Form-level error banner */}
        {formError && (
          <div
            role="alert"
            className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[12.5px] text-rose-400"
          >
            {formError}
          </div>
        )}

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
            onChange={(e) => { setEmail(e.target.value); setEmailError(""); setFormError(""); }}
            required
            aria-invalid={!!emailError}
            aria-describedby={emailError ? "email-error" : undefined}
            className={cn(
              "h-10 bg-white/[0.04] border-white/[0.09] text-[13.5px]",
              "placeholder:text-muted-foreground/40 focus:ring-0 focus:border-primary/40",
              "transition-colors duration-150",
              emailError && "border-rose-500/60 focus:border-rose-500/60"
            )}
          />
          {emailError && emailError.trim() && (
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
              onChange={(e) => { setPassword(e.target.value); setPasswordError(""); setFormError(""); }}
              required
              aria-invalid={!!passwordError && passwordError.trim() !== ""}
              className={cn(
                "h-10 bg-white/[0.04] border-white/[0.09] text-[13.5px] pr-10",
                "placeholder:text-muted-foreground/40 focus:ring-0 focus:border-primary/40",
                "transition-colors duration-150",
                passwordError && "border-rose-500/60 focus:border-rose-500/60"
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
          {passwordError && passwordError.trim() && (
            <p role="alert" className="text-[11.5px] text-rose-400 mt-1">
              {passwordError}
            </p>
          )}
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
