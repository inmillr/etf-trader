"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

interface EquityChartProps {
  data: Array<{
    date: string;
    equity: number;
  }>;
}

export function EquityChart({
  data
}: EquityChartProps) {
  if (data.length === 0) {
    return (
      <p className="muted">
        No equity data for this range.
      </p>
    );
  }

  const sampled =
    data.length > 120
      ? data.filter(
          (_, index) =>
            index %
              Math.ceil(
                data.length / 120
              ) ===
              0 ||
            index === data.length - 1
        )
      : data;

  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={sampled}>
          <XAxis
            dataKey="date"
            tick={{ fill: "#8b9bb4", fontSize: 11 }}
            minTickGap={28}
          />
          <YAxis
            tick={{ fill: "#8b9bb4", fontSize: 11 }}
            domain={["auto", "auto"]}
            tickFormatter={(value) =>
              `$${Number(value).toFixed(0)}`
            }
          />
          <Tooltip
            contentStyle={{
              background: "#121821",
              border: "1px solid #243044",
              borderRadius: 8
            }}
            formatter={(value) => [
              `$${Number(value).toFixed(2)}`,
              "Equity"
            ]}
          />
          <Line
            type="monotone"
            dataKey="equity"
            stroke="#4da3ff"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
