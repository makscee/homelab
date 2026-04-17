---
phase: 16-typescript-6-0-upgrade-with-deprecation-fixes
status: ready_for_research
created: 2026-04-17
autonomous: true
---

# Phase 16: TypeScript 6.0 Upgrade + Deprecation Fixes — Context

## Goal

Upgrade `apps/admin` from TypeScript 5.6 → 6.0 and fix all deprecations surfaced by the upgrade. Success = `bun run typecheck` and `bun run build` pass clean, no new runtime errors, site renders.

## Current State

- **typescript**: `^5.6.0`
- **@types/node**: `^22`
- **typescript-eslint**: `^8.58.2`
- Next.js 15.5.15 + React 19 + Tailwind v4 (Phase 15)

## Locked Decisions (autonomous defaults)

### D-1: Deprecation scope = fix-all-that-surface
Run `bun run typecheck` post-upgrade; fix every TS 6 error or new deprecation warning. Cap at "make typecheck green", do NOT refactor untouched code.

### D-2: typescript-eslint sibling bump
Bump `typescript-eslint` to the minimum version compatible with TS 6 (research will pin). Same wave as TS bump.

### D-3: tsconfig — minimal delta
Only change `tsconfig.json` where TS 6 requires (new default lib targets, `moduleResolution` defaults, etc.). No opt-in strictness increases.

### D-4: @types/node — bump if required
Keep `@types/node ^22` unless TS 6 needs `^24` (sibling Phase 17 also bumps this).

### D-5: Upgrade-only scope
No refactors, no new abstractions, no "while we're here" cleanups. Deprecation fixes use mechanical replacements.

## Out of Scope

- ESLint 10 upgrade (Phase 17)
- Runtime behavior changes
- API surface changes in shared `lib/*`
- Strict-mode opt-ins

## Open Questions for Research

- TS 6.0 release-blog breaking changes list — what actually breaks in a Next.js 15 + React 19 codebase?
- typescript-eslint minimum version for TS 6 compat (10.x?)
- Does Next.js 15.5 officially support TS 6 (compat matrix)?
- Bun's bundled TS version — does it matter for build or only for dev experience?
- @types/node 22 → 24 implications

## Verification Approach

- `cd apps/admin && bun run typecheck` exits 0
- `cd apps/admin && bun run build` exits 0
- Deploy to mcow + Playwright smoke-check `/`, `/audit`, `/alerts`
- Journal clean of type-related runtime errors (not typically surfaced but check anyway)

## Files Likely Touched

- `apps/admin/package.json` — typescript, typescript-eslint, @types/node bumps
- `apps/admin/tsconfig.json` — minimal-delta tweaks if required
- Source files with TS 6 deprecations — touch-on-break only
