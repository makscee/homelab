"use client";

import Link from "next/link";
import useSWR from "swr";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  humanizeResetSeconds,
  thresholdClass,
} from "@/app/(auth)/tokens/_lib/view-model";
import { Sparkline } from "@/app/(auth)/tokens/_components/Sparkline";
import type {
  ClaudeUsageEntry,
  OverviewResponse,
} from "@/app/(auth)/_lib/overview-view-model";

// --------------------------------------------------------------------------
// Pure helpers (exported for tests)
// --------------------------------------------------------------------------

/**
 * Tailwind class for a utilization bar fill, driven by the shared
 * Phase-13 thresholdClass(). Input is a ratio in [0, 1+].
 */
export function fillClassForRatio(ratio: number): string {
  const cls = thresholdClass(ratio);
  return cls === "critical"
    ? "bg-destructive"
    : cls === "warn"
      ? "bg-amber-500"
      : "bg-primary";
}

/** Format a ratio in [0, 1+] as an integer percentage string, e.g. "85%". */
export function formatRatioPct(ratio: number): string {
  const clamped = Math.min(1.5, Math.max(0, ratio));
  return `${Math.round(clamped * 100)}%`;
}

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

const fetcher = async (url: string): Promise<OverviewResponse> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as OverviewResponse;
};

function UsageRow({
  label,
  ratio,
  resetSeconds,
  sparkline,
  sparkFormat,
}: {
  label: "5h usage" | "7d usage";
  ratio: number | null;
  resetSeconds: number | null;
  sparkline: Array<[number, number]>;
  sparkFormat: "time" | "date";
}) {
  const pending = ratio === null;
  const pct = pending ? 0 : Math.min(100, Math.max(0, ratio * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          resets in {humanizeResetSeconds(resetSeconds)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-label={pending ? `${label}: pending` : `${label}: ${Math.round(pct)}%`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          className="h-2 flex-1 overflow-hidden rounded bg-muted"
        >
          {!pending && (
            <div
              className={cn("h-full", fillClassForRatio(ratio!))}
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
        <span className="w-10 text-right text-xs tabular-nums">
          {pending ? "—" : `${Math.round(pct)}%`}
        </span>
        <Sparkline
          samples={sparkline}
          tooltipLabel={label}
          labelFormat={sparkFormat}
        />
      </div>
    </div>
  );
}

export function ClaudeSummaryCard({ entry }: { entry: ClaudeUsageEntry }) {
  const waiting = entry.session === null && entry.weekly === null;
  return (
    <Link
      href={`/tokens/${encodeURIComponent(entry.label)}`}
      className="block focus:outline-hidden focus:ring-2 focus:ring-ring rounded-lg"
      data-token-label={entry.label}
    >
      <Card className="transition-colors hover:bg-accent/40">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{entry.label}</h3>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {waiting ? (
            <p className="text-xs text-muted-foreground">
              Waiting for first poll (up to 5 min)
            </p>
          ) : (
            <>
              <UsageRow
                label="5h usage"
                ratio={entry.session}
                resetSeconds={entry.resetSeconds5h}
                sparkline={entry.sparkline5h}
                sparkFormat="time"
              />
              <UsageRow
                label="7d usage"
                ratio={entry.weekly}
                resetSeconds={entry.resetSeconds7d}
                sparkline={entry.sparkline7d}
                sparkFormat="date"
              />
            </>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export function ClaudeSummary({ initial }: { initial: OverviewResponse }) {
  const { data } = useSWR<OverviewResponse>("/api/overview", fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: false,
    fallbackData: initial,
  });
  const entries = (data ?? initial).claude ?? [];

  return (
    <section className="mb-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Claude Code usage
        </h2>
        <Link
          href="/tokens"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Manage tokens →
        </Link>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No Claude tokens registered.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {entries.map((e) => (
            <ClaudeSummaryCard key={e.label} entry={e} />
          ))}
        </div>
      )}
    </section>
  );
}
