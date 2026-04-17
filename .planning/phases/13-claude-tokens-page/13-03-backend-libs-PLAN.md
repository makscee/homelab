---
phase: 13
plan: 03
type: execute
wave: 2
depends_on: [13-01]
files_modified:
  - apps/admin/lib/prometheus.server.ts
  - apps/admin/lib/prometheus.server.test.ts
  - apps/admin/lib/audit.server.ts
  - apps/admin/lib/audit.server.test.ts
  - apps/admin/lib/token-registry.server.ts
  - apps/admin/lib/token-registry.server.test.ts
  - apps/admin/app/api/tokens/route.ts
  - apps/admin/app/api/tokens/[id]/route.ts
  - apps/admin/app/api/tokens/[id]/rotate/route.ts
  - apps/admin/app/api/tokens/[id]/toggle/route.ts
  - apps/admin/app/api/tokens/[id]/rename/route.ts
  - apps/admin/lib/csrf.shared.ts
  - apps/admin/lib/csrf.server.ts
autonomous: true
requirements:
  - TOKEN-03
  - TOKEN-04
  - TOKEN-05
  - TOKEN-07
user_setup: []
tags:
  - backend
  - prometheus
  - audit
  - api

must_haves:
  truths:
    - "Server can fetch Prometheus instant + range queries and return typed results"
    - "Server can add, rotate, toggle, rename, and soft-delete tokens via SOPS write path"
    - "Every mutation emits a structured JSON audit event to stdout with ts/actor/action/token_id/diff"
    - "All mutation API routes reject requests without a valid same-origin + CSRF header combination"
    - "Token values never appear in any API response body or error message"
    - "API routes return 503 when sopsAvailable() is false (degraded mode)"
    - "CSRF constants live in csrf.shared.ts (no server-only marker) so client code can import them without breaking the build"
  artifacts:
    - path: "apps/admin/lib/csrf.shared.ts"
      provides: "Neutral constants module — CSRF_COOKIE_NAME, CSRF_HEADER_NAME, EXPECTED_ORIGIN — safe to import from client code"
      exports: ["CSRF_COOKIE_NAME", "CSRF_HEADER_NAME", "EXPECTED_ORIGIN"]
    - path: "apps/admin/lib/prometheus.server.ts"
      provides: "Typed fetch wrappers for /api/v1/query and /api/v1/query_range"
      exports: ["queryInstant", "queryRange", "PromInstantResult", "PromRangeResult"]
    - path: "apps/admin/lib/audit.server.ts"
      provides: "Structured JSON event emitter to stdout (journald sink); Phase 14 contract"
      exports: ["emitAudit", "AuditEvent"]
    - path: "apps/admin/lib/token-registry.server.ts"
      provides: "High-level CRUD: addToken, rotateToken, toggleEnabled, renameToken, softDeleteToken"
      exports: ["addToken", "rotateToken", "toggleEnabled", "renameToken", "softDeleteToken", "listTokens"]
    - path: "apps/admin/app/api/tokens/route.ts"
      provides: "POST /api/tokens — add new token; GET disabled (list is server-rendered)"
      exports: ["POST"]
    - path: "apps/admin/app/api/tokens/[id]/route.ts"
      provides: "DELETE (soft-delete)"
      exports: ["DELETE"]
    - path: "apps/admin/app/api/tokens/[id]/rotate/route.ts"
      provides: "POST atomic-swap rotate"
      exports: ["POST"]
    - path: "apps/admin/app/api/tokens/[id]/toggle/route.ts"
      provides: "POST toggle enabled/disabled"
      exports: ["POST"]
    - path: "apps/admin/app/api/tokens/[id]/rename/route.ts"
      provides: "POST rename label"
      exports: ["POST"]
  key_links:
    - from: "apps/admin/app/api/tokens/**"
      to: "apps/admin/lib/token-registry.server.ts"
      via: "named imports"
      pattern: "from.*token-registry"
    - from: "apps/admin/lib/token-registry.server.ts"
      to: "apps/admin/lib/sops.server.ts"
      via: "decryptRegistry + replaceRegistry"
      pattern: "from.*sops"
    - from: "apps/admin/lib/token-registry.server.ts"
      to: "apps/admin/lib/audit.server.ts"
      via: "emitAudit on every mutation"
      pattern: "emitAudit\\("
    - from: "apps/admin/lib/prometheus.server.ts"
      to: "http://mcow:9090/api/v1/query"
      via: "server-side fetch"
      pattern: "api/v1/query"
    - from: "apps/admin/lib/csrf.server.ts"
      to: "apps/admin/lib/csrf.shared.ts"
      via: "re-export of constants"
      pattern: "from './csrf.shared'"
    - from: "client code (api-client.ts in Plan 13-05)"
      to: "apps/admin/lib/csrf.shared.ts"
      via: "import constants (no server-only violation)"
      pattern: "csrf.shared"
---

<objective>
Build the backend layer consumed by Plans 13-04 (list/read page) and 13-05 (mutation dialogs): high-level token registry CRUD, Prometheus query wrappers, structured audit event emission, CSRF defense (split into shared constants + server helper), and the API Route Handlers that back each mutation. All mutations must flow through one audit-wrapped codepath; all responses must be free of token values; all routes must degrade cleanly when SOPS is unavailable.

Purpose: Isolate business logic + IO from UI so the UI plan stays thin and the checker can verify security properties against this plan alone.
Output: 3 lib modules, 1 CSRF constants shared module, 1 CSRF server helper, 5 Route Handlers, and tests for each lib.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/13-claude-tokens-page/13-CONTEXT.md
@.planning/phases/13-claude-tokens-page/13-01-sops-zod-spike-PLAN.md
@.planning/phases/13-claude-tokens-page/13-02-exporter-rebind-PLAN.md
@apps/admin/lib/auth-allowlist.server.ts
@apps/admin/middleware.ts
@apps/admin/auth.ts

