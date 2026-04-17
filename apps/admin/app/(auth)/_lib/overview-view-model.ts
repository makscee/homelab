import type { PromInstantSample } from "@/lib/prometheus.server";

// -------------------------------------------------------------------------
// Public types
// -------------------------------------------------------------------------

export type StaleLevel = "fresh" | "stale" | "dead" | "unknown";

export type HostRow = {
  name: string;
  role: string;
  cpuPct: number | null; // 0..100
  memPct: number | null; // 0..100
  diskPct: number | null; // 0..100
  containerCount: number | null; // null = no cAdvisor on this host
  uptimeSeconds: number | null;
  load1: number | null;
  load5: number | null;
  load15: number | null;
  netRx15m: number[]; // bytes/s sparkline samples, may be [] on failure
  lastScrapeUnix: number | null;
  stale: StaleLevel;
};

export type ClaudeUsageEntry = {
  label: string;
  /** 5h session utilization ratio 0..1, or null if no sample yet. */
  session: number | null;
  /** 7d weekly utilization ratio 0..1, or null if no sample yet. */
  weekly: number | null;
};

export type OverviewResponse = {
  ts: number; // server unix_ms
  prometheusHealthy: boolean;
  hosts: HostRow[];
  /**
   * One entry per Claude token label seen in Prometheus. Derived from
   * `claude_code_session_used_ratio{label=...}` ∪
   * `claude_code_weekly_used_ratio{label=...}`. Sorted by label for stable
   * render order.
   */
  claude: ClaudeUsageEntry[];
};

// -------------------------------------------------------------------------
// Host inventory (D-09 source of truth: CLAUDE.md §Servers)
// -------------------------------------------------------------------------

/**
 * node_exporter runs on `:9100` on every Tailnet host and labels the instance
 * as `<tailscale-ip>:9100`. Mapping is exhaustive — if a host is added or
 * decommissioned, update BOTH this map AND CLAUDE.md §Servers.
 */
export const HOST_BY_INSTANCE: Record<
  string,
  { name: string; role: string; hasContainers: boolean }
> = {
  "100.101.0.7:9100": {
    name: "tower",
    role: "Proxmox host",
    hasContainers: false,
  },
  "100.101.0.8:9100": {
    name: "docker-tower",
    role: "Media stack",
    hasContainers: true,
  },
  "100.99.133.9:9100": {
    name: "cc-worker",
    role: "CC runner",
    hasContainers: false,
  },
  "100.101.0.9:9100": {
    name: "mcow",
    role: "VoidNet / admin",
    hasContainers: true,
  },
  "100.101.0.3:9100": {
    name: "nether",
    role: "VPN entry/exit",
    hasContainers: false,
  },
  "100.119.15.122:9100": {
    name: "animaya-dev",
    role: "Animaya dev",
    hasContainers: false,
  },
};

/**
 * cAdvisor reports metrics with its own port (e.g. 8080), so joining by
 * `instance` on the PromQL layer doesn't work (RESEARCH Pitfall 3). Instead,
 * strip `:port` from the cAdvisor instance and map the raw Tailnet IP to the
 * hostname here.
 */
export const CADVISOR_HOST_BY_IP: Record<string, string> = {
  "100.101.0.8": "docker-tower",
  "100.101.0.9": "mcow",
};

// -------------------------------------------------------------------------
// classifyStale (D-09 thresholds)
// -------------------------------------------------------------------------

/**
 * Classify node_exporter scrape freshness.
 *
 *   null                 -> "unknown"
 *   age  <  90s          -> "fresh"
 *   age >=  90s && < 300 -> "stale"
 *   age >= 300s          -> "dead"
 *
 * Boundaries are inclusive at 90 and 300 per D-09.
 */
export function classifyStale(
  lastSeenUnix: number | null,
  nowUnix: number = Date.now() / 1000,
): StaleLevel {
  if (lastSeenUnix == null) return "unknown";
  const age = nowUnix - lastSeenUnix;
  if (age < 90) return "fresh";
  if (age < 300) return "stale";
  return "dead";
}

// -------------------------------------------------------------------------
// buildHostRows
// -------------------------------------------------------------------------

function keyByInstance(samples: PromInstantSample[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of samples) {
    const inst = s.labels.instance;
    if (inst) out[inst] = s.value;
  }
  return out;
}

/**
 * Zip the parallel PromQL results into one HostRow per entry in
 * HOST_BY_INSTANCE. Missing samples degrade to `null` fields so the UI keeps
 * rendering the tile with a stale indicator rather than disappearing.
 */
export function buildHostRows(args: {
  cpu: PromInstantSample[]; // rate fraction 0..1
  mem: PromInstantSample[]; // fraction 0..1
  disk: PromInstantSample[]; // fraction 0..1
  containers: PromInstantSample[]; // count (labelled by cAdvisor IP:port)
  /**
   * Uptime in *seconds* — the route handler translates node_boot_time_seconds
   * into `now - boot_time` before passing it here to keep this function pure.
   */
  uptimeSeconds: PromInstantSample[];
  load1: PromInstantSample[];
  load5: PromInstantSample[];
  load15: PromInstantSample[];
  lastScrape: PromInstantSample[]; // timestamp(up{job="node"})
  /** hostname → sparkline samples (bytes/s). Pre-keyed by route handler. */
  netRx: Record<string, number[]>;
  nowUnix?: number;
}): HostRow[] {
  const nowUnix = args.nowUnix ?? Date.now() / 1000;

  const cpuBy = keyByInstance(args.cpu);
  const memBy = keyByInstance(args.mem);
  const diskBy = keyByInstance(args.disk);
  const uptimeBy = keyByInstance(args.uptimeSeconds);
  const load1By = keyByInstance(args.load1);
  const load5By = keyByInstance(args.load5);
  const load15By = keyByInstance(args.load15);
  const lastBy = keyByInstance(args.lastScrape);

  // cAdvisor `instance` label uses IP:cadvisor_port — map by IP stem.
  const containerByName: Record<string, number> = {};
  for (const s of args.containers) {
    const ip = (s.labels.instance ?? "").split(":")[0];
    const name = CADVISOR_HOST_BY_IP[ip];
    if (name) containerByName[name] = s.value;
  }

  const rows: HostRow[] = [];
  for (const [instance, meta] of Object.entries(HOST_BY_INSTANCE)) {
    const lastSeen = lastBy[instance] ?? null;
    rows.push({
      name: meta.name,
      role: meta.role,
      cpuPct: instance in cpuBy ? cpuBy[instance] * 100 : null,
      memPct: instance in memBy ? memBy[instance] * 100 : null,
      diskPct: instance in diskBy ? diskBy[instance] * 100 : null,
      containerCount: meta.hasContainers
        ? (containerByName[meta.name] ?? null)
        : null,
      uptimeSeconds: instance in uptimeBy ? uptimeBy[instance] : null,
      load1: instance in load1By ? load1By[instance] : null,
      load5: instance in load5By ? load5By[instance] : null,
      load15: instance in load15By ? load15By[instance] : null,
      netRx15m: args.netRx[meta.name] ?? [],
      lastScrapeUnix: lastSeen,
      stale: classifyStale(lastSeen, nowUnix),
    });
  }
  return rows;
}
