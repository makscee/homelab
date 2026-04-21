---
phase: 15-tailwind-v4-migration-3-4-to-4-2-tailwind-merge-3
plan: 01
subsystem: ui
tags: [tailwind, tailwind-v4, postcss, shadcn, css-first, autoprefixer, next-js, admin]

requires:
  - phase: 14-global-overview-audit-log
    provides: shadcn primitives in use (Card, Button, focus rings), admin UI surface to validate against
provides:
  - apps/admin upgraded from Tailwind 3.4 → 4.2 via @tailwindcss/upgrade codemod
  - CSS-first config in app/globals.css (@import "tailwindcss", @theme inline, @custom-variant dark)
  - tailwind.config.ts removed; autoprefixer removed (v4 bundles Lightning CSS)
  - postcss.config.mjs updated to @tailwindcss/postcss plugin
  - v3 default-border compat preserved via global `* { @apply border-border }` rule
  - shadcn HSL-var color mapping continues to resolve (bg-background, text-foreground, border-border)
affects: [17-eslint-10-node-types-24-upgrade, 16-typescript-6-0-upgrade-with-deprecation-fixes, future admin UI phases, phase-18+ VoidNet bot UI if it pulls from admin primitives]

tech-stack:
  added: ["tailwindcss@4.2", "@tailwindcss/postcss@4.2", "tailwind-merge@3"]
  patterns: ["CSS-first Tailwind config (no tailwind.config.ts)", "Lightning CSS replaces autoprefixer", "Preserve v3 default-border via * { @apply border-border } until intentional migration"]

key-files:
  created: []
  modified:
    - apps/admin/package.json
    - apps/admin/postcss.config.mjs
    - apps/admin/app/globals.css
    - apps/admin/bun.lock
  deleted:
    - apps/admin/tailwind.config.ts

key-decisions:
  - "Preserve v3 default-border via global `* { @apply border-border }` — avoids visual regressions on shadcn components that relied on implicit border-border"
  - "Remove autoprefixer entirely — v4 uses Lightning CSS which handles vendor prefixing natively"
  - "Trust @tailwindcss/upgrade codemod for bulk rename, but audit diff for spurious changes to string literals"
  - "Out-of-scope infra bug (/tokens sops PATH) is NOT a Tailwind regression — defer to ROADMAP backlog"

patterns-established:
  - "CSS-first Tailwind config: @theme inline + @custom-variant dark block in app/globals.css is the single source for design tokens"
  - "Codemod audit: after @tailwindcss/upgrade, diff string literals (not just classnames) — codemod can touch string content inside TSX props that happen to match Tailwind tokens"

requirements-completed: [D-1, D-2, D-4, D-5]

duration: ~45min
completed: 2026-04-17
---

# Phase 15 Plan 01: Tailwind v4 Migration Summary

**apps/admin upgraded from Tailwind 3.4 → 4.2 via CSS-first config, autoprefixer removed, shadcn primitives pixel-verified via Playwright against prod v3 baseline.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-04-17
- **Tasks:** 3 (codemod, manual cleanup, human-verify checkpoint)
- **Files modified:** 4 (package.json, postcss.config.mjs, app/globals.css, bun.lock) + 1 deleted (tailwind.config.ts)

## Accomplishments

- apps/admin builds cleanly on Tailwind 4.2 (`bun run build` exits 0)
- postcss.config.mjs switched from `tailwindcss + autoprefixer` to `@tailwindcss/postcss`
- tailwind.config.ts deleted; all config moved to `@theme inline` + `@custom-variant dark` in globals.css
- Global `* { @apply border-border }` preserved → no visual regressions on shadcn Card/Button/Input borders
- autoprefixer removed from package.json (Lightning CSS in v4 handles prefixing)
- Playwright MCP UAT confirmed /login pixel-identical to prod v3 baseline

## Task Commits

1. **Task 1: Apply @tailwindcss/upgrade codemod** — `c15d237` (chore)
2. **Task 2: Manual CSS-first cleanup + autoprefixer removal** — `8b902ad` (feat)
3. **Task 3: Human-verify checkpoint (Playwright MCP)** — verified by parent, no commit

