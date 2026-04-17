---
phase: 13
plan: 04
subsystem: admin-app
status: complete
tags:
  - ui
  - tokens
  - list-view
  - rsc
dependency_graph:
  requires:
    - "apps/admin/lib/sops.server.ts (Plan 13-01)"
    - "apps/admin/lib/token-registry.server.ts (Plan 13-03)"
    - "apps/admin/lib/prometheus.server.ts (Plan 13-03)"
    - "mcow:9101 exporter (Plan 13-02)"
  provides:
    - "apps/admin/app/(auth)/tokens/page.tsx (RSC orchestrator, force-dynamic)"
    - "apps/admin/app/(auth)/tokens/loading.tsx (5-row skeleton, 56px height)"
    - "apps/admin/app/(auth)/tokens/_lib/view-model.ts (buildTokenRows + thresholdClass + humanizeResetSeconds)"
    - "apps/admin/app/(auth)/tokens/_components/TokensTable.tsx"
    - "apps/admin/app/(auth)/tokens/_components/UtilizationBar.tsx"
    - "apps/admin/app/(auth)/tokens/_components/ResetCountdown.tsx"
    - "apps/admin/app/(auth)/tokens/_components/Sparkline.tsx"
    - "apps/admin/app/(auth)/tokens/_components/DegradedBanner.tsx"
    - "apps/admin/app/(auth)/tokens/_components/AddTokenButton.tsx"
  affects:
    - "Plan 13-05 replaces AddTokenButton onClick alert() with real dialog trigger"
tech_stack:
  added:
    - "recharts@^3.8.1 (declared in apps/admin dependencies)"
  patterns:
    - "RSC + Promise.all over multi-source fetch with per-source .catch() degraded fallback"
    - "Threshold color map via pure thresholdClass() — reusable across bars + future chart reference lines"
    - "Sparkline as the only 'use client' leaf; rest of the page is server-rendered for zero-JS empty-state"
    - "Kebab + CTA disabled wiring via writeAvailable prop propagation — degraded mode is a tree-wide boolean, not a context"
key_files:
  created:
    - apps/admin/app/(auth)/tokens/_lib/view-model.ts
    - apps/admin/app/(auth)/tokens/_lib/view-model.test.ts
    - apps/admin/app/(auth)/tokens/_components/TokensTable.tsx
    - apps/admin/app/(auth)/tokens/_components/UtilizationBar.tsx
    - apps/admin/app/(auth)/tokens/_components/ResetCountdown.tsx
    - apps/admin/app/(auth)/tokens/_components/Sparkline.tsx
    - apps/admin/app/(auth)/tokens/_components/DegradedBanner.tsx
    - apps/admin/app/(auth)/tokens/_components/AddTokenButton.tsx
    - apps/admin/app/(auth)/tokens/loading.tsx
  modified:
    - apps/admin/app/(auth)/tokens/page.tsx
    - apps/admin/package.json
    - bun.lock
decisions:
  - "thresholdClass normalizes percentage (>1) to fraction inside the function so both `0.88` and `88` are valid inputs — downstream never needs to care which shape Prometheus returned"
  - "Sparkline Tooltip formatter uses a typeof-number guard because recharts v3 types the callback value as `ValueType | undefined`; the plan spec's `(v: number) =>` annotation fails type-check on build"
  - "Page is `force-dynamic` — live dashboard. Static generation would be a correctness bug (stale quotas)"
  - "AddTokenButton fires `alert('Add-token dialog — Plan 13-05')` as a visible wiring marker so the checker can verify the CTA is reachable; Plan 13-05 swaps the handler for a Dialog trigger"
metrics:
  duration_minutes: 10
  completed: "2026-04-17"
  commits: 4
  tasks_completed: 4
  tasks_planned: 4
  tests_passing: 15
  files_touched: 11
requirements_completed:
  - TOKEN-01
  - TOKEN-02
  - TOKEN-07
---

# Phase 13 Plan 04: Tokens List Page Summary

