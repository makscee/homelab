---
phase: 13
plan: 03
subsystem: admin-app
status: complete
tags:
  - backend
  - prometheus
  - audit
  - api
  - csrf
dependency_graph:
  requires:
    - "apps/admin/lib/sops.server.ts (Plan 13-01)"
    - "apps/admin/auth.ts + lib/auth-allowlist.server.ts (Phase 12)"
  provides:
    - "apps/admin/lib/prometheus.server.ts (queryInstant + queryRange)"
    - "apps/admin/lib/audit.server.ts (emitAudit — Phase 14 contract)"
    - "apps/admin/lib/token-registry.server.ts (CRUD with audit wrapping)"
    - "apps/admin/lib/csrf.shared.ts (neutral constants — client-safe)"
    - "apps/admin/lib/csrf.server.ts (verifier + token + cookie)"
    - "apps/admin/app/api/tokens/route.ts (POST = addToken)"
    - "apps/admin/app/api/tokens/[id]/route.ts (DELETE = softDeleteToken)"
    - "apps/admin/app/api/tokens/[id]/rotate/route.ts (POST = rotateToken)"
    - "apps/admin/app/api/tokens/[id]/toggle/route.ts (POST = toggleEnabled)"
    - "apps/admin/app/api/tokens/[id]/rename/route.ts (POST = renameToken)"
  affects:
    - "Plan 13-04 (list/read page) — consumes listTokens + queryInstant"
    - "Plan 13-05 (mutation dialogs) — consumes api-client against these routes, imports CSRF constants from csrf.shared.ts"
tech_stack:
  added: []
  patterns:
    - "Dependency-injection hook for sops impl (_setSopsImplForTest) — avoids Bun mock.module cross-file leakage"
    - "Defensive sanitizeErrorMessage() drops any error.message starting with sk-ant-oat01-"
    - "Constant-time CSRF cookie==header comparison"
    - "Next.js 15 async-params contract: ctx.params is Promise, resolved + Zod-validated before any other check"
    - "401 returned BEFORE CSRF verify to avoid leaking CSRF semantics to unauthed probes"
key_files:
  created:
    - apps/admin/lib/prometheus.server.ts
    - apps/admin/lib/prometheus.server.test.ts
    - apps/admin/lib/audit.server.ts
    - apps/admin/lib/audit.server.test.ts
    - apps/admin/lib/token-registry.server.ts
    - apps/admin/lib/token-registry.server.test.ts
    - apps/admin/lib/csrf.shared.ts
    - apps/admin/lib/csrf.server.ts
    - apps/admin/lib/csrf.server.test.ts
    - apps/admin/app/api/tokens/route.ts
    - apps/admin/app/api/tokens/[id]/route.ts
    - apps/admin/app/api/tokens/[id]/rotate/route.ts
    - apps/admin/app/api/tokens/[id]/toggle/route.ts
    - apps/admin/app/api/tokens/[id]/rename/route.ts
  modified:
    - apps/admin/eslint.config.mjs (ignore *.test.ts for server-only rule)
    - apps/admin/tsconfig.json (exclude test-setup.ts + *.test.ts from build)
decisions:
  - "CSRF split: csrf.shared.ts is the isomorphic constants module (safe for Plan 13-05 api-client.ts), csrf.server.ts houses the verifier + generator + cookie builder behind the server-only boundary"
  - "token-registry uses DI (_setSopsImplForTest) rather than Bun mock.module — mock.module persists process-wide and bleeds into sops.server.test.ts"
  - "Error branch in every route uses sanitizeErrorMessage() that drops messages starting with sk-ant-oat01- (belt-and-suspenders; sops.server already redacts)"
  - "Audit diffs for the rotate mutation use sentinel strings ([ROTATED]) even though audit.server force-redacts the `value` key — keeps the mutation call graph honest and single-sourced"
  - "CSRF Max-Age = 8h matches typical session length; HttpOnly intentionally absent (client must read the cookie to mirror into the x-csrf-token header)"
metrics:
  duration_minutes: 10
  completed: "2026-04-17"
  commits: 10
  tasks_completed: 5
  tasks_planned: 5
  tests_passing: 40
  files_touched: 16
requirements_completed:
  - TOKEN-03
  - TOKEN-04
  - TOKEN-05
  - TOKEN-07
---

# Phase 13 Plan 03: Backend Libs Summary

