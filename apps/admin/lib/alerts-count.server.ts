import "server-only";

import {
  queryInstant as realQueryInstant,
  type PromInstantResult,
} from "@/lib/prometheus.server";

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

// --------------------------------------------------------------------------
// PromQL source (D-11)
//
// When Phase 17 ships an Alertmanager consumer, swap the implementation of
// `getAlertCount` to read from `alertmanager.server.ts` — the AlertCount
// response shape MUST NOT change (T-14-05-04). This contract is what lets
// the UI (NavAlertBadge + AlertsCard) keep the same hook wired to the same
// endpoint across the Phase 17 swap.
// --------------------------------------------------------------------------

const QUERY = `count by(severity)(ALERTS{alertstate="firing"})`;

/**
 * Aggregate firing-alert counts by severity. Returns zeros with
 * `healthy: true` when Prometheus is reachable but ALERTS{} is empty (the
 * expected pre-Phase 17 state: rules not yet loaded). Returns zeros with
 * `healthy: false` when Prometheus itself is unreachable — callers (the
 * route handler) still send HTTP 200 so SWR does NOT retry-storm
 * (T-14-05-03).
 *
 * Unknown severity labels (e.g. `debug`) are counted under `other` rather
 * than rendered as raw label strings — this defends against XSS via a
 * malicious `severity` label (T-14-05-06).
 */
export async function getAlertCount(): Promise<AlertCount> {
  const bySeverity = { critical: 0, warning: 0, info: 0, other: 0 };
  let healthy = true;
  try {
    const samples = await queryInstant(QUERY);
    for (const s of samples) {
      const sev = (s.labels.severity ?? "").toLowerCase();
      const n = Number(s.value);
      if (!Number.isFinite(n)) continue;
      if (sev === "critical") bySeverity.critical += n;
      else if (sev === "warning") bySeverity.warning += n;
      else if (sev === "info") bySeverity.info += n;
      else bySeverity.other += n;
    }
  } catch {
    healthy = false;
  }
  const total =
    bySeverity.critical +
    bySeverity.warning +
    bySeverity.info +
    bySeverity.other;
  return { total, bySeverity, healthy };
}
