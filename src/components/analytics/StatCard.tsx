import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: "up" | "down" | "flat";
  trendLabel?: string;
  trendValue?: number; // percentage delta
  className?: string;
  accent?: boolean;
}

export function StatCard({
  label,
  value,
  sub,
  trend,
  trendLabel,
  trendValue,
  className,
  accent = false,
}: StatCardProps) {
  const trendColor =
    trend === "up" ? "text-emerald-400" :
    trend === "down" ? "text-rose-400" :
    "text-muted-foreground/60";

  return (
    <div
      className={cn(
        "rounded-2xl px-5 py-4 border transition-all duration-200",
        accent
          ? "bg-primary/[0.08] border-primary/20 hover:border-primary/30"
          : "bg-white/[0.025] border-white/[0.07] hover:border-white/[0.12]",
        className
      )}
    >
      {/* Label */}
      <p className="label-xs mb-2">{label}</p>

      {/* Value */}
      <p className={cn(
        "text-[26px] font-bold tabular-nums leading-none font-heading",
        accent && "text-primary"
      )}>
        {value}
      </p>

      {/* Sub + Trend row */}
      <div className="flex items-center justify-between mt-2 gap-2">
        {sub && (
          <p className="text-[11px] text-muted-foreground/60 truncate">{sub}</p>
        )}
        {trend && trendLabel && (
          <span className={cn("flex items-center gap-0.5 text-[11px] font-medium shrink-0 ml-auto", trendColor)}>
            {trend === "up"   && <TrendingUp   className="w-3 h-3" aria-hidden="true" />}
            {trend === "down" && <TrendingDown className="w-3 h-3" aria-hidden="true" />}
            {trend === "flat" && <Minus        className="w-3 h-3" aria-hidden="true" />}
            <span aria-label={`${trend === "up" ? "Up" : trend === "down" ? "Down" : "No change"} ${trendLabel}`}>
              {trendValue != null ? `${trendValue > 0 ? "+" : ""}${trendValue}%` : trendLabel}
            </span>
          </span>
        )}
      </div>

      {/* Progress fill bar for accent cards */}
      {accent && typeof value === "string" && value.includes("%") && (
        <div className="mt-3 h-[3px] rounded-full bg-white/[0.08] overflow-hidden">
          <div
            className="h-full rounded-full bg-primary/60 transition-all duration-700"
            style={{ width: value }}
          />
        </div>
      )}
    </div>
  );
}