<interfaces>
<!-- Reads TokenEntry/TokenRegistry types and primitives from Plan 13-01's sops.server.ts. -->
<!-- Produces the public API surface that Plans 13-04 (page) and 13-05 (client mutations) consume. -->

From Plan 13-01 `apps/admin/lib/sops.server.ts`:
```typescript
export type TokenEntry = { id, label, value, tier, owner_host, enabled,
                            added_at, rotated_at?, deleted_at?, notes? };
export type TokenRegistry = { tokens: TokenEntry[] };
export function sopsAvailable(): boolean;
export function decryptRegistry(path?: string): Promise<TokenRegistry>;
export function setRegistryField(path, jsonPath, value): Promise<void>;
export function replaceRegistry(path, next: TokenRegistry): Promise<void>;
```

From Phase 12 `apps/admin/lib/auth-allowlist.server.ts`:
```typescript
export function requireAllowlistedUser(): Promise<{ login: string }>;
```

Public API exports this plan adds:
```typescript
// lib/csrf.shared.ts (NEW — neutral, no 'server-only' marker)
export const CSRF_COOKIE_NAME: string;
export const CSRF_HEADER_NAME: string;
export const EXPECTED_ORIGIN: string;

// lib/token-registry.server.ts
export type PublicTokenEntry = Omit<TokenEntry, 'value'>;
// ^ value is NEVER returned to clients

export function listTokens(): Promise<PublicTokenEntry[]>;
export function addToken(input: { label, value, tier, owner_host, notes? },
                          actor: string): Promise<PublicTokenEntry>;
export function rotateToken(id: string, newValue: string,
                             actor: string): Promise<PublicTokenEntry>;
export function toggleEnabled(id: string, enabled: boolean,
                               actor: string): Promise<PublicTokenEntry>;
export function renameToken(id: string, newLabel: string,
                             actor: string): Promise<PublicTokenEntry>;
export function softDeleteToken(id: string, actor: string): Promise<void>;

// lib/audit.server.ts
export type AuditEvent = {
  ts: string;       // ISO 8601
  actor: string;    // github login
  action: 'token.add' | 'token.rotate' | 'token.toggle' | 'token.rename' | 'token.delete';
  token_id: string;
  diff: Record<string, { before?: unknown; after?: unknown }>;
};
export function emitAudit(event: AuditEvent): void;

// lib/prometheus.server.ts
export type PromInstantSample = { labels: Record<string,string>; value: number; ts: number };
export type PromRangeSeries = { labels: Record<string,string>; samples: [number, number][] };
export function queryInstant(promql: string): Promise<PromInstantSample[]>;
export function queryRange(promql: string, start: Date, end: Date, stepSec: number): Promise<PromRangeSeries[]>;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Prometheus query wrappers (queryInstant + queryRange)</name>
  <files>apps/admin/lib/prometheus.server.ts, apps/admin/lib/prometheus.server.test.ts</files>
  <read_first>
    - apps/admin/lib/sops.server.ts (server-only import convention + error-class pattern)
    - apps/admin/lib/auth-allowlist.server.ts (module shape reference)
    - .planning/phases/13-claude-tokens-page/13-CONTEXT.md §D-13-09 (metric names + cache strategy)
  </read_first>
  <behavior>
    - Test 1: queryInstant parses a mock `{status:"success", data:{resultType:"vector", result:[...]}}` into PromInstantSample[]
    - Test 2: queryRange parses `{status:"success", data:{resultType:"matrix", result:[...]}}` into PromRangeSeries[]
    - Test 3: Non-success response throws PromQueryError with status/reason (but no promql echo that could contain secrets — promql is app-generated, this is defensive only)
    - Test 4: Network error throws PromQueryError with a generic message
    - Test 5: queryInstant URL-encodes the promql query parameter
    - Test 6: queryRange computes `start`/`end` as unix-epoch seconds with fractional precision and `step` as an integer second count
  </behavior>
  <action>
    Create `apps/admin/lib/prometheus.server.ts`:

    ```typescript
    import 'server-only';

    const PROM_BASE = process.env.PROMETHEUS_URL ?? 'http://mcow:9090';

    export type PromInstantSample = {
      labels: Record<string, string>;
      value: number;
      ts: number;
    };

    export type PromRangeSeries = {
      labels: Record<string, string>;
      samples: Array<[number, number]>;  // [unixSec, value]
    };

    export class PromQueryError extends Error {
      constructor(public readonly status: number, message: string) {
        super(message);
        this.name = 'PromQueryError';
      }
    }

    type PromResp<T> = { status: 'success'; data: T } | { status: 'error'; errorType?: string; error?: string };

    async function promFetch<T>(path: string, params: URLSearchParams,
                                 init?: RequestInit): Promise<T> {
      const url = `${PROM_BASE}${path}?${params.toString()}`;
      let resp: Response;
      try {
        resp = await fetch(url, { ...init, cache: 'no-store' });
      } catch (e) {
        throw new PromQueryError(0, 'prometheus unreachable');
      }
      if (!resp.ok) {
        throw new PromQueryError(resp.status, `prometheus HTTP ${resp.status}`);
      }
      const body = (await resp.json()) as PromResp<T>;
      if (body.status !== 'success') {
        throw new PromQueryError(200, `prometheus query error: ${body.errorType ?? 'unknown'}`);
      }
      return body.data;
    }

    export async function queryInstant(promql: string): Promise<PromInstantSample[]> {
      const params = new URLSearchParams({ query: promql });
      const data = await promFetch<{ resultType: string; result: Array<{ metric: Record<string,string>; value: [number, string] }> }>(
        '/api/v1/query', params
      );
      return data.result.map(r => ({
        labels: r.metric,
        value: Number(r.value[1]),
        ts: r.value[0],
      }));
    }

    export async function queryRange(promql: string, start: Date, end: Date, stepSec: number,
                                      opts?: { revalidateSec?: number }): Promise<PromRangeSeries[]> {
      const params = new URLSearchParams({
        query: promql,
        start: (start.getTime() / 1000).toString(),
        end: (end.getTime() / 1000).toString(),
        step: Math.max(1, Math.floor(stepSec)).toString(),
      });
      const init: RequestInit = opts?.revalidateSec
        ? { next: { revalidate: opts.revalidateSec } } as RequestInit
        : { cache: 'no-store' };
      const data = await promFetch<{ resultType: string; result: Array<{ metric: Record<string,string>; values: Array<[number, string]> }> }>(
        '/api/v1/query_range', params, init
      );
      return data.result.map(r => ({
        labels: r.metric,
        samples: r.values.map(([t, v]) => [t, Number(v)] as [number, number]),
      }));
    }
    ```

    Create `apps/admin/lib/prometheus.server.test.ts` (Bun test) using `mock.module` or `globalThis.fetch = mock(...)` to stub fetch and assert all 6 behaviors above.
  </action>
  <verify>
    <automated>cd apps/admin &amp;&amp; bun test lib/prometheus.server.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - grep `import 'server-only'` as first line of apps/admin/lib/prometheus.server.ts
    - grep `export async function queryInstant` returns 1 line
    - grep `export async function queryRange` returns 1 line
    - grep `/api/v1/query_range` returns 1 line
    - grep `/api/v1/query\b` in prometheus.server.ts returns 1 line (for queryInstant endpoint)
    - grep `cache: 'no-store'` returns at least 1 line (live instant queries)
    - grep `next:.*revalidate` returns at least 1 line (range query cache)
    - `cd apps/admin && bun test lib/prometheus.server.test.ts` exits 0
    - Output shows 6 passed
  </acceptance_criteria>
  <done>Prometheus wrappers typed, tested, no-store for instant, revalidate for range.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Audit event emitter to stdout (journald sink)</name>
  <files>apps/admin/lib/audit.server.ts, apps/admin/lib/audit.server.test.ts</files>
  <read_first>
    - apps/admin/lib/sops.server.ts (server-only convention)
    - .planning/phases/13-claude-tokens-page/13-CONTEXT.md §D-13-08 (Phase 14 contract: stdout JSON, fields ts/actor/action/token_id/diff)
  </read_first>
  <behavior>
    - Test 1: emitAudit writes a single-line JSON to stdout (captured via process.stdout.write spy)
    - Test 2: Output contains exactly the fields ts, actor, action, token_id, diff — no extras
    - Test 3: ts is valid ISO 8601 datetime
    - Test 4: Token value in `diff` is NEVER present; diff only records field names that changed with before/after for non-value fields; value changes record `{before: '[REDACTED]', after: '[REDACTED]'}`
    - Test 5: emitAudit is synchronous (returns undefined, no Promise) — matches stdout write semantics
  </behavior>
  <action>
    Create `apps/admin/lib/audit.server.ts`:

    ```typescript
    import 'server-only';

    export type AuditAction =
      | 'token.add'
      | 'token.rotate'
      | 'token.toggle'
      | 'token.rename'
      | 'token.delete';

    export type AuditDiff = Record<string, { before?: unknown; after?: unknown }>;

    export type AuditEvent = {
      ts: string;
      actor: string;
      action: AuditAction;
      token_id: string;
      diff: AuditDiff;
    };

    const VALUE_FIELDS = new Set(['value']);

    function redactDiff(diff: AuditDiff): AuditDiff {
      const out: AuditDiff = {};
      for (const [k, v] of Object.entries(diff)) {
        if (VALUE_FIELDS.has(k)) {
          out[k] = { before: '[REDACTED]', after: '[REDACTED]' };
        } else {
          out[k] = v;
        }
      }
      return out;
    }

    export function emitAudit(event: Omit<AuditEvent, 'ts'> & { ts?: string }): void {
      const payload: AuditEvent = {
        ts: event.ts ?? new Date().toISOString(),
        actor: event.actor,
        action: event.action,
        token_id: event.token_id,
        diff: redactDiff(event.diff),
      };
      // Single-line JSON for journald; Phase 14 will replace this sink with sqlite insert
      process.stdout.write(JSON.stringify(payload) + '\n');
    }
    ```

    Create `apps/admin/lib/audit.server.test.ts` asserting all 5 behaviors. Spy on `process.stdout.write` via `spyOn`.
  </action>
  <verify>
    <automated>cd apps/admin &amp;&amp; bun test lib/audit.server.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - grep `import 'server-only'` as first line of apps/admin/lib/audit.server.ts
    - grep `export function emitAudit` returns 1 line
    - grep `type AuditAction` returns 1 line
    - grep `'token.add'` in audit.server.ts returns 1 line
    - grep `'token.rotate'` returns 1 line
    - grep `'token.toggle'` returns 1 line
    - grep `'token.rename'` returns 1 line
    - grep `'token.delete'` returns 1 line
    - grep `process.stdout.write` returns 1 line
    - grep `'\\[REDACTED\\]'` returns at least 1 line (value redaction)
    - `cd apps/admin && bun test lib/audit.server.test.ts` exits 0; 5 passed
  </acceptance_criteria>
  <done>Audit emitter writes single-line JSON to stdout with redacted value diffs; Phase 14 contract fields locked.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: High-level token-registry CRUD with audit wrapping</name>
  <files>apps/admin/lib/token-registry.server.ts, apps/admin/lib/token-registry.server.test.ts</files>
  <read_first>
    - apps/admin/lib/sops.server.ts (decryptRegistry + replaceRegistry + TokenRegistrySchema)
    - apps/admin/lib/audit.server.ts (emitAudit + AuditEvent)
    - .planning/phases/13-claude-tokens-page/13-CONTEXT.md §D-13-05 (atomic rotate), §D-13-12 (soft-delete default), §D-13-13 (schema)
  </read_first>
  <behavior>
    - Test 1: listTokens returns all non-deleted entries with `value` field stripped (PublicTokenEntry shape)
    - Test 2: addToken: generates uuid v4 id + sets added_at ISO string + appends to registry + emits audit with action=token.add and diff showing all set fields (value REDACTED)
    - Test 3: addToken: throws if label collides with an existing non-deleted entry
    - Test 4: addToken: throws if value does not match sk-ant-oat01-[A-Za-z0-9_-]+
    - Test 5: rotateToken: atomically replaces value + sets rotated_at; audit action=token.rotate; diff only shows value (REDACTED) + rotated_at
    - Test 6: toggleEnabled: flips enabled bool; audit action=token.toggle; diff shows enabled before/after
    - Test 7: renameToken: validates no collision with other non-deleted labels; updates label; audit action=token.rename
    - Test 8: softDeleteToken: sets deleted_at ISO string (does not remove entry); audit action=token.delete
    - Test 9: All mutations call replaceRegistry exactly once per call (single atomic SOPS commit)
    - Test 10: All mutations emit exactly one audit event per call
    - Test 11: If sopsAvailable() is false, mutations throw SopsUnavailableError before attempting any write
  </behavior>
  <action>
    Create `apps/admin/lib/token-registry.server.ts`:

    ```typescript
    import 'server-only';
    import { randomUUID } from 'node:crypto';
    import {
      decryptRegistry, replaceRegistry, sopsAvailable,
      TokenEntry, TokenRegistry, SopsUnavailableError,
    } from './sops.server';
    import { emitAudit, AuditDiff } from './audit.server';

    export type PublicTokenEntry = Omit<TokenEntry, 'value'>;

    const VALUE_REGEX = /^sk-ant-oat01-[A-Za-z0-9_-]+$/;

    function toPublic(e: TokenEntry): PublicTokenEntry {
      const { value, ...rest } = e;
      void value;
      return rest;
    }

    function requireSops(): void {
      if (!sopsAvailable()) throw new SopsUnavailableError('sops binary unavailable');
    }

    export async function listTokens(): Promise<PublicTokenEntry[]> {
      const reg = await decryptRegistry();
      return reg.tokens.filter(t => !t.deleted_at).map(toPublic);
    }

    function ensureUniqueLabel(reg: TokenRegistry, label: string, exceptId?: string): void {
      const collision = reg.tokens.find(t =>
        !t.deleted_at && t.label === label && t.id !== exceptId
      );
      if (collision) throw new Error('duplicate label');
    }

    export async function addToken(
      input: { label: string; value: string; tier: TokenEntry['tier']; owner_host: string; notes?: string },
      actor: string,
    ): Promise<PublicTokenEntry> {
      requireSops();
      if (!VALUE_REGEX.test(input.value)) throw new Error('invalid token format');
      const reg = await decryptRegistry();
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
      await replaceRegistry(process.env.CLAUDE_TOKENS_SOPS_PATH ?? 'secrets/claude-tokens.sops.yaml', next);
      const diff: AuditDiff = {
        label: { after: entry.label },
        tier: { after: entry.tier },
        owner_host: { after: entry.owner_host },
        enabled: { after: true },
        value: { after: '[NEW]' },   // redacted downstream
      };
      emitAudit({ actor, action: 'token.add', token_id: entry.id, diff });
      return toPublic(entry);
    }

    function findEntry(reg: TokenRegistry, id: string): TokenEntry {
      const e = reg.tokens.find(t => t.id === id && !t.deleted_at);
      if (!e) throw new Error('token not found');
      return e;
    }

    export async function rotateToken(id: string, newValue: string, actor: string): Promise<PublicTokenEntry> {
      requireSops();
      if (!VALUE_REGEX.test(newValue)) throw new Error('invalid token format');
      const reg = await decryptRegistry();
      const e = findEntry(reg, id);
      const prevRotated = e.rotated_at;
      e.value = newValue;
      e.rotated_at = new Date().toISOString();
      await replaceRegistry(process.env.CLAUDE_TOKENS_SOPS_PATH ?? 'secrets/claude-tokens.sops.yaml', reg);
      emitAudit({
        actor, action: 'token.rotate', token_id: id,
        diff: {
          value: { before: '[ROTATED]', after: '[ROTATED]' },
          rotated_at: { before: prevRotated, after: e.rotated_at },
        },
      });
      return toPublic(e);
    }

    export async function toggleEnabled(id: string, enabled: boolean, actor: string): Promise<PublicTokenEntry> {
      requireSops();
      const reg = await decryptRegistry();
      const e = findEntry(reg, id);
      const before = e.enabled;
      e.enabled = enabled;
      await replaceRegistry(process.env.CLAUDE_TOKENS_SOPS_PATH ?? 'secrets/claude-tokens.sops.yaml', reg);
      emitAudit({ actor, action: 'token.toggle', token_id: id, diff: { enabled: { before, after: enabled } } });
      return toPublic(e);
    }

    export async function renameToken(id: string, newLabel: string, actor: string): Promise<PublicTokenEntry> {
      requireSops();
      const reg = await decryptRegistry();
      const e = findEntry(reg, id);
      ensureUniqueLabel(reg, newLabel, id);
      const before = e.label;
      e.label = newLabel;
      await replaceRegistry(process.env.CLAUDE_TOKENS_SOPS_PATH ?? 'secrets/claude-tokens.sops.yaml', reg);
      emitAudit({ actor, action: 'token.rename', token_id: id, diff: { label: { before, after: newLabel } } });
      return toPublic(e);
    }

    export async function softDeleteToken(id: string, actor: string): Promise<void> {
      requireSops();
      const reg = await decryptRegistry();
      const e = findEntry(reg, id);
      e.deleted_at = new Date().toISOString();
      await replaceRegistry(process.env.CLAUDE_TOKENS_SOPS_PATH ?? 'secrets/claude-tokens.sops.yaml', reg);
      emitAudit({ actor, action: 'token.delete', token_id: id, diff: { deleted_at: { after: e.deleted_at } } });
    }
    ```

    Create `apps/admin/lib/token-registry.server.test.ts` stubbing sops.server.ts primitives with a test double (in-memory registry) and asserting all 11 behaviors. Use `mock.module('./sops.server', ...)` pattern.
  </action>
  <verify>
    <automated>cd apps/admin &amp;&amp; bun test lib/token-registry.server.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - grep `import 'server-only'` first line of token-registry.server.ts
    - grep `export async function listTokens` returns 1 line
    - grep `export async function addToken` returns 1 line
    - grep `export async function rotateToken` returns 1 line
    - grep `export async function toggleEnabled` returns 1 line
    - grep `export async function renameToken` returns 1 line
    - grep `export async function softDeleteToken` returns 1 line
    - grep `type PublicTokenEntry = Omit<TokenEntry, 'value'>` returns 1 line
    - grep `emitAudit(` returns at least 5 lines (one per mutation)
    - grep `requireSops()` returns at least 5 lines (one per mutation)
    - `cd apps/admin && bun test lib/token-registry.server.test.ts` exits 0; 11 passed
  </acceptance_criteria>
  <done>All CRUD ops wrap sops primitives, emit exactly one audit event, strip `value` from returns, and fail-fast when SOPS unavailable.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: CSRF double-submit cookie helper (split: shared constants + server verifier)</name>
  <files>apps/admin/lib/csrf.shared.ts, apps/admin/lib/csrf.server.ts, apps/admin/lib/csrf.server.test.ts</files>
  <read_first>
    - apps/admin/middleware.ts (existing auth middleware, origin/cookie patterns)
    - apps/admin/auth.ts (Auth.js session cookie name — usually `next-auth.session-token`)
    - .planning/phases/12-infra-foundation/12-CONTEXT.md (CSP + security headers pattern)
  </read_first>
  <behavior>
    - Test 1: issueCsrfCookie returns a Set-Cookie header with Path=/, SameSite=Strict, HttpOnly=false (readable by client JS to mirror into header), Secure
    - Test 2: verifyCsrf accepts when cookie value === x-csrf-token header value (and is a 32+ char token)
    - Test 3: verifyCsrf rejects when cookie missing
    - Test 4: verifyCsrf rejects when header missing
    - Test 5: verifyCsrf rejects when values differ
    - Test 6: verifyCsrf rejects when Origin header does not match expected origin (defense-in-depth)
    - Test 7: csrf.shared.ts exports CSRF_COOKIE_NAME, CSRF_HEADER_NAME, EXPECTED_ORIGIN as plain constants with NO `server-only` import — client code can import them without build error
  </behavior>
  <action>
    **Step 4a — Create `apps/admin/lib/csrf.shared.ts` (neutral, no server-only marker):**

    ```typescript
    // csrf.shared.ts — constants shared between client and server.
    // MUST NOT import 'server-only' or any server-only runtime.
    // Safe to import from .tsx client components.

    export const CSRF_COOKIE_NAME = 'hla-csrf';
    export const CSRF_HEADER_NAME = 'x-csrf-token';
    export const EXPECTED_ORIGIN =
      process.env.NEXT_PUBLIC_EXPECTED_ORIGIN ??
      process.env.EXPECTED_ORIGIN ??
      'https://homelab.makscee.ru';
    ```

    **Step 4b — Create `apps/admin/lib/csrf.server.ts` (re-exports constants, adds server helpers):**

    ```typescript
    import 'server-only';
    import { randomBytes } from 'node:crypto';
    import { NextRequest } from 'next/server';
    import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, EXPECTED_ORIGIN } from './csrf.shared';

    // Re-export so existing server code can still import the constants from csrf.server.
    // NEW: client code MUST import from csrf.shared directly (this file is server-only).
    export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, EXPECTED_ORIGIN };

    export function generateCsrfToken(): string {
      return randomBytes(32).toString('hex');  // 64 hex chars
    }

    export function csrfCookie(token: string): string {
      // HttpOnly=false is intentional: client JS reads the cookie and mirrors
      // into the x-csrf-token header (double-submit pattern)
      return `${CSRF_COOKIE_NAME}=${token}; Path=/; SameSite=Strict; Secure; Max-Age=28800`;
    }

    export class CsrfError extends Error {
      constructor(public readonly reason: string) {
        super(`csrf rejected: ${reason}`);
        this.name = 'CsrfError';
      }
    }

    export function verifyCsrf(req: NextRequest): void {
      const origin = req.headers.get('origin');
      if (origin && origin !== EXPECTED_ORIGIN) {
        throw new CsrfError('bad origin');
      }
      const cookie = req.cookies.get(CSRF_COOKIE_NAME)?.value;
      const header = req.headers.get(CSRF_HEADER_NAME);
      if (!cookie) throw new CsrfError('cookie missing');
      if (!header) throw new CsrfError('header missing');
      if (cookie.length < 32) throw new CsrfError('cookie too short');
      if (cookie !== header) throw new CsrfError('mismatch');
    }
    ```

    **Step 4c — Create tests in `csrf.server.test.ts` covering all 7 behaviors.**

    Test 7 specifically: read `apps/admin/lib/csrf.shared.ts` as text, assert it contains NO `server-only` string and exports all three constants.

    Layout helper note: Plan 13-05 (Task 1) wires issuance via `issueCsrfCookieOnce()` in `(auth)/layout.tsx`; this plan only ships the constants + verifier.
  </action>
  <verify>
    <automated>cd apps/admin &amp;&amp; bun test lib/csrf.server.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/admin/lib/csrf.shared.ts` exists
    - grep `CSRF_COOKIE_NAME` in csrf.shared.ts returns 1 line (the export)
    - grep `CSRF_HEADER_NAME` in csrf.shared.ts returns 1 line
    - grep `EXPECTED_ORIGIN` in csrf.shared.ts returns at least 1 line
    - grep `server-only` in csrf.shared.ts returns 0 lines (MUST be neutral)
    - grep `export function verifyCsrf` in csrf.server.ts returns 1 line
    - grep `export function generateCsrfToken` in csrf.server.ts returns 1 line
    - grep `export function csrfCookie` in csrf.server.ts returns 1 line
    - grep `from './csrf.shared'` in csrf.server.ts returns 1 line (re-export path)
    - grep `SameSite=Strict` in csrf.server.ts returns 1 line
    - grep `Secure` in csrf.server.ts returns at least 1 line
    - `cd apps/admin && bun test lib/csrf.server.test.ts` exits 0; 7 passed
  </acceptance_criteria>
  <done>Double-submit CSRF: constants live in csrf.shared.ts (client-safe, zero server-only imports), server-only verifier + token generator in csrf.server.ts. Origin check present. Plan 13-05 api-client.ts MUST import CSRF_COOKIE_NAME / CSRF_HEADER_NAME from csrf.shared — never from csrf.server (would break the client bundle).</done>