All five mutations (add, rotate, toggle, rename, soft-delete) now flow through a
uniform auth + CSRF + degraded-mode + Zod-validate + execute skeleton. Every
mutation emits exactly one audit JSON line to stdout with the Phase 14 contract
fields locked. Token plaintext never leaves the `sops.server.ts` boundary —
`PublicTokenEntry = Omit<TokenEntry, 'value'>` ensures nothing with a `value`
field reaches the wire.

## Commits

| Hash     | Message |
|----------|---------|
| 4480a86  | test(13-03): add failing tests for prometheus.server wrappers (RED) |
| 419d872  | feat(13-03): implement prometheus.server.ts query wrappers |
| d39d0fc  | test(13-03): add failing tests for audit.server emitter (RED) |
| 6b4518a  | feat(13-03): implement audit.server structured JSON emitter |
| 742f5fc  | test(13-03): add failing tests for token-registry CRUD (RED) |
| 0c8f48d  | feat(13-03): implement token-registry CRUD with audit + degraded-mode |
| 8855a60  | test(13-03): add failing tests for CSRF split (RED) |
| 77d476b  | feat(13-03): implement CSRF double-submit (split shared / server) |
| 1cbab8a  | feat(13-03): ship 5 mutation API Route Handlers (Next.js 15 async params) |

## Public API surface

```typescript
// lib/prometheus.server.ts
export function queryInstant(promql: string): Promise<PromInstantSample[]>;
export function queryRange(
  promql: string,
  start: Date, end: Date, stepSec: number,
  opts?: { revalidateSec?: number },
): Promise<PromRangeSeries[]>;
export class PromQueryError extends Error { status: number; }

// lib/audit.server.ts
export type AuditAction =
  | "token.add" | "token.rotate" | "token.toggle" | "token.rename" | "token.delete";
export function emitAudit(event: Omit<AuditEvent, "ts"> & { ts?: string }): void;

// lib/token-registry.server.ts
export type PublicTokenEntry = Omit<TokenEntry, "value">;
export function listTokens(): Promise<PublicTokenEntry[]>;
export function addToken(input, actor): Promise<PublicTokenEntry>;
export function rotateToken(id, newValue, actor): Promise<PublicTokenEntry>;
export function toggleEnabled(id, enabled, actor): Promise<PublicTokenEntry>;
export function renameToken(id, newLabel, actor): Promise<PublicTokenEntry>;
export function softDeleteToken(id, actor): Promise<void>;
export function _setSopsImplForTest(impl | null): void;  // test-only DI hook

// lib/csrf.shared.ts  (NEUTRAL — no server-only; client-safe)
export const CSRF_COOKIE_NAME: string;
export const CSRF_HEADER_NAME: string;
export const EXPECTED_ORIGIN: string;

// lib/csrf.server.ts  (server-only)
export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, EXPECTED_ORIGIN };
export function generateCsrfToken(): string;
export function csrfCookie(token: string): string;
export function verifyCsrf(req: NextRequest): void;  // throws CsrfError
export class CsrfError extends Error { reason: string; }
```

## csrf.shared.ts vs csrf.server.ts split rationale

The `server-only` npm package is a runtime sentinel that throws unconditionally
when loaded in a client bundle. Plan 13-05's `api-client.ts` runs in the browser
and needs the same cookie/header names the server verifier uses. If it imports
from a module that transitively pulls `server-only`, the Next.js build fails
with a client-boundary violation.

Solution: two modules.

- **csrf.shared.ts** — zero imports; just three `export const` declarations.
  The neutrality is asserted by an eslint-free, runtime-free test that reads
  the source and greps for `"server-only"`.
- **csrf.server.ts** — imports `server-only`, `node:crypto`, and `NextRequest`;
  re-exports the three constants so existing server code can continue to
  import them from csrf.server without change.

Acceptance test:
```
$ grep -c 'server-only' apps/admin/lib/csrf.shared.ts
0
```

## Audit JSON shape (redacted example)

```json
{
  "ts": "2026-04-17T09:54:00.000Z",
  "actor": "makscee",
  "action": "token.rotate",
  "token_id": "33333333-3333-4333-8333-333333333333",
  "diff": {
    "value": { "before": "[REDACTED]", "after": "[REDACTED]" },
    "rotated_at": { "before": "2026-04-10T12:00:00Z", "after": "2026-04-17T09:54:00.000Z" }
  }
}
```

Single line, newline-terminated, synchronous `process.stdout.write`. The `value`
key is unconditionally redacted in `audit.server.ts` regardless of what the
caller passed in — the token-registry callers still pass sentinels
(`[NEW]`, `[ROTATED]`) for defense-in-depth.

