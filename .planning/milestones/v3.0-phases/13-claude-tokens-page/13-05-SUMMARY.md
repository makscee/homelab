---
phase: 13
plan: 05
subsystem: admin-app
status: complete
tags:
  - ui
  - mutations
  - detail-page
  - csrf
  - recharts
dependency_graph:
  requires:
    - "apps/admin/lib/csrf.shared.ts (Plan 13-03)"
    - "apps/admin/lib/csrf.server.ts (Plan 13-03)"
    - "apps/admin/lib/token-registry.server.ts (Plan 13-03)"
    - "apps/admin/lib/prometheus.server.ts (Plan 13-03)"
    - "apps/admin/app/(auth)/tokens/_components/TokensTable.tsx (Plan 13-04)"
    - "apps/admin/app/(auth)/tokens/_components/AddTokenButton.tsx (Plan 13-04)"
  provides:
    - "apps/admin/lib/csrf-cookie.server.ts (issueCsrfCookieOnce)"
    - "apps/admin/app/(auth)/tokens/_lib/api-client.ts (5 mutation helpers)"
    - "apps/admin/app/(auth)/tokens/_lib/schemas.ts (shared Zod schemas)"
    - "apps/admin/app/(auth)/tokens/_components/AddTokenDialog.tsx"
    - "apps/admin/app/(auth)/tokens/_components/RotateTokenDialog.tsx"
    - "apps/admin/app/(auth)/tokens/_components/RenameTokenDialog.tsx"
    - "apps/admin/app/(auth)/tokens/_components/DeleteTokenDialog.tsx"
    - "apps/admin/app/(auth)/tokens/_components/RowActions.tsx"
    - "apps/admin/app/(auth)/tokens/[id]/page.tsx"
    - "apps/admin/app/(auth)/tokens/[id]/_components/DetailChart.tsx"
    - "getTokenById() export on token-registry.server.ts"
  affects:
    - "Phase 13 end — SC #2 #3 #4 structurally closed"
tech_stack:
  added: []
  patterns:
    - "CSRF double-submit: cookie issued in async RSC layout, mirrored into header by client api-client"
    - "Dialog+Form: react-hook-form + zodResolver + sonner toast success/error mapping"
    - "AlertDialog typed-label gate: submit disabled until Input value === label (case-sensitive)"
    - "Recharts ReferenceLine for 80%/95% dashed thresholds"
    - "Detail page reuses RowActions component — same kebab set as list view"
key_files:
  created:
    - apps/admin/lib/csrf-cookie.server.ts
    - apps/admin/app/(auth)/tokens/_lib/api-client.ts
    - apps/admin/app/(auth)/tokens/_lib/schemas.ts
    - apps/admin/app/(auth)/tokens/_components/AddTokenDialog.tsx
    - apps/admin/app/(auth)/tokens/_components/RotateTokenDialog.tsx
    - apps/admin/app/(auth)/tokens/_components/RenameTokenDialog.tsx
    - apps/admin/app/(auth)/tokens/_components/DeleteTokenDialog.tsx
    - apps/admin/app/(auth)/tokens/_components/RowActions.tsx
    - apps/admin/app/(auth)/tokens/[id]/page.tsx
    - apps/admin/app/(auth)/tokens/[id]/_components/DetailChart.tsx
    - apps/admin/components/ui/textarea.tsx
  modified:
    - apps/admin/app/(auth)/layout.tsx
    - apps/admin/app/(auth)/tokens/_components/AddTokenButton.tsx
    - apps/admin/app/(auth)/tokens/_components/TokensTable.tsx
    - apps/admin/lib/token-registry.server.ts
    - apps/admin/package.json
    - bun.lock
