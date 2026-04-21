import "server-only";

import {
  queryInstant as realQueryInstant,
  type PromInstantResult,
} from "@/lib/prometheus.server";
import { fetchRuleAnnotations } from "@/lib/prom-rules.server";

// --------------------------------------------------------------------------
// Dependency injection for tests — avoids `mock.module` bleed-through.
// --------------------------------------------------------------------------

type QueryInstantImpl = (promql: string) => Promise<PromInstantResult>;
let queryInstantImpl: QueryInstantImpl | null = null;

/** Test-only: swap the queryInstant surface. Pass null to restore. */
export function _setQueryInstantForTest(impl: QueryInstantImpl | null): void {
  queryInstantImpl = impl;
}

function queryInstant(promql: string): Promise<PromInstantResult> {
  return (queryInstantImpl ?? realQueryInstant)(promql);
}

// --------------------------------------------------------------------------
// Public types
// --------------------------------------------------------------------------

export type Severity = "critical" | "warning" | "info" | "other";

export type FiringAlert = {
  alertname: string;
  severity: Severity;
  instance: string;
  summary: string;
  duration_seconds: number;
  labels: Record<string, string>;
};

export type AlertsList = {
  healthy: boolean;
  stale_since?: string;
  alerts: FiringAlert[];
};

// --------------------------------------------------------------------------
// PromQL literals (must live here, not in route.ts — server-only sentinel
// placement rule).
// --------------------------------------------------------------------------

const ALERTS_Q = `ALERTS{alertstate="firing"}`;
const FOR_STATE_Q = `ALERTS_FOR_STATE`;

// --------------------------------------------------------------------------
// Deterministic label-join — identical labelsets produce identical keys
// regardless of property insertion order (Pitfall 4).
// --------------------------------------------------------------------------

function keyOf(labels: Record<string, string>): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
}

function bucketSeverity(raw: string | undefined): Severity {
  const sev = (raw ?? "").toLowerCase();
  if (sev === "critical" || sev === "warning" || sev === "info") return sev;
  return "other";
}

/**
 * List every firing alert, joining `ALERTS{alertstate="firing"}` with
 * `ALERTS_FOR_STATE` (for per-series duration) and `/api/v1/rules`
 * (for annotations.summary — labels alone don't carry annotations).
 *
 * Always-200 envelope: on any upstream failure returns
 * `{ healthy: false, stale_since, alerts: [] }` so the route handler can
 * send HTTP 200 and SWR never retry-storms (T-20-01-05).
 */
export async function listFiringAlerts(): Promise<AlertsList> {
  try {
    const [alertsSamples, forStateSamples, annotations] = await Promise.all([
      queryInstant(ALERTS_Q),
      queryInstant(FOR_STATE_Q),
      fetchRuleAnnotations(),
    ]);

    // Build start-timestamp map keyed by the full labelset.
    const startByKey = new Map<string, number>();
    for (const s of forStateSamples) {
      if (Number.isFinite(s.value)) {
        startByKey.set(keyOf(s.labels), s.value);
      }
    }

    const nowSec = Date.now() / 1000;
    const alerts: FiringAlert[] = alertsSamples.map((s) => {
      const severity = bucketSeverity(s.labels.severity);
      const alertname = s.labels.alertname ?? "";
      const instance = s.labels.instance ?? "";
      const start = startByKey.get(keyOf(s.labels)) ?? nowSec;
      const duration_seconds = Math.max(0, Math.floor(nowSec - start));
      const summary = annotations.get(alertname)?.summary ?? "";
      return {
        alertname,
        severity,
        instance,
        summary,
        duration_seconds,
        labels: s.labels,
      };
    });

    return { healthy: true, alerts };
  } catch {
    return {
      healthy: false,
      stale_since: new Date().toISOString(),
      alerts: [],
    };
  }
}
