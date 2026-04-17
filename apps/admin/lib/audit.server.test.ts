import { describe, test, expect, spyOn } from "bun:test";
import { emitAudit, type AuditEvent } from "./audit.server";

function captureStdout(fn: () => void): string[] {
  const lines: string[] = [];
  const spy = spyOn(process.stdout, "write").mockImplementation(
    // @ts-expect-error — stdout.write has many overloads; we capture the first arg.
    (chunk: string | Uint8Array) => {
      const s = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8");
      lines.push(s);
      return true;
    },
  );
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return lines;
}

describe("emitAudit", () => {
  test("writes exactly one single-line JSON record to stdout", () => {
    const lines = captureStdout(() => {
      emitAudit({
        actor: "makscee",
        action: "token.add",
        token_id: "11111111-2222-3333-4444-555555555555",
        diff: { label: { after: "alpha" } },
      });
    });
    expect(lines.length).toBe(1);
    const line = lines[0];
    expect(line.endsWith("\n")).toBe(true);
    // Exactly one newline.
    expect(line.split("\n").length).toBe(2);
    const parsed = JSON.parse(line);
    expect(typeof parsed).toBe("object");
    expect(parsed.actor).toBe("makscee");
  });

  test("output contains exactly the keys ts/actor/action/token_id/diff", () => {
    const lines = captureStdout(() => {
      emitAudit({
        actor: "makscee",
        action: "token.rename",
        token_id: "id-1",
        diff: { label: { before: "x", after: "y" } },
      });
    });
    const parsed = JSON.parse(lines[0]);
    const keys = Object.keys(parsed).sort();
    expect(keys).toEqual(["action", "actor", "diff", "token_id", "ts"]);
  });

  test("ts is a valid ISO 8601 datetime when not provided", () => {
    const lines = captureStdout(() => {
      emitAudit({
        actor: "u",
        action: "token.toggle",
        token_id: "id",
        diff: { enabled: { before: true, after: false } },
      });
    });
    const parsed = JSON.parse(lines[0]);
    expect(typeof parsed.ts).toBe("string");
    // Should round-trip through Date without NaN.
    const d = new Date(parsed.ts);
    expect(Number.isNaN(d.getTime())).toBe(false);
    // ISO 8601 with Z or offset — check for T separator and either Z or +/- timezone.
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);
  });

  test("redacts token value in diff (before AND after) regardless of input", () => {
    const lines = captureStdout(() => {
      emitAudit({
        actor: "u",
        action: "token.rotate",
        token_id: "id",
        diff: {
          value: { before: "sk-ant-oat01-ABC", after: "sk-ant-oat01-XYZ" },
          rotated_at: { before: undefined, after: "2026-04-17T00:00:00Z" },
        },
      });
    });
    const parsed = JSON.parse(lines[0]);
    expect(parsed.diff.value).toEqual({ before: "[REDACTED]", after: "[REDACTED]" });
    // Non-value fields pass through untouched.
    expect(parsed.diff.rotated_at.after).toBe("2026-04-17T00:00:00Z");
    // Full JSON must never contain the raw token.
    expect(lines[0]).not.toContain("sk-ant-oat01-ABC");
    expect(lines[0]).not.toContain("sk-ant-oat01-XYZ");
  });

  test("is synchronous — returns undefined, not a Promise", () => {
    const lines = captureStdout(() => {
      const result = emitAudit({
        actor: "u",
        action: "token.delete",
        token_id: "id",
        diff: { deleted_at: { after: "2026-04-17T00:00:00Z" } },
      });
      expect(result).toBeUndefined();
      // If it returned a Promise, typeof would be "object" with a .then.
      expect(typeof (result as unknown as { then?: unknown } | undefined)?.then).toBe(
        "undefined",
      );
    });
    expect(lines.length).toBe(1);
  });
});

// Compile-time shape check: AuditEvent is exported with the right fields.
const _shape: AuditEvent = {
  ts: new Date().toISOString(),
  actor: "x",
  action: "token.add",
  token_id: "y",
  diff: {},
};
void _shape;