</task>

<task type="auto">
  <name>Task 5: API Route Handlers for all 5 mutations (Next.js 15 async params)</name>
  <files>apps/admin/app/api/tokens/route.ts, apps/admin/app/api/tokens/[id]/route.ts, apps/admin/app/api/tokens/[id]/rotate/route.ts, apps/admin/app/api/tokens/[id]/toggle/route.ts, apps/admin/app/api/tokens/[id]/rename/route.ts</files>
  <read_first>
    - apps/admin/lib/token-registry.server.ts (Task 3 exports)
    - apps/admin/lib/csrf.server.ts (Task 4 verifyCsrf)
    - apps/admin/lib/sops.server.ts (sopsAvailable)
    - apps/admin/lib/auth-allowlist.server.ts (requireAllowlistedUser — or equivalent Phase 12 helper)
    - apps/admin/auth.ts (Auth.js v5 `auth()` helper for reading session)
    - .planning/phases/13-CONTEXT.md §D-13-11 (add-token form inputs)
  </read_first>
  <action>
    **CRITICAL Next.js 15 change:** Dynamic route params are `Promise<...>`, not sync. Every `[id]` route MUST type the context as `{ params: Promise<{ id: string }> }` and `await ctx.params` before use.

    Every route MUST follow this exact skeleton (adapt per-verb):

    **Non-dynamic route (`/api/tokens`):**

    ```typescript
    import { NextRequest, NextResponse } from 'next/server';
    import { z } from 'zod';
    import { auth } from '@/auth';
    import { verifyCsrf, CsrfError } from '@/lib/csrf.server';
    import { sopsAvailable } from '@/lib/sops.server';
    import { addToken } from '@/lib/token-registry.server';

    export const runtime = 'nodejs';  // REQUIRED: sops binary needs Node runtime

    const InputSchema = z.object({
      label: z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/),
      value: z.string().regex(/^sk-ant-oat01-[A-Za-z0-9_-]+$/),
      tier: z.enum(['pro', 'max', 'enterprise']),
      owner_host: z.string().min(1).max(64),
      notes: z.string().max(500).optional(),  // matches client AddTokenSchema notes field
    });

    export async function POST(req: NextRequest) {
      // 1. AuthN/AuthZ
      const session = await auth();
      if (!session?.user?.login) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
      // 2. CSRF
      try { verifyCsrf(req); }
      catch (e) {
        if (e instanceof CsrfError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
        throw e;
      }
      // 3. Degraded mode
      if (!sopsAvailable()) {
        return NextResponse.json({ error: 'sops unavailable' }, { status: 503 });
      }
      // 4. Input validation
      const body = await req.json().catch(() => null);
      const parsed = InputSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: 'invalid input', issues: parsed.error.issues }, { status: 400 });
      }
      // 5. Execute
      try {
        const result = await addToken(parsed.data, session.user.login);
        return NextResponse.json({ ok: true, token: result });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'server error';
        const safe = message.startsWith('sk-ant-oat01-') ? 'server error' : message;
        return NextResponse.json({ error: safe }, { status: 400 });
      }
    }
    ```

    **Dynamic routes (`/api/tokens/[id]/*`) — Next.js 15 async params pattern:**

    ```typescript
    import { NextRequest, NextResponse } from 'next/server';
    import { z } from 'zod';
    import { auth } from '@/auth';
    import { verifyCsrf, CsrfError } from '@/lib/csrf.server';
    import { sopsAvailable } from '@/lib/sops.server';
    import { /* mutation fn */ } from '@/lib/token-registry.server';

    export const runtime = 'nodejs';

    const ParamsSchema = z.object({ id: z.string().uuid() });
    const InputSchema = /* per-route — see below */;

    // NOTE: Next.js 15 — params is a Promise, NOT a sync object.
    export async function POST(
      req: NextRequest,
      ctx: { params: Promise<{ id: string }> },
    ) {
      // 0. Resolve async params FIRST so `id` is available to all downstream checks.
      const rawParams = await ctx.params;
      const paramsParsed = ParamsSchema.safeParse(rawParams);
      if (!paramsParsed.success) {
        return NextResponse.json({ error: 'invalid id' }, { status: 400 });
      }
      const { id } = paramsParsed.data;

      // 1. AuthN/AuthZ
      const session = await auth();
      if (!session?.user?.login) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
      // 2. CSRF
      try { verifyCsrf(req); }
      catch (e) {
        if (e instanceof CsrfError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
        throw e;
      }
      // 3. Degraded mode
      if (!sopsAvailable()) {
        return NextResponse.json({ error: 'sops unavailable' }, { status: 503 });
      }
      // 4. Input validation (skip for DELETE which has no body)
      const body = await req.json().catch(() => null);
      const parsed = InputSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: 'invalid input', issues: parsed.error.issues }, { status: 400 });
      }
      // 5. Execute
      try {
        const result = await /* mutation */(id, parsed.data./* field */, session.user.login);
        return NextResponse.json({ ok: true, token: result });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'server error';
        const safe = message.startsWith('sk-ant-oat01-') ? 'server error' : message;
        return NextResponse.json({ error: safe }, { status: 400 });
      }
    }
    ```

    Per-route specifics (all dynamic routes use the `Promise<{ id: string }>` pattern above):

    **`apps/admin/app/api/tokens/route.ts` (POST = addToken):** Non-dynamic, uses the first skeleton above. InputSchema includes `notes: z.string().max(500).optional()`.

    **`apps/admin/app/api/tokens/[id]/route.ts` (DELETE = softDeleteToken)** — full concrete file:

    ```typescript
    import { NextRequest, NextResponse } from 'next/server';
    import { z } from 'zod';
    import { auth } from '@/auth';
    import { verifyCsrf, CsrfError } from '@/lib/csrf.server';
    import { sopsAvailable } from '@/lib/sops.server';
    import { softDeleteToken } from '@/lib/token-registry.server';

    export const runtime = 'nodejs';

    const ParamsSchema = z.object({ id: z.string().uuid() });

    // Next.js 15: params is a Promise. Resolve before anything else.
    export async function DELETE(
      req: NextRequest,
      ctx: { params: Promise<{ id: string }> },
    ) {
      const rawParams = await ctx.params;
      const paramsParsed = ParamsSchema.safeParse(rawParams);
      if (!paramsParsed.success) {
        return NextResponse.json({ error: 'invalid id' }, { status: 400 });
      }
      const { id } = paramsParsed.data;

      const session = await auth();
      if (!session?.user?.login) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
      try { verifyCsrf(req); }
      catch (e) {
        if (e instanceof CsrfError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
        throw e;
      }
      if (!sopsAvailable()) {
        return NextResponse.json({ error: 'sops unavailable' }, { status: 503 });
      }
      try {
        await softDeleteToken(id, session.user.login);
        return NextResponse.json({ ok: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'server error';
        const safe = message.startsWith('sk-ant-oat01-') ? 'server error' : message;
        return NextResponse.json({ error: safe }, { status: 400 });
      }
    }
    ```

    **`apps/admin/app/api/tokens/[id]/rotate/route.ts` (POST = rotateToken):**
    ```typescript
    const InputSchema = z.object({ value: z.string().regex(/^sk-ant-oat01-[A-Za-z0-9_-]+$/) });
    // const { id } = ParamsSchema.parse(await ctx.params);
    // call: rotateToken(id, parsed.data.value, session.user.login)
    ```

    **`apps/admin/app/api/tokens/[id]/toggle/route.ts` (POST = toggleEnabled):**
    ```typescript
    const InputSchema = z.object({ enabled: z.boolean() });
    // const { id } = ParamsSchema.parse(await ctx.params);
    // call: toggleEnabled(id, parsed.data.enabled, session.user.login)
    ```

    **`apps/admin/app/api/tokens/[id]/rename/route.ts` (POST = renameToken):**
    ```typescript
    const InputSchema = z.object({
      label: z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/),
    });
    // const { id } = ParamsSchema.parse(await ctx.params);
    // call: renameToken(id, parsed.data.label, session.user.login)
    ```

    Critical rules:
    - `export const runtime = 'nodejs'` on EVERY route (sops subprocess needs it).
    - EVERY dynamic route uses `ctx: { params: Promise<{ id: string }> }` — NEVER `{ params: { id: string } }` (that was Next.js 14 and will fail type-check + runtime in Next.js 15.5.x).
    - EVERY dynamic route `await ctx.params` before accessing `id`.
    - The error branch MUST check if the error message starts with `sk-ant-oat01-` (defensive) and replace with generic text.
    - The success branch MUST NOT include the `value` field in the response (PublicTokenEntry guarantees this).
    - Return 401 before CSRF check so unauth probes don't learn CSRF semantics.
    - Return 503 specifically for `sopsAvailable() === false`.
  </action>
  <verify>
    <automated>cd apps/admin &amp;&amp; bun run build 2&gt;&amp;1 | tail -30 &amp;&amp; grep -rE "export const runtime = 'nodejs'" apps/admin/app/api/tokens/ | wc -l | grep -q '^5$'</automated>
  </verify>
  <acceptance_criteria>
    - grep `export async function POST` in apps/admin/app/api/tokens/route.ts returns 1 line
    - grep `export async function DELETE` in apps/admin/app/api/tokens/[id]/route.ts returns 1 line
    - grep `export async function POST` in apps/admin/app/api/tokens/[id]/rotate/route.ts returns 1 line
    - grep `export async function POST` in apps/admin/app/api/tokens/[id]/toggle/route.ts returns 1 line
    - grep `export async function POST` in apps/admin/app/api/tokens/[id]/rename/route.ts returns 1 line
    - grep -rE `params: Promise<\{ id: string \}>` apps/admin/app/api/tokens/\[id\]/ returns exactly 4 lines (Next.js 15 async-param contract present in ALL 4 dynamic routes — route.ts, rotate/route.ts, toggle/route.ts, rename/route.ts)
    - grep -rE `await ctx\.params` apps/admin/app/api/tokens/\[id\]/ returns exactly 4 lines (each dynamic route awaits ctx.params before touching id)
    - grep -rE `ParamsSchema\.safeParse\(rawParams\)|ParamsSchema\.safeParse\(await ctx\.params\)` apps/admin/app/api/tokens/\[id\]/ returns at least 4 lines (every dynamic route validates id via Zod)
    - grep -rE `\bparams: \{ id: string \}([^>]|$)` apps/admin/app/api/tokens/ returns 0 lines (no sync-param Next.js 14 signature anywhere — guards against regression)
    - grep -rE `ctx\.params\.id` apps/admin/app/api/tokens/ returns 0 lines (no direct sync access to params.id — MUST go through await)
    - grep -r `export const runtime = 'nodejs'` apps/admin/app/api/tokens/ returns exactly 5 files
    - grep -r `verifyCsrf(req)` apps/admin/app/api/tokens/ returns 5 lines
    - grep -r `sopsAvailable()` apps/admin/app/api/tokens/ returns 5 lines
    - grep -r `await auth()` apps/admin/app/api/tokens/ returns 5 lines
    - grep -r `session.user.login` apps/admin/app/api/tokens/ returns at least 5 lines
    - `cd apps/admin && bun run build` exits 0
    - grep -r `sk-ant-oat01-` apps/admin/app/api/tokens/ — every match is inside a Zod regex literal (NOT in a NextResponse.json body, NOT in a console.log/error)
  </acceptance_criteria>
  <done>All 5 mutation routes ship with Next.js 15 async-param contract, identical auth+CSRF+degraded+validate+execute skeleton; build is clean; no token leakage paths.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser → /api/tokens/* | Untrusted JSON + headers; AuthN via Auth.js cookie |
| admin app → Prometheus | Tailnet only; no auth required by Prometheus (trusted network) |
| admin app → sops binary | child_process boundary; argv sanitized |
| admin app → stdout/journald | audit events flow here; must be tamper-free |

## STRIDE Threat Register

| Threat ID | Category | Component | ASVS | Disposition | Mitigation Plan |
|-----------|----------|-----------|------|-------------|-----------------|
| T-13-03-01 | Spoofing | Unauthenticated mutation | V4.1 | mitigate | `await auth()` check returns 401 before any other processing |
| T-13-03-02 | Tampering | CSRF on mutation routes | V13.4 | mitigate | Task 4 double-submit cookie + Origin check; verified on all 5 routes |
| T-13-03-03 | Repudiation | Mutation without audit trail | V7.1 | mitigate | Task 3 emits exactly 1 audit event per successful mutation; Task 2 tests assert single emission |
| T-13-03-04 | Information Disclosure | Token value echoed in API response | V7.1 | mitigate | PublicTokenEntry strips value via Omit; Task 5 acceptance grep asserts no sk-ant-oat01- in response paths |
| T-13-03-05 | Information Disclosure | Token value in error messages | V7.1 | mitigate | Task 5 sanitizes error.message starting with sk-ant-oat01-; Task 1 sops.server.ts pre-sanitizes |
| T-13-03-06 | Denial of Service | SOPS write failure leaves partial state | V11.1 | mitigate | Plan 13-01 replaceRegistry is atomic (tmp+rename); mutations use single call to replaceRegistry per mutation |
| T-13-03-07 | Elevation of Privilege | Non-allowlisted GitHub user auths | V4.2 | mitigate | Phase 12 allowlist middleware + session has `login` only for allowlisted users |
| T-13-03-08 | Denial of Service | Concurrent SOPS writes corrupt file | V1.1 | mitigate | Plan 13-01 withMutex serializes; Task 3 tests observe serialization via replaceRegistry call count |
| T-13-03-09 | Information Disclosure | Prometheus credentials exposed | V10.3 | accept | Prom is Tailnet-only, no creds; if HTTPS+basicauth is added later, adapt promFetch |
| T-13-03-10 | Repudiation | Audit event lost if process crashes mid-mutation | accept | Stdout write is line-buffered and flushed on event loop turn; systemd journal has crash-survivable log; Phase 14 sqlite upgrade closes remaining window |
| T-13-03-11 | Information Disclosure | server-only module accidentally imported by client bundle | V1.1 | mitigate | Task 4 splits CSRF constants to csrf.shared.ts (no server-only marker); client code imports from csrf.shared; build-time next.js server-only guard still protects csrf.server.ts runtime |

All threats have a disposition. No high-severity unmitigated.
</threat_model>

<verification>
- `cd apps/admin && bun test lib/` — all four test files pass (prometheus, audit, token-registry, csrf)
- `cd apps/admin && bun run build` exits 0
- `grep -r 'export const runtime' apps/admin/app/api/tokens/` shows 5 `'nodejs'` matches
- `grep -rE 'params: Promise<' apps/admin/app/api/tokens/\[id\]/` shows 4 matches (Next.js 15 contract)
- No `sk-ant-oat01-` leakage in any response path (acceptance criteria in Task 5)
- `grep 'server-only' apps/admin/lib/csrf.shared.ts` returns 0 (neutral module)
</verification>

<success_criteria>
Backend API + lib layer is complete: all 5 mutations work through a uniform auth+CSRF+degraded+validate+execute skeleton, every mutation emits exactly one audit event, token values never leave the sops.server.ts boundary toward the client. CSRF constants are cleanly split so client code (Plan 13-05 api-client.ts) imports from csrf.shared.ts without tripping the server-only boundary. All dynamic API routes use Next.js 15's async params contract. Plans 13-04/05 can import from these modules without writing any new business logic.
</success_criteria>

<output>
After completion, create `.planning/phases/13-claude-tokens-page/13-03-SUMMARY.md` noting: final API surface, audit event JSON shape example (redacted), csrf.shared.ts vs csrf.server.ts split rationale, and any deviation from plan (e.g. if Auth.js session uses `email` instead of `login`, record).
</output>
