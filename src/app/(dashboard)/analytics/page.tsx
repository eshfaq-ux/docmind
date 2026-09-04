"use client";

import { useState, useEffect } from "react";
import { StatCard } from "@/components/analytics/StatCard";
import { TokenChart } from "@/components/analytics/TokenChart";
import { ConfidencePie } from "@/components/analytics/ConfidencePie";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BarChart3 } from "lucide-react";

interface UsageData {
  totals: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: string;
    chatCount: number;
    embedCount: number;
  };
  daily: { date: string; totalTokens: number; costUsd: string; chatCount: number }[];
  byModel: { model: string; totalTokens: number; costUsd: string; count: number }[];
  confidence: { high: number; medium: number; low: number; none: number };
}

const PERIODS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function AnalyticsPage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/usage?days=${days}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load usage data");
        return r.json();
      })
      .then(setData)
      .catch(() => toast.error("Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <div className="max-w-6xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Token usage, cost, and answer quality metrics
          </p>
        </div>
        <div className="flex gap-1 p-1 glass border-white/10 rounded-lg">
          {PERIODS.map(({ label, days: d }) => (
            <Button
              key={d}
              variant="ghost"
              size="sm"
              className={`text-xs px-3 h-7 ${
                days === d
                  ? "bg-primary/20 text-primary hover:bg-primary/30"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setDays(d)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Stat row */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl bg-white/5" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Tokens"
            value={fmtTokens(data.totals.totalTokens)}
            sub={`${fmtTokens(data.totals.promptTokens)} prompt · ${fmtTokens(data.totals.completionTokens)} completion`}
            accent
          />
          <StatCard
            label="Est. Cost"
            value={`$${Number(data.totals.costUsd).toFixed(4)}`}
            sub={`${days}-day total`}
          />
          <StatCard
            label="Chat Messages"
            value={data.totals.chatCount.toLocaleString()}
            sub="user + assistant turns"
          />
          <StatCard
            label="High Confidence"
            value={
              data.totals.chatCount > 0
                ? `${Math.round((data.confidence.high / (data.totals.chatCount || 1)) * 100)}%`
                : "—"
            }
            sub="answers with high confidence"
          />
        </div>
      ) : null}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="glass border-white/10 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Token Usage Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-52 w-full bg-white/5 rounded-lg" />
            ) : (
              <TokenChart data={data?.daily ?? []} />
            )}
          </CardContent>
        </Card>

        <Card className="glass border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Answer Confidence</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-52 w-full bg-white/5 rounded-lg" />
            ) : (
              <ConfidencePie data={data?.confidence ?? { high: 0, medium: 0, low: 0, none: 0 }} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* By-model table */}
      {!loading && data && data.byModel.length > 0 && (
        <Card className="glass border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Usage by Model</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 pr-4 text-xs text-muted-foreground font-medium">Model</th>
                    <th className="text-right py-2 pr-4 text-xs text-muted-foreground font-medium">Calls</th>
                    <th className="text-right py-2 pr-4 text-xs text-muted-foreground font-medium">Tokens</th>
                    <th className="text-right py-2 text-xs text-muted-foreground font-medium">Cost (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byModel.map((row) => (
                    <tr key={row.model} className="border-b border-white/5 last:border-0">
                      <td className="py-2.5 pr-4 font-mono text-xs text-primary">{row.model}</td>
                      <td className="py-2.5 pr-4 text-right text-xs tabular-nums">{row.count.toLocaleString()}</td>
                      <td className="py-2.5 pr-4 text-right text-xs tabular-nums">{fmtTokens(row.totalTokens)}</td>
                      <td className="py-2.5 text-right text-xs tabular-nums">${Number(row.costUsd).toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && data && data.totals.totalTokens === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
            <BarChart3 className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No usage data yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Start chatting with a knowledge base to see analytics here
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
