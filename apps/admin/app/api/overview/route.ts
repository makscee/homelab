import { NextResponse } from "next/server";
import { auth } from "@/auth";
// DASH-05: the aggregator module carries the `import "server-only"` sentinel
// (see lib/overview-aggregator.server.ts) — importing it from this Route
// Handler gives transitive enforcement that the client bundle never sees
// PROMETHEUS_URL or the PromQL query strings. We do NOT put
// `import "server-only"` directly in this file because eslint-plugin
// `server-only/server-only` (see eslint.config.mjs) requires any file with
// that literal to have `.server` in its basename, and Next.js mandates the
// filename be exactly `route.ts`.
import { getOverviewSnapshot } from "@/lib/overview-aggregator.server";

// Node runtime is required by the Prometheus HTTP client (TLS trust store +
// Tailnet DNS); `force-dynamic` guarantees every request re-aggregates
// instead of hitting the Next.js fetch cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/overview — session-gated live snapshot for the `/` host grid.
 * SWR on the client polls this every 30s. Response shape is stable
 * (OverviewResponse) so SWR can merge refresh payloads over the RSC seed
 * without layout thrash.
 */
export async function GET() {
  const session = await auth();
  if (!session) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const payload = await getOverviewSnapshot();
  return NextResponse.json(payload);
}
