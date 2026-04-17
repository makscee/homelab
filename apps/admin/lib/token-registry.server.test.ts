import { describe, test, expect, beforeEach, mock, spyOn } from "bun:test";

// --------------------------------------------------------------------------
// Mock ./sops.server BEFORE the registry module imports it. Bun's mock.module
// is hoisted per file, so module-scope placement is sufficient.
// --------------------------------------------------------------------------

type TokenEntry = {
  id: string;
  label: string;
  value: string;
  tier: "pro" | "max" | "enterprise";
  owner_host: string;
  enabled: boolean;
  added_at: string;
  rotated_at?: string;
  deleted_at?: string;
  notes?: string;
};
type TokenRegistry = { tokens: TokenEntry[] };

type SopsState = {
  store: TokenRegistry;
  replaceCalls: number;
  decryptCalls: number;
  available: boolean;
};

const sopsState: SopsState = {
  store: { tokens: [] },
  replaceCalls: 0,
  decryptCalls: 0,
  available: true,
};

class SopsUnavailableError extends Error {
  constructor(message = "sops binary unavailable") {
    super(message);
    this.name = "SopsUnavailableError";
  }
}

mock.module("./sops.server", () => ({
  sopsAvailable: () => sopsState.available,
  decryptRegistry: async (_path?: string) => {
    sopsState.decryptCalls += 1;
    // Return a DEEP copy so the caller can't mutate our store accidentally.
    return JSON.parse(JSON.stringify(sopsState.store)) as TokenRegistry;
  },
  replaceRegistry: async (_path: string, next: TokenRegistry) => {
    sopsState.replaceCalls += 1;
    sopsState.store = JSON.parse(JSON.stringify(next)) as TokenRegistry;
  },
  // setRegistryField not used by token-registry, but keep stub for completeness.
  setRegistryField: async () => undefined,
  SopsUnavailableError,
  // Re-export types via empty no-ops (types erased at runtime).
}));

// Now import the module under test (after the mock is installed).
import {
  listTokens,
  addToken,
  rotateToken,
  toggleEnabled,
  renameToken,
  softDeleteToken,
  type PublicTokenEntry,
} from "./token-registry.server";

import * as audit from "./audit.server";

function resetState(): void {
  sopsState.store = { tokens: [] };
  sopsState.replaceCalls = 0;
  sopsState.decryptCalls = 0;
  sopsState.available = true;
}

function seedToken(partial: Partial<TokenEntry> = {}): TokenEntry {
  const e: TokenEntry = {
    id: partial.id ?? "11111111-1111-4111-8111-111111111111",
    label: partial.label ?? "alpha",
    value: partial.value ?? "sk-ant-oat01-AAAAAAAAAAAAAAAA",
    tier: partial.tier ?? "max",
    owner_host: partial.owner_host ?? "mcow",
    enabled: partial.enabled ?? true,
    added_at: partial.added_at ?? "2026-04-17T00:00:00Z",
    rotated_at: partial.rotated_at,
    deleted_at: partial.deleted_at,
    notes: partial.notes,
  };
  sopsState.store.tokens.push(e);
  return e;
}

beforeEach(() => {
  resetState();
});

describe("listTokens", () => {
  test("returns non-deleted entries with value stripped", async () => {
    seedToken({ id: "11111111-1111-4111-8111-111111111111", label: "alpha" });
    seedToken({
      id: "22222222-2222-4222-8222-222222222222",
      label: "deleted-one",
      deleted_at: "2026-04-17T00:00:00Z",
    });
    const out = await listTokens();
    expect(out.length).toBe(1);
    expect(out[0].label).toBe("alpha");
    // value field must be absent in the public shape.
    expect(Object.hasOwn(out[0] as object, "value")).toBe(false);
  });
});

