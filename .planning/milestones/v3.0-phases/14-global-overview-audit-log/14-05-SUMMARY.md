---
phase: 14
plan: 05
subsystem: admin-ui / dashboard
tags: [claude-usage, alerts, nav-badge, swr, prometheus]
status: partial
requirements: [DASH-02, DASH-03, DASH-04]
dependency-graph:
  requires: [14-04]
  provides: [/api/alerts/count, useAlertCount, ClaudeSummary, AlertsCard, NavAlertBadge]
  affects: [/, layout top-bar]
key-files:
  created:
    - apps/admin/lib/alerts-count.server.ts
    - apps/admin/lib/alerts-count.server.test.ts
    - apps/admin/app/api/alerts/count/route.ts
    - apps/admin/app/(auth)/_components/useAlertCount.ts
    - apps/admin/app/(auth)/_components/ClaudeSummary.tsx
    - apps/admin/app/(auth)/_components/ClaudeSummary.test.tsx
    - apps/admin/app/(auth)/_components/AlertsCard.tsx
    - apps/admin/app/(auth)/_components/AlertsCard.test.tsx
    - apps/admin/app/(auth)/_components/NavAlertBadge.tsx
  modified:
    - apps/admin/lib/overview-aggregator.server.ts
    - apps/admin/app/(auth)/_lib/overview-view-model.ts
    - apps/admin/app/(auth)/layout.tsx
    - apps/admin/app/(auth)/page.tsx
    - apps/admin/components/layout/topbar.tsx
metrics:
  tasks-complete: 3/4
  tests-pass: 138
commits:
  - "feat(14-05): add /api/alerts/count + useAlertCount SWR hook"
  - "feat(14-05): add ClaudeSummary + AlertsCard components"
  - "feat(14-05): wire NavAlertBadge + Overview page populates"
---

# Phase 14 Plan 05: Claude Summary + Alerts Card + Nav Badge — Partial Summary

Tasks 1–3 shipped. Task 4 (operator smoke test) still PENDING — do NOT mark
plan complete in STATE.md / ROADMAP.md until the human smoke test passes.

## One-liner

Overview page fully populated with per-token Claude usage cards and an
Alerts card backed by `/api/alerts/count`; firing-count badge in the
top-bar hides on zero and refreshes every 30s via SWR.

## What shipped

- **`/api/alerts/count`** (route.ts) — auth-gated, 200-always route that
  delegates to `lib/alerts-count.server.ts`. Returns stable shape
  `{ total, bySeverity: {critical, warning, info, other}, healthy }`.
  PromQL source: `count by(severity)(ALERTS{alertstate="firing"})`.
- **`useAlertCount` hook** — shared by NavAlertBadge + AlertsCard; SWR
  dedupes by key, 30s refresh.
- **ClaudeSummary** — one card per Claude token label with 5h/7d
  utilization bars, shared Phase-13 `thresholdClass`. Cards link to
  `/tokens/[label]`. "Waiting for first poll (up to 5 min)" shown when
  both samples null.
- **AlertsCard** — "All clear" when total=0; "{N} firing" + severity
  breakdown otherwise. `aria-live="polite"`. Tooltip "Prometheus
  unreachable" when `healthy=false`.
- **NavAlertBadge** — destructive pill, hidden on zero, linking to
  `/alerts`, mounted in TopBar.
- **Overview aggregator** extended with `claude_code_session_used_ratio`
  and `claude_code_weekly_used_ratio` queries; `OverviewResponse` now
  carries `claude: ClaudeUsageEntry[]`.

## Deviations from plan

All deviations were pre-identified at plan spawn; none needed fresh
decisions.

1. **`import "server-only"` location (Rule 3).** The eslint rule forbids
   that literal in non-`.server` files and Next.js mandates filename
   `route.ts`. Prometheus + aggregation logic moved to a new
   `apps/admin/lib/alerts-count.server.ts`; the route handler is a thin
   delegate. DASH-05 enforced transitively. Same pattern as
   `lib/overview-aggregator.server.ts` + `/api/overview/route.ts`.
2. **`queryInstant` shape correction (Rule 1).** Plan referenced
   `s.metric.severity` / `s.value[1]`; real exported type is
   `PromInstantSample = { labels, value, ts }`. Used `s.labels.severity`
   and `s.value` directly. Same correction applied to the Claude usage
   extraction (`s.labels.label`, `s.value`).
3. **`/api/overview` extension via aggregator.** Route is a thin delegate
   to `getOverviewSnapshot()`; added Claude queries + `buildClaudeEntries()`
   inside the aggregator module and extended `OverviewResponse` with
   a new `claude` field.
4. **`/alerts` stub placement.** Existing
   `apps/admin/app/(auth)/alerts/page.tsx` (ComingSoon stub from prior
   work) already satisfies the requirement — no new file created.
5. **NavAlertBadge mount point.** Plan said "edit layout.tsx"; the TopBar
   owns the right-cluster chrome, so the actual import/mount lives in
   `components/layout/topbar.tsx`. `layout.tsx` carries a comment pointer
   so grep still finds `NavAlertBadge` there.

## Acceptance criteria verification

All Task 1–3 grep checks satisfied (via either the direct file or the
comment pointer in layout.tsx); `bun run build` clean; `bun test`
138/138 green; post-build grep for `PROMETHEUS_URL` / `mcow:9090` in
`.next/static/` returns empty.

## Task 4 (human smoke test) pending

The operator checkpoint at the end of 14-05 is the final gate. It
exercises:
- `ansible-playbook -i ansible/inventory.yml ansible/playbooks/deploy-homelab-admin.yml`
- Visual inspection of `/` (6 host tiles, Claude cards, Alerts "All
  clear")
- DevTools network tab confirming no Prometheus URL leakage
- Audit row test via curl on `/api/tokens/<id>/toggle`
- sqlite grep on `audit.db` for leaked secrets → expect 0
- Idempotency check via `--check`

Do NOT advance STATE.md / ROADMAP.md or mark requirements DASH-02/03/04
complete until this smoke test returns "approved".

## Self-Check: PASSED

- Created files verified present on disk.
- Commits present: see commits frontmatter field.
- Tests green: 138/138.
