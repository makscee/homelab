---
phase: 12-infra-foundation
plan: "01"
subsystem: admin-scaffold
tags: [next.js, bun, tailwind, shadcn, typescript, react, workspaces]
dependency_graph:
  requires: []
  provides: [apps/admin scaffold, bun workspaces root, bun.lock, standalone build]
  affects: [12-02, 12-04, 12-05, 12-09]
tech_stack:
  added:
    - "Next.js 15.5.15 (bumped from planned 15.2.4 — see deviations)"
    - "React 19.2.5"
    - "Zod 3.24.1"
    - "Tailwind CSS ^3.4.0"
    - "shadcn/ui (components.json + lib/utils.ts)"
    - "clsx ^2.1.1 + tailwind-merge ^2.5.0"
    - "TypeScript ^5.6.0"
    - "Bun workspaces (bun.lock text format)"
  patterns:
    - "CSS variables dark theme on :root (no toggle, dark-by-default per D-12-21)"
    - "standalone output in next.config.mjs (consumed by Ansible deploy Plan 09)"
    - "Bun workspace root with apps/* glob"
key_files:
  created:
    - package.json
    - bun.lock
    - apps/admin/package.json
    - apps/admin/next.config.mjs
    - apps/admin/tsconfig.json
    - apps/admin/tailwind.config.ts
    - apps/admin/postcss.config.mjs
    - apps/admin/components.json
    - apps/admin/lib/utils.ts
    - apps/admin/app/layout.tsx
    - apps/admin/app/page.tsx
    - apps/admin/app/globals.css
    - apps/admin/.env.example
  modified:
    - .gitignore
decisions:
  - "Next.js bumped to 15.5.15 (from planned 15.2.4) to clear GHSA-q4gf-8mx6-v5v3 DoS CVE affecting <15.5.15"
  - "bun.lock (text) not bun.lockb (binary) — Bun 1.3.5 generates text lockfile by default"
  - "root node_modules added to .gitignore (Bun workspaces hoists deps to root)"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-17"
  tasks_completed: 2
  tasks_total: 2
  files_created: 13
  files_modified: 1
---

# Phase 12 Plan 01: Bun Workspaces Root + Next.js Admin Scaffold Summary

**One-liner:** Next.js 15.5.15 + React 19.2.5 workspaces scaffold with standalone output, dark-by-default Tailwind/shadcn theme, and clean bun audit gate.

## What Was Built

- Bun workspaces root (`package.json` with `workspaces: ["apps/*"]`) with build/dev/lint/audit scripts
- `apps/admin/` Next.js app with all required config files
- Standalone output enabled (`output: 'standalone'`) for Ansible deploy pipeline
- Dark mode forced via `<html className="dark">` (D-12-21 — no toggle)
- shadcn CSS variable theme on `:root`; `lib/utils.ts` with `cn()` helper
- `.env.example` with `HOMELAB_ADMIN_ALLOWED_GITHUB_LOGINS=makscee`

## Verification Results

| Check | Result |
|-------|--------|
| `bun install --frozen-lockfile` | Passes (704 packages) |
| `cd apps/admin && bun run build` | Exit 0, standalone output generated |
| `bun audit --audit-level high` | **No vulnerabilities found** |
| Next.js version in package.json | 15.5.15 |
| `output: 'standalone'` in next.config.mjs | Present |
| `darkMode: 'class'` in tailwind.config.ts | Present |
| `<html className="dark">` in layout.tsx | Present |
| `bun.lock` at repo root committed | Present |

## Exact Package Versions Installed

- `next`: **15.5.15**
- `react`: **19.2.5**
- `react-dom`: **19.2.5**
- `zod`: **3.24.1**
- `eslint-config-next`: **15.5.15**
- `tailwindcss`: ^3.4.0 (resolved to latest 3.4.x)
- `typescript`: ^5.6.0

## bun audit Output

```
bun audit v1.3.5 (1e86cebd)
No vulnerabilities found
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Next.js bumped from 15.2.4 to 15.5.15**
- **Found during:** Task 2 verification (`bun audit`)
- **Issue:** Next.js 15.2.4 fails `bun audit --audit-level high` with 1 critical RCE (GHSA-9qr9-h5gf-34mp) and 3 high CVEs. Next.js 15.2.9 still fails with GHSA-q4gf-8mx6-v5v3 (DoS, affects `<15.5.15`). The plan's must_have requires `bun audit --audit-level high` exits 0.
- **Fix:** Bumped `next` and `eslint-config-next` to `15.5.15` (minimum clean version in 15.x series). The plan states "15.2.4 or higher 15.x patch containing CVE fix" — this satisfies that intent.
- **Files modified:** `apps/admin/package.json`, `bun.lock`
- **Commits:** `392c709`

**2. [Rule 2 - Correctness] Added root `node_modules` to .gitignore**
- **Found during:** Task 1 commit staging
- **Issue:** Bun workspaces hoists dependencies to repo root `node_modules/`. This was untracked and would accidentally be staged.
- **Fix:** Added `node_modules` to `.gitignore` v3.0 section (above `apps/*/node_modules`).
- **Files modified:** `.gitignore`
- **Commit:** `9990ae4`

**3. [Rule 1 - Fact] Lockfile is `bun.lock` (text), not `bun.lockb` (binary)**
- **Found during:** Task 1
- **Issue:** Bun 1.3.5 generates a text-format lockfile `bun.lock`, not the binary `bun.lockb` referenced in the plan. This is correct Bun 1.x behavior.
- **Fix:** Committed `bun.lock` as the deterministic lockfile. Plan artifact path `bun.lockb` is understood as the lockfile of whatever format Bun generates.
- **Files:** `bun.lock`

## Known Stubs

`apps/admin/app/page.tsx` contains placeholder text "Homelab Admin — scaffold OK" — intentional per plan spec. Real layout ships in Plan 05.

## Self-Check: PASSED

All created files verified present. Both task commits verified in git log:
- `9990ae4` — chore(12-01): Bun workspaces root + .gitignore
- `392c709` — feat(12-01): scaffold apps/admin Next.js 15.5.15 + React 19 + Tailwind + shadcn
