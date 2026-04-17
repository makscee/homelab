import "server-only";

import {
  queryInstant,
  queryRangeByInstance,
  type PromInstantSample,
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
// Claude usage — exporter emits one series per token label.
// 0..1 fraction; null in the view-model means "no sample yet"
// (new token / exporter down / hasn't polled once).
const Q_CLAUDE_SESSION = `claude_code_session_used_ratio`;
const Q_CLAUDE_WEEKLY = `claude_code_weekly_used_ratio`;

/**
 * Merge session + weekly claude samples into one ClaudeUsageEntry per token
 * label (union of the two metric families), sorted alphabetically so the
 * /api/overview response is render-stable across refreshes.
 */
export function buildClaudeEntries(
  sessionSamples: PromInstantSample[],
  weeklySamples: PromInstantSample[],
): ClaudeUsageEntry[] {
  const byLabelSession: Record<string, number> = {};
  for (const s of sessionSamples) {
    const label = s.labels.label;
    if (!label) continue;
    const n = Number(s.value);
    if (Number.isFinite(n)) byLabelSession[label] = n;
  }
  const byLabelWeekly: Record<string, number> = {};
  for (const s of weeklySamples) {
    const label = s.labels.label;
    if (!label) continue;
    const n = Number(s.value);
    if (Number.isFinite(n)) byLabelWeekly[label] = n;
  }
  const labels = new Set([
    ...Object.keys(byLabelSession),
    ...Object.keys(byLabelWeekly),
  ]);
  return [...labels].sort().map((label) => ({
    label,
    session: byLabelSession[label] ?? null,
    weekly: byLabelWeekly[label] ?? null,
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

    const claude = buildClaudeEntries(claudeSession, claudeWeekly);

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
