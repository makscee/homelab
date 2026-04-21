import "server-only";

import {
  queryInstant,
  queryRange,
  queryRangeByInstance,
  type PromInstantSample,
  type PromRangeSeries,
} from "@/lib/prometheus.server";
import {
  HOST_BY_INSTANCE,
  buildHostRows,
  type ClaudeUsageEntry,
  type OverviewResponse,
} from "@/app/(auth)/_lib/overview-view-model";

// PromQL queries — kept in this server-only module so the literal source is
// never bundled for the browser (DASH-05 defense-in-depth).
const Q_CPU = `1 - avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[2m]))`;
const Q_MEM = `1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes`;
const Q_DISK = `1 - node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{mountpoint="/",fstype!~"tmpfs|overlay"}`;
const Q_CONT = `count by(instance)(container_last_seen{name!=""})`;
const Q_UP = `node_boot_time_seconds`;
const Q_L1 = `node_load1`;
const Q_L5 = `node_load5`;
const Q_L15 = `node_load15`;
const Q_LAST = `timestamp(up{job="node"})`;
const Q_NETRX = `sum by(instance)(rate(node_network_receive_bytes_total{device!~"lo|veth.*|docker.*|br-.*|tailscale.*"}[1m]))`;
// Claude usage — exporter (servers/mcow/claude-usage-exporter/exporter.py)
// emits one series per token label as `claude_usage_{5h,7d}_utilization`
// (0..1) plus absolute reset timestamps. Label key is `name`, not `label`.
// null in the view-model means "no sample yet" (new token / exporter down).
const Q_CLAUDE_SESSION = `claude_usage_5h_utilization`;
const Q_CLAUDE_WEEKLY = `claude_usage_7d_utilization`;
const Q_CLAUDE_RESET_5H = `claude_usage_5h_reset_timestamp - time()`;
const Q_CLAUDE_RESET_7D = `claude_usage_7d_reset_timestamp - time()`;
const Q_CLAUDE_RANGE_5H = `claude_usage_5h_utilization * 100`;
const Q_CLAUDE_RANGE_7D = `claude_usage_7d_utilization * 100`;

/**
 * Merge session + weekly claude samples into one ClaudeUsageEntry per token
 * label (union of the two metric families), sorted alphabetically so the
 * /api/overview response is render-stable across refreshes.
 */
export function buildClaudeEntries(
  sessionSamples: PromInstantSample[],
  weeklySamples: PromInstantSample[],
  reset5hSamples: PromInstantSample[] = [],
  reset7dSamples: PromInstantSample[] = [],
  sparkline5h: PromRangeSeries[] = [],
  sparkline7d: PromRangeSeries[] = [],
): ClaudeUsageEntry[] {
  const indexInstant = (samples: PromInstantSample[]) => {
    const out: Record<string, number> = {};
    for (const s of samples) {
      const name = s.labels.name;
      if (!name) continue;
      const n = Number(s.value);
      if (Number.isFinite(n)) out[name] = n;
    }
    return out;
  };
  const indexRange = (series: PromRangeSeries[]) => {
    const out: Record<string, Array<[number, number]>> = {};
    for (const s of series) {
      const name = s.labels.name;
      if (!name) continue;
      out[name] = s.samples;
    }
    return out;
  };

  const byNameSession = indexInstant(sessionSamples);
  const byNameWeekly = indexInstant(weeklySamples);
  const byNameReset5h = indexInstant(reset5hSamples);
  const byNameReset7d = indexInstant(reset7dSamples);
  const byNameSpark5h = indexRange(sparkline5h);
  const byNameSpark7d = indexRange(sparkline7d);

  const names = new Set([
    ...Object.keys(byNameSession),
    ...Object.keys(byNameWeekly),
  ]);
  return [...names].sort().map((label) => ({
    label,
    session: byNameSession[label] ?? null,
    weekly: byNameWeekly[label] ?? null,
    resetSeconds5h: byNameReset5h[label] ?? null,
    resetSeconds7d: byNameReset7d[label] ?? null,
    sparkline5h: byNameSpark5h[label] ?? [],
    sparkline7d: byNameSpark7d[label] ?? [],
  }));
}

