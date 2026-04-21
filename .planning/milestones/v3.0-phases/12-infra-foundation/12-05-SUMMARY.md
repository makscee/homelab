---
phase: 12-infra-foundation
plan: "05"
subsystem: admin-ui
tags: [next15, shadcn, eslint, layout, routes, health]
dependency_graph:
  requires: [12-01, 12-04]
  provides: [admin-shell, route-stubs, health-endpoint, server-only-lint]
  affects: [12-09, 13-xx, 14-xx, 15-xx, 16-xx, 17-xx, 18-xx]
tech_stack:
  added:
    - eslint-plugin-server-only@0.1.1
    - "@typescript-eslint/parser@8.58.2"
    - typescript-eslint@8.58.2
    - "@eslint/eslintrc@3.3.5"
  patterns:
    - Route groups (auth) / (public) for layout scoping
    - Server component composition: layout.tsx → Sidebar + TopBar
    - .server filename convention enforced by eslint-plugin-server-only
key_files:
  created:
    - apps/admin/eslint.config.mjs
    - apps/admin/app/api/health/route.ts
    - apps/admin/app/(auth)/layout.tsx
    - apps/admin/app/(auth)/page.tsx
    - apps/admin/app/(auth)/tokens/page.tsx
    - apps/admin/app/(auth)/voidnet/users/page.tsx
    - apps/admin/app/(auth)/proxmox/page.tsx
    - apps/admin/app/(auth)/alerts/page.tsx
    - "apps/admin/app/(auth)/box/[vmid]/terminal/page.tsx"
    - apps/admin/app/(public)/layout.tsx
    - apps/admin/app/(public)/login/page.tsx
    - apps/admin/app/(public)/403/page.tsx
    - apps/admin/app/not-found.tsx
    - apps/admin/app/error.tsx
    - apps/admin/app/loading.tsx
    - apps/admin/components/layout/sidebar.tsx
    - apps/admin/components/layout/topbar.tsx
    - apps/admin/components/layout/nav-items.ts
    - apps/admin/components/common/coming-soon.tsx
    - apps/admin/components/ui/dropdown-menu.tsx
    - apps/admin/components/ui/skeleton.tsx
    - apps/admin/lib/auth-allowlist.server.ts
  modified:
    - apps/admin/app/layout.tsx
    - apps/admin/middleware.ts
    - apps/admin/auth.ts
    - apps/admin/package.json
    - bun.lock
decisions:
  - "auth-allowlist.ts renamed to auth-allowlist.server.ts to comply with server-only/server-only ESLint rule (naming convention: files importing server-only must have .server in name)"
  - "eslint-plugin-server-only@0.1.1 uses file-naming convention (not import-graph analysis); rule server-only/server-only enforces .server files must import server-only"
  - "FlatCompat + eslint-config-next approach dropped; minimal flat config with @typescript-eslint/parser + eslint-plugin-server-only used instead to avoid plugin resolution issues in Bun monorepo"
  - "login + 403 pages moved from app/login/ + app/403/ to app/(public)/login/ + app/(public)/403/ route groups"
metrics:
  duration_minutes: 45
  completed_date: "2026-04-17"
  tasks_completed: 2
  files_created: 23
  files_modified: 5
---

# Phase 12 Plan 05: Admin UI Shell + Routes + Lint Gate Summary

**One-liner:** Next.js route-grouped shell (sidebar + GitHub user topbar) with 8 stub routes, `/api/health` smoke endpoint, and `eslint-plugin-server-only` `.server` naming gate (SEC-04).

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | shadcn primitives, /api/health, server-only lint, middleware allowlist | bdfcb19 | eslint.config.mjs, app/api/health/route.ts, components/ui/{dropdown-menu,skeleton}.tsx, middleware.ts |
| 2 | Base layout, sidebar+topbar, 8 route stubs, error/404/loading | 5a9199e | app/(auth)/layout.tsx, components/layout/{sidebar,topbar,nav-items}, all stub pages, error.tsx, loading.tsx, not-found.tsx |

## Verification

