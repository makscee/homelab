"use client";

import { useState } from "react";
import useSWR from "swr";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { SeverityBadge } from "./SeverityBadge";
import { LabelsCell } from "./LabelsCell";
import { StaleBanner } from "./StaleBanner";

type Severity = "critical" | "warning" | "info" | "other";

type FiringAlert = {
  alertname: string;
  severity: Severity;
  instance: string;
  summary: string;
  duration_seconds: number;
  labels: Record<string, string>;
};

type AlertsListResponse = {
  healthy: boolean;
  stale_since?: string;
  alerts: FiringAlert[];
};

type SortCol = "severity" | "alertname" | "duration";
type SortDir = "asc" | "desc";

const SEV_ORDER: Record<Severity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  other: 3,
};

const fetcher = (u: string): Promise<AlertsListResponse> =>
  fetch(u).then((r) => r.json());

function formatDuration(sec: number): string {
  if (sec < 60) return "<1m";
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function SortIcon({
  active,
  dir,
}: {
  active: boolean;
  dir: SortDir;
}) {
  if (!active)
    return <ArrowUpDown className="inline h-3 w-3 text-muted-foreground" />;
  return dir === "asc" ? (
    <ArrowUp className="inline h-3 w-3 text-primary" />
  ) : (
    <ArrowDown className="inline h-3 w-3 text-primary" />
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div aria-label="Loading alerts" className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 flex-1" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-6 flex-[2]" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-12 text-center space-y-2">
      <h2 className="text-xl font-semibold">No firing alerts</h2>
      <p className="text-sm text-muted-foreground">
        All configured alert rules are within thresholds. Prometheus is being
        polled every 15s.
      </p>
    </div>
  );
}

export function AlertsTable() {
  const { data } = useSWR<AlertsListResponse>("/api/alerts/list", fetcher, {
    refreshInterval: 15_000,
  });

  const [sortCol, setSortCol] = useState<SortCol>("duration");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function onSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir(col === "duration" ? "desc" : "asc");
    }
  }

  if (!data) return <SkeletonRows count={5} />;

  if (!data.healthy) {
    return (
      <div className="space-y-4">
        <StaleBanner since={data.stale_since} />
      </div>
    );
  }

  if (data.alerts.length === 0) return <EmptyState />;

  const sorted = [...data.alerts].sort((a, b) => {
    let cmp = 0;
    if (sortCol === "severity") {
      cmp = SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
    } else if (sortCol === "alertname") {
      cmp = a.alertname.localeCompare(b.alertname);
    } else {
      cmp = a.duration_seconds - b.duration_seconds;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">
              <button
                type="button"
                onClick={() => onSort("severity")}
                className="inline-flex items-center gap-1 text-xs font-semibold uppercase"
              >
                Severity{" "}
                <SortIcon active={sortCol === "severity"} dir={sortDir} />
              </button>
            </TableHead>
            <TableHead>
              <button
                type="button"
                onClick={() => onSort("alertname")}
                className="inline-flex items-center gap-1 text-xs font-semibold uppercase"
              >
                Alert Name{" "}
                <SortIcon active={sortCol === "alertname"} dir={sortDir} />
              </button>
            </TableHead>
            <TableHead className="w-40">Instance</TableHead>
            <TableHead>Summary</TableHead>
            <TableHead className="w-24">
              <button
                type="button"
                onClick={() => onSort("duration")}
                className="inline-flex items-center gap-1 text-xs font-semibold uppercase"
              >
                Duration{" "}
                <SortIcon active={sortCol === "duration"} dir={sortDir} />
              </button>
            </TableHead>
            <TableHead className="w-28">Labels</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((a, i) => (
            <TableRow
              key={`${a.alertname}|${a.instance}|${i}`}
              className="hover:bg-secondary/40"
            >
              <TableCell>
                <SeverityBadge severity={a.severity} />
              </TableCell>
              <TableCell>
                <code className="font-mono text-sm">{a.alertname}</code>
              </TableCell>
              <TableCell>
                <span className="text-xs text-muted-foreground font-mono">
                  {a.instance || (
                    <span className="text-muted-foreground">—</span>
                  )}
                </span>
              </TableCell>
              <TableCell>
                <span className="line-clamp-2 text-sm">
                  {a.summary || (
                    <span className="text-muted-foreground">—</span>
                  )}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-sm font-mono">
                  {formatDuration(a.duration_seconds)}
                </span>
              </TableCell>
              <TableCell>
                <LabelsCell labels={a.labels} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