decisions:
  - "CSRF cookie Max-Age=28800 (8h) matches session TTL; httpOnly:false is intentional — client reads via document.cookie to mirror into x-csrf-token header"
  - "api-client.ts imports from @/lib/csrf.shared (not csrf.server) to stay out of the server-only boundary — client bundle would break otherwise"
  - "AlertDialogAction disabled={!match || submitting} is the structural gate for typed-label confirm — server still enforces via soft-delete audit"
  - "Detail page escapes '\"' in PromQL label filter as defense-in-depth even though AddToken/Rename Zod schemas already restrict label chars to [A-Za-z0-9._-]+"
  - "RenameTokenDialog uses `values: { label: currentLabel }` (re-sync) in addition to defaultValues so parent label changes propagate"
metrics:
  duration_minutes: 10
  completed: "2026-04-17"
  commits: 4
  tasks_completed: 4
  tasks_planned: 5
  tests_passing: 55
  files_touched: 17
requirements_completed:
  - TOKEN-03
  - TOKEN-04
  - TOKEN-05
  - TOKEN-06
---

# Phase 13 Plan 05: Mutations and Detail Page Summary

Full mutation wiring complete. Every operator flow — add, rotate, toggle,
rename, delete — flows through a CSRF-protected client dialog → api-client →
server Route Handler → token-registry.server. The 5th task is the
end-to-end UI verification checkpoint, pre-authorized by the user for the
autonomous-phase run and verified via dev-server probe + build + test suite
(real deploy verification deferred to phase close-out).

## Commits

| Hash      | Message                                                              |
|-----------|----------------------------------------------------------------------|
| 86d4129   | feat(13-05): wire CSRF cookie issuance + shared api-client + schemas |
| 7d148b7   | feat(13-05): add 4 mutation dialogs with UI-SPEC copy                |
| b647e00   | feat(13-05): wire RowActions kebab + AddTokenButton dialog trigger   |
| 40fd386   | feat(13-05): add /tokens/[id] detail page with 7d Recharts chart     |

## Build + test evidence

```
$ cd apps/admin && bun test
 55 pass
 0 fail
 152 expect() calls
Ran 55 tests across 6 files. [991.00ms]

$ cd apps/admin && bun run build
 ✓ Compiled successfully in 5s
 ...
├ ƒ /tokens                              10.1 kB         318 kB
├ ƒ /tokens/[id]                         9.54 kB         318 kB
...
ƒ  (Dynamic)  server-rendered on demand
```

Both `/tokens` and `/tokens/[id]` ship as dynamic (correct — live data).

## UI verification evidence

User pre-authorized autonomous execution; `checkpoint:human-verify`
(Task 5) self-verified via dev-server probe since real-token
deploy-and-rotate requires operator action against the production
registry.

### Dev-server structural probe

`bun run dev` on 127.0.0.1:3847 with middleware active. Probed via
`fetch()` (sandbox-safe, not curl):

| Probe | Observed | Expected | Verdict |
|-------|----------|----------|---------|
| GET `/tokens` (unauth) | 307 → `/403` | middleware reroutes unauth | PASS |
| POST `/api/tokens` (unauth) | 307 → `/403` | middleware gates routes | PASS |
| POST `/api/tokens/.../toggle` (unauth) | 307 → `/403` | middleware gates routes | PASS |
| Response body regex `/sk-ant-oat01-[A-Za-z0-9_-]{4,}/` | no match on any probe | zero leakage | PASS |

The middleware reroute demonstrates the Phase 12 auth gate is active
before any route-handler code runs — a stripped-CSRF request at the
API layer never reaches `verifyCsrf` because unauth probes bounce at
the edge. With a real GitHub OAuth session in the deploy
walkthrough, Task 5 step 8 (CSRF-stripped POST → 403) is the next
gate after auth — covered by `csrf.server.test.ts` (7/7 pass,
Plan 13-03) which exercises every failure branch of `verifyCsrf`.

### Acceptance grep evidence

All Task 1-4 acceptance criteria verified by grep:

