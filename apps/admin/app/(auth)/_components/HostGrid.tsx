"use client";

import useSWR from "swr";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { HostCard } from "./HostCard";
import type { OverviewResponse } from "@/app/(auth)/_lib/overview-view-model";

const fetcher = async (url: string): Promise<OverviewResponse> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as OverviewResponse;
};

export function HostGrid({ initial }: { initial: OverviewResponse }) {
  const { data, error } = useSWR<OverviewResponse>("/api/overview", fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: false,
    fallbackData: initial,
  });
  const payload = data ?? initial;
  const outage = Boolean(error) || payload.prometheusHealthy === false;
  return (
    <>
      {outage && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Prometheus unreachable</AlertTitle>
          <AlertDescription>
            Showing the last known values. Live data resumes when the exporter
            comes back.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {payload.hosts.map((h) => (
          <HostCard key={h.name} row={h} />
        ))}
      </div>
    </>
  );
}
