---
phase: 16-typescript-6-0-upgrade-with-deprecation-fixes
plan: 01
subsystem: apps/admin
tags: [typescript, toolchain, upgrade, deprecation, next.js]
requires: []
provides:
  - typescript 6.0.3 green across typecheck/build/lint
  - phase-17 unblocked (eslint 10 + @types/node 24 can proceed)
affects:
  - apps/admin/package.json
  - apps/admin/bun.lock
  - apps/admin/types/css.d.ts
  - .gitignore
tech-stack:
  added:
    - typescript@6.0.3
  patterns:
    - ambient CSS module declaration for side-effect imports
key-files:
  created:
    - apps/admin/types/css.d.ts
  modified:
    - apps/admin/package.json
    - apps/admin/bun.lock
    - .gitignore
decisions:
  - TS2882 on `import './globals.css'` resolved via `declare module "*.css"` ambient decl (one-line mechanical fix per D-1)
  - typescript-eslint NOT bumped — 8.58.2 peer range `>=4.8.4 <6.1.0` covers TS 6.0.x (D-2 confirmed no-op)
  - @types/node NOT bumped — stays ^22 per D-4; phase 17 owns the bump
  - tsconfig.json unchanged — no deprecated options in use (D-3 zero delta)
metrics:
  completed: 2026-04-17
  duration: ~15m
  tasks: 3
  files: 4
  commits: 1
---

# Phase 16 Plan 01: TypeScript 6.0.3 Upgrade Summary

TypeScript bumped from `^5.6.0` to `^6.0.3` in apps/admin with a single mechanical ambient-module decl to satisfy TS 6's new TS2882 on side-effect CSS imports; deployed to mcow with health + auth-redirect smoke green.

## Actions

- **Task 1 (commit `4075e80`):** Edited `apps/admin/package.json` typescript devDep; `bun install` resolved TS 6.0.3. Typecheck surfaced a single TS2882 on `app/layout.tsx` line 2 (`import './globals.css'`). Added `apps/admin/types/css.d.ts` with `declare module "*.css"` — mechanical one-line fix per D-1, zero source-code touch. Build + lint clean. Added `apps/admin/tsconfig.tsbuildinfo` to `.gitignore` (Rule 3: generated artifact from TS change).
- **Task 2:** `ansible-playbook playbooks/deploy-homelab-admin.yml -l mcow` green (29 ok, 6 changed, 0 failed). `/api/health` reports `commit_sha: 4075e80`. `systemctl is-active homelab-admin` = `active`. Journal clean post-restart.
- **Task 3 (auto-approved):** Playwright MCP not available in this agent's tool surface; fell back to HTTP-level smoke via mcow ssh. All three routes (`/`, `/audit`, `/alerts`) return 307 → `/login` (auth middleware intact, expected for unauthenticated curl). `/login` returns 200 with form markup. `/api/health` returns `{ok:true, commit_sha:"4075e80"}`. Journal scan `grep -iE "error|warn|uncaught|digest|exception"` for last 5min → zero matches. Per `auto_advance=true`, auto-approved.

## Verification

| Check | Result |
|-------|--------|
| `grep -q '"typescript": "\^6' package.json` | pass |
| `bun x tsc --version` | `Version 6.0.3` |
| `bun x tsc --noEmit` | exit 0 |
| `bun run build` | exit 0 |
| `bun run lint` | exit 0 (no errors/warnings) |
| `ssh root@mcow 'systemctl is-active homelab-admin'` | `active` |
| `/api/health` commit_sha | `4075e80` |
| journal errors post-restart | none |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TS2882 on CSS side-effect import**
- **Found during:** Task 1, first typecheck run
- **Issue:** TS 6 raised `error TS2882: Cannot find module or type declarations for side-effect import of './globals.css'` at `app/layout.tsx:2:8`. TS 5.x silently tolerated this; TS 6 enforces it.
- **Fix:** Added `apps/admin/types/css.d.ts` with `declare module "*.css"` — ambient module decl, type-only, zero runtime impact. This is the standard Next.js pattern for CSS side-effect imports under strict TS.
- **Files modified:** `apps/admin/types/css.d.ts` (new)
- **Commit:** `4075e80`

**2. [Rule 3 - Blocking] `apps/admin/tsconfig.tsbuildinfo` generated but untracked**
- **Found during:** Task 1 post-commit hygiene (post-commit deletion/untracked check)
- **Issue:** `tsc --noEmit` with `incremental: true` now emits `tsconfig.tsbuildinfo`; file was untracked and not in any .gitignore.
- **Fix:** Added `apps/admin/tsconfig.tsbuildinfo` entry to root `.gitignore` (under existing `apps/*/` glob section).
- **Commit:** `4075e80` (bundled with Task 1 per single-atomic-commit rule)

### Auth/Verification Gates

**Task 3 Playwright substitution:** Plan specified Playwright MCP for browser-level console capture. This agent's tool surface does not include `mcp__playwright__*` tools. Substituted with HTTP-level smoke (307 redirects confirmed, /login 200, /api/health commit confirmed, journal clean). Auto-mode policy (`auto_advance=true`) applied → checkpoint auto-approved. If parent wants true browser-level console capture, run Playwright MCP against `https://homelab.makscee.ru` post-login.

## Known Stubs

None.

## Self-Check: PASSED

- `apps/admin/types/css.d.ts` — FOUND
- `apps/admin/package.json` typescript `^6.0.3` — FOUND
- commit `4075e80` — FOUND in `git log`
- mcow health.commit_sha == `4075e80` — CONFIRMED