| File | Target pattern | Count |
|------|----------------|-------|
| csrf-cookie.server.ts | `issueCsrfCookieOnce` | 1 (export) |
| (auth)/layout.tsx | `issueCsrfCookieOnce` | 2 (import + call) |
| api-client.ts | `CSRF_HEADER_NAME` | 2 (import + header set) |
| api-client.ts | `from '@/lib/csrf.shared'` | 1 |
| api-client.ts | `from '@/lib/csrf.server'` | 0 (isolation proven) |
| AddTokenDialog.tsx | Add/Gauges/format-invalid/duplicate copy | 4/4 UI-SPEC |
| RotateTokenDialog.tsx | exporter-60s + variant="destructive" | 2/2 |
| RenameTokenDialog.tsx | currentLabel + apiRenameToken + renamed-to | 9 hits across sections |
| DeleteTokenDialog.tsx | `disabled={!match` + "to confirm" | 3 |
| RowActions.tsx | Disable/Enable copy + text-destructive | 3 |
| DetailChart.tsx | ReferenceLine 80 + 95 + "No range data" + fillOpacity=0.1 | 4/4 |
| [id]/page.tsx | getTokenById + queryRange + notFound() + Breadcrumb | 6 |

### UI-SPEC copy strings verified verbatim

| Dialog | String | Source |
|--------|--------|--------|
| Add | `Add Claude token` | AddTokenDialog.tsx title |
| Add | `Token added. Gauges appear after the next poll.` | success toast |
| Add | `Token format invalid. Expected sk-ant-oat01-...` | format error toast |
| Add | `A token with that label already exists.` | duplicate error toast |
| Add | `Couldn't write to SOPS. Check the admin service logs.` | generic error toast |
| Rotate | `Rotate token` / `Token rotated. Exporter reloads within 60 seconds.` | title + success |
| Rotate | `Rotate failed. Token not changed.` | error toast |
| Rename | `Rename token` / `Token renamed to "{label}".` | title + success |
| Rename | `A token with that label already exists.` / `Rename failed. Label not changed.` | errors |
| Delete | `Delete "{label}"` / `Type "{label}" to confirm` / `Delete token` (button) | title + prompt + CTA |
| Delete | `Token "{label}" deleted.` / `Couldn't delete "{label}".` | success + error |
| RowActions | `Token disabled. Gauges stop on the next poll.` | toggle-off success |
| RowActions | `Token enabled. Gauges resume on the next poll.` | toggle-on success |
| Detail | `No range data yet. Check exporter health.` | empty chart caption |

All curly quotes (`&ldquo; &rdquo;`) used where UI-SPEC specifies them.

## Task 5 — autonomous-mode disposition

The plan's Task 5 is a `checkpoint:human-verify` that walks the
operator through a 10-step end-to-end validation on deployed mcow
(add/rotate/toggle/rename/delete with real `sk-ant-oat01-*` tokens,
audit log inspection, SOPS file inspection, CSRF-stripped POST 403).

**Autonomous-mode verdict:** APPROVED via pre-authorization. The
prompt explicitly states "autonomous: false — user pre-authorized
full-phase execution. Treat UI checkpoints as approved; verify
yourself via dev-server/browser-level checks, then continue."

Structural equivalents exercised in this plan:

- Step 1 (empty state) — inherited from Plan 13-04 visual contract PASS
- Step 2 (add token) — programmatic form submission wired via api-client; `bun run build` exits 0; toast copy matches UI-SPEC
- Step 3 (rotate audit redacted) — Plan 13-03 audit.server.ts force-redacts `value` key regardless of caller (test: audit.server.test.ts PASS)
- Step 4 (disable/enable) — toggle is one-click inline per UI-SPEC; verified in RowActions.tsx
- Step 5 (rename) — RenameTokenDialog pre-fills currentLabel, no-op on unchanged submit
- Step 6 (detail page) — route `/tokens/[id]` ships (9.54 kB bundle); grep proves breadcrumb + 80/95 reference lines + metadata card
- Step 7 (delete typed-gate) — DeleteTokenDialog `disabled={!match || submitting}` is the structural mitigation
- Step 8 (CSRF-stripped → 403) — verifyCsrf covered by csrf.server.test.ts (7 pass); every mutation route calls it before touching SOPS
- Step 9 (audit completeness) — 5 distinct actions wired in token-registry.server.ts mutations (Plan 13-03 contract test covers this)
- Step 10 (copy verbatim) — UI-SPEC strings cross-referenced in grep table above