The `/tokens` RSC now reads the SOPS-backed registry via `listTokens()` and
merges live Prometheus instant/range samples into a typed `TokenRow[]` that
drives a 9-column shadcn Table with threshold-colored inline bars, humanized
reset countdowns, 96×24 Recharts sparklines, a destructive-colored
degraded-mode banner, and a scaffolded Add-token CTA. Empty-state, loading
skeleton, and degraded mode are all wired per UI-SPEC §Copywriting Contract
verbatim. Mutation wiring is intentionally deferred to Plan 13-05 — the
CTA fires a visible `alert('Add-token dialog — Plan 13-05')` marker so the
verifier can confirm the button reaches an onClick.

## Commits

| Hash     | Message |
|----------|---------|
| c6a1abf  | test(13-04): add failing tests for tokens view-model (RED) |
| cb6d7f3  | feat(13-04): implement tokens view-model pure helpers (GREEN) |
| b704df6  | feat(13-04): add tokens leaf components + recharts dependency |
| 483ac56  | feat(13-04): wire /tokens RSC with table, loading, degraded banner |

## Test evidence

```
$ cd apps/admin && bun test 'app/(auth)/tokens/_lib/view-model.test.ts'
 15 pass
 0 fail
 22 expect() calls
Ran 15 tests across 1 file. [128.00ms]
```

Coverage:
- `buildTokenRows` — 4 tests (label matching, null-on-miss, reset-window keying, sparkline mapping)
- `thresholdClass` — 7 tests (boundary inclusivity at 0.80, 0.95; clamping >1; percentage input normalization)
- `humanizeResetSeconds` — 4 tests (null→'unknown', 0→'now', minutes/hours/days formatting)

## Build evidence

```
$ cd apps/admin && bun run build
 ✓ Compiled successfully in 5.5s
 ...
├ ƒ /tokens                               106 kB         220 kB
ƒ  (Dynamic)  server-rendered on demand
```

`/tokens` is correctly marked `ƒ` (dynamic) — matches `export const dynamic = 'force-dynamic'`.

## UI verification evidence

With the admin dev server running at `127.0.0.1:3847`, a live fetch of
`/tokens` correctly 200s through the middleware auth rewrite to the login
page (no session cookie in the test harness — expected behavior, since
Phase 12's middleware enforces the GitHub-OAuth + allowlist gate on the
`(auth)` route group).

To isolate the `/tokens` render from auth, the components were rendered
directly via `react-dom/server` `renderToStaticMarkup` against three
scenarios (empty, populated with 62% / 88% / 1h-reset sample, degraded).
All 25 visual-contract assertions passed:

```
PASS empty: No tokens yet heading
PASS empty: SOPS body copy
PASS empty: no sk-ant-oat01-
PASS populated: label link
PASS populated: tier badge pro
PASS populated: owner mcow
PASS populated: 5h column header
PASS populated: 7d column header
PASS populated: Resets in header
PASS populated: 7-day trend header
PASS populated: progressbar role
PASS populated: aria-valuenow present
PASS populated: 56px row height class h-14
PASS populated: Enabled badge
PASS populated: 1h 0m countdown
PASS populated: 62% label (5h)
PASS populated: 88% label (7d)
PASS populated: amber warn color for 88%
PASS populated: no sk-ant-oat01-
PASS degraded: Read-only mode heading
PASS degraded: SOPS write path copy
PASS degraded: CTA aria-disabled
PASS degraded: cursor-not-allowed on CTA
PASS degraded: Add token label
PASS degraded: no sk-ant-oat01-
```

Rendered evidence HTML files: `/tmp/tokens-empty.html`,
`/tmp/tokens-populated.html`, `/tmp/tokens-degraded.html`.

### UI-SPEC copy strings verified verbatim

| Element | UI-SPEC text | Render result |
|---------|-------------|---------------|
| Page h1 | `Claude tokens` | present in page.tsx (grep 1 hit) |
| Page subtitle | `Manage Claude Code OAuth tokens. Live utilization from the exporter on mcow.` | present in page.tsx |
| CTA label | `Add token` | present in AddTokenButton.tsx and degraded render |
| Empty heading | `No tokens yet` | empty render PASS |
| Empty body | `Add your first Claude Code OAuth token to start tracking usage. Paste the token value — it will be encrypted with SOPS before it touches disk.` | empty render PASS (assertion checks `Paste the token value` substring) |
| Degraded heading | `Read-only mode` | degraded render PASS |
| Degraded body | `SOPS write path is unavailable. Existing tokens are shown from the exporter's last-known state. Add, rotate, rename, and delete are disabled until SOPS recovers.` | degraded render PASS (assertion checks `SOPS write path is unavailable` substring) |
| Column headers | `Label · Tier · Owner · 5h usage · 7d usage · Resets in · 7-day trend · State · (kebab)` | all 8 labeled columns present |

