import { describe, expect, test } from "bun:test";
import {
  classifyStale,
  buildHostRows,
  HOST_BY_INSTANCE,
  CADVISOR_HOST_BY_IP,
} from "./overview-view-model";
import type { PromInstantSample } from "@/lib/prometheus.server";

// -------------------------------------------------------------------------
// Fixtures
// -------------------------------------------------------------------------

const sample = (
  labels: Record<string, string>,
  value: number,
): PromInstantSample => ({ labels, value, ts: 1700000000 });

const allInstances = Object.keys(HOST_BY_INSTANCE);

// -------------------------------------------------------------------------
// classifyStale
// -------------------------------------------------------------------------

describe("classifyStale", () => {
  const now = 1_000_000; // arbitrary unix seconds

  test("null → unknown", () => {
    expect(classifyStale(null, now)).toBe("unknown");
  });

  test("10s old → fresh", () => {
    expect(classifyStale(now - 10, now)).toBe("fresh");
  });

  test("100s old (90-300 band) → stale", () => {
    expect(classifyStale(now - 100, now)).toBe("stale");
  });

  test("400s old → dead", () => {
    expect(classifyStale(now - 400, now)).toBe("dead");
  });

  test("age=89 (just under 90) → fresh", () => {
    expect(classifyStale(now - 89, now)).toBe("fresh");
  });

  test("age=90 boundary (inclusive at 90) → stale", () => {
    expect(classifyStale(now - 90, now)).toBe("stale");
  });

  test("age=300 boundary (inclusive at 300) → dead", () => {
    expect(classifyStale(now - 300, now)).toBe("dead");
  });
});

// -------------------------------------------------------------------------
// HOST_BY_INSTANCE
// -------------------------------------------------------------------------

describe("HOST_BY_INSTANCE", () => {
  test("has exactly 6 entries", () => {
    expect(Object.keys(HOST_BY_INSTANCE)).toHaveLength(6);
  });

  test("covers the 6 Tailnet hosts from CLAUDE.md", () => {
    const names = Object.values(HOST_BY_INSTANCE)
      .map((h) => h.name)
      .sort();
    expect(names).toEqual(
      [
        "animaya-dev",
        "cc-worker",
        "docker-tower",
        "mcow",
        "nether",
        "tower",
      ].sort(),
    );
  });

  test("every instance key ends with :9100", () => {
    for (const key of Object.keys(HOST_BY_INSTANCE)) {
      expect(key).toMatch(/:9100$/);
    }
  });

  test("hasContainers is true only for docker-tower and mcow", () => {
    const withContainers = Object.values(HOST_BY_INSTANCE)
      .filter((h) => h.hasContainers)
      .map((h) => h.name)
      .sort();
    expect(withContainers).toEqual(["docker-tower", "mcow"]);
  });
});

// -------------------------------------------------------------------------
// CADVISOR_HOST_BY_IP
// -------------------------------------------------------------------------

describe("CADVISOR_HOST_BY_IP", () => {
  test("maps docker-tower and mcow IPs", () => {
    expect(CADVISOR_HOST_BY_IP["100.101.0.8"]).toBe("docker-tower");
    expect(CADVISOR_HOST_BY_IP["100.101.0.9"]).toBe("mcow");
  });
});

// -------------------------------------------------------------------------
// buildHostRows
// -------------------------------------------------------------------------

