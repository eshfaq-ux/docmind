"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Shield, Bell, Trash2, KeyRound, AlertTriangle,
  Eye, EyeOff, Check, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

function SectionHeader({ icon: Icon, title, description }: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-muted-foreground/70" />
      </div>
      <div>
        <h2 className="text-[14px] font-semibold">{title}</h2>
        <p className="text-[12px] text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { data: session } = useSession();

  // Password change state
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  // Danger zone
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const isGoogleUser = !session?.user || !(session.user as { hasPassword?: boolean }).hasPassword;

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) { toast.error("New passwords don't match"); return; }
    if (newPw.length < 8) { toast.error("Password must be at least 8 characters"); return; }

    setSavingPw(true);
    try {
      const res = await fetch("/api/profile/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to change password");
      }
      toast.success("Password changed successfully");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingPw(false);
    }
  }

  async function deleteAccount() {
    if (deleteConfirm !== session?.user?.email) {
      toast.error("Email doesn't match");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/profile", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete account");
      toast.success("Account deleted");
      await signOut({ callbackUrl: "/login" });
    } catch (err) {
      toast.error((err as Error).message);
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-10 animate-fade-up">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account preferences and security
        </p>
      </div>

      {/* Password / Security */}
      <section className="glass rounded-2xl p-6">
        <SectionHeader
          icon={KeyRound}
          title="Password"
          description="Change your account password"
        />

        {isGoogleUser ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.07]">
            <Shield className="w-4 h-4 text-muted-foreground/50 shrink-0" />
            <p className="text-[13px] text-muted-foreground">
              You signed in with Google. Password authentication is not available for your account.
            </p>
          </div>
        ) : (
          <form onSubmit={changePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[12px] text-muted-foreground">Current password</Label>
              <div className="relative">
                <Input
                  type={showCurrentPw ? "text" : "password"}
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="h-9 bg-white/[0.04] border-white/[0.09] text-[13px] pr-10 focus:border-primary/40 focus:ring-0"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                  aria-label={showCurrentPw ? "Hide" : "Show"}
                >
                  {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px] text-muted-foreground">New password</Label>
              <div className="relative">
                <Input
                  type={showNewPw ? "text" : "password"}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="h-9 bg-white/[0.04] border-white/[0.09] text-[13px] pr-10 focus:border-primary/40 focus:ring-0"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                  aria-label={showNewPw ? "Hide" : "Show"}
                >
                  {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px] text-muted-foreground">Confirm new password</Label>
              <div className="relative">
                <Input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  autoComplete="new-password"
                  required
                  className={cn(
                    "h-9 bg-white/[0.04] border-white/[0.09] text-[13px] focus:ring-0",
                    confirmPw && newPw === confirmPw
                      ? "border-emerald-500/30 focus:border-emerald-500/50"
                      : confirmPw
                      ? "border-rose-500/30 focus:border-rose-500/50"
                      : "focus:border-primary/40"
                  )}
                />
                {confirmPw && newPw === confirmPw && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                )}
              </div>
            </div>

            <Button
              type="submit"
              disabled={savingPw || !currentPw || !newPw || !confirmPw}
              className="bg-primary hover:bg-primary/90 h-9 text-[13px] px-5 disabled:opacity-40"
            >
              {savingPw ? "Saving…" : "Change password"}
            </Button>
          </form>
        )}
      </section>

      {/* Notifications placeholder */}
      <section className="glass rounded-2xl p-6">
        <SectionHeader
          icon={Bell}
          title="Notifications"
          description="Control how DocMind communicates with you"
        />
        <div className="space-y-3">
          {[
            { label: "Email on document ready", sub: "When ingestion completes", enabled: true },
            { label: "Email on eval complete", sub: "When an eval run finishes", enabled: false },
            { label: "Weekly usage summary", sub: "Token usage digest every Monday", enabled: false },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-2.5 border-b border-white/[0.05] last:border-0">
              <div>
                <p className="text-[13px] font-medium">{item.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{item.sub}</p>
              </div>
              <button
                className={cn(
                  "relative w-9 h-5 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                  item.enabled ? "bg-primary/70" : "bg-white/[0.12]"
                )}
                role="switch"
                aria-checked={item.enabled}
                onClick={() => toast.info("Notification preferences coming soon")}
              >
                <span className={cn(
                  "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200",
                  item.enabled ? "translate-x-4" : "translate-x-0.5"
                )} />
              </button>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground/40 mt-3">
          Email notifications require RESEND_API_KEY to be configured.
        </p>
      </section>

      {/* Danger zone */}
      <section className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.03] p-6">
        <SectionHeader
          icon={AlertTriangle}
          title="Danger Zone"
          description="Permanent actions that cannot be undone"
        />

        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-black/20 border border-rose-500/15 space-y-3">
            <div>
              <p className="text-[13px] font-semibold text-rose-400">Delete account</p>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                Permanently deletes your account, all knowledge bases, documents, and conversation history. This cannot be undone.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] text-muted-foreground">
                Type your email <span className="text-foreground/70 font-mono">{session?.user?.email}</span> to confirm
              </Label>
              <Input
                type="email"
                placeholder={session?.user?.email ?? ""}
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                className="h-9 bg-white/[0.04] border-rose-500/20 text-[13px] focus:border-rose-500/40 focus:ring-0"
              />
            </div>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteConfirm !== session?.user?.email || deleting}
              onClick={deleteAccount}
              className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 h-8 text-[12px] disabled:opacity-30 gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deleting ? "Deleting…" : "Delete my account"}
            </Button>
          </div>
        </div>
      </section>

    </div>
  );
}
