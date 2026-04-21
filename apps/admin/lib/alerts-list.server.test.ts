import { afterEach, describe, expect, test } from "bun:test";
import {
  _setQueryInstantForTest,
  listFiringAlerts,
} from "./alerts-list.server";
import { _setFetchImplForTest } from "./prom-rules.server";
import type { PromInstantSample } from "./prometheus.server";

const sample = (
  labels: Record<string, string>,
  value: number,
): PromInstantSample => ({ labels, value, ts: 1_700_000_000 });

function mockRulesFetch(
  rules: Array<{ name: string; summary?: string; description?: string }>,
) {
  _setFetchImplForTest(async () => {
    return new Response(
      JSON.stringify({
        status: "success",
        data: {
          groups: [
            {
              rules: rules.map((r) => ({
                type: "alerting",
                name: r.name,
                annotations: {
                  summary: r.summary ?? "",
                  description: r.description ?? "",
                },
              })),
            },
          ],
        },
      }),
      { status: 200 },
    );
  });
}

function mockRulesFetchEmpty() {
  _setFetchImplForTest(async () => {
    return new Response(
      JSON.stringify({ status: "success", data: { groups: [] } }),
      { status: 200 },
    );
  });
}

afterEach(() => {
  _setQueryInstantForTest(null);
  _setFetchImplForTest(null);
});

describe("listFiringAlerts", () => {
  test("joins ALERTS and ALERTS_FOR_STATE by labelset — different instances get distinct durations", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const start1 = nowSec - 600; // 10 minutes ago
    const start2 = nowSec - 120; // 2 minutes ago

    _setQueryInstantForTest(async (q) => {
      if (q.includes("ALERTS_FOR_STATE")) {
        return [
          sample(
            {
              alertname: "HostDown",
              severity: "critical",
              instance: "tower",
            },
            start1,
          ),
          sample(
            {
              alertname: "HostDown",
              severity: "critical",
              instance: "docker-tower",
            },
            start2,
          ),
        ];
      }
      return [
        sample(
          {
            alertname: "HostDown",
            severity: "critical",
            instance: "tower",
          },
          1,
        ),
        sample(
          {
            alertname: "HostDown",
            severity: "critical",
            instance: "docker-tower",
          },
          1,
        ),
      ];
    });
    mockRulesFetchEmpty();

    const out = await listFiringAlerts();
    expect(out.healthy).toBe(true);
    expect(out.alerts).toHaveLength(2);
    const byInstance = Object.fromEntries(
      out.alerts.map((a) => [a.instance, a.duration_seconds]),
    );
    expect(byInstance.tower).toBeGreaterThanOrEqual(600);
    expect(byInstance["docker-tower"]).toBeGreaterThanOrEqual(120);
    expect(byInstance.tower).toBeGreaterThan(byInstance["docker-tower"]);
  });

  test("severity is lowercased; unknown severity bucketed to 'other' (XSS defense)", async () => {
    _setQueryInstantForTest(async (q) => {
      if (q.includes("ALERTS_FOR_STATE")) return [];
      return [
        sample({ alertname: "A", severity: "CRITICAL", instance: "x" }, 1),
        sample(
          {
            alertname: "B",
            severity: "<script>alert(1)</script>",
            instance: "y",
          },
          1,
        ),
      ];
    });
    mockRulesFetchEmpty();

    const out = await listFiringAlerts();
    const sevs = out.alerts.map((a) => a.severity).sort();
    expect(sevs).toEqual(["critical", "other"]);
  });

  test("on queryInstant throw returns healthy:false envelope with stale_since ISO", async () => {
    _setQueryInstantForTest(async () => {
      throw new Error("prometheus unreachable");
    });
    mockRulesFetchEmpty();

    const out = await listFiringAlerts();
    expect(out.healthy).toBe(false);
    expect(out.alerts).toEqual([]);
    expect(typeof out.stale_since).toBe("string");
    // Roughly ISO 8601
    expect(out.stale_since).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("summary sourced from prom-rules annotations; missing annotation → empty string", async () => {
    _setQueryInstantForTest(async (q) => {
      if (q.includes("ALERTS_FOR_STATE")) return [];
      return [
        sample(
          { alertname: "HostDown", severity: "critical", instance: "a" },
          1,
        ),
        sample(
          {
            alertname: "MysteryAlert",
            severity: "warning",
            instance: "b",
          },
          1,
        ),
      ];
    });
    mockRulesFetch([{ name: "HostDown", summary: "Host a is down" }]);

    const out = await listFiringAlerts();
    const byName = Object.fromEntries(
      out.alerts.map((a) => [a.alertname, a.summary]),
    );
    expect(byName.HostDown).toBe("Host a is down");
    expect(byName.MysteryAlert).toBe("");
  });

  test("label-join is deterministic across insertion orders", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const start = nowSec - 300;

    // Same logical labelset; keys inserted in opposite orders.
    const labelsForState: Record<string, string> = {};
    labelsForState.severity = "warning";
    labelsForState.alertname = "X";
    labelsForState.instance = "node1";

    const labelsAlerts: Record<string, string> = {};
    labelsAlerts.alertname = "X";
    labelsAlerts.instance = "node1";
    labelsAlerts.severity = "warning";

    _setQueryInstantForTest(async (q) => {
      if (q.includes("ALERTS_FOR_STATE")) {
        return [sample(labelsForState, start)];
      }
      return [sample(labelsAlerts, 1)];
    });
    mockRulesFetchEmpty();

    const out = await listFiringAlerts();
    expect(out.alerts).toHaveLength(1);
    expect(out.alerts[0].duration_seconds).toBeGreaterThanOrEqual(300);
  });
});
