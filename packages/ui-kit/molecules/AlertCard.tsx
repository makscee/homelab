import type { JSX } from "react";
import { Card, CardContent, CardHeader } from "../primitives";
import { Badge } from "../primitives";
import { cn } from "../lib/utils";

/**
 * AlertCard — per-alert summary tile for alerts lists.
 *
 * Thin, consumer-agnostic contract matching Prometheus/Alertmanager firing
 * alerts. Severity → Badge variant mapping is canonical for the kit
 * (critical=destructive, warning=amber, info=secondary).
 */
export interface AlertCardProps {
  alertname: string;
  severity: "critical" | "warning" | "info";
  summary: string;
  startsAt: string; // ISO
  labels: Record<string, string>;
  className?: string;
}

function formatDurationSince(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return "<1m";
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

export function AlertCard(props: AlertCardProps): JSX.Element {
  const { alertname, severity, summary, startsAt, labels, className } = props;

  const severityClass =
    severity === "warning"
      ? "bg-amber-500 text-white hover:bg-amber-500/80"
      : undefined;
  const severityVariant =
    severity === "critical"
      ? "destructive"
      : severity === "info"
        ? "secondary"
        : "default";

  const labelEntries = Object.entries(labels).slice(0, 6);

  return (
    <Card className={cn(className)} data-alertname={alertname}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge variant={severityVariant} className={severityClass}>
              {severity}
            </Badge>
            <code className="font-mono text-sm">{alertname}</code>
          </div>
          <span
            className="text-xs font-mono text-muted-foreground"
            title={startsAt}
          >
            {formatDurationSince(startsAt)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm">{summary || "—"}</p>
        {labelEntries.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {labelEntries.map(([k, v]) => (
              <span
                key={k}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
              >
                {k}={v}
              </span>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
