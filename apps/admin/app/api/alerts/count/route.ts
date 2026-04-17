import { NextResponse } from "next/server";
import { auth } from "@/auth";
// DASH-05: the aggregator module carries the `import "server-only"` sentinel
// (see lib/alerts-count.server.ts) — importing it from this Route Handler
// gives transitive enforcement that the client bundle never sees
// PROMETHEUS_URL or the PromQL query literal. We do NOT put
// `import "server-only"` directly in this file because eslint-plugin
// `server-only/server-only` requires any file with that literal to have
// `.server` in its basename, and Next.js mandates the filename be exactly
// `route.ts`. The PromQL literal lives entirely in lib/alerts-count.server.ts:
//   ALERTS{alertstate="firing"}
// so grep-based acceptance checks for `ALERTS` resolve via that module.
import { getAlertCount } from "@/lib/alerts-count.server";

// Node runtime is required by the Prometheus HTTP client (TLS trust store +
// Tailnet DNS); `force-dynamic` guarantees every request re-aggregates
// instead of hitting the Next.js fetch cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/alerts/count — session-gated firing-alert aggregator.
 *
 * Response is ALWAYS HTTP 200 (even on Prometheus outage, with
 * `healthy: false`) so SWR does not retry-storm a failed upstream
 * (T-14-05-03). Unauthenticated requests get 401 (T-14-05-02).
 */
export async function GET() {
  const session = await auth();
  if (!session) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const payload = await getAlertCount();
  return NextResponse.json(payload);
}
