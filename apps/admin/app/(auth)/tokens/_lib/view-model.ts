import type { PublicTokenEntry } from "@/lib/token-registry.server";
import type {
  PromInstantSample,
  PromRangeSeries,
} from "@/lib/prometheus.server";

// -------------------------------------------------------------------------
// Public types
// -------------------------------------------------------------------------

/**
 * Per-row view model for the tokens table. Pure data — no JSX, no icons.
 *
 * `pct5h` / `pct7d` are stored in the 0-100 space. The exporter emits
 * `claude_usage_5h_utilization` / `claude_usage_7d_utilization` as 0..1
 * fractions; the caller multiplies by 100 in PromQL before passing samples
 * here. `null` signals "no Prometheus sample for this label yet" (new token,
 * exporter down, or the label hasn't polled once).
 */
export type TokenRow = {
  entry: PublicTokenEntry;
  pct5h: number | null;
  pct7d: number | null;
  resetSecondsFiveHour: number | null;
  resetSecondsSevenDay: number | null;
  sparkline: Array<[number, number]>; // [unixSec, value], may be empty
};

export type Threshold = "safe" | "warn" | "critical";

// -------------------------------------------------------------------------
// Threshold + humanizer helpers (pure)
// -------------------------------------------------------------------------

/**
 * Classify a utilization value into one of 3 threshold bands.
 *
 * Accepts either a fraction (0-1) OR a percentage (0-100). Values > 1 are
 * treated as percentages and divided by 100. Values are clamped into
 * [0, 1.5] before comparison so overflow metrics (e.g. clipped at 150%)
 * still resolve to 'critical'.
 *
 * Inclusive lower bounds:
 *   [0,    0.80) -> safe
 *   [0.80, 0.95) -> warn
 *   [0.95, inf ) -> critical
 */
export function thresholdClass(value: number): Threshold {
  if (Number.isNaN(value)) return "safe";
  // Auto-normalize percentage (0-100) to fraction (0-1). Values in (1, 2]
  // are treated as "overflow fractions" (e.g. metric clipped at 150%) and
  // left as-is so they resolve critical. Values > 2 are unambiguously
  // percentage-space (>200%) and divided by 100.
  let fraction: number;
  if (value > 2) fraction = value / 100;
  else fraction = value;
  if (fraction >= 0.95) return "critical";
  if (fraction >= 0.8) return "warn";
  return "safe";
}

/**
 * Humanize a seconds-until-reset scalar to a compact operator-readable
 * string. Shape:
 *   null / NaN    -> "unknown"
 *   <= 0 seconds  -> "now"
 *   >= 1 day      -> "Xd Yh"
 *   >= 1 hour     -> "Xh Ym"
 *   < 1 hour      -> "Xm"
 */
export function humanizeResetSeconds(s: number | null | undefined): string {
  if (s === null || s === undefined || Number.isNaN(s)) return "unknown";
  if (s <= 0) return "now";
  const total = Math.floor(s);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// -------------------------------------------------------------------------
// Internal lookup helpers
// -------------------------------------------------------------------------

// Exporter labels each metric series with `name` (not `label`) — see
// servers/mcow/claude-usage-exporter/exporter.py. The registry's display
// field is still called `label`; we match exporter-side `name` against
// registry-side `label` because the exporter sources its `name` value from
// the same registry `label` field.
function sampleByLabel(
  samples: PromInstantSample[],
  label: string,
): number | null {
  const match = samples.find((s) => s.labels.name === label);
  return match ? match.value : null;
}

function sparklineByLabel(
  series: PromRangeSeries[],
  label: string,
): Array<[number, number]> {
  const match = series.find((s) => s.labels.name === label);
  return match ? match.samples : [];
}

// -------------------------------------------------------------------------
// Public: buildTokenRows
// -------------------------------------------------------------------------

/**
 * Zip registry entries with Prometheus samples into one TokenRow per entry.
 * Entries that have no matching Prometheus sample get `null` fields and an
 * empty sparkline — the UI MUST render a placeholder rather than hiding the
 * row (operator needs to see "token exists but hasn't been polled yet").
 */
export function buildTokenRows(input: {
  entries: PublicTokenEntry[];
  pct5hSamples: PromInstantSample[];
  pct7dSamples: PromInstantSample[];
  // Reset samples are seconds-until-reset (exporter publishes an absolute
  // Unix-seconds timestamp; caller subtracts `time()` in PromQL before
  // passing them here). Separate 5h vs 7d families — the exporter emits
  // `claude_usage_5h_reset_timestamp` and `claude_usage_7d_reset_timestamp`
  // as distinct metrics rather than one metric with a `window` label.
  reset5hSamples: PromInstantSample[];
  reset7dSamples: PromInstantSample[];
  sparklines: PromRangeSeries[];
}): TokenRow[] {
  return input.entries.map((entry) => ({
    entry,
    pct5h: sampleByLabel(input.pct5hSamples, entry.label),
    pct7d: sampleByLabel(input.pct7dSamples, entry.label),
    resetSecondsFiveHour: sampleByLabel(input.reset5hSamples, entry.label),
    resetSecondsSevenDay: sampleByLabel(input.reset7dSamples, entry.label),
    sparkline: sparklineByLabel(input.sparklines, entry.label),
  }));
}
