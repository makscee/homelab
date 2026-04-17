import "server-only";

// --------------------------------------------------------------------------
// Config
// --------------------------------------------------------------------------

// Prometheus runs on docker-tower (100.101.0.8 via Tailnet MagicDNS). The fallback
// is only hit in local dev — production renders PROMETHEUS_URL into
// /etc/homelab-admin/env (ansible/playbooks/tasks/homelab-admin-secrets.yml).
const PROM_BASE = process.env.PROMETHEUS_URL ?? "http://docker-tower:9090";

// --------------------------------------------------------------------------
// Public types
// --------------------------------------------------------------------------

export type PromInstantSample = {
  labels: Record<string, string>;
  value: number;
  ts: number;
};

export type PromRangeSeries = {
  labels: Record<string, string>;
  samples: Array<[number, number]>; // [unixSec, value]
};

/**
 * Instant and range query results serialize back to simple JSON shapes that
 * are safe to return from Server Components or Route Handlers.
 */
export type PromInstantResult = PromInstantSample[];
export type PromRangeResult = PromRangeSeries[];

// --------------------------------------------------------------------------
// Errors
// --------------------------------------------------------------------------

export class PromQueryError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "PromQueryError";
  }
}

// --------------------------------------------------------------------------
// Internal response types
// --------------------------------------------------------------------------

type PromSuccess<T> = { status: "success"; data: T };
type PromError = { status: "error"; errorType?: string; error?: string };
type PromResp<T> = PromSuccess<T> | PromError;

type PromVectorData = {
  resultType: string;
  result: Array<{
    metric: Record<string, string>;
    value: [number, string];
  }>;
};

type PromMatrixData = {
  resultType: string;
  result: Array<{
    metric: Record<string, string>;
    values: Array<[number, string]>;
  }>;
};

// --------------------------------------------------------------------------
// Core fetch helper — never echoes promql in error messages.
// --------------------------------------------------------------------------

async function promFetch<T>(
  path: string,
  params: URLSearchParams,
  init?: RequestInit,
): Promise<T> {
  const url = `${PROM_BASE}${path}?${params.toString()}`;
  let resp: Response;
  try {
    resp = await fetch(url, { ...init });
  } catch {
    // Do NOT forward the underlying error message — it can contain hostnames,
    // stack-embedded query fragments, or upstream server detail. Generic only.
    throw new PromQueryError(0, "prometheus unreachable");
  }
  if (!resp.ok) {
    throw new PromQueryError(resp.status, `prometheus HTTP ${resp.status}`);
  }
  let body: PromResp<T>;
  try {
    body = (await resp.json()) as PromResp<T>;
  } catch {
    throw new PromQueryError(resp.status, "prometheus returned non-JSON body");
  }
  if (body.status !== "success") {
    // Include only the errorType enum, never the echoed query or raw error text.
    const errType = body.errorType ?? "unknown";
    throw new PromQueryError(200, `prometheus query error: ${errType}`);
  }
  return body.data;
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/**
 * Execute a PromQL instant query against `${PROMETHEUS_URL}/api/v1/query`.
 * Always bypasses the Next.js fetch cache (`cache: 'no-store'`) because the
 * admin dashboard is a live operator tool.
 */
export async function queryInstant(promql: string): Promise<PromInstantResult> {
  const params = new URLSearchParams({ query: promql });
  const data = await promFetch<PromVectorData>("/api/v1/query", params, {
    cache: "no-store",
  });
  return data.result.map((r) => ({
    labels: r.metric,
    value: Number(r.value[1]),
    ts: r.value[0],
  }));
}

/**
 * Execute a PromQL range query. `start`/`end` go on the wire as unix-epoch
 * seconds with fractional precision; `stepSec` is floored to an integer
 * second count (Prometheus treats sub-second steps as invalid for most uses).
 *
 * Pass `opts.revalidateSec` to opt into Next.js ISR-style caching for range
 * charts. Omit to force `cache: 'no-store'`.
 */
export async function queryRange(
  promql: string,
  start: Date,
  end: Date,
  stepSec: number,
  opts?: { revalidateSec?: number },
): Promise<PromRangeResult> {
  const params = new URLSearchParams({
    query: promql,
    start: (start.getTime() / 1000).toString(),
    end: (end.getTime() / 1000).toString(),
    step: Math.max(1, Math.floor(stepSec)).toString(),
  });
  const init: RequestInit = opts?.revalidateSec
    ? ({ next: { revalidate: opts.revalidateSec } } as RequestInit)
    : { cache: "no-store" };
  const data = await promFetch<PromMatrixData>(
    "/api/v1/query_range",
    params,
    init,
  );
  return data.result.map((r) => ({
    labels: r.metric,
    samples: r.values.map(([t, v]) => [t, Number(v)] as [number, number]),
  }));
}

// --------------------------------------------------------------------------
// Overview aggregator — shared by /api/overview Route Handler and the RSC
// page.tsx seed. Keeping both surfaces on one helper guarantees the SWR
// refresh payload matches the SSR'd first paint (T-14-04-06).
// --------------------------------------------------------------------------

/**
 * Run the overview query range and return a flat record keyed by
 * `instance` → numeric samples (bytes/sec), for sparkline consumption.
 * Any query failure degrades to an empty object.
 */
export async function queryRangeByInstance(
  promql: string,
  start: Date,
  end: Date,
  stepSec: number,
): Promise<Record<string, number[]>> {
  const series = await queryRange(promql, start, end, stepSec);
  const out: Record<string, number[]> = {};
  for (const s of series) {
    const inst = s.labels.instance;
    if (!inst) continue;
    out[inst] = s.samples.map(([, v]) => v);
  }
  return out;
}
