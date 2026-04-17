"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

type Props = {
  /** bytes-per-second samples from the 15-minute net-rx range query. */
  data: number[];
  /** Accessibility label describing what the sparkline represents. */
  ariaLabel?: string;
};

/**
 * Full-width, `h-10` trend line for the host tile's network-receive
 * sparkline. Renders a muted placeholder when the exporter hasn't posted
 * samples yet (e.g. host just booted) so the tile layout stays stable.
 */
export function Sparkline({ data, ariaLabel = "net rx 15m" }: Props) {
  if (!data || data.length === 0) {
    return (
      <div
        className="h-10 w-full rounded bg-muted/40"
        aria-label={`${ariaLabel}: no data`}
      />
    );
  }
  const series = data.map((v, i) => ({ i, v }));
  return (
    <div className="h-10 w-full" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series}>
          <Line
            type="monotone"
            dataKey="v"
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