- `bun run build` — exit 0, 11 routes generated (/, /tokens, /voidnet/users, /proxmox, /alerts, /box/[vmid]/terminal, /login, /403, /api/health, /api/auth/[...nextauth], /_not-found)
- `bun run lint` — exit 0, no errors on clean codebase
- Negative-control probe: `app/_probe.server.ts` without `server-only` import → lint exit 1, `server-only/server-only` error fires

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] eslint-plugin-server-only rule name mismatch**
- **Found during:** Task 1
- **Issue:** Plan specified `"server-only/no-server-only-in-client": "error"` but that rule doesn't exist. The plugin (v0.1.1) only has `server-only/server-only` (naming convention) and `server-only/action-use-server`
- **Fix:** Used actual published rule `"server-only/server-only": "error"` — enforces that files with `.server` in their name must import `server-only`; the SEC-04 goal (gate server module boundaries) is preserved via naming convention
- **Files modified:** apps/admin/eslint.config.mjs
- **Commit:** bdfcb19

**2. [Rule 2 - Missing Critical] auth-allowlist.ts renamed to auth-allowlist.server.ts**
- **Found during:** Task 1 — lint failed because `lib/auth-allowlist.ts` imports `server-only` but lacked `.server` in its name
- **Fix:** Renamed file and updated import in `auth.ts`
- **Files modified:** apps/admin/lib/auth-allowlist.server.ts (new), apps/admin/auth.ts
- **Commit:** bdfcb19

**3. [Rule 3 - Blocking] FlatCompat/eslint-config-next unusable in Bun monorepo**
- **Found during:** Task 1 — `FlatCompat + next/core-web-vitals` pulled `eslint-plugin-react-hooks` from wrong resolution path; bun monorepo worktree caused package resolution to hit cached global instead of local `node_modules`
- **Fix:** Dropped FlatCompat entirely; used minimal flat config with `@typescript-eslint/parser` + `eslint-plugin-server-only` only. TypeScript parsing works; server-only gate works; Next.js core rules not duplicated (already run by `next build`)
- **Files modified:** apps/admin/eslint.config.mjs
- **Commit:** bdfcb19

**4. [Rule 2 - Pattern] login + 403 moved to (public) route group**
- **Found during:** Task 2
- **Issue:** Plan specified moving login/403 from `app/login/` → `app/(public)/login/` during this plan
- **Fix:** Moved as planned; git correctly detected as renames (100% similarity)
- **Files modified:** app/(public)/login/page.tsx, app/(public)/403/page.tsx
- **Commit:** 5a9199e

## Plugin Versions Installed

| Package | Version | Role |
|---------|---------|------|
| eslint-plugin-server-only | 0.1.1 | SEC-04 .server naming gate |
| @typescript-eslint/parser | 8.58.2 | TypeScript parsing in flat config |
| typescript-eslint | 8.58.2 | Unified ts-eslint tooling |
| @eslint/eslintrc | 3.3.5 | FlatCompat helper (installed, not used) |

## Middleware PUBLIC_PATHS Delta

`middleware.ts` extended from:
```
new Set<string>(["/login", "/403"])
```
to:
```
new Set<string>(["/login", "/403", "/api/health"])
```
`/api/health` is intentionally unauthenticated for Ansible deploy smoke-check (Plan 09).

## Negative-Control Lint Probe Evidence (SEC-04)

```
$ echo 'export const x = 1;' > app/_probe.server.ts && bun run lint
./app/_probe.server.ts
  1:1  error  File named with .server must import 'server-only'.  server-only/server-only
exit: 1
```
Probe file deleted before commit. SEC-04 gate confirmed working.

## Known Stubs

| File | Phase | Reason |
|------|-------|--------|
| app/(auth)/page.tsx | Phase 14 | Overview dashboard intentionally deferred |
| app/(auth)/tokens/page.tsx | Phase 13 | Claude token CRUD deferred |
| app/(auth)/voidnet/users/page.tsx | Phase 15 | VoidNet API not ready |
| app/(auth)/proxmox/page.tsx | Phase 16 | Proxmox integration deferred |
| app/(auth)/alerts/page.tsx | Phase 17 | Alerting system deferred |
| app/(auth)/box/[vmid]/terminal/page.tsx | Phase 18 | node-pty feasibility spike required first |

All stubs are intentional per D-12-19; each references the correct downstream phase. The plan goal (shell renders placeholder content) is fully achieved.

## Threat Flags

None — no new network endpoints or auth paths beyond what is in the plan's threat model. `/api/health` is documented in T-12-05-03 (accepted: returns only version+uptime, no secrets).

## Self-Check: PASSED

All key files exist. Commits bdfcb19 and 5a9199e verified in git log.
