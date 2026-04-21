---
phase: 13-claude-tokens-page
fixed_at: 2026-04-17T00:00:00Z
review_path: .planning/phases/13-claude-tokens-page/13-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 6
status: all_fixed
---

# Phase 13: Code Review Fix Report

**Fixed at:** 2026-04-17
**Source review:** `.planning/phases/13-claude-tokens-page/13-REVIEW.md`
**Iteration:** 1

## Summary

- Findings in scope (Critical + Warning): 6
- Fixed: 6
- Info items deferred: 6
- Status: all in-scope findings fixed

## Fixed Issues

### CR-01: PromQL metric-name + label contract mismatch between UI and exporter

**Files modified:** `apps/admin/app/(auth)/tokens/page.tsx`,
`apps/admin/app/(auth)/tokens/[id]/page.tsx`,
`apps/admin/app/(auth)/tokens/_lib/view-model.ts`
**Commit:** 84ac2b2
**Applied fix:** Aligned UI PromQL to match exporter metric names
(`claude_usage_5h_utilization * 100`,
`claude_usage_7d_utilization * 100`,
`claude_usage_Xh_reset_timestamp - time()`) and switched label lookup
from `labels.label` to `labels.name`. Dashboard now renders real
utilization data from Prometheus.

### WR-01: TOCTOU race on duplicate-label check

**Files modified:** `apps/admin/lib/sops.server.ts`,
`apps/admin/lib/token-registry.server.ts`
**Commit:** ce5e2da
**Applied fix:** Introduced `mutateRegistry(path, mutator)` which holds
the sops mutex across the full decrypt → mutate → write cycle.
`addToken`/`renameToken` now see their peers' in-flight writes and
duplicate-label detection is race-safe.

### WR-02: Unsanitized `value` in `setRegistryField`

**Files modified:** `apps/admin/lib/sops.server.ts`
**Commit:** ce5e2da
**Applied fix:** Deleted the unused `setRegistryField` helper
entirely. No live callers depended on it (`replaceRegistry`/
`mutateRegistry` own every mutation path), so removal is the minimal
and safest mitigation.

### WR-03: `sanitizeErrorMessage` only catches token prefix at string start

**Files modified:** `apps/admin/lib/redact.server.ts` (new),
`apps/admin/app/api/tokens/route.ts`,
`apps/admin/app/api/tokens/[id]/route.ts`,
`apps/admin/app/api/tokens/[id]/rename/route.ts`,
`apps/admin/app/api/tokens/[id]/rotate/route.ts`,
`apps/admin/app/api/tokens/[id]/toggle/route.ts`
**Commit:** 35d03f3
**Applied fix:** Centralized redaction into
`lib/redact.server.ts::sanitizeErrorMessage` using a global
`/sk-ant-oat01-[A-Za-z0-9_-]+/g` regex. All five route handlers import
from this single source; the per-file `startsWith` heuristic is gone.

### WR-04: CSRF verifier tolerates missing Origin header

**Files modified:** `apps/admin/lib/csrf.server.ts`,
`apps/admin/lib/csrf.server.test.ts`
**Commit:** 2cef343
**Applied fix:** `verifyCsrf` now requires Origin or Referer to be
present; Referer is stripped to scheme+host for comparison. Added
regression tests covering both the missing-Origin rejection and the
Referer-fallback acceptance path.

### WR-05: Mutation failures return 400 instead of 404 for unknown id

**Files modified:** `apps/admin/lib/token-registry.server.ts`,
`apps/admin/app/api/tokens/[id]/route.ts`,
`apps/admin/app/api/tokens/[id]/rename/route.ts`,
`apps/admin/app/api/tokens/[id]/rotate/route.ts`,
`apps/admin/app/api/tokens/[id]/toggle/route.ts`
**Commit:** dfe9244
**Applied fix:** Added `TokenNotFoundError` class; `findEntry` now
throws it and all four id-scoped route handlers branch on
`instanceof TokenNotFoundError` to return HTTP 404 with
`{error: "not found"}`. Malformed-input errors remain 400.

## Deferred (Info)

All six Info findings are documented but deferred — they are polish/
defense-in-depth items that do not gate the phase. Recommended to
revisit in a follow-up hardening pass.

### IN-01: `_redact` in exporter over-redacts trailing text — **deferred**

`exporter.py::_redact` replaces from the first token match to
end-of-string. Low impact (exporter errors rarely leak tokens and
operators still see the prefix). Fix is a one-line regex change on
the Python side; defer to next homelab touch of the exporter.

### IN-02: `csrfCookie()` is dead code, diverges from actual cookie writer — **deferred**

`csrfCookie()` is only exercised by the existing unit test; real
cookie issuance flows through `csrf-cookie.server.ts`. Non-urgent
cleanup; leaving for a future refactor to consolidate cookie
issuance.

### IN-03: `sopsAvailable()` is a synchronous child-process spawn per request — **deferred**

~5-20ms spawnSync floor per mutation/render. Invisible on an
operator dashboard with ≤10 clients; wire in a 30s TTL cache only
if latency telemetry flags it.

### IN-04: `EXPECTED_ORIGIN` silent hardcoded fallback — **deferred**

Worth a startup warn-once, but requires hooking into an
instrumentation entrypoint that this phase did not introduce. Queue
for the next admin-app boot-time refactor.

### IN-05: `TokensTable` per-row client boundary — **deferred**

Performance concern only materializes above ~50 rows. Current
operator uses <10 tokens. Revisit if/when row counts grow.

### IN-06: `notes` field has no control-char sanitization — **deferred**

React escapes rendered output so XSS is not exploitable. Confusable
unicode filtering is a nice-to-have; add a Zod transform in a future
validation pass.

---

_Fixed: 2026-04-17_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
