import { getOverviewSnapshot } from "@/lib/overview-aggregator.server";
import { HostGrid } from "./_components/HostGrid";
import { ClaudeSummary } from "./_components/ClaudeSummary";
import { AlertsCard } from "./_components/AlertsCard";

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

      <section className="mb-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Hosts
        </h2>
        <HostGrid initial={initial} />
      </section>

      <ClaudeSummary initial={initial} />

      <AlertsCard />
    </div>
  );
}