## Test evidence

```
$ cd apps/admin && bun test lib/
 40 pass
 0 fail
 130 expect() calls
Ran 40 tests across 5 files. [1173.00ms]
```

Breakdown:
- prometheus.server.test.ts — 7 pass (plan required 6; added explicit no-store coverage)
- audit.server.test.ts — 5 pass
- token-registry.server.test.ts — 12 pass (plan required 11; split the mutation-count invariant and audit-count invariant into two tests)
- csrf.server.test.ts — 7 pass
- sops.server.test.ts — 9 pass (unchanged from Plan 13-01; verified no regression after DI refactor)

```
$ cd apps/admin && bun run build
✓ Compiled successfully in 1685ms
Routes: /api/tokens, /api/tokens/[id], /api/tokens/[id]/rename, /api/tokens/[id]/rotate, /api/tokens/[id]/toggle (all dynamic ƒ)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Pre-existing `server-only` ESLint rule flagged `.server.test.ts` files**
- **Found during:** Task 5 build verification.
- **Issue:** `apps/admin/eslint.config.mjs` has a `server-only/server-only: error` rule matching `*.server.*` by filename. It correctly flags server modules missing the `import "server-only"` sentinel, but it also flagged every `.server.test.ts` file — including Plan 13-01's `sops.server.test.ts`. Test files intentionally do not import `server-only` (the Bun test harness neutralizes the sentinel via `mock.module` preload). Plan 13-01 appears to have landed without a `bun run build` verification so the issue had been dormant.
- **Fix:** Added `ignores: ["**/*.test.ts", "**/*.test.tsx"]` to the rule's file glob. Comment documents the rationale.
- **Files modified:** `apps/admin/eslint.config.mjs`
- **Commit:** `1cbab8a`

**2. [Rule 3 — Blocking] `test-setup.ts` inside tsconfig `include` tripped Next.js type-check**
- **Found during:** Task 5 build verification.
- **Issue:** Bun-specific `import { mock } from "bun:test"` in `test-setup.ts` has no Node/Next type declarations. `tsc --noEmit` (run by `next build`) thus errored. Same root cause as #1: build never ran during Plan 13-01.
- **Fix:** Added `test-setup.ts`, `**/*.test.ts`, `**/*.test.tsx` to tsconfig `exclude`. Tests still run via Bun (separate toolchain); Next build no longer sees them.
- **Files modified:** `apps/admin/tsconfig.json`
- **Commit:** `1cbab8a`

**3. [Rule 1 — Bug] Bun `mock.module` leaks across test files**
- **Found during:** Task 3 post-implementation verification (`bun test lib/`).
- **Issue:** `mock.module("./sops.server", ...)` in `token-registry.server.test.ts` persisted into the entire test process and poisoned `sops.server.test.ts`, which then reported 6/9 failing with the symptom "sops binary unavailable" (the mocked version's default state leaked). Running each file in isolation passed 9/9.
- **Fix:** Removed `mock.module` entirely. Added `_setSopsImplForTest(impl | null)` DI hook to `token-registry.server.ts`, modeled after the existing `_setSpawnSyncForTest` pattern in `sops.server.ts`. Test installs an in-memory double in `beforeEach` and restores with `_setSopsImplForTest(null)` in `afterEach`. Zero cross-file leakage; all 40 lib tests now green across a single `bun test lib/` invocation.
- **Files modified:** `apps/admin/lib/token-registry.server.ts`, `apps/admin/lib/token-registry.server.test.ts`
- **Commit:** `1cbab8a`

No Rule-4 architectural decisions were required.

## Threat Flags

None. All surfaces introduced by this plan map to pre-declared threats in the
plan's `<threat_model>` (T-13-03-01 through T-13-03-11). No new trust boundaries,
no new auth paths, no new file-system access patterns.

## Known Stubs

None. The registry currently holds 0 entries (empty seed from Plan 13-01); the
UI plans (13-04/05) are responsible for populating it via the API routes this
plan ships. The `listTokens` → empty array flow is intentional, not a stub.

## Acceptance Criteria Pass/Fail

| Criterion                                                                     | Result |
|-------------------------------------------------------------------------------|--------|
| `import 'server-only'` first line of prometheus.server.ts                     | PASS   |
| `export async function queryInstant` — 1 line                                 | PASS   |
| `export async function queryRange` — 1 line                                   | PASS   |
| `/api/v1/query_range` — 1 line                                                | PASS   |
| `/api/v1/query\b` — 1 line                                                    | PASS   |
| `cache: 'no-store'` — at least 1 line                                         | PASS (queryInstant default + queryRange default) |
| `next:.*revalidate` — at least 1 line                                         | PASS   |
| `bun test lib/prometheus.server.test.ts` — 6+ passed                          | PASS (7 passed) |
| `import 'server-only'` first line of audit.server.ts                          | PASS   |
| `export function emitAudit` — 1 line                                          | PASS   |
| `type AuditAction` — 1 line                                                   | PASS   |
| Each of `'token.add'`/`'token.rotate'`/`'token.toggle'`/`'token.rename'`/`'token.delete'` — 1 line | PASS |
| `process.stdout.write` — 1 line                                               | PASS   |
| `'[REDACTED]'` — at least 1 line                                              | PASS   |
| `bun test lib/audit.server.test.ts` — 5 passed                                | PASS   |
| `import 'server-only'` first line of token-registry.server.ts                 | PASS   |
| Each of `listTokens`/`addToken`/`rotateToken`/`toggleEnabled`/`renameToken`/`softDeleteToken` — 1 line | PASS |
| `type PublicTokenEntry = Omit<TokenEntry, 'value'>` — 1 line                  | PASS   |
| `emitAudit(` — at least 5 lines                                               | PASS (5 call sites)   |
| `requireSops()` — at least 5 lines (one per mutation)                         | PASS (5 mutations)    |
| `bun test lib/token-registry.server.test.ts` — 11+ passed                     | PASS (12 passed)      |
| `csrf.shared.ts` exists + 3 constants + no `server-only` string               | PASS   |
| `verifyCsrf` + `generateCsrfToken` + `csrfCookie` in csrf.server.ts           | PASS   |
| `from './csrf.shared'` in csrf.server.ts                                      | PASS   |
| `SameSite=Strict` + `Secure` in csrf.server.ts                                | PASS   |
| `bun test lib/csrf.server.test.ts` — 7 passed                                 | PASS   |
| `export async function POST` on all 4 POST routes                             | PASS   |
| `export async function DELETE` on [id]/route.ts                               | PASS   |
| `params: Promise<{ id: string }>` — exactly 4 lines across [id] routes        | PASS   |
| `await ctx.params` — exactly 4 lines                                          | PASS   |
| `ParamsSchema.safeParse(rawParams)` — at least 4 lines                        | PASS   |
| `params: { id: string }` (sync) — 0 lines                                     | PASS   |
| `ctx.params.id` (sync) — 0 lines                                              | PASS   |
| `export const runtime = "nodejs"` — exactly 5 files                           | PASS   |
| `verifyCsrf(req)` — 5 lines                                                   | PASS   |
| `sopsAvailable()` — 5 lines                                                   | PASS   |
| `await auth()` — 5 lines                                                      | PASS   |
| `session.user.login` — at least 5 lines                                       | PASS (5 — once per route) |
| `bun run build` exits 0                                                       | PASS   |
| `sk-ant-oat01-` only in Zod regex literals, never in response bodies/logs     | PASS (verified by grep: all matches in VALUE_REGEX / InputSchema regex / sanitizeErrorMessage prefix check) |

## Self-Check: PASSED

All claimed files exist and all claimed commits are reachable from `main`:

- apps/admin/lib/prometheus.server.ts — FOUND
- apps/admin/lib/prometheus.server.test.ts — FOUND
- apps/admin/lib/audit.server.ts — FOUND
- apps/admin/lib/audit.server.test.ts — FOUND
- apps/admin/lib/token-registry.server.ts — FOUND
- apps/admin/lib/token-registry.server.test.ts — FOUND
- apps/admin/lib/csrf.shared.ts — FOUND
- apps/admin/lib/csrf.server.ts — FOUND
- apps/admin/lib/csrf.server.test.ts — FOUND
- apps/admin/app/api/tokens/route.ts — FOUND
- apps/admin/app/api/tokens/[id]/route.ts — FOUND
- apps/admin/app/api/tokens/[id]/rotate/route.ts — FOUND
- apps/admin/app/api/tokens/[id]/toggle/route.ts — FOUND
- apps/admin/app/api/tokens/[id]/rename/route.ts — FOUND
- commits 4480a86, 419d872, d39d0fc, 6b4518a, 742f5fc, 0c8f48d, 8855a60, 77d476b, 1cbab8a — ALL FOUND

Final verification: `bun test lib/` = 40 pass / 0 fail; `bun run build` = exit 0.
