import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { thresholdClass } from "@/app/(auth)/tokens/_lib/view-model";
import type { HostRow } from "@/app/(auth)/_lib/overview-view-model";
import { StaleDot } from "./StaleDot";
import { Sparkline } from "./Sparkline";

type Props = { row: HostRow };

// -------------------------------------------------------------------------
// Formatting helpers (pure, exported for tests)
// -------------------------------------------------------------------------

export function formatUptime(seconds: number | null): string {
  if (seconds == null || Number.isNaN(seconds) || seconds < 0) return "—";
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  if (total >= 86400) return `${days}d ${hours}h`;
  return `${hours}h ${mins}m`;
}

export function formatLoad(v: number | null): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(2);
}

function fillClass(pct: number): string {
  const cls = thresholdClass(pct);
  return cls === "critical"
    ? "bg-destructive"
    : cls === "warn"
      ? "bg-amber-500"
      : "bg-primary";
}

// -------------------------------------------------------------------------
// Metric bar
// -------------------------------------------------------------------------

function MetricBar({
  label,
  value,
}: {
  label: "CPU" | "Memory" | "Disk";
  value: number | null;
}) {
  if (value == null) {
    return (
      <div className="flex items-center gap-3">
        <span className="w-16 text-xs text-muted-foreground">{label}</span>
        <div
          role="progressbar"
          aria-label={`${label}: pending`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
          className="h-2 flex-1 rounded bg-muted"
        />
        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
          —
        </span>
      </div>
    );
  }
  const clamped = Math.min(100, Math.max(0, value));
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
          className={cn("h-full", fillClass(clamped))}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="w-10 text-right text-xs tabular-nums">
        {clamped.toFixed(0)}%
      </span>
    </div>
  );
}

// -------------------------------------------------------------------------
// HostCard
// -------------------------------------------------------------------------

/**
 * Single host tile. Pure RSC — no hooks, no state; the parent HostGrid owns
 * the SWR refresh loop and re-renders the card with new `row` props on each
 * poll.
 */
export function HostCard({ row }: Props) {
  return (
    <Card data-host={row.name}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{row.name}</h2>
            <StaleDot level={row.stale} />
          </div>
          <Badge variant="outline" className="text-[10px] font-normal">
            {row.role}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <MetricBar label="CPU" value={row.cpuPct} />
        <MetricBar label="Memory" value={row.memPct} />
        <MetricBar label="Disk" value={row.diskPct} />

        <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
          <div>
            <div className="text-muted-foreground">Uptime</div>
            <div className="tabular-nums">{formatUptime(row.uptimeSeconds)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Load</div>
            <div className="tabular-nums">
              {formatLoad(row.load1)} / {formatLoad(row.load5)} /{" "}
              {formatLoad(row.load15)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Containers</div>
            <div
              className="tabular-nums"
              title={
                row.containerCount === null
                  ? "cAdvisor not provisioned on this host"
                  : undefined
              }
            >
              {row.containerCount === null ? "—" : row.containerCount}
            </div>
          </div>
        </div>

        <Sparkline
          data={row.netRx15m}
          ariaLabel={`${row.name} net rx 15m`}
        />
      </CardContent>
    </Card>
  );
}
