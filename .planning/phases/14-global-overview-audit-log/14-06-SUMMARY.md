---
phase: 14-global-overview-audit-log
plan: 06
subsystem: infra
tags: [bun, sqlite, nextjs, webpack-externals, systemd, homelab-admin]

requires:
  - phase: 14-global-overview-audit-log
    provides: /audit route + audit_log bun:sqlite reader (plan 14-03), Claude token usage cards (plan 14-05)
provides:
  - bun:sqlite shim that proxies native Database under Bun runtime while preserving build-time throw stub
  - systemd unit forcing Bun runtime (`bun --bun run start`) so `next start` child processes inherit Bun, not Node
  - /audit page renders (empty-state verified) with no shim-throw digest error
  - Claude usage card render path verified (empty-state: no token DB yet)
affects: [14-07, future audit-log writers, any server-side bun:sqlite consumer]

tech-stack:
  added: []
  patterns:
    - "Runtime-detecting native module shim: `typeof Bun !== 'undefined'` guard re-exports native `bun:sqlite`; else throws"
    - "systemd ExecStart uses `bun --bun` flag to force Bun runtime for all child processes spawned by `next start`"

key-files:
  created: []
  modified:
    - apps/admin/lib/bun-sqlite-shim.js
    - apps/admin/lib/bun-sqlite-shim.ts
    - servers/mcow/homelab-admin.service

key-decisions:
  - "Surgical shim fix over webpack externals refactor — keep build-time stub, proxy at runtime only"
  - "Force Bun via systemd `--bun` flag rather than rewriting start script or repackaging to bun-standalone"
  - "Accept empty-state verification for /audit + Claude cards — no audit rows written yet, no tokens registered; render paths proven crash-free"

patterns-established:
  - "Runtime vs build-time module dispatch via `typeof Bun` guard in webpack-externalized shim"
  - "systemd units for Bun-powered Next.js services must pass `--bun` to propagate runtime to `next start` children"

requirements-completed: [GAP-14-01, GAP-14-03]

duration: ~45min (including runtime-verification deviation and re-deploy)
completed: 2026-04-17
---

# Phase 14 Plan 06: bun:sqlite Shim Runtime Proxy Summary

**Fixed /audit digest crash by proxying native bun:sqlite through the shim under Bun runtime and forcing `next start` to run under Bun via systemd `--bun` flag.**

## Performance

- **Duration:** ~45 min (shim fix + runtime-gap diagnosis + systemd fix + redeploy)
- **Completed:** 2026-04-17
- **Tasks:** 3 planned + 1 deviation
- **Files modified:** 3

## Accomplishments
- Shim (`.js` + `.ts`) now re-exports native `bun:sqlite` `Database` when `typeof Bun !== 'undefined'`, falls through to existing throw-stub otherwise — Node build worker unaffected.
- Identified and closed runtime gap: `next start` was spawning Node, not Bun, so the shim always took the throw branch in production.
- homelab-admin systemd unit patched to `ExecStart=/usr/local/bin/bun --bun run start`; redeploy confirmed `readlink /proc/$MainPID/exe = /usr/local/bin/bun`.
- /audit renders without digest error (empty-state "No audit entries yet"); journal clean of `bun:sqlite shim` throws since deploy.

## Task Commits

1. **Task 1: Shim runtime proxy (.js)** — part of `db361c3` (fix)
2. **Task 2: Shim runtime proxy (.ts)** — part of `db361c3` (fix)
3. **Task 3: Build + deploy + verify** — `db361c3` deploy (initial, insufficient)
4. **Deviation: systemd `--bun` flag** — `77b5c57` (fix) — applied by parent main context after Playwright UAT exposed runtime gap

## Files Created/Modified
- `apps/admin/lib/bun-sqlite-shim.js` — `typeof Bun` guard + native `require('bun:sqlite')` re-export
- `apps/admin/lib/bun-sqlite-shim.ts` — TS-side mirror of guard for type-check parity
- `servers/mcow/homelab-admin.service` — `ExecStart` now passes `--bun` to force Bun runtime for `next start` children

