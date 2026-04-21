---
phase: 15-tailwind-v4-migration-3-4-to-4-2-tailwind-merge-3
plan: 02
subsystem: ui
tags: [tailwind-merge, tailwind, admin-ui, dep-bump]

requires:
  - phase: 15-01
    provides: Tailwind v4.2 utility set (outline-hidden, ring-3, shadow-xs, etc.)
provides:
  - tailwind-merge v3.x aligned with Tailwind v4 class groups
  - Completed Phase 15 scope (Tailwind v4 + tailwind-merge v3 paired upgrade)
affects: [admin-ui, future-shadcn-upgrades, Phase 16 TS upgrade]

tech-stack:
  added: [tailwind-merge ^3]
  patterns:
    - "Fix-on-break dep bumps (D-3): bump, build, Playwright-verify, only edit on failure"

key-files:
  created:
    - .planning/phases/15-tailwind-v4-migration-3-4-to-4-2-tailwind-merge-3/15-02-SUMMARY.md
  modified:
    - apps/admin/package.json
    - apps/admin/bun.lock

key-decisions:
  - "tailwind-merge v3 bump needed no cn() refactor — single call site in apps/admin/lib/utils.ts with no extendTailwindMerge/custom validators, so v3 breaking changes (ClassValidator, ClassGroup signatures) do not apply."
  - "D-5 honored: upgrade-only, zero refactor. lib/utils.ts unchanged."
  - "Playwright MCP UAT on prod (commit a039d43 on mcow) confirmed zero visual regressions across Overview, /audit, /alerts."

patterns-established:
  - "Fix-on-break dep bump: skip pre-audit when surface area is near-zero (verified by grep for extension APIs before the bump)."

requirements-completed: [D-3, D-5]

duration: ~15min
completed: 2026-04-17
---

# Phase 15 Plan 02: tailwind-merge v3 bump Summary

**tailwind-merge bumped to ^3.0.0 paired with Tailwind v4.2 — single-file dep upgrade, zero code changes, Playwright-verified pixel-identical on prod.**

## Performance

- **Duration:** ~15 min (bump + build + deploy + Playwright UAT)
- **Completed:** 2026-04-17
- **Tasks:** 2 (Task 1 auto, Task 2 checkpoint:human-verify via Playwright MCP)
- **Files modified:** 2 (package.json, bun.lock)

## Accomplishments

- tailwind-merge pinned `^3.0.0` in `apps/admin/package.json`; `bun.lock` updated to v3.x resolved version
- `bun run build` clean; no TS or import errors on the `twMerge` surface
- `apps/admin/lib/utils.ts` `cn()` helper untouched (D-5 upgrade-only honored)
- Ansible deploy `ansible/playbooks/deploy-homelab-admin.yml` ran `PLAY RECAP ok=29`; commit `a039d43` live on mcow
- Playwright MCP UAT (authenticated prod session) confirmed pixel parity vs pre-bump baseline:
  - `/` Overview — host tiles, progress bars, sparklines, badges, sidebar, topbar, avatar all render correctly; 0 console errors (6 pre-existing SWR warnings unrelated)
  - `/audit` — empty-state renders identically
  - `/alerts` — card border + shadow + "Coming in Phase 17" copy identical
- No doubled focus rings, no state-variant conflicts, no size-variant stacking, no badge color mismatch observed

## Task Commits

1. **Task 1: Bump tailwind-merge to ^3.0.0** — `a039d43` (chore)
2. **Task 2: Playwright visual spot-check** — verification-only, no commit (no fix-on-break needed)

## Files Created/Modified

- `apps/admin/package.json` — tailwind-merge pin changed from ^2.x to ^3.0.0
- `apps/admin/bun.lock` — lockfile updated with v3.x resolved version

## Decisions Made

- **Fix-on-break validated:** surface area audit (15-RESEARCH.md §tailwind-merge v3) was accurate — our codebase has zero `extendTailwindMerge`/`createTailwindMerge`/custom `ClassValidator` call sites, so all documented v3 breaking changes are no-ops for us. No code edits needed.
- **`/tokens` deliberately skipped:** pre-existing sops PATH issue (backlog 999.1) blocks the page; unrelated to tailwind-merge. Not in Phase 15 scope.

## Deviations from Plan

None — plan executed exactly as written. Build passed on first try; Playwright UAT surfaced zero mismerges, so the fix-on-break branch (D-3) was not exercised.

## Issues Encountered

- `/tokens` page could not be UAT-verified because of the pre-existing sops PATH issue tracked in ROADMAP backlog 999.1 (`homelab-admin.service` unit lacks `/usr/local/bin` in `Environment=PATH`). Explicitly out of Phase 15 scope — tailwind-merge v3 has no interaction with sops.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Phase 15 complete (24/24 plans across v3.0 roadmap):** Tailwind v4.2 + tailwind-merge v3 shipped and verified on prod.
- **Ready for Phase 16 (TypeScript 6.0 upgrade with deprecation fixes):** no blockers from 15; TS surface is independent of CSS/className layer.
- **Open backlog item (not Phase 15):** 999.1 sops PATH fix for `/tokens` — extend `homelab-admin.service` unit `Environment=PATH=` to include `/usr/local/bin`, or use `BindReadOnlyPaths=/usr/local/bin/sops`.

## Self-Check: PASSED

- FOUND: .planning/phases/15-tailwind-v4-migration-3-4-to-4-2-tailwind-merge-3/15-02-SUMMARY.md
- FOUND: a039d43 (chore(15-02): bump tailwind-merge to v3)

---
*Phase: 15-tailwind-v4-migration-3-4-to-4-2-tailwind-merge-3*
*Completed: 2026-04-17*
