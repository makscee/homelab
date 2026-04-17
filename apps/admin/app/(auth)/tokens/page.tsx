import { listTokens } from "@/lib/token-registry.server";
import { sopsAvailable } from "@/lib/sops.server";
import { queryInstant, queryRange } from "@/lib/prometheus.server";
import { buildTokenRows } from "./_lib/view-model";
import { TokensTable } from "./_components/TokensTable";
import { DegradedBanner } from "./_components/DegradedBanner";
import { AddTokenButton } from "./_components/AddTokenButton";

// Live dashboard: every paint is a fresh snapshot from the registry + Prometheus.
// Static generation would be a correctness bug (stale quota data).
export const dynamic = "force-dynamic";

export default async function TokensPage() {
  const writeAvailable = sopsAvailable();
  const entries = await listTokens();

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  // Run Prometheus queries in parallel; any individual failure degrades to
  // an empty result set so the page still renders (threat T-13-04-03).
  const [pct5h, pct7d, resets, sparklines] = await Promise.all([
    queryInstant("claude_usage_5h_pct").catch(() => []),
    queryInstant("claude_usage_7d_pct").catch(() => []),
    queryInstant("claude_usage_reset_seconds").catch(() => []),
    queryRange("claude_usage_7d_pct", sevenDaysAgo, now, 3600, {
      revalidateSec: 60,
    }).catch(() => []),
  ]);

  const rows = buildTokenRows({
    entries,
    pct5hSamples: pct5h,
    pct7dSamples: pct7d,
    resetSamples: resets,
    sparklines,
  });

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Claude tokens</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage Claude Code OAuth tokens. Live utilization from the exporter
            on mcow.
          </p>
        </div>
        <AddTokenButton disabled={!writeAvailable} />
      </div>

      {!writeAvailable && <DegradedBanner />}

      <TokensTable rows={rows} writeAvailable={writeAvailable} />
    </div>
  );
}