describe("buildHostRows", () => {
  const now = 2_000_000;
  const fullCpu = allInstances.map((inst) =>
    sample({ instance: inst }, 0.1),
  );
  const fullMem = allInstances.map((inst) =>
    sample({ instance: inst }, 0.5),
  );
  const fullDisk = allInstances.map((inst) =>
    sample({ instance: inst }, 0.3),
  );
  const fullUptime = allInstances.map((inst) =>
    sample({ instance: inst }, now - 3600),
  );
  const fullLoad1 = allInstances.map((inst) =>
    sample({ instance: inst }, 0.5),
  );
  const fullLoad5 = allInstances.map((inst) =>
    sample({ instance: inst }, 0.7),
  );
  const fullLoad15 = allInstances.map((inst) =>
    sample({ instance: inst }, 0.9),
  );
  const fullLastScrape = allInstances.map((inst) =>
    sample({ instance: inst }, now - 10),
  );

  test("all 6 hosts present with full payload", () => {
    const rows = buildHostRows({
      cpu: fullCpu,
      mem: fullMem,
      disk: fullDisk,
      containers: [
        sample({ instance: "100.101.0.8:8080" }, 12),
        sample({ instance: "100.101.0.9:8080" }, 4),
      ],
      uptimeSeconds: allInstances.map((inst) =>
        sample({ instance: inst }, 3600),
      ),
      load1: fullLoad1,
      load5: fullLoad5,
      load15: fullLoad15,
      lastScrape: fullLastScrape,
      netRx: {},
      nowUnix: now,
    });
    expect(rows).toHaveLength(6);
    const tower = rows.find((r) => r.name === "tower")!;
    expect(tower.cpuPct).toBeCloseTo(10);
    expect(tower.memPct).toBeCloseTo(50);
    expect(tower.diskPct).toBeCloseTo(30);
    expect(tower.containerCount).toBeNull(); // tower has no cAdvisor
    expect(tower.uptimeSeconds).toBe(3600);
    expect(tower.stale).toBe("fresh");
  });

  test("missing disk samples → diskPct null while other fields populate", () => {
    const rows = buildHostRows({
      cpu: fullCpu,
      mem: fullMem,
      disk: [], // empty — prometheus query failed
      containers: [],
      uptimeSeconds: [],
      load1: fullLoad1,
      load5: fullLoad5,
      load15: fullLoad15,
      lastScrape: fullLastScrape,
      netRx: {},
      nowUnix: now,
    });
    const mcow = rows.find((r) => r.name === "mcow")!;
    expect(mcow.diskPct).toBeNull();
    expect(mcow.cpuPct).toBeCloseTo(10);
    expect(mcow.memPct).toBeCloseTo(50);
  });

  test("cAdvisor returned nothing for tower → containerCount null", () => {
    const rows = buildHostRows({
      cpu: fullCpu,
      mem: fullMem,
      disk: fullDisk,
      containers: [sample({ instance: "100.101.0.8:8080" }, 7)],
      uptimeSeconds: [],
      load1: fullLoad1,
      load5: fullLoad5,
      load15: fullLoad15,
      lastScrape: fullLastScrape,
      netRx: {},
      nowUnix: now,
    });
    const tower = rows.find((r) => r.name === "tower")!;
    expect(tower.containerCount).toBeNull();
    const dt = rows.find((r) => r.name === "docker-tower")!;
    expect(dt.containerCount).toBe(7);
    const mcow = rows.find((r) => r.name === "mcow")!;
    expect(mcow.containerCount).toBeNull();
  });

  test("dead last-scrape → stale:'dead'", () => {
    const rows = buildHostRows({
      cpu: fullCpu,
      mem: fullMem,
      disk: fullDisk,
      containers: [],
      uptimeSeconds: [],
      load1: fullLoad1,
      load5: fullLoad5,
      load15: fullLoad15,
      lastScrape: allInstances.map((inst) =>
        sample({ instance: inst }, now - 1000),
      ),
      netRx: {},
      nowUnix: now,
    });
    for (const r of rows) {
      expect(r.stale).toBe("dead");
    }
  });

  test("netRx sparkline passed through by hostname", () => {
    const rows = buildHostRows({
      cpu: fullCpu,
      mem: fullMem,
      disk: fullDisk,
      containers: [],
      uptimeSeconds: [],
      load1: fullLoad1,
      load5: fullLoad5,
      load15: fullLoad15,
      lastScrape: fullLastScrape,
      netRx: { tower: [1, 2, 3] },
      nowUnix: now,
    });
    const tower = rows.find((r) => r.name === "tower")!;
    expect(tower.netRx15m).toEqual([1, 2, 3]);
    const mcow = rows.find((r) => r.name === "mcow")!;
    expect(mcow.netRx15m).toEqual([]);
  });
});
