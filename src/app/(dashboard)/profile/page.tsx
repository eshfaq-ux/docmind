"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { User, Mail, Shield, Calendar, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const user = session?.user;

  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() ?? "U";

  function startEdit() {
    setName(user?.name ?? "");
    setEditingName(true);
  }

  function cancelEdit() {
    setEditingName(false);
    setName("");
  }

  async function saveName() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to update name");
      }
      toast.success("Name updated");
      setEditingName(false);
      // Refresh session data
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="max-w-2xl space-y-6 animate-fade-up">
        <Skeleton className="h-8 w-40 bg-white/5" />
        <div className="glass rounded-2xl p-6 space-y-5">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full bg-white/5 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8 animate-fade-up">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your account information
        </p>
      </div>

      {/* Avatar + identity */}
      <div className="glass rounded-2xl p-6 space-y-6">
        <div className="flex items-center gap-5">
          <div className="relative">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user?.image ?? ""} />
              <AvatarFallback className="bg-primary/20 text-primary text-xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
          </div>
          <div>
            <p className="text-lg font-semibold">{user?.name ?? "—"}</p>
            <p className="text-[13px] text-muted-foreground">{user?.email}</p>
            <span className="inline-flex items-center gap-1 mt-1 text-[11px] px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary/80 font-medium">
              <Shield className="w-2.5 h-2.5" />
              {(user as { role?: string })?.role ?? "admin"}
            </span>
          </div>
        </div>
      </div>

      {/* Account details */}
      <div className="glass rounded-2xl divide-y divide-white/[0.06]">

        {/* Display name */}
        <div className="flex items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <User className="w-4 h-4 text-muted-foreground/50 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider font-medium mb-0.5">Display name</p>
              {editingName ? (
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") cancelEdit(); }}
                    autoFocus
                    className="h-8 text-sm bg-white/[0.05] border-white/[0.12] focus:border-primary/40 focus:ring-0 w-48"
                  />
                  <button
                    onClick={saveName}
                    disabled={saving || !name.trim()}
                    className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-40"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <p className="text-[14px] font-medium">{user?.name ?? "—"}</p>
              )}
            </div>
          </div>
          {!editingName && (
            <button
              onClick={startEdit}
              className="shrink-0 flex items-center gap-1.5 text-[12px] text-muted-foreground/50 hover:text-muted-foreground transition-colors duration-150"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
          )}
        </div>

        {/* Email */}
        <div className="flex items-center gap-3 px-6 py-4">
          <Mail className="w-4 h-4 text-muted-foreground/50 shrink-0" />
          <div>
            <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider font-medium mb-0.5">Email address</p>
            <div className="flex items-center gap-2">
              <p className="text-[14px] font-medium">{user?.email}</p>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                verified
              </span>
            </div>
          </div>
        </div>

        {/* Role */}
        <div className="flex items-center gap-3 px-6 py-4">
          <Shield className="w-4 h-4 text-muted-foreground/50 shrink-0" />
          <div>
            <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider font-medium mb-0.5">Role</p>
            <p className="text-[14px] font-medium capitalize">{(user as { role?: string })?.role ?? "admin"}</p>
          </div>
        </div>

        {/* User ID */}
        <div className="flex items-center gap-3 px-6 py-4">
          <Calendar className="w-4 h-4 text-muted-foreground/50 shrink-0" />
          <div>
            <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider font-medium mb-0.5">User ID</p>
            <p className="text-[13px] font-mono text-muted-foreground">{user?.id ?? "—"}</p>
          </div>
        </div>
      </div>

    </div>
  );
}
