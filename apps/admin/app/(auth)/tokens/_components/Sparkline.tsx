"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";

type Props = {
  samples: Array<[number, number]>;
  tooltipLabel?: string;
  /** "date" = toLocaleDateString (default, 7d), "time" = toLocaleTimeString (5h). */
  labelFormat?: "date" | "time";
};

/**
 * 96px wide, 24px tall trend line from the 7-day sparkline Prometheus range
 * query. Hover shows the raw percent for that bucket.
 *
 * Empty state renders a muted placeholder block — per UI-SPEC §Empty state
 * "exporter healthy but token just added".
 */
export function Sparkline({
  samples,
  tooltipLabel = "7d usage",
  labelFormat = "date",
}: Props) {
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
            formatter={(v) => [
              `${typeof v === "number" ? v.toFixed(0) : v}%`,
              tooltipLabel,
            ]}
            labelFormatter={(t) =>
              typeof t === "number"
                ? labelFormat === "time"
                  ? new Date(t * 1000).toLocaleTimeString()
                  : new Date(t * 1000).toLocaleDateString()
                : String(t)
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
