"use client";

import useSWR from "swr";

export type AlertCount = {
  total: number;
  bySeverity: {
    critical: number;
    warning: number;
    info: number;
    other: number;
  };
  healthy: boolean;
};

const fetcher = async (url: string): Promise<AlertCount> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as AlertCount;
};

const FALLBACK: AlertCount = {
  total: 0,
  bySeverity: { critical: 0, warning: 0, info: 0, other: 0 },
  healthy: true,
};

/**
 * Shared SWR hook consumed by BOTH NavAlertBadge and AlertsCard. SWR dedupes
 * by cache key so there is a single in-flight fetch at any time, and both
 * consumers re-render on the same payload.
 */
export function useAlertCount() {
  return useSWR<AlertCount>("/api/alerts/count", fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: false,
    fallbackData: FALLBACK,
  });
}
