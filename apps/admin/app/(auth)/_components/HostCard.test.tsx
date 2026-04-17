import { describe, expect, test } from "bun:test";
import { formatUptime, formatLoad } from "./HostCard";

// No RTL installed — we cover the pure formatting helpers (uptime + load)
// which together implement the UI-SPEC copy rules and the "null → —"
// contract. JSX render coverage is exercised by `bun run build`.

describe("formatUptime", () => {
  test("null → —", () => {
    expect(formatUptime(null)).toBe("—");
  });

  test("NaN → —", () => {
    expect(formatUptime(Number.NaN)).toBe("—");
  });

  test("negative → —", () => {
    expect(formatUptime(-1)).toBe("—");
  });

  test("< 86400s → 'Xh Ym'", () => {
    // 3661s = 1h 1m
    expect(formatUptime(3661)).toBe("1h 1m");
    // 86399s = 23h 59m (boundary just under a day)
    expect(formatUptime(86399)).toBe("23h 59m");
  });

  test(">= 86400s → 'Xd Yh'", () => {
    // 86400s = 1d 0h (boundary inclusive at 1 day)
    expect(formatUptime(86400)).toBe("1d 0h");
    // 2d 3h = 2*86400 + 3*3600 = 183600
    expect(formatUptime(183600)).toBe("2d 3h");
  });

  test("0s → '0h 0m'", () => {
    expect(formatUptime(0)).toBe("0h 0m");
  });
});

describe("formatLoad", () => {
  test("null → —", () => {
    expect(formatLoad(null)).toBe("—");
  });

  test("NaN → —", () => {
    expect(formatLoad(Number.NaN)).toBe("—");
  });

  test("0.5 → '0.50'", () => {
    expect(formatLoad(0.5)).toBe("0.50");
  });

  test("1.234 → '1.23' (2 decimal places)", () => {
    expect(formatLoad(1.234)).toBe("1.23");
  });
});