describe("addToken", () => {
  test("generates uuid v4 id + added_at, appends to registry, emits audit", async () => {
    const emitSpy = spyOn(audit, "emitAudit").mockImplementation(() => undefined);
    try {
      const result = await addToken(
        {
          label: "new",
          value: "sk-ant-oat01-ABCDEF",
          tier: "pro",
          owner_host: "mcow",
          notes: "seed",
        },
        "makscee",
      );
      expect((result as PublicTokenEntry).label).toBe("new");
      // uuid v4-ish check (8-4-4-4-12 hex).
      expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(typeof result.added_at).toBe("string");
      expect(sopsState.store.tokens.length).toBe(1);
      expect(sopsState.replaceCalls).toBe(1);

      expect(emitSpy).toHaveBeenCalledTimes(1);
      const event = emitSpy.mock.calls[0][0] as {
        action: string;
        actor: string;
        diff: Record<string, { after?: unknown }>;
      };
      expect(event.action).toBe("token.add");
      expect(event.actor).toBe("makscee");
      // Diff records all set fields; value key MUST NOT leak plaintext.
      expect(event.diff.label?.after).toBe("new");
      expect(event.diff.enabled?.after).toBe(true);
      expect(event.diff.value?.after).toBe("[NEW]");
    } finally {
      emitSpy.mockRestore();
    }
  });

  test("throws on duplicate label (non-deleted collision)", async () => {
    seedToken({ label: "dup" });
    await expect(
      addToken(
        { label: "dup", value: "sk-ant-oat01-B", tier: "pro", owner_host: "mcow" },
        "u",
      ),
    ).rejects.toThrow(/duplicate label/);
    // No write side-effect on validation failure.
    expect(sopsState.replaceCalls).toBe(0);
  });

  test("rejects value not matching sk-ant-oat01- regex", async () => {
    await expect(
      addToken(
        { label: "x", value: "not-a-token", tier: "pro", owner_host: "mcow" },
        "u",
      ),
    ).rejects.toThrow(/invalid token format/);
    expect(sopsState.replaceCalls).toBe(0);
  });
});

describe("rotateToken", () => {
  test("atomically swaps value + sets rotated_at; audit diff redacts value", async () => {
    const e = seedToken({ id: "33333333-3333-4333-8333-333333333333", label: "r" });
    const emitSpy = spyOn(audit, "emitAudit").mockImplementation(() => undefined);
    try {
      const out = await rotateToken(e.id, "sk-ant-oat01-NEWVAL", "makscee");
      expect(out.rotated_at).toBeDefined();
      expect(sopsState.store.tokens[0].value).toBe("sk-ant-oat01-NEWVAL");
      expect(sopsState.replaceCalls).toBe(1);
      expect(emitSpy).toHaveBeenCalledTimes(1);
      const event = emitSpy.mock.calls[0][0] as {
        action: string;
        diff: Record<string, { before?: unknown; after?: unknown }>;
      };
      expect(event.action).toBe("token.rotate");
      expect(event.diff.value?.before).toBe("[ROTATED]");
      expect(event.diff.value?.after).toBe("[ROTATED]");
      expect(event.diff.rotated_at?.after).toBeDefined();
    } finally {
      emitSpy.mockRestore();
    }
  });
});

describe("toggleEnabled", () => {
  test("flips enabled bool; audit diff shows before/after", async () => {
    const e = seedToken({ id: "44444444-4444-4444-8444-444444444444", enabled: true });
    const emitSpy = spyOn(audit, "emitAudit").mockImplementation(() => undefined);
    try {
      const out = await toggleEnabled(e.id, false, "u");
      expect(out.enabled).toBe(false);
      expect(sopsState.replaceCalls).toBe(1);
      expect(emitSpy).toHaveBeenCalledTimes(1);
      const ev = emitSpy.mock.calls[0][0] as {
        action: string;
        diff: Record<string, { before?: unknown; after?: unknown }>;
      };
      expect(ev.action).toBe("token.toggle");
      expect(ev.diff.enabled).toEqual({ before: true, after: false });
    } finally {
      emitSpy.mockRestore();
    }
  });
});

