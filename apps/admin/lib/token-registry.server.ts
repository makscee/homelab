import "server-only";

import { randomUUID } from "node:crypto";

import * as sopsModule from "./sops.server";
import {
  SopsUnavailableError,
  type TokenEntry,
  type TokenRegistry,
} from "./sops.server";
import { emitAudit, type AuditDiff } from "./audit.server";

// --------------------------------------------------------------------------
// Dependency injection for tests
//
// We DO NOT use Bun's `mock.module("./sops.server", ...)` because that mock
// persists for the whole test process and bleeds into sops.server.test.ts
// which imports the real module. Instead, tests call `_setSopsImpl({...})`
// with an in-memory double and `_setSopsImpl(null)` to restore.
// --------------------------------------------------------------------------

type SopsImpl = {
  sopsAvailable: () => boolean;
  decryptRegistry: (path?: string) => Promise<TokenRegistry>;
  replaceRegistry: (path: string, next: TokenRegistry) => Promise<void>;
  mutateRegistry: <T>(
    path: string,
    mutator: (
      current: TokenRegistry,
    ) => Promise<{ next: TokenRegistry; result: T }>,
  ) => Promise<T>;
};

let sopsImpl: SopsImpl | null = null;

/** Test-only: swap the sops.server surface used by this module. */
export function _setSopsImplForTest(impl: SopsImpl | null): void {
  sopsImpl = impl;
}

function sops(): SopsImpl {
  return sopsImpl ?? sopsModule;
}

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/**
 * Shape returned to clients. `value` is NEVER included — the plaintext token
 * only exists inside the sops.server.ts boundary and in-memory here briefly
 * during mutations.
 */
export type PublicTokenEntry = Omit<TokenEntry, "value">;

// --------------------------------------------------------------------------
// Constants + helpers
// --------------------------------------------------------------------------

/**
 * Claude OAuth tokens match `sk-ant-oat01-...`. Anything else is rejected
 * server-side before we touch the registry, matching the same regex used in
 * sops.server's Zod schema and every Route Handler's Zod input schema.
 */
const VALUE_REGEX = /^sk-ant-oat01-[A-Za-z0-9_-]+$/;

const REGISTRY_PATH =
  process.env.CLAUDE_TOKENS_SOPS_PATH ?? "secrets/claude-tokens.sops.yaml";

function toPublic(entry: TokenEntry): PublicTokenEntry {
  // Destructure-and-discard `value`. The `_` prefix + void silences lint
  // without widening the public shape.
  const { value: _value, ...rest } = entry;
  void _value;
  return rest;
}

function requireSops(): void {
  if (!sops().sopsAvailable()) {
    throw new SopsUnavailableError("sops binary unavailable");
  }
}

/**
 * Thrown by `findEntry` when no live (non-deleted) token matches the given id.
 * Route handlers branch on `instanceof TokenNotFoundError` to map to HTTP 404
 * instead of the generic 400, so clients can distinguish "acted on a deleted
 * or never-existed token" from "malformed body". See WR-05.
 */
export class TokenNotFoundError extends Error {
  constructor(message = "token not found") {
    super(message);
    this.name = "TokenNotFoundError";
  }
}

function findEntry(reg: TokenRegistry, id: string): TokenEntry {
  const e = reg.tokens.find((t) => t.id === id && !t.deleted_at);
  if (!e) throw new TokenNotFoundError();
  return e;
}

