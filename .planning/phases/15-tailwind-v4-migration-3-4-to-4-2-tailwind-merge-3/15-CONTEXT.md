---
phase: 15-tailwind-v4-migration-3-4-to-4-2-tailwind-merge-3
status: ready_for_research
created: 2026-04-17
---

# Phase 15: Tailwind v4 Migration + tailwind-merge 3 — Context

## Goal

Upgrade `apps/admin` frontend stack from Tailwind v3.4 → v4.2 and tailwind-merge v2.5 → v3, using the CSS-first config model. Scope is a clean upgrade — no ad-hoc refactors, no new features. Success = production build passes, site renders pixel-equivalent to pre-upgrade, no runtime styling regressions.

## Current State

- **tailwindcss**: `^3.4.0` (JS config: `apps/admin/tailwind.config.ts`)
- **tailwind-merge**: `^2.5.0`
- **PostCSS**: `^8.4.0` with `autoprefixer ^10.4.0`
- `app/globals.css`: 47 lines (small, clean)
- Single Next.js app — no monorepo package-boundary concerns

## Locked Decisions

### D-1: CSS-first config
Fully migrate to Tailwind v4 CSS-first model (`@theme` directive in `app/globals.css`, no JS config). Delete `tailwind.config.ts`. Rationale: v4-idiomatic, one source of truth, smaller surface.

### D-2: Drop autoprefixer
Remove `autoprefixer` from package.json and PostCSS config. Tailwind v4 handles vendor prefixing via Lightning CSS automatically. PostCSS config collapses to `@tailwindcss/postcss` only (or moves entirely to the CSS pipeline per v4 defaults).

### D-3: tailwind-merge v3 — fix on break
Bump `tailwind-merge` to `^3.0.0`. Do not pre-audit all `twMerge`/`cn` call sites. Rely on build + Playwright visual spot-checks to surface regressions; fix on break.

### D-4: Use official codemod
Run `npx @tailwindcss/upgrade` as the primary migration mechanism. Commit its output as-is, then make manual adjustments only where the codemod leaves gaps or misclassifies.

### D-5: Upgrade-only scope
No pattern cleanups, no new utilities, no component refactors mixed in. If the codemod surfaces "would be nicer as X" observations, capture them as backlog items (`999.x` in ROADMAP). Keep the phase PR reviewable.

## Out of Scope

- Design tokens / brand refresh
- Dark-mode rework (existing mechanism preserved as-is)
- shadcn/ui or component library swaps
- Tailwind plugin additions (forms, typography, etc.) unless already present
- TypeScript 6 upgrade (Phase 16)
- ESLint 10 upgrade (Phase 17)

## Open Questions for Research

- Exact codemod behavior on `tailwind.config.ts` → CSS `@theme` (does it handle custom colors / extend blocks cleanly?)
- Class rename list v3 → v4 (e.g., `shadow-sm` → `shadow-xs`, `bg-opacity-*` → `bg-black/50`) — codemod should handle but need list for visual-diff focus
- Lightning CSS browser-target config (does it need explicit browserslist, or does it read `package.json.browserslist`?)
- tailwind-merge v3 breaking changes list (custom class groups API, validators signature)
- Next.js 15.5 + Tailwind v4 known issues (HMR, build-time CSS extraction)

## Verification Approach

- `bun run build` succeeds (no PostCSS or Tailwind errors)
- Dev server renders without console errors
- Playwright snapshot of `/` (Overview) matches pre-upgrade layout within tolerance — host tiles, Alerts card, Claude Usage card, sidebar, top-bar all render as before
- Playwright snapshot of `/audit`, `/tokens`, `/alerts` pages — no broken layouts
- Visual spot-check: progress bars, badges, table borders, sparkline containers

## Files Likely Touched

- `apps/admin/package.json` — dep bumps + removal of autoprefixer
- `apps/admin/postcss.config.mjs` — simplify to `@tailwindcss/postcss`
- `apps/admin/tailwind.config.ts` — **delete**
- `apps/admin/app/globals.css` — `@import "tailwindcss"` + `@theme` block
- Any component using class name that was renamed (codemod rewrites these)
- Any call site using tailwind-merge v3-breaking API (fix on break)

## Next Steps

1. `/gsd-research-phase 15` — researcher investigates codemod behavior + tailwind-merge v3 breaking changes + Next.js 15.5 compat notes.
2. `/gsd-plan-phase 15` — break into plans (likely: 15-01 codemod + CSS-first, 15-02 tailwind-merge bump + visual verify).
