"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DailyRow {
  date: string;
  totalTokens: number;
  costUsd: string;
  chatCount: number;
}

interface TokenChartProps {
  data: DailyRow[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass border-white/10 rounded-lg px-3 py-2 text-xs space-y-1">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-primary">{payload[0]?.value?.toLocaleString()} tokens</p>
      <p className="text-accent">{payload[1]?.value} chats</p>
    </div>
  );
};

export function TokenChart({ data }: TokenChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        No usage data for this period
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="tokensGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="chatsGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "#94A3B8" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => v.slice(5)} // MM-DD
        />
        <YAxis
          yAxisId="tokens"
          tick={{ fontSize: 10, fill: "#94A3B8" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
          width={36}
        />
        <YAxis
          yAxisId="chats"
          orientation="right"
          tick={{ fontSize: 10, fill: "#94A3B8" }}
          tickLine={false}
          axisLine={false}
          width={28}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          yAxisId="tokens"
          type="monotone"
          dataKey="totalTokens"
          stroke="#6366F1"
          strokeWidth={2}
          fill="url(#tokensGrad)"
          dot={false}
          name="Tokens"
        />
        <Area
          yAxisId="chats"
          type="monotone"
          dataKey="chatCount"
          stroke="#06B6D4"
          strokeWidth={2}
          fill="url(#chatsGrad)"
          dot={false}
          name="Chats"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
