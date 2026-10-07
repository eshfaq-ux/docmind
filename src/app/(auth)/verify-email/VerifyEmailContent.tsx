"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2, Mail } from "lucide-react";

type State = "verifying" | "success" | "error";

export default function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [state, setState] = useState<State>("verifying");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setErrorMessage("No verification token found in the link.");
      return;
    }

    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (res.ok) {
          setState("success");
          // Auto-redirect to login after 3s
          setTimeout(() => router.push("/login"), 3000);
        } else {
          const data = await res.json().catch(() => ({})) as { error?: string };
          setState("error");
          setErrorMessage(data.error ?? "Verification failed. Please try again.");
        }
      })
      .catch(() => {
        setState("error");
        setErrorMessage("Network error. Please check your connection and try again.");
      });
  }, [token, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">

        {/* Card */}
        <div className="glass rounded-2xl p-8 space-y-6 text-center">

          {state === "verifying" && (
            <>
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
              </div>
              <div className="space-y-1.5">
                <h1 className="text-[18px] font-bold">Verifying your email</h1>
                <p className="text-[13px] text-muted-foreground">Just a moment…</p>
              </div>
            </>
          )}

          {state === "success" && (
            <>
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </div>
              </div>
              <div className="space-y-1.5">
                <h1 className="text-[18px] font-bold">Email verified!</h1>
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  Your account is active. Redirecting you to login…
                </p>
              </div>
              <Link
                href="/login"
                className="block w-full py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-[13.5px] font-semibold transition-colors duration-150"
              >
                Sign in now
              </Link>
            </>
          )}

          {state === "error" && (
            <>
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                  <XCircle className="w-6 h-6 text-rose-400" />
                </div>
              </div>
              <div className="space-y-1.5">
                <h1 className="text-[18px] font-bold">Verification failed</h1>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{errorMessage}</p>
              </div>
              <div className="space-y-2.5">
                <Link
                  href="/register"
                  className="block w-full py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-[13.5px] font-semibold transition-colors duration-150"
                >
                  Register again
                </Link>
                <Link
                  href="/login"
                  className="block w-full py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.09] hover:bg-white/[0.08] text-foreground text-[13.5px] font-medium transition-colors duration-150"
                >
                  Back to login
                </Link>
              </div>
            </>
          )}

        </div>

        {/* Footer note */}
        <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/40">
          <Mail className="w-3 h-3" />
          <span>Didn&apos;t receive an email? Check your spam folder.</span>
        </div>
      </div>
    </div>
  );
}
