"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface ConfidenceDistribution {
  high: number;
  medium: number;
  low: number;
  none: number;
}

interface ConfidencePieProps {
  data: ConfidenceDistribution;
}

const COLORS: Record<string, string> = {
  high:   "#22C55E",
  medium: "#F59E0B",
  low:    "#F97316",
  none:   "#EF4444",
};

const LABELS: Record<string, string> = {
  high:   "High",
  medium: "Medium",
  low:    "Low",
  none:   "No context",
};

interface TooltipProps { active?: boolean; payload?: { name: string; value: number }[] }
const CustomTooltip = ({ active, payload }: TooltipProps) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="glass border-white/10 rounded-lg px-3 py-2 text-xs">
      <p className="font-medium" style={{ color: COLORS[name] }}>
        {LABELS[name]} confidence
      </p>
      <p className="text-muted-foreground">{value} messages</p>
    </div>
  );
};

export function ConfidencePie({ data }: ConfidencePieProps) {
  const chartData = Object.entries(data)
    .map(([key, value]) => ({ name: key, value }))
    .filter((d) => d.value > 0);

  const total = Object.values(data).reduce((s, v) => s + v, 0);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        No messages yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="45%"
          innerRadius={56}
          outerRadius={80}
          paddingAngle={3}
          dataKey="value"
        >
          {chartData.map((entry) => (
            <Cell key={entry.name} fill={COLORS[entry.name]} opacity={0.85} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value) => (
            <span className="text-xs text-muted-foreground">{LABELS[value]}</span>
          )}
          iconSize={8}
          iconType="circle"
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