**Plan metadata:** _(this commit)_ docs(15-01): summary

## Files Modified

- `apps/admin/package.json` — tailwindcss → 4.2, add @tailwindcss/postcss, remove autoprefixer, add tailwind-merge@3
- `apps/admin/postcss.config.mjs` — single plugin `@tailwindcss/postcss`
- `apps/admin/app/globals.css` — @import "tailwindcss"; @theme inline block with HSL CSS vars; @custom-variant dark; global `* { @apply border-border }` compat rule
- `apps/admin/tailwind.config.ts` — **deleted** (config migrated to CSS)
- `apps/admin/bun.lock` — lockfile regen

## Decisions Made

- **Preserve v3 default-border compat** — v4 dropped implicit `border-border` on `*`. Re-added global rule so shadcn primitives (Card, Input, Button outline variant, Dialog) keep their borders without touching every component.
- **Drop autoprefixer** — v4 uses Lightning CSS internally. Keeping autoprefixer causes double-prefixing and slower builds.
- **Codemod + manual audit flow** — ran `@tailwindcss/upgrade`, then read the full diff before committing; caught spurious string-literal rename (see deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Codemod spurious rename in AlertsCard string literals**
- **Found during:** Task 2 (manual CSS-first cleanup diff audit)
- **Issue:** `@tailwindcss/upgrade` codemod renamed `"outline"` → `"outline-solid"` inside string-literal content in `apps/admin/components/overview/AlertsCard.tsx` (not a Tailwind class usage — prop text content). This is a false-positive: codemod matched the token `outline` inside a JSX string rather than a className.
- **Fix:** Reverted those specific string-literal changes manually; left genuine `outline` classname renames alone.
- **Files modified:** `apps/admin/components/overview/AlertsCard.tsx` (revert-only)
- **Verification:** Playwright MCP UAT on /alerts — card renders with correct copy ("Coming in Phase 17"), border, shadow.
- **Committed in:** `8b902ad` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 codemod false-positive bug)
**Impact on plan:** No scope creep. Codemod audit caught it pre-commit.

## Issues Encountered

- None during planned work. Out-of-scope infra bug observed at /tokens (see Follow-ups).

## Verification (Playwright MCP UAT by parent agent)

| Route | Result | Notes |
|-------|--------|-------|
| `/` Overview (prod session) | PASS | Host tiles, CPU/Mem/Disk progress bars, load, uptime, sparklines, badges ("Proxmox host", "Media stack"), sidebar nav, topbar avatar + sign-out all render. Zero console errors (6 SWR warnings pre-existing, unrelated). |
| `/audit` | PASS | "Audit log" heading, "No audit entries yet" empty-state, layout clean |
| `/alerts` | PASS | Card with border + shadow + "Coming in Phase 17" copy renders correctly |
| `/login` (local v4 vs prod v3) | PIXEL-IDENTICAL | Card border, rounded corners, shadow, "Continue with GitHub" button — side-by-side match |
| Focus ring (Tab → button on /login) | PASS | Solid blue outline, well-positioned, no displacement (D-4 `outline-hidden` not broken) |

All 7 must-have truths from plan frontmatter verified.

## Follow-ups (Out of Scope)

- **`/tokens` server digest error 1852942543** — journal shows `Error [TypeError]: Executable not found in $PATH: "sops"`. Root cause: systemd unit `ProtectSystem=strict` hides `/usr/local/bin/sops` from `homelab-admin` user's PATH. **NOT a Tailwind v4 regression.** Captured as ROADMAP backlog item (999.x) — separate infra fix (likely Phase 13 follow-up: extend homelab-admin.service unit to include /usr/local/bin in `Environment=PATH=` or unmask sops via `ReadOnlyPaths=`).

## Next Phase Readiness

- apps/admin on Tailwind v4.2 with shadcn primitives verified pixel-equivalent to v3 baseline
- Ready for Phase 16 (TypeScript 6.0 upgrade) and Phase 17 (ESLint 10 / @types/node 24)
- Plan 15-02 (tailwind-merge v3 bump) remains — parent will route

---
*Phase: 15-tailwind-v4-migration-3-4-to-4-2-tailwind-merge-3*
*Completed: 2026-04-17*
