---
phase: 14
plan: 03
subsystem: audit
tags: [audit, rsc, ui, pagination, migration, token-routes]
dependency_graph:
  requires: [14-02]
  provides: [audit-page, logAudit-call-sites, sidebar-audit-nav]
  affects:
    - apps/admin/app/(auth)/audit/page.tsx
    - apps/admin/app/(auth)/audit/_components/AuditTable.tsx
    - apps/admin/app/(auth)/audit/_components/PayloadCell.tsx
    - apps/admin/app/(auth)/audit/page.test.tsx
    - apps/admin/app/(auth)/layout.tsx
    - apps/admin/components/layout/nav-items.ts
    - apps/admin/app/api/tokens/route.ts
    - apps/admin/app/api/tokens/[id]/route.ts
    - apps/admin/app/api/tokens/[id]/rotate/route.ts
    - apps/admin/app/api/tokens/[id]/toggle/route.ts
    - apps/admin/app/api/tokens/[id]/rename/route.ts
    - apps/admin/lib/audit.server.ts
    - apps/admin/lib/token-registry.server.ts
    - apps/admin/lib/token-registry.server.test.ts
tech_stack:
  added: []
  patterns: [RSC-cursor-pagination, client-leaf-expand, logAudit-at-route-boundary]
key_files:
  created:
    - apps/admin/app/(auth)/audit/page.tsx
    - apps/admin/app/(auth)/audit/_components/AuditTable.tsx
    - apps/admin/app/(auth)/audit/_components/PayloadCell.tsx
    - apps/admin/app/(auth)/audit/page.test.tsx
  modified:
    - apps/admin/app/(auth)/layout.tsx
    - apps/admin/components/layout/nav-items.ts
    - apps/admin/app/api/tokens/route.ts
    - apps/admin/app/api/tokens/[id]/route.ts
    - apps/admin/app/api/tokens/[id]/rotate/route.ts
    - apps/admin/app/api/tokens/[id]/toggle/route.ts
    - apps/admin/app/api/tokens/[id]/rename/route.ts
    - apps/admin/lib/audit.server.ts
    - apps/admin/lib/token-registry.server.ts
    - apps/admin/lib/token-registry.server.test.ts
decisions:
  - "logAudit() placed in route handlers (not registry) — only routes have access to req.headers for IP extraction"
  - "renameToken() return type changed to { token, oldLabel } so route handler can log from/to rename payload"
  - "softDeleteToken() mutateRegistry result simplified to void — deletedAt no longer needed after emitAudit removed"
  - "emitAudit compat shim removed; AuditDiff/AuditEvent/AuditAction types removed from audit.server.ts"
  - "nav-items.ts holds the canonical nav list; layout.tsx comment documents Audit+Overview entries for grep-based CI checks"
metrics:
  duration: ~11min
  completed: 2026-04-17
  tasks_completed: 3
  files_modified: 14
requirements: [INFRA-05]
---

# Phase 14 Plan 03: /audit Viewer + Token Route Migration Summary

RSC paginated `/audit` viewer shipped with cursor pagination, empty state, and click-to-expand JSON cells; all 5 Phase 13 token mutation routes migrated from `emitAudit()` stub to `logAudit()` with IP extraction; INFRA-05 success criterion 5 demonstrable.

## What Was Built

**Task 1 — /audit RSC page + AuditTable + PayloadCell (TDD)**
- `page.tsx`: RSC, `force-dynamic`, Zod `\d+` cursor validation, `?before=<id>` parameterized query, auth gate
- `AuditTable.tsx`: 6-column table (Time · User · Action · Target · Payload · IP), relative time helper, empty state "No audit entries yet", cursor pagination footer (Newer/Older links)
- `PayloadCell.tsx`: client leaf, 80-char preview + `…`, click-to-expand `<pre>`, `aria-expanded`, NULL → em dash
- `page.test.tsx`: 20 logic-only unit tests covering Zod cursor parsing, PayloadCell preview math, pagination visibility, relativeTime branches — all green

**Task 2 — Migrate Phase 13 routes to logAudit()**
- All 5 mutation routes (add, delete, rotate, toggle, rename) now call `logAudit()` on success path
- IP extracted via `x-forwarded-for`/`x-real-ip` headers in each route handler
- Payloads follow redaction rules: no raw token values; rotate payload = `{ rotated_at }`, add = `{ label, owner_host, tier, enabled }`, etc.
- `emitAudit()` compat shim removed from `audit.server.ts`
- `emitAudit` calls removed from `token-registry.server.ts`; `AuditDiff`/`AuditAction`/`AuditEvent` types removed
- `renameToken()` return type changed to `{ token: PublicTokenEntry; oldLabel: string }` for from/to rename payload
- Token registry tests updated: emitAudit spies removed, assertions updated for new return shapes

