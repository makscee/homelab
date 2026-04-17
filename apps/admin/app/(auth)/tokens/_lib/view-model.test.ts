import { describe, expect, test } from "bun:test";
import {
  buildTokenRows,
  humanizeResetSeconds,
  thresholdClass,
  type TokenRow,
} from "./view-model";
import type { PublicTokenEntry } from "@/lib/token-registry.server";
import type {
  PromInstantSample,
  PromRangeSeries,
} from "@/lib/prometheus.server";

// -------------------------------------------------------------------------
// Fixtures
// -------------------------------------------------------------------------

const entry = (
  overrides: Partial<PublicTokenEntry> = {},
): PublicTokenEntry => ({
  id: "11111111-1111-4111-8111-111111111111",
  label: "makscee-personal",
  tier: "pro",
  owner_host: "mcow",
  enabled: true,
  added_at: "2026-04-17T00:00:00.000Z",
  ...overrides,
});

const sample = (
  labels: Record<string, string>,
  value: number,
): PromInstantSample => ({ labels, value, ts: 1700000000 });

const series = (
  labels: Record<string, string>,
  samples: Array<[number, number]>,
): PromRangeSeries => ({ labels, samples });

// -------------------------------------------------------------------------
// buildTokenRows — matching behavior
// -------------------------------------------------------------------------

describe("buildTokenRows", () => {
  test("Test 1: matches entries to instant samples by labels.name", () => {
    const entries = [entry({ label: "makscee-personal" })];
    const pct5hSamples = [sample({ name: "makscee-personal" }, 62)];
    const pct7dSamples = [sample({ name: "makscee-personal" }, 44)];
    const rows = buildTokenRows({
      entries,
      pct5hSamples,
      pct7dSamples,
      reset5hSamples: [],
      reset7dSamples: [],
      sparklines: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.pct5h).toBe(62);
    expect(rows[0]!.pct7d).toBe(44);
  });

  test("Test 2: entries with no matching instant sample get nulls", () => {
    const entries = [entry({ label: "brand-new-token" })];
    const rows = buildTokenRows({
      entries,
      pct5hSamples: [sample({ name: "other-label" }, 50)],
      pct7dSamples: [],
      reset5hSamples: [],
      reset7dSamples: [],
      sparklines: [],
    });
    expect(rows[0]!.pct5h).toBeNull();
    expect(rows[0]!.pct7d).toBeNull();
  });

  test("Test 3: reset seconds sourced from separate 5h/7d sample arrays", () => {
    const entries = [entry({ label: "tok-a" })];
    const reset5hSamples = [
      sample({ name: "tok-a" }, 3600),
      sample({ name: "tok-other" }, 999),
    ];
    const reset7dSamples = [sample({ name: "tok-a" }, 86400)];
    const rows = buildTokenRows({
      entries,
      pct5hSamples: [],
      pct7dSamples: [],
      reset5hSamples,
      reset7dSamples,
      sparklines: [],
    });
    expect(rows[0]!.resetSecondsFiveHour).toBe(3600);
    expect(rows[0]!.resetSecondsSevenDay).toBe(86400);
  });

  test("Test 4: sparkline is the matching PromRangeSeries samples, empty if missing", () => {
    const entries = [
      entry({ id: "a", label: "has-series" }),
      entry({ id: "b", label: "no-series" }),
    ];
    const sparklines = [
      series({ name: "has-series" }, [
        [1700000000, 20],
        [1700003600, 30],
      ]),
    ];
    const rows = buildTokenRows({
      entries,
      pct5hSamples: [],
      pct7dSamples: [],
      reset5hSamples: [],
      reset7dSamples: [],
      sparklines,
    });
    expect(rows[0]!.sparkline).toEqual([
      [1700000000, 20],
      [1700003600, 30],
    ]);
    expect(rows[1]!.sparkline).toEqual([]);
  });
});

// -------------------------------------------------------------------------
// thresholdClass — inclusive lower bounds, percentage normalization
// -------------------------------------------------------------------------

describe("thresholdClass", () => {
  test("Test 5: 0.79 fraction -> safe (below 80%)", () => {
    expect(thresholdClass(0.79)).toBe("safe");
  });

  test("Test 6: 0.80 fraction -> warn (inclusive lower bound)", () => {
    expect(thresholdClass(0.8)).toBe("warn");
  });

  test("Test 7: 0.94 fraction -> warn", () => {
    expect(thresholdClass(0.94)).toBe("warn");
  });

  test("Test 8: 0.95 fraction -> critical (inclusive lower bound)", () => {
    expect(thresholdClass(0.95)).toBe("critical");
  });

  test("Test 9: 1.5 (overflow) -> critical (clamped)", () => {
    expect(thresholdClass(1.5)).toBe("critical");
  });

  test("Test 9b: percentages (0-100 range) auto-normalized", () => {
    // Callers may pass 62 (from `claude_usage_5h_utilization * 100`, stored as 0-100) or 0.62 (0-1).
    expect(thresholdClass(62)).toBe("safe");
    expect(thresholdClass(85)).toBe("warn");
    expect(thresholdClass(96)).toBe("critical");
  });
});

// -------------------------------------------------------------------------
// humanizeResetSeconds
// -------------------------------------------------------------------------

describe("humanizeResetSeconds", () => {
  test("Test 10: 3600 seconds -> '1h 0m'", () => {
    expect(humanizeResetSeconds(3600)).toBe("1h 0m");
  });

  test("Test 10b: 90000 seconds -> '1d 1h' (days branch)", () => {
    expect(humanizeResetSeconds(90000)).toBe("1d 1h");
  });

  test("Test 10c: 125 seconds -> '2m' (minutes branch)", () => {
    expect(humanizeResetSeconds(125)).toBe("2m");
  });

  test("Test 10d: 0 seconds -> 'now'", () => {
    expect(humanizeResetSeconds(0)).toBe("now");
  });

  test("Test 11: null -> 'unknown'", () => {
    expect(humanizeResetSeconds(null)).toBe("unknown");
  });
});

// Static type check: TokenRow shape must include all 6 documented fields.
const _typeCheck: TokenRow = {
  entry: entry(),
  pct5h: null,
  pct7d: null,
  resetSecondsFiveHour: null,
  resetSecondsSevenDay: null,
  sparkline: [],
};
void _typeCheck;
