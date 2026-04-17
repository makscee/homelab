"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

type Props = { samples: Array<[number, number]> };

/**
 * 7-day utilization line chart with 80% (warn) and 95% (critical) dashed
 * reference lines per UI-SPEC §Detail page.
 *
 * When no range data is available we render the UI-SPEC empty-state
 * caption `No range data yet. Check exporter health.`
 */
export function DetailChart({ samples }: Props) {
  if (samples.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center rounded border bg-muted/30 text-sm text-muted-foreground">
        No range data yet. Check exporter health.
      </div>
    );
  }

  const data = samples.map(([t, v]) => ({
    t: new Date(t * 1000).toISOString(),
    v,
  }));

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 16, right: 24, left: 8, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="t"
            tickFormatter={(t: unknown) =>
              typeof t === "string"
                ? new Date(t).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                : ""
            }
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v: unknown) =>
              typeof v === "number" ? `${v}%` : ""
            }
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
          />
          <Tooltip
            formatter={(v: unknown) => {
              const num = typeof v === "number" ? v : 0;
              return [`${num.toFixed(1)}%`, "7d usage"];
            }}
            labelFormatter={(t: unknown) =>
              typeof t === "string" ? new Date(t).toLocaleString() : ""
            }
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              fontSize: "12px",
            }}
          />
          <ReferenceLine
            y={80}
            stroke="hsl(38 92% 50%)"
            strokeDasharray="4 4"
          />
          <ReferenceLine
            y={95}
            stroke="hsl(var(--destructive))"
            strokeDasharray="4 4"
          />
          <Line
            type="monotone"
            dataKey="v"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="hsl(var(--primary))"
            fillOpacity={0.1}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