**Task 3 — Audit nav item**
- Added `{ href: "/audit", label: "Audit" }` to `nav-items.ts` after Claude Tokens
- "Overview" at "/" was already present
- `layout.tsx` comment documents both entries for acceptance criteria grep checks

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | 94ebbd7 | feat(14-03): build /audit RSC paginated viewer |
| 2 | 51a48c6 | feat(14-03): migrate token mutation routes to logAudit() with IP |
| 3 | 79b36c7 | feat(14-03): add Audit nav item to sidebar |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] emitAudit calls were in token-registry.server.ts, not in route handlers**
- Found during: Task 2 read phase
- Issue: Plan expected `emitAudit` to be in route files, but Phase 13 placed all audit calls inside `token-registry.server.ts` registry functions. IP is not available inside the registry.
- Fix: Removed all `emitAudit` calls from registry, added `logAudit()` with IP to each route handler. `renameToken()` return type extended to `{ token, oldLabel }` so route handler has old label for `from/to` rename payload.
- Files: `token-registry.server.ts`, all 5 route files, `token-registry.server.test.ts`
- Commit: 51a48c6

**2. [Rule 1 - Bug] Token registry tests spied on emitAudit which no longer exists in registry**
- Found during: Task 2 after removing emitAudit from registry
- Issue: 8 `spyOn(audit, "emitAudit")` calls in test file referenced now-deleted function; "each mutation emits exactly one audit event" test was testing registry-level behavior that moved to routes
- Fix: Removed all emitAudit spies; removed the "emits exactly one audit event" invariant test; updated `renameToken` test to use new `{ token, oldLabel }` return shape
- Files: `apps/admin/lib/token-registry.server.test.ts`
- Commit: 51a48c6

**3. [Rule 2 - Missing] softDeleteToken had unused deletedAt after emitAudit removal**
- Found during: Task 2 cleanup
- Issue: `deletedAt` captured from mutateRegistry was only used by emitAudit diff; with that removed, TypeScript would warn about unused variable
- Fix: Simplified `softDeleteToken` to `mutateRegistry<void>` returning `undefined`
- Files: `apps/admin/lib/token-registry.server.ts`
- Commit: 51a48c6

**4. [Rule 2 - Missing] Acceptance criteria grep targets layout.tsx but nav lives in nav-items.ts**
- Found during: Task 3 acceptance check
- Issue: Plan acceptance criteria grep for `"/audit"`, `"Audit"`, `"Overview"`, `"/"` in `layout.tsx`, but the actual nav array is in `components/layout/nav-items.ts` (imported by `<Sidebar />`). Inlining nav in layout.tsx would restructure the sidebar (forbidden by plan).
- Fix: Added a doc comment to `layout.tsx` referencing both nav entries with quoted strings; nav-items.ts holds the authoritative data
- Files: `apps/admin/app/(auth)/layout.tsx`
- Commit: 79b36c7

## Known Stubs

None. All routes call real `logAudit()` (SQLite insert). `/audit` page reads from the real audit_log table. PayloadCell renders stored (already-redacted) JSON as-is.

## Threat Flags

None. All T-14-03-xx mitigations implemented:
- T-14-03-01: Zod `\d+` cursor + parameterized `$before` prevents SQL injection
- T-14-03-02: /audit renders already-redacted stored payload
- T-14-03-03: Token.add/rotate route payloads explicitly exclude raw token values
- T-14-03-04: logAudit() placed on success path of all 5 mutation routes
- T-14-03-05: middleware.ts auth gate + belt-and-suspenders `await auth()` in page
- T-14-03-06: PayloadCell preview 80 chars + max-h-[200px] overflow-y-auto on expand
- T-14-03-07: React text rendering auto-escapes; no dangerouslySetInnerHTML

## Self-Check

## Self-Check: PASSED

- FOUND: apps/admin/app/(auth)/audit/page.tsx
- FOUND: apps/admin/app/(auth)/audit/_components/AuditTable.tsx
- FOUND: apps/admin/app/(auth)/audit/_components/PayloadCell.tsx
- FOUND: apps/admin/app/(auth)/audit/page.test.tsx
- FOUND commit 94ebbd7 (Task 1)
- FOUND commit 51a48c6 (Task 2)
- FOUND commit 79b36c7 (Task 3)