function ensureUniqueLabel(
  reg: TokenRegistry,
  label: string,
  exceptId?: string,
): void {
  const collision = reg.tokens.find(
    (t) => !t.deleted_at && t.label === label && t.id !== exceptId,
  );
  if (collision) throw new Error("duplicate label");
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

export async function listTokens(): Promise<PublicTokenEntry[]> {
  const reg = await sops().decryptRegistry();
  return reg.tokens.filter((t) => !t.deleted_at).map(toPublic);
}

/**
 * Fetch a single non-deleted token by id. Returns null when no live entry
 * matches — callers (the detail page) call `notFound()` in that case.
 */
export async function getTokenById(
  id: string,
): Promise<PublicTokenEntry | null> {
  const reg = await sops().decryptRegistry();
  const e = reg.tokens.find((t) => t.id === id && !t.deleted_at);
  return e ? toPublic(e) : null;
}

// All mutation paths below hold the sops.server mutex across the full
// decrypt → mutate → write cycle via `mutateRegistry`. Prior code did
// `decrypt` outside the mutex and only took the lock around `replaceRegistry`,
// which left a TOCTOU window where two concurrent addToken/renameToken
// callers could both read the same registry, both pass `ensureUniqueLabel`,
// then serialize through the write lock with the later write silently
// clobbering the earlier one (data loss / duplicate label). See WR-01.

export async function addToken(
  input: {
    label: string;
    value: string;
    tier: TokenEntry["tier"];
    owner_host: string;
    notes?: string;
  },
  actor: string,
): Promise<PublicTokenEntry> {
  requireSops();
  if (!VALUE_REGEX.test(input.value)) {
    throw new Error("invalid token format");
  }

  const entry = await sops().mutateRegistry<TokenEntry>(
    REGISTRY_PATH,
    async (reg) => {
      ensureUniqueLabel(reg, input.label);
      const created: TokenEntry = {
        id: randomUUID(),
        label: input.label,
        value: input.value,
        tier: input.tier,
        owner_host: input.owner_host,
        enabled: true,
        added_at: new Date().toISOString(),
        notes: input.notes,
      };
      const next: TokenRegistry = { tokens: [...reg.tokens, created] };
      return { next, result: created };
    },
  );

  const diff: AuditDiff = {
    label: { after: entry.label },
    tier: { after: entry.tier },
    owner_host: { after: entry.owner_host },
    enabled: { after: true },
    // `value` is a tracked redaction key; passing a sentinel keeps the
    // before/after shape uniform with other mutations without any risk of
    // plaintext leaking — audit.server.ts forces [REDACTED] regardless.
    value: { after: "[NEW]" },
  };
  emitAudit({ actor, action: "token.add", token_id: entry.id, diff });

  return toPublic(entry);
}

export async function rotateToken(
  id: string,
  newValue: string,
  actor: string,
): Promise<PublicTokenEntry> {
  requireSops();
  if (!VALUE_REGEX.test(newValue)) {
    throw new Error("invalid token format");
  }

  const { entry, prevRotated } = await sops().mutateRegistry<{
    entry: TokenEntry;
    prevRotated: string | undefined;
  }>(REGISTRY_PATH, async (reg) => {
    const e = findEntry(reg, id);
    const previous = e.rotated_at;
    e.value = newValue;
    e.rotated_at = new Date().toISOString();
    return { next: reg, result: { entry: e, prevRotated: previous } };
  });

  emitAudit({
    actor,
    action: "token.rotate",
    token_id: id,
    diff: {
      // Sentinels; audit.server also force-redacts `value` entries.
      value: { before: "[ROTATED]", after: "[ROTATED]" },
      rotated_at: { before: prevRotated, after: entry.rotated_at },
    },
  });

  return toPublic(entry);
}

export async function toggleEnabled(
  id: string,
  enabled: boolean,
  actor: string,
): Promise<PublicTokenEntry> {
  requireSops();

  const { entry, before } = await sops().mutateRegistry<{
    entry: TokenEntry;
    before: boolean;
  }>(REGISTRY_PATH, async (reg) => {
    const e = findEntry(reg, id);
    const prev = e.enabled;
    e.enabled = enabled;
    return { next: reg, result: { entry: e, before: prev } };
  });

  emitAudit({
    actor,
    action: "token.toggle",
    token_id: id,
    diff: { enabled: { before, after: enabled } },
  });

  return toPublic(entry);
}

export async function renameToken(
  id: string,
  newLabel: string,
  actor: string,
): Promise<PublicTokenEntry> {
  requireSops();

  const { entry, before } = await sops().mutateRegistry<{
    entry: TokenEntry;
    before: string;
  }>(REGISTRY_PATH, async (reg) => {
    const e = findEntry(reg, id);
    ensureUniqueLabel(reg, newLabel, id);
    const prev = e.label;
    e.label = newLabel;
    return { next: reg, result: { entry: e, before: prev } };
  });

  emitAudit({
    actor,
    action: "token.rename",
    token_id: id,
    diff: { label: { before, after: newLabel } },
  });

  return toPublic(entry);
}

export async function softDeleteToken(id: string, actor: string): Promise<void> {
  requireSops();

  const deletedAt = await sops().mutateRegistry<string>(
    REGISTRY_PATH,
    async (reg) => {
      const e = findEntry(reg, id);
      e.deleted_at = new Date().toISOString();
      return { next: reg, result: e.deleted_at };
    },
  );

  emitAudit({
    actor,
    action: "token.delete",
    token_id: id,
    diff: { deleted_at: { after: deletedAt } },
  });
}
