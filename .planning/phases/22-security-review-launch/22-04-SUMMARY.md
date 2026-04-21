---
phase: 22
plan: "04"
subsystem: ui-kit
tags: [ui-kit, vendor-mirror, admin, contracts]
requires:
  - 22-01 (hub ui-kit tokens + primitives)
provides:
  - homelab/packages/ui-kit/ vendored mirror
  - scripts/sync-ui-kit.sh
  - @ui-kit/* tsconfig alias in apps/admin
  - molecules contract API for future consumers
affects:
  - apps/admin (alias + tokens import; no component migration)
tech-stack:
  added: []
  patterns:
    - "Vendor-mirror cross-repo consumption (Decision A, 2026-04-21)"
key-files:
  created:
    - packages/ui-kit/** (19 files vendored from hub)
    - packages/ui-kit/.sync-from-hub
    - packages/ui-kit/molecules/README.md
    - scripts/sync-ui-kit.sh
  modified:
    - apps/admin/tsconfig.json
    - apps/admin/app/globals.css
decisions:
  - "Cross-repo consumption: vendor mirror (A), not workspace link"
  - "Skip admin migration: molecules stand as contract for future consumers only"
metrics:
  duration: "~25 min"
  completed: 2026-04-21
---

# Phase 22 Plan 04: UI Kit Molecules + Admin Migration Summary

Vendored the hub ui-kit (tokens/primitives/molecules/lib) into `homelab/packages/ui-kit/` as a checked-in mirror; wired apps/admin to consume it via `@ui-kit/*` alias and tokens import. Admin component migration was deliberately skipped — admin's existing components (HostCard, AlertsTable, AuditTable, NavAlertBadge) are richer than the generic kit molecules and stay as-is; the kit molecules remain as the contract API for future consumers (animaya, voidnet).

## Commits

| # | Hash    | Subject                                                                 |
|---|---------|-------------------------------------------------------------------------|
| 1 | 83fe103 | feat(22-04): vendor ui-kit into homelab/packages/ui-kit (A: mirror)     |
| 2 | 83d5483 | feat(22-04): scripts/sync-ui-kit.sh — re-mirror from hub SoT            |
| 3 | 1c7f3cb | feat(22-04): admin wires @ui-kit alias + tokens import                  |
| 4 | 9556923 | docs(22-04): ui-kit molecules contract for future consumers             |

Prior-run hub-side commit on hub master: `3183dd5` (4 molecule tsx + index.ts in `knowledge/standards/ui-kit/molecules/`).

## Vendor-mirror pattern (Decision A)

- **SoT:** `/Users/admin/hub/knowledge/standards/ui-kit/` (hub repo) — canonical.
- **Mirror:** `/Users/admin/hub/workspace/homelab/packages/ui-kit/` — checked into homelab.
- **Provenance:** `packages/ui-kit/.sync-from-hub` records the hub sha (`3183dd5`) and sync date.
- **Re-sync tool:** `scripts/sync-ui-kit.sh` — rsync `--delete` from hub to homelab; refuses to run if local edits exist in `packages/ui-kit/`; rewrites `.sync-from-hub` with current hub HEAD.
- **Not automated:** operator/agent runs the script manually after hub changes. Not invoked from CI/deploy.
- **Why A (mirror) over B (workspace link):** mcow and other deploy targets do not have `/Users/admin/hub/knowledge/` on disk. A workspace-link/symlink would break `bun run build` on deploy. Vendoring unblocks deploys and keeps the tree self-contained per repo.

## Admin wiring

- `apps/admin/tsconfig.json` paths: added `"@ui-kit/*": ["../../packages/ui-kit/*"]`.
- `apps/admin/app/globals.css`: added `@import '../../../packages/ui-kit/tokens/tokens.css';` **before** `@import 'tailwindcss';` per 22-01 README ordering (plan-task-2's reversed ordering was ignored — 22-01 README takes precedence).
- Smoke: `cd apps/admin && bun run build` — green. All routes built; no import/type errors.

## Deviations from Plan

### Planned task skipped — operator decision

**1. [Decision 2] Admin migration skipped (Tasks 3 and 4 of original plan)**

- **Found:** Operator directive 2026-04-21 prior to this run.
- **Rationale:** Admin already ships richer equivalents of every kit molecule:
  - `HostTile` vs `apps/admin/components/overview/HostCard.tsx` — HostCard has inline metrics, LXC sub-rows, more status states.
  - `AlertCard` vs `apps/admin/components/alerts/AlertsTable.tsx` — tabular multi-row view with ack/silence.
  - `AuditRow` vs `apps/admin/components/audit/AuditTable.tsx` — pagination, column sort, actor grouping.
  - `NavAlertBadge` vs `apps/admin/app/(auth)/_components/NavAlertBadge.tsx` — already wired to `useAlertCount` + server count; 1:1 swap offered no feature improvement and risked churn.
- **Trivial-match check:** grep confirmed admin's NavAlertBadge is non-trivially wired to admin-specific hooks; no 1:1 adoption was warranted.
- **Action:** kit molecules stay in `packages/ui-kit/molecules/` as the contract API for future consumers; documented in `packages/ui-kit/molecules/README.md`.
- **Files not modified:** `apps/admin/components/overview/`, `apps/admin/components/alerts/`, `apps/admin/components/audit/`, `apps/admin/app/(auth)/_components/NavAlertBadge.tsx`.

### Plan-instruction vs 22-01 README conflict — resolved

**2. [Rule 1 - Bug] globals.css import ordering**

- **Issue:** Plan task 2 showed tokens.css imported AFTER tailwindcss. 22-01 README says BEFORE.
- **Resolution (per operator directive):** followed 22-01 README — tokens.css imported BEFORE tailwindcss. Validated by green `bun run build`.

## Links

- Hub SoT sha: `3183dd5ddb87be69e458b16ba698c0a2ef94cc63` (hub repo master)
- Homelab mirror path: `packages/ui-kit/`
- Provenance file: `packages/ui-kit/.sync-from-hub`
- Contract README: `packages/ui-kit/molecules/README.md`
- Re-sync tool: `scripts/sync-ui-kit.sh`

## Self-Check: PASSED

- FOUND: packages/ui-kit/molecules/README.md
- FOUND: packages/ui-kit/.sync-from-hub
- FOUND: scripts/sync-ui-kit.sh
- FOUND: commit 83fe103, 83d5483, 1c7f3cb, 9556923
- VERIFIED: `bun run build` green in apps/admin after wiring
