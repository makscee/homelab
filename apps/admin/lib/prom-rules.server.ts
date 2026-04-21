import "server-only";

// --------------------------------------------------------------------------
// Prometheus /api/v1/rules fetcher — supplies annotations (summary,
// description) keyed by alertname. The ALERTS{} series carries only labels,
// not annotations, so we join on alertname at read time. D-01 keeps us on
// Prometheus (no Alertmanager client in this phase).
// --------------------------------------------------------------------------

const PROM_BASE = process.env.PROMETHEUS_URL ?? "http://docker-tower:9090";

export type RuleAnnotation = { summary: string; description: string };

// --------------------------------------------------------------------------
// Dependency injection for tests — mirror alerts-count.server.ts DI style,
// avoiding `mock.module` bleed-through.
// --------------------------------------------------------------------------

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;
let fetchImpl: FetchImpl | null = null;

/** Test-only: swap the fetch surface. Pass null to restore. */
export function _setFetchImplForTest(impl: FetchImpl | null): void {
  fetchImpl = impl;
}

function doFetch(url: string, init?: RequestInit): Promise<Response> {
  return (fetchImpl ?? (globalThis.fetch as FetchImpl))(url, init);
}

// --------------------------------------------------------------------------
// Response types
// --------------------------------------------------------------------------

type RulesResponse = {
  status: string;
  data?: {
    groups?: Array<{
      rules?: Array<{
        type?: string;
        name?: string;
        annotations?: Record<string, string>;
      }>;
    }>;
  };
};

/**
 * Fetch `${PROMETHEUS_URL}/api/v1/rules` and index alerting-rule annotations
 * by alertname. Non-fatal: returns an empty Map on any error so that
 * listFiringAlerts() can still degrade to healthy:true with empty summaries.
 */
export async function fetchRuleAnnotations(): Promise<
  Map<string, RuleAnnotation>
> {
  const out = new Map<string, RuleAnnotation>();
  try {
    const resp = await doFetch(`${PROM_BASE}/api/v1/rules`, {
      cache: "no-store",
    });
    if (!resp.ok) return out;
    const body = (await resp.json()) as RulesResponse;
    if (body.status !== "success" || !body.data?.groups) return out;
    for (const g of body.data.groups) {
      for (const r of g.rules ?? []) {
        if (r.type !== "alerting" || !r.name) continue;
        out.set(r.name, {
          summary: r.annotations?.summary ?? "",
          description: r.annotations?.description ?? "",
        });
      }
    }
  } catch {
    // Non-fatal — caller treats empty map as healthy.
  }
  return out;
}