/**
 * Aggregate the `/` overview payload. Shared by the /api/overview Route
 * Handler (SWR refresh) and the RSC `page.tsx` seed (fallbackData) so the
 * first paint and subsequent refreshes cannot drift in shape (T-14-04-06).
 *
 * Per-query `.catch(() => [])` gates keep the grid rendering when a single
 * PromQL fails (D-10 per-tile degradation — the missing field becomes `null`
 * and the affected row renders a stale dot). The outer try/catch flips
 * `prometheusHealthy: false` on catastrophic failure so the UI shows a
 * page-level banner (T-14-04-04).
 *
 * Issues 9 instant queries (CPU, memory, disk, containers, boot time, load
 * 1/5/15, last scrape) + 1 range query (15-minute net-rx sparkline) in
 * parallel.
 */
export async function getOverviewSnapshot(): Promise<OverviewResponse> {
  const now = Date.now() / 1000;
  const nowUnix = Math.floor(now);
  const rangeEnd = new Date(nowUnix * 1000);
  const rangeStart = new Date((nowUnix - 15 * 60) * 1000);
  const claude5hStart = new Date((nowUnix - 5 * 3600) * 1000);
  const claude7dStart = new Date((nowUnix - 7 * 24 * 3600) * 1000);

  try {
    const [
      cpu,
      mem,
      disk,
      containers,
      uptimeRaw,
      load1,
      load5,
      load15,
      lastScrape,
      netRxMap,
      claudeSession,
      claudeWeekly,
      claudeReset5h,
      claudeReset7d,
      claudeSpark5h,
      claudeSpark7d,
    ] = await Promise.all([
      queryInstant(Q_CPU).catch(() => []),
      queryInstant(Q_MEM).catch(() => []),
      queryInstant(Q_DISK).catch(() => []),
      queryInstant(Q_CONT).catch(() => []),
      queryInstant(Q_UP).catch(() => []),
      queryInstant(Q_L1).catch(() => []),
      queryInstant(Q_L5).catch(() => []),
      queryInstant(Q_L15).catch(() => []),
      queryInstant(Q_LAST).catch(() => []),
      queryRangeByInstance(Q_NETRX, rangeStart, rangeEnd, 30).catch(
        () => ({}) as Record<string, number[]>,
      ),
      queryInstant(Q_CLAUDE_SESSION).catch(() => []),
      queryInstant(Q_CLAUDE_WEEKLY).catch(() => []),
      queryInstant(Q_CLAUDE_RESET_5H).catch(() => []),
      queryInstant(Q_CLAUDE_RESET_7D).catch(() => []),
      queryRange(Q_CLAUDE_RANGE_5H, claude5hStart, rangeEnd, 300, {
        revalidateSec: 60,
      }).catch(() => [] as PromRangeSeries[]),
      queryRange(Q_CLAUDE_RANGE_7D, claude7dStart, rangeEnd, 3600, {
        revalidateSec: 60,
      }).catch(() => [] as PromRangeSeries[]),
    ]);

    // uptimeRaw carries boot time (unix seconds); translate to seconds since
    // boot so the view-model keeps its `uptimeSeconds` contract.
    const uptimeSeconds = uptimeRaw.map((s) => ({
      labels: s.labels,
      value: now - s.value,
      ts: s.ts,
    }));

    // netRxMap is keyed by node_exporter instance (IP:9100). Re-key by the
    // hostname so buildHostRows can zip by meta.name.
    const netRxByName: Record<string, number[]> = {};
    for (const [inst, samples] of Object.entries(netRxMap)) {
      const meta = HOST_BY_INSTANCE[inst];
      if (meta) netRxByName[meta.name] = samples;
    }

    const hosts = buildHostRows({
      cpu,
      mem,
      disk,
      containers,
      uptimeSeconds,
      load1,
      load5,
      load15,
      lastScrape,
      netRx: netRxByName,
      nowUnix: now,
    });

    const claude = buildClaudeEntries(
      claudeSession,
      claudeWeekly,
      claudeReset5h,
      claudeReset7d,
      claudeSpark5h,
      claudeSpark7d,
    );

    return { ts: Date.now(), prometheusHealthy: true, hosts, claude };
  } catch {
    return {
      ts: Date.now(),
      prometheusHealthy: false,
      hosts: [],
      claude: [],
    };
  }
}