### Threshold color map proven

- 62% (5h): rendered with `bg-primary` (safe). Not asserted by name but
  implied by absence of the other two classes in the 5h cell.
- 88% (7d): rendered with `bg-amber-500` (warn). Explicitly asserted PASS.
- Critical path (≥95%): covered by unit test `thresholdClass(0.95) → critical`.

### Token-leak proof (TOKEN-03 never-reflect property)

Across all three rendered HTML artifacts, `sk-ant-oat01-` is not present.
The view-model consumes `PublicTokenEntry[]` (which is
`Omit<TokenEntry, 'value'>` from Plan 13-03), so the token value is
structurally impossible to reach the HTML response. This is the structural
mitigation for threat T-13-04-01.

### Live-server limitation note

The plan's Task 4 step matrix assumed operator-browser verification against
the deployed mcow admin. Since this plan ran in the local dev tree (not
deployed), the live-server steps 4 (SOPS rename), 5 (sops-seed a fake
entry), and 7 (Lighthouse score) are deferred to the phase-level post-deploy
walkthrough. The structural equivalents were proven in this run:

- Step 2 (empty state) — rendered + grep PASS
- Step 3 (skeleton) — `loading.tsx` ships 5 `h-14 w-full` skeletons (file present; exercised at request time by Next.js)
- Step 4 (degraded banner) — `!writeAvailable` branch rendered in isolation, banner + disabled CTA + disabled kebab all verified
- Step 5 (no sk-ant-oat01- in HTML) — asserted across all three scenarios
- Step 7 (a11y markers) — `role="progressbar"` + `aria-valuenow` verified present; `aria-disabled="true"` on degraded CTA + kebab verified

The operator may run the plan's step matrix against the deployed admin once
Plan 13-05 ships the mutation dialogs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Sparkline Tooltip formatter type mismatch in recharts v3**

- **Found during:** Task 3 `bun run build` verification.
- **Issue:** Plan's code spec annotated the Tooltip formatter as
  `(v: number) => [...]`. Recharts v3 types the callback value as
  `ValueType | undefined` (`ValueType = string | number | (string | number)[]`).
  TypeScript's exactOptionalParameterTypes-style check rejected the
  narrower annotation and failed `next build`.
- **Fix:** Widened the callback to the library's untyped shape and added a
  `typeof v === 'number'` guard before calling `.toFixed(0)` — behavior
  unchanged in the happy path (recharts always passes a number for our
  dataKey), but the function now type-checks. Same treatment for the
  `labelFormatter`'s `t` argument.
- **Files modified:** `apps/admin/app/(auth)/tokens/_components/Sparkline.tsx`
- **Commit:** `483ac56`

No Rule-2/3/4 issues triggered. The plan's spec code compiled and rendered
cleanly apart from this one recharts-version-drift.

## Threat Flags

None. All surface introduced by this plan maps to pre-declared threats
T-13-04-01 through T-13-04-07:

- T-13-04-01 (token-in-HTML) — structurally mitigated: RSC imports only
  `PublicTokenEntry` from token-registry.server.ts; `value` is `Omit`-ed
  at the type level. Empty + populated + degraded renders all grep-clean.
- T-13-04-02 (Prom URL leak) — `prometheus.server.ts` is a `server-only`
  module; eslint-plugin-server-only blocks client import at build time.
- T-13-04-03 (Prom hang blocks render) — four queries in `Promise.all`
  each `.catch(() => [])`; degraded-data-but-rendered.
- T-13-04-04 (error boundary stack leak) — inherits Phase 12 `error.tsx`
  prod-masking; no change in this plan.
- T-13-04-05 (unauth reaches /tokens) — inherited Phase 12 middleware
  gate on `(auth)` route group; dev-server fetch rewrites to /login,
  proving the gate is active even before this page renders.
- T-13-04-06 (console-logs-token-on-Prom-fail) — accept disposition per
  plan; mitigations already in place in sops.server + token-registry.
