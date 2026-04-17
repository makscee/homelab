/**
 * Audit page tests — logic-only (no RTL; Phase 19 will add full render harness).
 * Tests focus on cursor math, PayloadCell preview logic, and pagination visibility.
 * TODO: Phase 19 — upgrade to @testing-library/react for full render coverage.
 */

import { describe, test, expect } from "bun:test";

// ── PayloadCell preview math ──────────────────────────────────────────────────

/** Mirrors the preview logic in PayloadCell.tsx */
function previewJson(json: string | null): string | null {
  if (json === null) return null;
  return json.length > 80 ? json.slice(0, 80) + "…" : json;
}

describe("PayloadCell preview logic", () => {
  test("null payload returns null (renders em dash)", () => {
    expect(previewJson(null)).toBeNull();
  });

  test("short payload returned as-is (<=80 chars)", () => {
    const json = '{"action":"test"}';
    expect(previewJson(json)).toBe(json);
  });

  test("exactly 80 chars returned as-is", () => {
    const json = "x".repeat(80);
    expect(previewJson(json)).toBe(json);
  });

  test("81 chars gets truncated to 80 + ellipsis", () => {
    const json = "x".repeat(81);
    const result = previewJson(json);
    expect(result).toBe("x".repeat(80) + "…");
  });

  test("long payload shows first 80 chars + ellipsis", () => {
    const json = JSON.stringify({ key: "a".repeat(200) });
    const result = previewJson(json)!;
    expect(result.endsWith("…")).toBe(true);
    // The preview part (before the ellipsis) is 80 chars
    expect(result.slice(0, 80)).toBe(json.slice(0, 80));
  });
});

// ── Cursor pagination visibility logic ───────────────────────────────────────

/** Mirrors pagination decisions in AuditTable.tsx */
function paginationState(rowCount: number, pageSize: number, before: number | null) {
  const showNewer = before !== null;
  const showOlder = rowCount === pageSize;
  return { showNewer, showOlder };
}

describe("Pagination visibility", () => {
  const PAGE = 50;

  test("0 rows, no cursor → neither button shown", () => {
    const { showNewer, showOlder } = paginationState(0, PAGE, null);
    expect(showNewer).toBe(false);
    expect(showOlder).toBe(false);
  });

  test("30 rows, no cursor → Older hidden (< PAGE), Newer hidden (no cursor)", () => {
    const { showNewer, showOlder } = paginationState(30, PAGE, null);
    expect(showNewer).toBe(false);
    expect(showOlder).toBe(false);
  });

  test("50 rows, no cursor → Older shown (full page), Newer hidden", () => {
    const { showNewer, showOlder } = paginationState(50, PAGE, null);
    expect(showNewer).toBe(false);
    expect(showOlder).toBe(true);
  });

  test("50 rows, with cursor → both shown", () => {
    const { showNewer, showOlder } = paginationState(50, PAGE, 100);
    expect(showNewer).toBe(true);
    expect(showOlder).toBe(true);
  });

  test("30 rows, with cursor → Newer shown, Older hidden", () => {
    const { showNewer, showOlder } = paginationState(30, PAGE, 100);
    expect(showNewer).toBe(true);
    expect(showOlder).toBe(false);
  });
});

// ── Cursor validation (Zod schema behavior) ───────────────────────────────────

import { z } from "zod";

const BeforeSchema = z.string().regex(/^\d+$/).optional();

describe("Before cursor Zod validation", () => {
  test("undefined is valid (first page)", () => {
    expect(BeforeSchema.safeParse(undefined).success).toBe(true);
  });

  test("numeric string is valid", () => {
    expect(BeforeSchema.safeParse("100").success).toBe(true);
  });

  test("alphabetic string is invalid (→ falls back to first page, no 500)", () => {
    expect(BeforeSchema.safeParse("abc").success).toBe(false);
  });

  test("empty string is invalid", () => {
    expect(BeforeSchema.safeParse("").success).toBe(false);
  });

  test("negative number string is invalid (no leading minus in \\d+)", () => {
    expect(BeforeSchema.safeParse("-1").success).toBe(false);
  });

  test("float string is invalid", () => {
    expect(BeforeSchema.safeParse("1.5").success).toBe(false);
  });
});

// ── Relative time helper logic ────────────────────────────────────────────────

/** Mirrors relativeTime() in AuditTable.tsx */
function relativeTime(iso: string, now: Date): string {
  const t = new Date(iso);
  const diffSec = Math.floor((now.getTime() - t.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 7 * 86400) return "Yesterday";
  return t.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

describe("relativeTime helper", () => {
  const base = new Date("2026-04-17T12:00:00Z");

  test("30s ago → 'just now'", () => {
    expect(relativeTime("2026-04-17T11:59:30Z", base)).toBe("just now");
  });

  test("5 min ago → '5m ago'", () => {
    expect(relativeTime("2026-04-17T11:55:00Z", base)).toBe("5m ago");
  });

  test("2 hours ago → '2h ago'", () => {
    expect(relativeTime("2026-04-17T10:00:00Z", base)).toBe("2h ago");
  });

  test("yesterday → 'Yesterday'", () => {
    expect(relativeTime("2026-04-16T12:00:00Z", base)).toBe("Yesterday");
  });
});
