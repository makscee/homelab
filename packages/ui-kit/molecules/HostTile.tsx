import type { JSX } from "react";
import { Card, CardContent, CardHeader } from "../primitives";
import { Badge } from "../primitives";
import { cn } from "../lib/utils";

/**
 * HostTile — generic host summary card for fleet dashboards.
 *
 * Thin, consumer-agnostic contract. Richer variants (with sparklines, stale
 * indicators, load averages, etc.) belong in consumer-local components that
 * either compose HostTile or replace it entirely. This molecule is the
 * minimum shape the kit guarantees across animaya / voidnet / homelab.
 */
export interface HostTileProps {
  hostname: string;
  tailscaleIp?: string;
  cpuPct: number;
  memPct: number;
  diskPct: number;
  containerCount?: number;
  status?: "up" | "down" | "unknown";
  className?: string;
}

function MetricRow({ label, pct }: { label: string; pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-xs text-muted-foreground">{label}</span>
      <div
        role="progressbar"
        aria-label={`${label}: ${clamped.toFixed(0)}%`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        className="h-2 flex-1 overflow-hidden rounded bg-muted"
      >
        <div
          className={cn(
            "h-full",
            clamped >= 90
              ? "bg-destructive"
              : clamped >= 75
                ? "bg-amber-500"
                : "bg-primary",
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="w-10 text-right text-xs tabular-nums">
        {clamped.toFixed(0)}%
      </span>
    </div>
  );
}

export function HostTile(props: HostTileProps): JSX.Element {
  const {
    hostname,
    tailscaleIp,
    cpuPct,
    memPct,
    diskPct,
    containerCount,
    status = "unknown",
    className,
  } = props;

  const statusVariant =
    status === "up"
      ? "default"
      : status === "down"
        ? "destructive"
        : "outline";

  return (
    <Card data-host={hostname} className={cn(className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{hostname}</h2>
            {tailscaleIp ? (
              <span className="text-[10px] font-mono text-muted-foreground">
                {tailscaleIp}
              </span>
            ) : null}
          </div>
          <Badge variant={statusVariant} className="text-[10px] font-normal">
            {status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <MetricRow label="CPU" pct={cpuPct} />
        <MetricRow label="Memory" pct={memPct} />
        <MetricRow label="Disk" pct={diskPct} />
        {typeof containerCount === "number" ? (
          <div className="pt-1 text-xs">
            <span className="text-muted-foreground">Containers: </span>
            <span className="tabular-nums">{containerCount}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