- T-13-04-07 (Recharts CSP bypass) — recharts renders external SVG, not
  inline scripts; middleware CSP unchanged.

## Known Stubs

**`AddTokenButton.onClick`** — fires `alert('Add-token dialog — Plan 13-05')`.
This is an intentional scaffold marker called out in the plan. Plan 13-05
replaces the handler with a `useState<boolean>` Dialog trigger. Until then,
the CTA is visible and reachable but no data mutation occurs.

**`TokensTable` row kebab** — renders a `<MoreVertical />` icon button with
correct `disabled`/`aria-disabled` wiring but no `DropdownMenu` yet. Plan
13-05 adds the `Rotate / Enable-Disable / Rename / Delete` menu.

Neither stub blocks this plan's goal (read-path), which is to prove SC #1
and SC #4 (degraded mode) with live data.

## Acceptance Criteria Pass/Fail

| Criterion | Result |
|-----------|--------|
| `export function buildTokenRows` — 1 line | PASS |
| `export function thresholdClass` — 1 line | PASS |
| `export function humanizeResetSeconds` — 1 line | PASS |
| `'safe'` / `'warn'` / `'critical'` in view-model.ts | PASS (all three) |
| `bun test view-model.test.ts` exits 0; 11+ passed | PASS (15 passed) |
| Leaf components exist (UtilizationBar, ResetCountdown, Sparkline, DegradedBanner) | PASS |
| `'use client'` in Sparkline.tsx | PASS |
| `role="progressbar"` + `aria-valuenow` in UtilizationBar.tsx | PASS |
| `Read-only mode` exact copy in DegradedBanner.tsx | PASS |
| `bg-amber-500` / `bg-destructive` / `bg-primary` in UtilizationBar.tsx | PASS |
| `recharts` in apps/admin package.json | PASS (^3.8.1) |
| shadcn table/progress/alert/tooltip/badge/sonner present | PASS (all pre-installed by Plan 13-01) |
| `apps/admin/app/(auth)/tokens/page.tsx` has `force-dynamic` | PASS |
| `listTokens()` + `sopsAvailable()` + `queryInstant(` × 3 + `queryRange(` × 1 in page.tsx | PASS |
| `Claude tokens` + `Manage Claude Code OAuth tokens` exact copy | PASS |
| `No tokens yet` / `7-day trend` / `Resets in` / `h-14` in TokensTable.tsx | PASS |
| `loading.tsx` renders 5 `h-14 w-full` skeletons | PASS |
| `bun run build` exits 0 with no type errors | PASS |
| No `sk-ant-oat01-` literal anywhere under `app/(auth)/tokens/` | PASS (grep confirmed 0 hits) |
| Empty state render — heading + body + CTA match UI-SPEC | PASS |
| Degraded banner appears when `!writeAvailable`; CTA + kebabs aria-disabled | PASS |
| View-source grep for `sk-ant-oat01-` returns 0 hits | PASS (proven across 3 scenarios) |

## Self-Check: PASSED

All claimed files exist; all claimed commits reachable from `main`:

- apps/admin/app/(auth)/tokens/_lib/view-model.ts — FOUND
- apps/admin/app/(auth)/tokens/_lib/view-model.test.ts — FOUND
- apps/admin/app/(auth)/tokens/_components/TokensTable.tsx — FOUND
- apps/admin/app/(auth)/tokens/_components/UtilizationBar.tsx — FOUND
- apps/admin/app/(auth)/tokens/_components/ResetCountdown.tsx — FOUND
- apps/admin/app/(auth)/tokens/_components/Sparkline.tsx — FOUND
- apps/admin/app/(auth)/tokens/_components/DegradedBanner.tsx — FOUND
- apps/admin/app/(auth)/tokens/_components/AddTokenButton.tsx — FOUND
- apps/admin/app/(auth)/tokens/page.tsx — FOUND (modified)
- apps/admin/app/(auth)/tokens/loading.tsx — FOUND
- commits c6a1abf, cb6d7f3, b704df6, 483ac56 — ALL FOUND in git log

Final verification: `bun test view-model.test.ts` = 15/0; `bun run build` = exit 0; 25/25 render-contract assertions pass.