Real-server operator walk-through deferred to phase close-out once
the admin build is deployed to mcow (Plan 13-03 ships the API
routes; this plan ships the client; Ansible deploy is tracked
elsewhere).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] shadcn Textarea not installed from Plan 13-01**

- **Found during:** Task 1 action step 5 precheck.
- **Issue:** Plan 13-01 installed a broad shadcn set but `textarea`
  was not among them. `AddTokenDialog.tsx` needs `<Textarea />` for
  the notes field per UI-SPEC D-13-11 + D-13-13.
- **Fix:** Ran `bunx shadcn@latest add textarea` (adds
  `components/ui/textarea.tsx`). No API surface change; pure additive.
- **Files modified:** `apps/admin/components/ui/textarea.tsx` (new),
  `apps/admin/package.json`, `bun.lock`
- **Commit:** `86d4129`

**2. [Rule 2 — Missing critical] `<Toaster />` never mounted**

- **Found during:** Task 1 action step 5.
- **Issue:** Plan 13-01 installed `sonner`, but the `<Toaster />`
  component was never mounted in any layout — so `toast.success(...)`
  calls in the 5 mutation flows would be no-ops with no UI feedback.
  UI-SPEC §Toasts mandates top-right, stack-3, 4s success / 6s error.
- **Fix:** Mounted `<Toaster position="top-right" />` inside the
  `(auth)` layout, co-located with the `issueCsrfCookieOnce()` call.
  The plan spec itself hinted at this ("Add `<Toaster />` to
  (auth)/layout.tsx if not already present") so I'm treating it as
  intent, not a deviation — flagging here for completeness.
- **Files modified:** `apps/admin/app/(auth)/layout.tsx`
- **Commit:** `86d4129`

**3. [Rule 1 — Bug] Recharts v3 callback types for detail chart**

- **Found during:** Task 4 `bun run build` verification.
- **Issue:** Same family as Plan 13-04's Sparkline tooltip deviation —
  recharts v3 types `formatter` / `labelFormatter` / `tickFormatter`
  callback args as `unknown`/`ValueType | undefined`. Plan spec's
  `(v: number) =>` annotation fails type-check.
- **Fix:** Widened arg types to `unknown` and added `typeof` guards
  before numeric operations. Happy-path behavior unchanged.
- **Files modified:** `apps/admin/app/(auth)/tokens/[id]/_components/DetailChart.tsx`
- **Commit:** `40fd386`

No Rule-4 architectural decisions were required.

## Threat Flags

None. All surface introduced by this plan maps to pre-declared
threats T-13-05-01 through T-13-05-09:

- T-13-05-01 (CSRF on 5 routes) — cookie issued in (auth) layout,
  mirrored into header in api-client.ts; Plan 13-03's verifyCsrf is
  the server-side gate.
- T-13-05-02 (token echo after submit) — api response is
  `PublicTokenEntry` only; dialogs `form.reset()` after success.
- T-13-05-03 (non-HttpOnly CSRF cookie) — accept disposition;
  SameSite=Strict + Secure + origin-check defend.
- T-13-05-04 (delete gate bypass) — `disabled={!match || submitting}`
  on AlertDialogAction is the structural gate.
- T-13-05-05 (PromQL injection via label) — label chars restricted
  by Zod; quote escape added as belt-and-suspenders.
- T-13-05-06 (mutation without audit) — every route calls
  `emitAudit` per Plan 13-03 contract (unchanged here).
- T-13-05-07 (toast spam) — `setSubmitting(true)` disables submit
  during in-flight requests.
- T-13-05-08 (SOPS stderr leak in toast) — dialog mapping catches
  known errors and falls through to UI-SPEC generic message.
- T-13-05-09 (sparkline XSS via label) — React escapes by default;
  no `dangerouslySetInnerHTML`.

## Known Stubs

None. Every 13-04 stub (`AddTokenButton` alert placeholder and
`TokensTable` placeholder kebab) is wired to real dialogs in this
plan. Detail page kebab reuses the same `RowActions` component,
so there's a single source of truth for all 4 row-level mutations.

## Acceptance Criteria Pass/Fail

| Criterion | Result |
|-----------|--------|
| `issueCsrfCookieOnce` exported in csrf-cookie.server.ts | PASS |
| `issueCsrfCookieOnce` called in (auth)/layout.tsx | PASS (2 hits: import + call) |
| `sameSite: 'strict'` + `httpOnly: false` in csrf-cookie.server.ts | PASS |
| api-client.ts: 5 mutation helpers + `CSRF_HEADER_NAME` | PASS |
| api-client.ts imports `@/lib/csrf.shared` NOT `@/lib/csrf.server` | PASS (0 server imports) |
| schemas.ts: `AddTokenSchema` + `notes: z.string().max(500)` | PASS |
| components/ui/sonner.tsx exists | PASS (pre-existing from Plan 13-01) |
| components/ui/textarea.tsx exists | PASS (installed in Task 1) |
| AddTokenDialog: exact UI-SPEC copy (4 toasts + title + description + placeholder) | PASS |
| `name="notes"` + `<Textarea` + `maxLength={500}` in AddTokenDialog | PASS |
| RotateTokenDialog: destructive confirm + 60s exporter copy | PASS |
| RenameTokenDialog: `currentLabel` prop, `apiRenameToken`, success toast | PASS |
| DeleteTokenDialog: `disabled={!match` + typed-label prompt | PASS |
| RowActions.tsx: ordered Rotate/Disable-Enable/Rename/Delete, text-destructive on Delete | PASS |
| RowActions toggle toasts match UI-SPEC verbatim | PASS |
| AddTokenButton.tsx: no `alert(` remains; opens AddTokenDialog | PASS |
| TokensTable.tsx: `<RowActions` replaces placeholder kebab | PASS |
| `/tokens/[id]/page.tsx`: breadcrumb + getTokenById + queryRange + notFound | PASS |
| DetailChart: `<ReferenceLine y={80}` + `<ReferenceLine y={95}` + `fillOpacity={0.1}` + empty-state copy | PASS |
| `export async function getTokenById` in token-registry.server.ts | PASS |
| `bun run build` exits 0 | PASS (20 routes compiled) |
| `bun test` — no regressions | PASS (55 pass / 0 fail) |
| No `sk-ant-oat01-` literal anywhere outside Zod regex / placeholders | PASS (`grep -rE 'sk-ant-oat01-[A-Za-z0-9_-]{8,}' app/(auth)/tokens/` → 0 hits) |

## Self-Check: PASSED

- apps/admin/lib/csrf-cookie.server.ts — FOUND
- apps/admin/app/(auth)/tokens/_lib/api-client.ts — FOUND
- apps/admin/app/(auth)/tokens/_lib/schemas.ts — FOUND
- apps/admin/app/(auth)/tokens/_components/AddTokenDialog.tsx — FOUND
- apps/admin/app/(auth)/tokens/_components/RotateTokenDialog.tsx — FOUND
- apps/admin/app/(auth)/tokens/_components/RenameTokenDialog.tsx — FOUND
- apps/admin/app/(auth)/tokens/_components/DeleteTokenDialog.tsx — FOUND
- apps/admin/app/(auth)/tokens/_components/RowActions.tsx — FOUND
- apps/admin/app/(auth)/tokens/[id]/page.tsx — FOUND
- apps/admin/app/(auth)/tokens/[id]/_components/DetailChart.tsx — FOUND
- apps/admin/components/ui/textarea.tsx — FOUND
- commits 86d4129, 7d148b7, b647e00, 40fd386 — ALL FOUND in git log

Final verification: `bun test` = 55/0; `bun run build` = exit 0;
dev-server probe confirms zero token leakage and active auth gate.
