import { describe, expect, test } from "bun:test";
import { buildSeverityRows, formatFiring } from "./AlertsCard";
import type { AlertCount } from "./useAlertCount";

const mk = (p: Partial<AlertCount["bySeverity"]>, healthy = true): AlertCount => {
  const by = { critical: 0, warning: 0, info: 0, other: 0, ...p };
  const total = by.critical + by.warning + by.info + by.other;
  return { total, bySeverity: by, healthy };
};

describe("formatFiring", () => {
  test("3 → '3 firing'", () => {
    expect(formatFiring(3)).toBe("3 firing");
  });
  test("1 → '1 firing' (plan uses singular grammar)", () => {
    expect(formatFiring(1)).toBe("1 firing");
  });
});

describe("buildSeverityRows", () => {
  test("no alerts → empty list", () => {
    expect(buildSeverityRows(mk({}))).toEqual([]);
  });

  test("skips zero-count severities", () => {
    const rows = buildSeverityRows(mk({ critical: 2 }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: "critical",
      name: "Critical",
      count: 2,
      variant: "destructive",
    });
  });

  test("critical=1, warning=2 → ordered critical then warning", () => {
    const rows = buildSeverityRows(mk({ critical: 1, warning: 2 }));
    expect(rows.map((r) => r.key)).toEqual(["critical", "warning"]);
  });

  test("info and other render with correct variants", () => {
    const rows = buildSeverityRows(mk({ info: 1, other: 1 }));
    expect(rows.find((r) => r.key === "info")?.variant).toBe("secondary");
    expect(rows.find((r) => r.key === "other")?.variant).toBe("outline-solid");
  });
});
