---
phase: 17-eslint-10-node-types-24-upgrade
plan: 01
subsystem: apps/admin
tags: [eslint, types, toolchain, upgrade]
requires: []
provides:
  - "ESLint 10.2.x lint pipeline"
  - "@types/node 24.x compile-time types"
  - "Inline server-only SEC-04 rule (plugin-free)"
affects:
  - apps/admin/package.json
  - apps/admin/bun.lock
  - apps/admin/eslint.config.mjs
tech-stack:
  added: []
  patterns:
    - "Inline ESLint flat-config rule (P-1 fallback for broken plugin)"
key-files:
  created: []
  modified:
    - apps/admin/package.json
    - apps/admin/bun.lock
    - apps/admin/eslint.config.mjs
decisions:
  - "P-1 fallback applied: inlined server-only rule after eslint-plugin-server-only@0.1.1 crashed on ESLint 10 (pulled @typescript-eslint/utils@7.x LegacyESLint class that extends a removed ESLint 10 class); dropped plugin devDep"
  - "Kept @eslint/eslintrc ^3.3.5 pinned per D-5 (unused at runtime, no churn)"
  - "HTTP smoke via curl accepted as auth-gate verification substitute for Playwright (307 → /login on /, /audit, /alerts confirms routing + middleware intact)"
metrics:
  duration: "~7 min"
  completed: 2026-04-17T16:21Z
  tasks_completed: 3
  commits: 1
---

# Phase 17 Plan 01: ESLint 10 + @types/node 24 Upgrade Summary

Mechanical bump of `apps/admin` to ESLint `^10.2.0` and `@types/node` `^24`, with the planned P-1 fallback triggered — `eslint-plugin-server-only@0.1.1` was dropped and its single SEC-04 rule inlined into `eslint.config.mjs`.

## Tasks Completed

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | Bump eslint 9 → 10.2, @types/node 22 → 24 + P-1 inline | ✅ | `a687d6b` |
| 2 | Deploy to mcow via Ansible | ✅ | (deploy only) |
| 3 | HTTP smoke /, /audit, /alerts | ✅ | — |

## Verification Results

- `bun x eslint --version` → `v10.2.0` ✓
- `bun run lint` → exit 0 (`✔ No ESLint warnings or errors`) ✓
- `bun x tsc --noEmit` → exit 0, zero diagnostics ✓
- `bun run build` → Next.js production build succeeded; all routes compiled ✓
- Ansible deploy `deploy-homelab-admin.yml -l mcow` → 29 ok, 6 changed, 0 failed ✓
- Local `/api/health` → `200 ok=true` ✓
- Public `https://homelab.makscee.ru/api/health` → `200 ok=true` ✓
- `systemctl is-active homelab-admin` on mcow → `active` ✓
- HTTP smoke /, /audit, /alerts → all `307 → /login` (auth gate intact) ✓
- `journalctl -u homelab-admin -n 20` → clean, no errors/warnings ✓

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - P-1 fallback] eslint-plugin-server-only crashed on ESLint 10**
- **Found during:** Task 1 lint step
- **Issue:** `TypeError: Class extends value undefined is not a constructor or null` at `@typescript-eslint/utils@7.18.0/dist/ts-eslint/eslint/LegacyESLint.js`. The plugin indirectly pulls `@typescript-eslint/utils@7.x`, which references an ESLint base class removed in ESLint 10.
- **Fix:** Per plan's documented P-1 fallback: inlined the `server-only/server-only` rule directly into `apps/admin/eslint.config.mjs` (~40 LOC), removed `eslint-plugin-server-only` from `devDependencies`, reinstalled. SEC-04 enforcement preserved — the rule still reports any `*.server.ts(x)` file missing a top-level `import "server-only"`.
- **Files modified:** `apps/admin/eslint.config.mjs`, `apps/admin/package.json`, `apps/admin/bun.lock`
- **Commit:** `a687d6b`

No other deviations. D-2 (typescript-eslint peer range) and D-4 (eslint-config-next not imported) held as RESEARCH predicted — no-ops.

## Authentication Gates

None. Deploy and smoke ran without auth friction (Tailnet SSH + public HTTPS).

## Threat Surface Changes

None. No new endpoints, auth paths, or trust boundaries. The inlined SEC-04 rule is behaviorally equivalent to the dropped plugin — boundary enforcement preserved (T-17-04 mitigated).

## Known Stubs

None.

## Self-Check: PASSED

- `apps/admin/package.json` contains `"eslint": "^10.2.0"` — FOUND
- `apps/admin/package.json` contains `"@types/node": "^24"` — FOUND
- `apps/admin/eslint.config.mjs` contains inline `serverOnlyRule` — FOUND
- Commit `a687d6b` present in `git log` — FOUND
- `homelab-admin.service` active on mcow — CONFIRMED