describe("renameToken", () => {
  test("updates label when no collision; audit records before/after", async () => {
    const e = seedToken({ id: "55555555-5555-4555-8555-555555555555", label: "old" });
    const emitSpy = spyOn(audit, "emitAudit").mockImplementation(() => undefined);
    try {
      const out = await renameToken(e.id, "new-label", "u");
      expect(out.label).toBe("new-label");
      expect(sopsState.replaceCalls).toBe(1);
      const ev = emitSpy.mock.calls[0][0] as {
        action: string;
        diff: Record<string, { before?: unknown; after?: unknown }>;
      };
      expect(ev.action).toBe("token.rename");
      expect(ev.diff.label).toEqual({ before: "old", after: "new-label" });
    } finally {
      emitSpy.mockRestore();
    }
  });

  test("throws on collision with another non-deleted label", async () => {
    seedToken({ id: "66666666-6666-4666-8666-666666666666", label: "taken" });
    const other = seedToken({ id: "77777777-7777-4777-8777-777777777777", label: "self" });
    await expect(renameToken(other.id, "taken", "u")).rejects.toThrow(/duplicate label/);
    expect(sopsState.replaceCalls).toBe(0);
  });
});

describe("softDeleteToken", () => {
  test("sets deleted_at without removing the entry; audit action=token.delete", async () => {
    const e = seedToken({ id: "88888888-8888-4888-8888-888888888888" });
    const emitSpy = spyOn(audit, "emitAudit").mockImplementation(() => undefined);
    try {
      await softDeleteToken(e.id, "u");
      expect(sopsState.store.tokens.length).toBe(1);
      expect(sopsState.store.tokens[0].deleted_at).toBeDefined();
      expect(sopsState.replaceCalls).toBe(1);
      const ev = emitSpy.mock.calls[0][0] as { action: string };
      expect(ev.action).toBe("token.delete");
    } finally {
      emitSpy.mockRestore();
    }
  });
});

describe("invariants across all mutations", () => {
  test("each mutation calls replaceRegistry exactly once per call", async () => {
    const e = seedToken({ id: "99999999-9999-4999-8999-999999999999", label: "invar" });
    const emitSpy = spyOn(audit, "emitAudit").mockImplementation(() => undefined);
    try {
      resetState();
      seedToken({ id: e.id, label: e.label });

      await addToken(
        { label: "addc", value: "sk-ant-oat01-A", tier: "pro", owner_host: "mcow" },
        "u",
      );
      expect(sopsState.replaceCalls).toBe(1);

      await rotateToken(e.id, "sk-ant-oat01-R", "u");
      expect(sopsState.replaceCalls).toBe(2);

      await toggleEnabled(e.id, false, "u");
      expect(sopsState.replaceCalls).toBe(3);

      await renameToken(e.id, "renamed", "u");
      expect(sopsState.replaceCalls).toBe(4);

      await softDeleteToken(e.id, "u");
      expect(sopsState.replaceCalls).toBe(5);
    } finally {
      emitSpy.mockRestore();
    }
  });

  test("each mutation emits exactly one audit event per call", async () => {
    const e = seedToken({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", label: "au" });
    const emitSpy = spyOn(audit, "emitAudit").mockImplementation(() => undefined);
    try {
      resetState();
      seedToken({ id: e.id, label: e.label });

      await addToken(
        { label: "au2", value: "sk-ant-oat01-A", tier: "pro", owner_host: "mcow" },
        "u",
      );
      await rotateToken(e.id, "sk-ant-oat01-R", "u");
      await toggleEnabled(e.id, false, "u");
      await renameToken(e.id, "au-renamed", "u");
      await softDeleteToken(e.id, "u");
      expect(emitSpy).toHaveBeenCalledTimes(5);
    } finally {
      emitSpy.mockRestore();
    }
  });

  test("throws SopsUnavailableError before any write when sopsAvailable() is false", async () => {
    sopsState.available = false;
    await expect(
      addToken(
        { label: "x", value: "sk-ant-oat01-A", tier: "pro", owner_host: "mcow" },
        "u",
      ),
    ).rejects.toBeInstanceOf(SopsUnavailableError);
    expect(sopsState.replaceCalls).toBe(0);
    expect(sopsState.decryptCalls).toBe(0);
  });
});
