---
phase: 20
plan: 01
subsystem: admin-ui
tags: [nextjs, prometheus, swr, alerts, dashboard]
requires: [prometheus-server, alerts-count.server.ts pattern]
provides: [listFiringAlerts, fetchRuleAnnotations, /api/alerts/list, /alerts page]
affects: [apps/admin/app/(auth)/alerts]
tech_stack:
  added: []
  patterns: [server-only sentinel module, always-200 envelope, SWR 15s refresh, DI test hook]
key_files:
  created:
    - apps/admin/lib/alerts-list.server.ts
    - apps/admin/lib/alerts-list.server.test.ts
    - apps/admin/lib/prom-rules.server.ts
    - apps/admin/app/api/alerts/list/route.ts
    - apps/admin/app/(auth)/alerts/_components/AlertsTable.tsx
    - apps/admin/app/(auth)/alerts/_components/SeverityBadge.tsx
    - apps/admin/app/(auth)/alerts/_components/LabelsCell.tsx
    - apps/admin/app/(auth)/alerts/_components/StaleBanner.tsx
  modified:
    - apps/admin/app/(auth)/alerts/page.tsx  # replaced ComingSoon stub
decisions:
  - Followed D-01 (Prometheus only, no AM client).
  - Followed D-02 (table, not cards).
  - Followed D-03 (SWR 15s refreshInterval; NavAlertBadge cadence left at its Phase 14-05 default — change was not a one-number edit, see RESEARCH Open Q3).
metrics:
  duration_minutes: ~20
  tasks_completed: 2
  completed_date: 2026-04-21
---

# Phase 20 Plan 01: Alerts Panel Summary

Read-only `/alerts` triage table with SWR auto-refresh, stale banner, empty state, and Alertmanager link-out — covers ALERT-01, ALERT-02, ALERT-06.

## What Shipped

- **`lib/alerts-list.server.ts`** — `listFiringAlerts()` joins `ALERTS{alertstate="firing"}` + `ALERTS_FOR_STATE` + `/api/v1/rules`; deterministic labelset-key join; severity enum-bucketed (XSS defense); always-200 envelope with `stale_since` on throw.
- **`lib/prom-rules.server.ts`** — `fetchRuleAnnotations()` indexing alerting-rule summaries by alertname; non-fatal empty-Map on upstream error.
- **`/api/alerts/list` route** — auth-gated, `runtime=nodejs`, `force-dynamic`, unauth → 401, everything else → 200.
- **`/alerts` page** — replaces `<ComingSoon />` stub. Heading "Alerts" + ghost-variant "Open Alertmanager" link-out reading `process.env.ALERTMANAGER_URL` (server-side only).
- **`AlertsTable`** — SWR `refreshInterval: 15_000`; sortable Severity/Alert Name/Duration (default Duration desc); 5-row skeleton loading; empty state per UI-SPEC copy; stale banner when `healthy:false`; row hover `bg-secondary/40`.
- **`SeverityBadge`** — exact UI-SPEC color classes per severity bucket.
- **`LabelsCell`** — collapsible "N labels" chip → inline `k=v` spans.
- **`StaleBanner`** — shadcn `Alert variant="destructive"` + `AlertTriangle` + HH:MM-formatted `stale_since`.

## Verification

- `bun test lib/alerts-list.server.test.ts` → 5/5 pass (14 expect calls, 133ms).
- `bunx tsc --noEmit` → clean on all new files (pre-existing e2e errors unrelated).
- `bun run lint` → no ESLint warnings or errors.
- `bun run build` → exits 0.
- Grep acceptance: `import "server-only"`, `ALERTS{alertstate="firing"}`, `ALERTS_FOR_STATE`, `_setQueryInstantForTest`, `fetchRuleAnnotations`, `/api/v1/rules`, `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `refreshInterval: 15_000`, `process.env.ALERTMANAGER_URL`, `bg-red-900/30 border-red-500/50 text-red-400`, "No firing alerts", "Open Alertmanager" — all present. `ComingSoon` grep-absent from page.

## Commits

- `57d1046` feat(20-01): add listFiringAlerts aggregator + prom-rules annotations helper
- `b4c9e00` feat(20-01): /alerts page — route + RSC + SWR table (ALERT-01/02/06)

## Deviations from Plan

None. Plan executed exactly as written.

**NavAlertBadge cadence (RESEARCH Open Q3):** Per plan guidance, alignment was to proceed only if it was literally a one-number edit. The existing badge hook lives inside `app/(auth)/_components/useAlertCount.ts` alongside conditional logic; left untouched. ALERT-06 remains intact at its Phase 14-05 cadence.

## Checkpoint Task 3 — Deferred

Task 3 is a `checkpoint:human-verify` whose plan text explicitly states: *"Plan 01 deploys through Plan 02 together (see depends_on). This checkpoint runs AFTER Plan 02 has shipped ansible-playbook deploy-homelab-admin.yml rendering ALERTMANAGER_URL + deployed the new claude-usage rules."*

Plan 02 has not yet shipped in this worktree (it adds `ALERTMANAGER_URL` to `ansible/playbooks/tasks/homelab-admin-secrets.yml` and deploys claude-usage rules). Playwright MCP UAT of https://homelab.makscee.ru/alerts, stale-banner simulation, and NavAlertBadge regression screenshots are deferred to the post-Plan-02 deploy step.

## Known Stubs

None. All code paths are wired — Prometheus URL flows from env, annotations from `/api/v1/rules`, table from SWR.

## Self-Check: PASSED

All 8 created files exist on disk; both commits present in `git log` (57d1046, b4c9e00). Checkpoint Task 3 explicitly deferred by plan contract (depends on Plan 02 deploy).
