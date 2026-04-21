---
phase: 17-eslint-10-node-types-24-upgrade
status: ready_for_research
created: 2026-04-17
autonomous: true
---

# Phase 17: ESLint 10 + @types/node 24 Upgrade — Context

## Goal

Upgrade `apps/admin` to ESLint 10 and `@types/node` 24. Success = `bun run lint`, `bun run typecheck`, and `bun run build` all pass clean; deploy to mcow; Playwright smoke on `/`, `/audit`, `/alerts`.

## Current State (post-Phase-16)

- **eslint**: `^9.x` (via Next.js default)
- **typescript-eslint**: `^8.58.2`
- **@types/node**: `^22`
- **typescript**: `^6.0.3` (Phase 16)
- **next**: `15.5.15`

## Locked Decisions (autonomous defaults)

### D-1: ESLint 10 flat config only
Flat config (`eslint.config.*`) is ESLint 10's only supported format. Migrate if the repo still uses `.eslintrc.*`. Use official migration guide / `@eslint/migrate-config` if needed.

### D-2: typescript-eslint bump to match
Bump `typescript-eslint` to the minimum version compatible with ESLint 10 (likely 9.x / 10.x — research pins).

### D-3: @types/node 22 → 24
Straight bump. Node runtime on mcow is already 22+; types catch up.

### D-4: Next.js eslint-config-next compat
Use the `eslint-config-next` version that supports ESLint 10 + flat config. Research pins exact version.

### D-5: Upgrade-only scope
No new rules, no style sweeps, no `--fix` runs that touch unrelated files. Fix only what breaks.

## Out of Scope

- Rule-set expansion (adding plugins, stricter rules)
- Prettier integration changes
- Runtime behavior changes
- Phase 18+ features

## Open Questions for Research

- ESLint 10 release notes — breaking changes for a Next.js 15 + typescript-eslint 8 codebase
- typescript-eslint peer range for ESLint 10 (min version)
- eslint-config-next compat version for ESLint 10
- `@types/node` 22 → 24 implications (new globals, stricter types)
- Does Next.js 15.5 bundle its own eslint-config internally — forced to stay on a pinned version?

## Verification Approach

- `cd apps/admin && bun run lint` exits 0
- `cd apps/admin && bun run typecheck` exits 0
- `cd apps/admin && bun run build` exits 0
- Deploy via `ansible-playbook ansible/playbooks/deploy-homelab-admin.yml -l mcow`
- Playwright smoke `/`, `/audit`, `/alerts` — no console errors

## Files Likely Touched

- `apps/admin/package.json` — eslint, typescript-eslint, eslint-config-next, @types/node bumps
- `apps/admin/eslint.config.*` or `.eslintrc.*` — flat-config migration if required
- `apps/admin/bun.lock`
