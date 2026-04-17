import { getOverviewSnapshot } from "@/lib/overview-aggregator.server";
import { HostGrid } from "./_components/HostGrid";

// Live dashboard: every paint is a fresh Prometheus snapshot — static
// generation would be a correctness bug (stale host state). SWR on the
// client then refreshes via /api/overview every 30s.
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const initial = await getOverviewSnapshot();

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live snapshot of the Tailnet. Refreshes every 30 seconds.
        </p>
      </div>

      {/* Plan 05 replaces this with the Claude summary card. */}
      <div data-slot="claude-summary" className="mb-6" />

      <section className="mb-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Hosts
        </h2>
        <HostGrid initial={initial} />
      </section>

      {/* Plan 05 replaces this with the alerts card. */}
      <div data-slot="alerts-card" />
    </div>
  );
}
