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

function findEntry(reg: TokenRegistry, id: string): TokenEntry {
  const e = reg.tokens.find((t) => t.id === id && !t.deleted_at);
  if (!e) throw new Error("token not found");
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
  const reg = await sops().decryptRegistry();
  ensureUniqueLabel(reg, input.label);

  const entry: TokenEntry = {
    id: randomUUID(),
    label: input.label,
    value: input.value,
    tier: input.tier,
    owner_host: input.owner_host,
    enabled: true,
    added_at: new Date().toISOString(),
    notes: input.notes,
  };

  const next: TokenRegistry = { tokens: [...reg.tokens, entry] };
  await sops().replaceRegistry(REGISTRY_PATH, next);

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
  const reg = await sops().decryptRegistry();
  const e = findEntry(reg, id);
  const prevRotated = e.rotated_at;
  e.value = newValue;
  e.rotated_at = new Date().toISOString();

  await sops().replaceRegistry(REGISTRY_PATH, reg);

  emitAudit({
    actor,
    action: "token.rotate",
    token_id: id,
    diff: {
      // Sentinels; audit.server also force-redacts `value` entries.
      value: { before: "[ROTATED]", after: "[ROTATED]" },
      rotated_at: { before: prevRotated, after: e.rotated_at },
    },
  });

  return toPublic(e);
}

export async function toggleEnabled(
  id: string,
  enabled: boolean,
  actor: string,
): Promise<PublicTokenEntry> {
  requireSops();
  const reg = await sops().decryptRegistry();
  const e = findEntry(reg, id);
  const before = e.enabled;
  e.enabled = enabled;

  await sops().replaceRegistry(REGISTRY_PATH, reg);

  emitAudit({
    actor,
    action: "token.toggle",
    token_id: id,
    diff: { enabled: { before, after: enabled } },
  });

  return toPublic(e);
}

export async function renameToken(
  id: string,
  newLabel: string,
  actor: string,
): Promise<PublicTokenEntry> {
  requireSops();
  const reg = await sops().decryptRegistry();
  const e = findEntry(reg, id);
  ensureUniqueLabel(reg, newLabel, id);
  const before = e.label;
  e.label = newLabel;

  await sops().replaceRegistry(REGISTRY_PATH, reg);

  emitAudit({
    actor,
    action: "token.rename",
    token_id: id,
    diff: { label: { before, after: newLabel } },
  });

  return toPublic(e);
}

export async function softDeleteToken(id: string, actor: string): Promise<void> {
  requireSops();
  const reg = await sops().decryptRegistry();
  const e = findEntry(reg, id);
  e.deleted_at = new Date().toISOString();

  await sops().replaceRegistry(REGISTRY_PATH, reg);

  emitAudit({
    actor,
    action: "token.delete",
    token_id: id,
    diff: { deleted_at: { after: e.deleted_at } },
  });
}
