"use client";

import {
  CartesianGrid,
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
          <CartesianGrid
            stroke="#3c3836"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tick={{ fill: "#928374", fontSize: 11, fontFamily: "IBM Plex Mono, ui-monospace, monospace" }}
            minTickGap={28}
            axisLine={{ stroke: "#504945" }}
            tickLine={{ stroke: "#504945" }}
          />
          <YAxis
            tick={{ fill: "#928374", fontSize: 11, fontFamily: "IBM Plex Mono, ui-monospace, monospace" }}
            axisLine={{ stroke: "#504945" }}
            tickLine={{ stroke: "#504945" }}
            domain={["auto", "auto"]}
            tickFormatter={(value) =>
              `$${Number(value).toFixed(0)}`
            }
          />
          <Tooltip
            contentStyle={{
              background: "#282828",
              border: "1px solid #504945",
              borderRadius: 4,
              color: "#ebdbb2",
              fontFamily:
                "IBM Plex Mono, ui-monospace, monospace",
              fontSize: 12
            }}
            formatter={(value) => [
              `$${Number(value).toFixed(2)}`,
              "Equity"
            ]}
          />
          <Line
            type="monotone"
            dataKey="equity"
            stroke="#8ec07c"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