## Decisions Made
- **Surgical shim over externals refactor:** Plan called for minimal change; kept webpack externals path untouched, mutated shim only.
- **`--bun` flag over start-script rewrite:** Smallest-surface-area fix for the runtime gap; preserves `bun run start` semantics.
- **Ship on empty-state verification:** /audit and Claude card render paths are proven crash-free; data-population is a separate concern tracked below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] systemd unit spawned Node instead of Bun, defeating the shim's runtime proxy branch**
- **Found during:** Task 3 (post-deploy Playwright UAT by parent main context)
- **Issue:** After `db361c3` deployed, /audit still returned "Something went wrong" (digest `3632396266`). Journal showed `Error: bun:sqlite shim: should not be called at build time at new Database (lib/bun-sqlite-shim.js:22:13)`. Root cause: systemd `ExecStart=/usr/local/bin/bun run start` — `next start` spawned `/usr/bin/node` as server, so `typeof Bun === 'undefined'` at runtime and shim took the throw branch.
- **Fix:** Changed `ExecStart` to `/usr/local/bin/bun --bun run start`. `--bun` flag forces Bun runtime for all child processes spawned by `next start`.
- **Files modified:** `servers/mcow/homelab-admin.service`
- **Verification:** `ansible-playbook -i inventory/homelab.yml playbooks/deploy-homelab-admin.yml` exit 0, service healthy; `readlink /proc/$MainPID/exe = /usr/local/bin/bun`; journal clean of shim-throw errors; /audit renders empty-state without digest.
- **Committed in:** `77b5c57` (parent main context, already in history)

---

**Total deviations:** 1 auto-fixed (Rule 1 — runtime/deploy bug)
**Impact on plan:** Deviation was essential — shim fix alone was insufficient without Bun runtime. No scope creep.

## Issues Encountered
- Original plan assumed production process was already Bun; it was not. Shim fix was necessary but not sufficient; systemd unit needed the `--bun` flag.

## UAT Results (from parent Playwright run)
- **Test 3 — /audit table renders:** PASS. Page renders layout + "No audit entries yet" heading. No digest error. Empty table is legitimate (no audit rows written yet).
- **Test 4 — payload expand / pagination:** N/A. Unverifiable on empty DB — no rows to expand or paginate.
- **Test 6 — Claude usage cards on /overview:** Render path PASS. Cards show "No Claude tokens registered." `/var/lib/homelab-admin/tokens.db` does not exist on mcow. No crash, no digest — legit empty state.

## Known Gaps / Follow-ups
- **Test 4 unverifiable until audit rows exist.** Needs either (a) writer path exercised in integration or (b) seed data. Track in 14-07 or a new plan if 14-07 scope does not cover audit writers.
- **Claude usage cards empty because token registry DB is absent on mcow.** Render path is proven; populating `/var/lib/homelab-admin/tokens.db` and wiring a registration flow is a separate follow-up — not a shim bug.

## User Setup Required
None — deployment + verification handled by operator via Ansible.

## Next Phase Readiness
- /audit unblocked for further UI/feature work (plan 14-07 and beyond).
- Claude usage card render path unblocked; upstream dependency is now "populate token registry," not "fix shim."
- Pattern established for future Bun-on-systemd services: always pass `--bun` to force runtime propagation.

## Self-Check: PASSED
- `apps/admin/lib/bun-sqlite-shim.js` — FOUND
- `apps/admin/lib/bun-sqlite-shim.ts` — FOUND
- `servers/mcow/homelab-admin.service` — FOUND
- commit `db361c3` — FOUND
- commit `77b5c57` — FOUND

---
*Phase: 14-global-overview-audit-log*
*Plan: 06*
*Completed: 2026-04-17*
