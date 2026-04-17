import { describe, expect, test } from "bun:test";
import { fillClassForRatio, formatRatioPct } from "./ClaudeSummary";

// No React Testing Library in this project — cover the pure helpers that
// implement the UI-SPEC color + label rules. JSX render coverage is
// exercised by `bun run build`.

describe("fillClassForRatio", () => {
  test("< 0.80 → bg-primary", () => {
    expect(fillClassForRatio(0)).toBe("bg-primary");
    expect(fillClassForRatio(0.5)).toBe("bg-primary");
    expect(fillClassForRatio(0.79)).toBe("bg-primary");
  });

  test("0.80 .. 0.949 → bg-amber-500", () => {
    expect(fillClassForRatio(0.8)).toBe("bg-amber-500");
    expect(fillClassForRatio(0.85)).toBe("bg-amber-500");
    expect(fillClassForRatio(0.94)).toBe("bg-amber-500");
  });

  test(">= 0.95 → bg-destructive", () => {
    expect(fillClassForRatio(0.95)).toBe("bg-destructive");
    expect(fillClassForRatio(1)).toBe("bg-destructive");
    expect(fillClassForRatio(1.5)).toBe("bg-destructive");
  });
});

describe("formatRatioPct", () => {
  test("0 → 0%", () => {
    expect(formatRatioPct(0)).toBe("0%");
  });

  test("0.5 → 50%", () => {
    expect(formatRatioPct(0.5)).toBe("50%");
  });

  test("0.856 → 86% (rounded)", () => {
    expect(formatRatioPct(0.856)).toBe("86%");
  });

  test("1 → 100%", () => {
    expect(formatRatioPct(1)).toBe("100%");
  });

  test("overflow clamped to 150%", () => {
    expect(formatRatioPct(2)).toBe("150%");
  });

  test("negative clamped to 0%", () => {
    expect(formatRatioPct(-0.5)).toBe("0%");
  });
});
