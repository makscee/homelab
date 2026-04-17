---
phase: 15-tailwind-v4-migration-3-4-to-4-2-tailwind-merge-3
verified: 2026-04-17T15:25:00Z
status: passed
score: 5/5 observable truths verified
---

# Phase 15: Tailwind v4 Migration + tailwind-merge v3 — Verification Report

**Phase Goal:** Upgrade `apps/admin` from Tailwind v3.4 → v4.2 and tailwind-merge v2.5 → v3 using CSS-first config. Build passes, site renders pixel-equivalent, no runtime regressions. Upgrade-only scope.

**Verified:** 2026-04-17T15:25:00Z
**Status:** passed
**Verification method:** Playwright MCP against live mcow deploy (commits 8b902ad + a039d43) + local dev server comparison with prod v3 baseline.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `bun run build` passes on Tailwind v4.2 | ✓ VERIFIED | Next.js 15.5.15 compiled all 20 routes, PLAY RECAP ok=29 on deploy. |
| 2 | CSS-first config in place; tailwind.config.ts deleted | ✓ VERIFIED | `@theme` + `@import "tailwindcss"` in app/globals.css; JS config removed. |
| 3 | Site renders pixel-equivalent to pre-upgrade | ✓ VERIFIED | Playwright: /, /audit, /alerts, /login compared — identical. /login local v4 vs prod v3 pixel-identical (card, border, shadow, button). |
| 4 | No runtime regressions | ✓ VERIFIED | 0 console errors on /, /audit, /alerts. Journal clean of CSS/Tailwind errors. Focus ring on button tab = solid blue outline (no `outline-hidden` breakage). |
| 5 | tailwind-merge v3 clean bump | ✓ VERIFIED | package.json `^3.0.0` (resolved 3.5.0). `cn()` helper unchanged. Prod visual diff on / /audit /alerts = zero regressions. |

**Score:** 5/5 truths verified.

### Required Artifacts

| Artifact | Expected | Status |
|----------|----------|--------|
| `apps/admin/package.json` | tailwindcss ^4, tailwind-merge ^3, no autoprefixer | ✓ VERIFIED |
| `apps/admin/postcss.config.mjs` | `@tailwindcss/postcss` only | ✓ VERIFIED |
| `apps/admin/tailwind.config.ts` | deleted | ✓ VERIFIED |
| `apps/admin/app/globals.css` | `@import "tailwindcss"` + `@theme` + preserved `* { @apply border-border }` | ✓ VERIFIED |
| `apps/admin/lib/utils.ts` | unchanged cn() signature | ✓ VERIFIED |
| `bun.lock` | updated | ✓ VERIFIED |

**Artifacts:** 6/6 verified.

## Requirements Coverage

| Decision | Status |
|----------|--------|
| D-1: CSS-first config | ✓ SATISFIED |
| D-2: Drop autoprefixer | ✓ SATISFIED |
| D-3: tailwind-merge v3 fix-on-break | ✓ SATISFIED (nothing broke) |
| D-4: Use official codemod | ✓ SATISFIED |
| D-5: Upgrade-only scope | ✓ SATISFIED (one deviation: codemod false-positive `"outline"` → `"outline-solid"` in AlertsCard string literals, reverted in Task 2 of 15-01) |

**Coverage:** 5/5 locked decisions respected.

## Anti-Patterns Found

None. Codemod spurious literal rename caught + reverted atomically.

## Human Verification Required

None — all goal truths verified via Playwright + build output.

## Gaps Summary

### Non-Critical Gaps (Deferred to Backlog)

1. **/tokens digest error — `sops` binary PATH under systemd**
   - Issue: `ProtectSystem=strict` on homelab-admin.service hides `/usr/local/bin/sops` from the process environment, so /tokens (which invokes sops to decrypt SOPS secrets) throws at runtime.
   - Impact: Pre-existing infra bug, surfaced during Phase 15 verification but **unrelated** to Tailwind or tailwind-merge upgrade.
   - Recommendation: Tracked as ROADMAP backlog entry 999.1. Fix by adding `Environment=PATH=...` or `BindReadOnlyPaths=/usr/local/bin/sops` to the unit. Out of Phase 15 scope.

## Verification Metadata

**Verification approach:** Goal-backward against ROADMAP phase goal + 15-CONTEXT.md locked decisions.
**Must-haves source:** 15-CONTEXT.md + 15-01/02-PLAN.md frontmatters.
**Automated checks:** build + deploy exit 0; journal clean.
**Human checks:** 0 required; Playwright-driven visual spot-checks covered the shadcn hotspots identified in research.
**Total verification time:** ~10 min (codemod run + deploy + Playwright).

---
*Verified: 2026-04-17T15:25:00Z*
*Verifier: Claude Opus 4.7 (parent context, Playwright MCP + ssh)*
