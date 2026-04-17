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
  //
  // Exporter (servers/mcow/claude-usage-exporter/exporter.py) publishes:
  //   - claude_usage_5h_utilization / claude_usage_7d_utilization (0..1)
  //   - claude_usage_5h_reset_timestamp / claude_usage_7d_reset_timestamp
  //     (absolute Unix seconds) — convert to seconds-until-reset via `- time()`
  //   - label `name` (not `label`)
  // Multiply utilization by 100 here so the view-model keeps operating in the
  // 0..100 space it already assumes.
  const [pct5h, pct7d, reset5h, reset7d, sparklines] = await Promise.all([
    queryInstant("claude_usage_5h_utilization * 100").catch(() => []),
    queryInstant("claude_usage_7d_utilization * 100").catch(() => []),
    queryInstant("claude_usage_5h_reset_timestamp - time()").catch(() => []),
    queryInstant("claude_usage_7d_reset_timestamp - time()").catch(() => []),
    queryRange("claude_usage_7d_utilization * 100", sevenDaysAgo, now, 3600, {
      revalidateSec: 60,
    }).catch(() => []),
  ]);

  const rows = buildTokenRows({
    entries,
    pct5hSamples: pct5h,
    pct7dSamples: pct7d,
    reset5hSamples: reset5h,
    reset7dSamples: reset7d,
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
