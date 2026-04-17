"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";

type Props = { samples: Array<[number, number]> };

/**
 * 96px wide, 24px tall trend line from the 7-day sparkline Prometheus range
 * query. Hover shows the raw percent for that bucket.
 *
 * Empty state renders a muted placeholder block — per UI-SPEC §Empty state
 * "exporter healthy but token just added".
 */
export function Sparkline({ samples }: Props) {
  if (samples.length === 0) {
    return (
      <div
        className="h-6 w-24 rounded bg-muted"
        aria-label="no trend data"
      />
    );
  }
  const data = samples.map(([t, v]) => ({ t, v }));
  return (
    <div className="h-6 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="v"
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          <Tooltip
            formatter={(v: number) => [`${v.toFixed(0)}%`, "7d usage"]}
            labelFormatter={(t: number) =>
              new Date(t * 1000).toLocaleDateString()
            }
            contentStyle={{
              fontSize: "11px",
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
