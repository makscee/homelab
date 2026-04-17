import { afterEach, describe, expect, test } from "bun:test";
import {
  _setQueryInstantForTest,
  getAlertCount,
} from "./alerts-count.server";
import type { PromInstantSample } from "./prometheus.server";

const sample = (
  labels: Record<string, string>,
  value: number,
): PromInstantSample => ({ labels, value, ts: 1_700_000_000 });

afterEach(() => {
  _setQueryInstantForTest(null);
});

describe("getAlertCount", () => {
  test("empty ALERTS → all zeros, healthy=true (pre-Phase 17 state)", async () => {
    _setQueryInstantForTest(async () => []);
    const out = await getAlertCount();
    expect(out).toEqual({
      total: 0,
      bySeverity: { critical: 0, warning: 0, info: 0, other: 0 },
      healthy: true,
    });
  });

  test("critical=2 warning=1 → total=3", async () => {
    _setQueryInstantForTest(async () => [
      sample({ severity: "critical" }, 2),
      sample({ severity: "warning" }, 1),
    ]);
    const out = await getAlertCount();
    expect(out.total).toBe(3);
    expect(out.bySeverity).toEqual({
      critical: 2,
      warning: 1,
      info: 0,
      other: 0,
    });
    expect(out.healthy).toBe(true);
  });

  test("unknown severity counted under other", async () => {
    _setQueryInstantForTest(async () => [
      sample({ severity: "debug" }, 4),
    ]);
    const out = await getAlertCount();
    expect(out.bySeverity.other).toBe(4);
    expect(out.total).toBe(4);
  });

  test("severity label missing → counted under other", async () => {
    _setQueryInstantForTest(async () => [sample({}, 1)]);
    const out = await getAlertCount();
    expect(out.bySeverity.other).toBe(1);
  });

  test("severity is case-insensitive", async () => {
    _setQueryInstantForTest(async () => [
      sample({ severity: "CRITICAL" }, 1),
      sample({ severity: "Warning" }, 2),
    ]);
    const out = await getAlertCount();
    expect(out.bySeverity.critical).toBe(1);
    expect(out.bySeverity.warning).toBe(2);
  });

  test("Prometheus unreachable → healthy=false, all zeros", async () => {
    _setQueryInstantForTest(async () => {
      throw new Error("prometheus unreachable");
    });
    const out = await getAlertCount();
    expect(out).toEqual({
      total: 0,
      bySeverity: { critical: 0, warning: 0, info: 0, other: 0 },
      healthy: false,
    });
  });

  test("non-finite values ignored", async () => {
    _setQueryInstantForTest(async () => [
      sample({ severity: "critical" }, Number.NaN),
      sample({ severity: "critical" }, 3),
    ]);
    const out = await getAlertCount();
    expect(out.bySeverity.critical).toBe(3);
  });
});
