"use client";

import { signOut, useSession } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Settings, User, HardDrive, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface TopbarProps {
  storageBytes?: number;
  storageLimitBytes?: number;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

export function Topbar({ storageBytes = 0, storageLimitBytes = 500 * 1024 * 1024 }: TopbarProps) {
  const { data: session } = useSession();
  const pct = Math.min((storageBytes / storageLimitBytes) * 100, 100);
  const isCritical = pct > 85;
  const isWarning = pct > 65 && !isCritical;

  const initials = session?.user?.name
    ?.split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() ?? "U";

  return (
    <header
      className="fixed top-0 left-[220px] right-0 h-14 flex items-center px-5 gap-4 z-10 border-b border-white/[0.06]"
      style={{ background: "rgba(6,11,24,0.88)", backdropFilter: "blur(24px)" }}
    >
      {/* Storage indicator */}
      <div className="flex items-center gap-2.5 shrink-0">
        <HardDrive className={cn("w-3.5 h-3.5 shrink-0", isCritical ? "text-rose-400" : isWarning ? "text-amber-400" : "text-muted-foreground/50")} />
        <div className="flex flex-col gap-0.5 min-w-[120px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground/60">Storage</span>
            <span className={cn("text-[11px] font-mono tabular-nums", isCritical ? "text-rose-400" : isWarning ? "text-amber-400" : "text-muted-foreground/60")}>
              {formatBytes(storageBytes)} <span className="opacity-40">/</span> {formatBytes(storageLimitBytes)}
            </span>
          </div>
          {/* Track */}
          <div className="h-[3px] w-full rounded-full bg-white/[0.08] overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                isCritical ? "bg-rose-400" : isWarning ? "bg-amber-400" : "bg-primary/60"
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1" />

      {/* User dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-white/[0.05] transition-colors duration-150 outline-none group">
              <Avatar className="h-7 w-7">
                <AvatarImage src={session?.user?.image ?? ""} />
                <AvatarFallback className="bg-primary/20 text-primary text-[11px] font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="text-[13px] font-medium text-foreground/80 group-hover:text-foreground max-w-[120px] truncate transition-colors">
                {session?.user?.name ?? "User"}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
            </button>
          }
        />
        <DropdownMenuContent
          align="end"
          className="w-52 glass-strong border-white/[0.12] rounded-xl p-1.5 shadow-2xl"
        >
          <div className="px-2.5 py-2 mb-1">
            <p className="text-[13px] font-semibold truncate">{session?.user?.name ?? "User"}</p>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{session?.user?.email}</p>
          </div>
          <DropdownMenuSeparator className="bg-white/[0.06] my-1" />
          <DropdownMenuItem className="rounded-lg px-2.5 py-2 text-[13px] gap-2.5 cursor-pointer hover:bg-white/[0.07] focus:bg-white/[0.07]">
            <User className="w-3.5 h-3.5 text-muted-foreground" /> Profile
          </DropdownMenuItem>
          <DropdownMenuItem className="rounded-lg px-2.5 py-2 text-[13px] gap-2.5 cursor-pointer hover:bg-white/[0.07] focus:bg-white/[0.07]">
            <Settings className="w-3.5 h-3.5 text-muted-foreground" /> Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-white/[0.06] my-1" />
          <DropdownMenuItem
            className="rounded-lg px-2.5 py-2 text-[13px] gap-2.5 cursor-pointer text-rose-400 hover:bg-rose-500/10 focus:bg-rose-500/10 hover:text-rose-400"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
