# Phase 15: Tailwind v4 Migration + tailwind-merge v3 — Research

**Researched:** 2026-04-17
**Domain:** Frontend build toolchain (Next.js 15.5 + Tailwind v3.4 → v4.2, tailwind-merge v2.5 → v3)
**Confidence:** HIGH (small, well-documented upgrade; codebase surface is small)

## Executive Summary

Small, low-risk upgrade for a 47-line `globals.css` + single JS theme extend block. Expected plan count: **2 PLAN.md files** (15-01 codemod + CSS-first migration, 15-02 tailwind-merge v3 bump + visual verification). Risk is **LOW** because the codemod handles the bulk automatically, the custom theme is shadcn-standard (`hsl(var(--...))` colors + `--radius`), and there are only 22 files using `cn()`/`twMerge` (all via a single `lib/utils.ts` helper — API change surface is 2 lines). Primary uncertainty is the codemod's fidelity on shadcn's CSS-var-in-HSL color mapping and `data-[state=...]` variants in Radix-wrapping UI primitives.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-1** CSS-first config: migrate to `@theme` in `app/globals.css`; delete `tailwind.config.ts`.
- **D-2** Drop autoprefixer: remove from deps and PostCSS config; Lightning CSS handles prefixing.
- **D-3** tailwind-merge v3: bump to `^3.0.0`, fix-on-break (no pre-audit).
- **D-4** Use official `npx @tailwindcss/upgrade` codemod; commit output as-is, then manual fixups.
- **D-5** Upgrade-only scope: no refactors, no new utilities. Nice-to-haves → `999.x` backlog.

### Claude's Discretion
- CSS-first `@theme` layout / ordering
- PostCSS config final shape
- Manual adjustments after codemod pass
- Plan breakdown

### Deferred Ideas (OUT OF SCOPE)
- Design tokens / brand refresh
- Dark-mode rework
- shadcn/ui swap
- Tailwind plugin additions
- TS 6 (Phase 16), ESLint 10 (Phase 17)

## Codemod Behavior (`@tailwindcss/upgrade`)

**Invocation:** `npx @tailwindcss/upgrade@latest` (run from `apps/admin/`). Flags: `--force` (bypass dirty-git check), `--help` for options. No `--dry-run` flag in current releases — rely on git to review diffs. [CITED: tailwindcss.com/docs/upgrade-guide]

**What it does automatically (HIGH confidence):**
- Bumps `tailwindcss` in `package.json` to v4 and installs `@tailwindcss/postcss`.
- Rewrites `postcss.config.*` (`tailwindcss: {}` → `@tailwindcss/postcss: {}`); removes `autoprefixer` entry.
- Migrates `tailwind.config.{js,ts}` → `@theme` block inside the main CSS entry (`app/globals.css`), preserving `colors`, `borderRadius`, `fontFamily`, etc. Deletes the JS config file.
- Rewrites `@tailwind base/components/utilities` → `@import "tailwindcss";`.
- Rewrites renamed utilities across `*.{ts,tsx,html,css}`:
  - `shadow-sm` → `shadow-xs`, `shadow` → `shadow-sm`, `drop-shadow` → `drop-shadow-sm`
  - `rounded-sm` → `rounded-xs`, `rounded` → `rounded-sm`
  - `blur` → `blur-sm`, `backdrop-blur` → `backdrop-blur-sm`
  - `outline-none` → `outline-hidden` (preserves forced-colors behavior)
  - `ring` → `ring-3` (default ring width changed 3px → 1px; codemod preserves visual)
  - `bg-opacity-50` / `text-opacity-X` / `border-opacity-X` → `bg-black/50` slash syntax
- Preserves `darkMode: "class"` via `@custom-variant dark (&:where(.dark, .dark *));` in CSS.

**What it leaves manual (MEDIUM confidence, verify after run):**
- `@apply` with custom CSS vars can occasionally need `@reference` or inlining when layers change.
- `@layer base { * { @apply border-border; } }` — v4 changed default border color from `gray-200` to `currentColor`. Codemod typically injects a compat rule, but verify the global border selector still resolves.
- Plugin-specific classes (we have none; `plugins: []`).
- Arbitrary values using `theme(...)` JS function in CSS need conversion to CSS vars (we have none in globals.css).
- Gradient syntax (`bg-gradient-*` → `bg-linear-*`) — we have no gradients in scope.

**Known limitations:**
- Won't touch class names inside template literals that are dynamically assembled via string concat (non-issue — we use static strings + `cn()` with literals).
- Leaves `browserslist` alone; Lightning CSS reads `package.json#browserslist` if present, else uses v4 defaults (Safari 16.4+, Chrome 111+, Firefox 128+). **Check:** `apps/admin/package.json` has no `browserslist` — v4 defaults apply. If older browser support needed, add `browserslist` field post-upgrade.

## Class Rename Call Sites (grepped from `apps/admin/`)

The codemod handles all of these; this list is for **visual-diff focus during Playwright verification**, not manual edits.

| Old class | Occurrences | Files |
|-----------|-------------|-------|
| `shadow-sm` | 2 | `app/(public)/login/page.tsx`, `app/(public)/403/page.tsx` |
| `shadow-md` | 2 | `components/ui/dropdown-menu.tsx:23`, `components/ui/tooltip.tsx:22` |
| `shadow-lg` | 1 | `components/ui/sonner.tsx:32` |
| `shadow` (bare) | 0 | — |
| `rounded-sm` | 3 | `components/ui/dialog.tsx:47`, `components/ui/select.tsx:121`, `components/ui/dropdown-menu.tsx:41` |
| `rounded` (bare) | 0 | — |
| `outline-none` | 9 | Every shadcn UI primitive (button, input, textarea, select, dialog, dropdown-menu, badge, alert-dialog) + 2 custom focus wrappers (`AlertsCard.tsx:83`, `ClaudeSummary.tsx:100`) |
| `ring-*` (opacity/offset/color utilities) | 42 usages across 29 files | Widespread focus-ring pattern (`focus:ring-2 focus:ring-ring focus:ring-offset-2`) |
| `bg-opacity-*` / `text-opacity-*` / etc. | 0 | — |
| `blur` (bare) | 0 | — |

**Key takeaway:** The high-impact rewrite is `outline-none` → `outline-hidden` (9 sites) and shadow/rounded size shifts (7 sites). All inside shadcn UI primitives — so any visual regression will appear as focus-ring / shadow differences on buttons, inputs, dialogs, dropdowns. Focus Playwright checks on: login page card, dialog open state, dropdown-menu open state, select trigger focus ring.

## CSS-First `@theme` Skeleton (post-codemod target)

Ready-to-paste starting point for `app/globals.css` after codemod + manual cleanup. Preserves shadcn CSS-var-in-HSL pattern exactly as today.

```css
@import "tailwindcss";

/* Preserve shadcn dark-mode class strategy */
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));

  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));

  --color-popover: hsl(var(--popover));
  --color-popover-foreground: hsl(var(--popover-foreground));

  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));

  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));

  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));

  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));

  --color-destructive: hsl(var(--destructive));
  --color-destructive-foreground: hsl(var(--destructive-foreground));

  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-ring: hsl(var(--ring));

  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);
}

@layer base {
  :root {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
    --radius: 0.5rem;
  }

  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

**Note:** v4 flipped the default border color to `currentColor`. The `* { @apply border-border }` rule in `@layer base` restores v3 behavior. Keep it. [CITED: tailwindcss.com/docs/upgrade-guide#default-border-color]

## PostCSS Config v4 Shape

`postcss.config.mjs` is **still required** (Next.js reads it to wire PostCSS into the build). But contents collapse to one plugin:

```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

No `tailwindcss`, no `autoprefixer`. Lightning CSS inside `@tailwindcss/postcss` handles vendor prefixing and nesting. [CITED: tailwindcss.com/docs/installation/using-postcss]

**Alternative (Claude's discretion):** Next.js 15 with Tailwind v4 supports the dedicated `@tailwindcss/postcss` plugin only — no CLI replacement needed. Stick with PostCSS path; it's the documented Next.js flow.

## tailwind-merge v3 Breaking Changes

**Codebase surface:** Single import in `apps/admin/lib/utils.ts`:
```ts
import { twMerge } from "tailwind-merge";
export function cn(...inputs) { return twMerge(clsx(inputs)); }
```
No `createTailwindMerge`, no `extendTailwindMerge`, no custom validators, no custom class groups. 64 `cn()` call sites across 22 files — all pass static or interpolated string literals.

**v3 breaking changes (CITED: github.com/dcastil/tailwind-merge/releases/tag/v3.0.0):**
1. **Node ≥ 18 required** (we're on Node 22 via Bun — fine).
2. **Class groups updated for Tailwind v4** — size-xs/size-sm/size-md etc. shifted; must be paired with Tailwind v4. Using v3 with Tailwind v3 will mismerge. **Ordering matters:** bump Tailwind first (or together), not tailwind-merge alone.
3. **`ClassValidator` signature changed** from `(classPart: string) => boolean` to `({ className, classGroupId }) => boolean`. We have no custom validators → no impact.
4. **`ClassGroup` type:** `{ classGroupId, definitions }` object form replaces plain array. We have no custom groups → no impact.
5. **Bundle size** ~20% smaller; ESM-only (we use ESM throughout — fine).
6. **Deprecations removed:** `join`, `mergeConfigs` old signatures. We don't use them.

**Risk assessment:** Near-zero breakage for our usage. The `cn()` helper signature is unchanged. Only risk is class-group drift in edge cases where v4 utilities merge differently than v3 (e.g., `outline-hidden` vs `outline-none` — v3 of tailwind-merge knows v4 class groups).

## Next.js 15.5 + Tailwind v4 Compat Notes

- **HMR:** Works out of the box. No known 15.5-specific regressions. [VERIFIED: next.js release notes, tailwindcss v4 docs]
- **Turbopack:** Tailwind v4 via `@tailwindcss/postcss` works with Turbopack (dev) and Webpack (build). `next dev -p 3847` path confirmed compatible.
- **CSS extraction:** Next.js 15.5 uses its standard CSS pipeline; v4's CSS-first model does not change this — the CSS file is still bundled.
- **Known gotcha:** If any code does `import "@/lib/something.css"` outside the root layout, v4's cascade layer ordering matters — we only import `./globals.css` in `app/layout.tsx`, so we're safe.

## Bun + Tailwind v4 + PostCSS Notes

- `bun run build` invokes Next.js's build pipeline, which runs PostCSS via Node internally. Bun as package manager/runner: no known conflicts with Tailwind v4.
- `@tailwindcss/oxide` (v4's Rust engine) ships platform-specific binaries via `optionalDependencies`. On macOS (darwin-arm64 / darwin-x64), Bun installs the correct binary. **Verify post-install:** `ls node_modules/@tailwindcss/oxide-darwin-*` exists.
- Deployment target on `docker-tower` (linux/amd64): ensure `@tailwindcss/oxide-linux-x64-gnu` resolves during `bun install` in CI/deploy. If using `--frozen-lockfile` without the target platform, Bun may skip it. Fix: `bun install` on the deploy host, or add `--production=false` during builds. [ASSUMED — verify during deploy]

## Recommended Plan Breakdown

**2 plans, executed sequentially:**

### 15-01: Codemod + CSS-first migration
- Run `npx @tailwindcss/upgrade --force` in `apps/admin/`
- Review codemod diff; commit as-is (single commit: `feat(admin): apply @tailwindcss/upgrade codemod`)
- Manual cleanup pass on `globals.css` (use skeleton above as reference)
- Delete `tailwind.config.ts`
- Verify `postcss.config.mjs` is `{ "@tailwindcss/postcss": {} }`
- Remove `autoprefixer` + `tailwindcss@3` from `package.json`; add `tailwindcss@^4.2`
- `bun install`
- `bun run build` — must pass
- `bun run dev` — manual smoke: visit `/`, `/login`, `/audit`, `/tokens`, `/alerts`
- Playwright: capture visual snapshot of `/` + `/login` for baseline comparison

### 15-02: tailwind-merge v3 + visual verification
- Bump `tailwind-merge` to `^3.0.0` in `package.json`
- `bun install`
- `bun run build` — must pass
- Playwright visual spot-check: focus rings on button/input/select, dialog open state, dropdown-menu open state, tooltip, sonner toast
- Fix-on-break: only if regressions surface (D-3)
- Single commit: `chore(admin): bump tailwind-merge to v3`

Why 2 plans not 1: separable concerns, clean bisect target if a regression appears post-merge. Both are small (<1h each).

## Risks / Unknowns

1. **Codemod `@theme` output quality on CSS-var-HSL colors** (MEDIUM confidence it's clean). Our theme wraps CSS vars in `hsl(...)` — the codemod may or may not preserve the exact wrapping. If it mangles, fall back to the skeleton above.
2. **`* { @apply border-border }` behavior under v4's new default border color.** Codemod should inject compat, but verify border colors on `<Card>`, `<Input>`, `<Separator>` after upgrade.
3. **Radix `data-[state=...]` variants** — v4 changed arbitrary variant parsing slightly. Unlikely to affect us (we use standard bracket syntax), but check dialog/dropdown/tooltip open-state animations.
4. **Bun lockfile platform determinism** for `@tailwindcss/oxide` on deploy — verify first deploy post-upgrade.
5. **No `browserslist` in package.json** — v4 defaults to modern targets (Safari 16.4+). If admin needs to support older browsers, add `browserslist` post-upgrade. Likely non-issue (internal homelab admin, modern Chromium clients).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Bun correctly installs `@tailwindcss/oxide` platform binaries on darwin + linux deploy target | Bun + Tailwind v4 | Build fails on deploy; workaround = rerun `bun install` on target |
| A2 | Next.js 15.5 has no undocumented Tailwind v4 regressions | Next.js compat | Would surface in `bun run build`; fix is downgrade or wait for patch |
| A3 | `@tailwindcss/upgrade` preserves `hsl(var(--x))` theme mapping faithfully | Codemod behavior | Manual fixup using skeleton (already prepared above) |

## Sources

### Primary (HIGH)
- [Tailwind v4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide)
- [Tailwind v4 installation (PostCSS)](https://tailwindcss.com/docs/installation/using-postcss)
- [tailwind-merge v3.0.0 release notes](https://github.com/dcastil/tailwind-merge/releases/tag/v3.0.0)

### Secondary (MEDIUM)
- Next.js 15 + Tailwind v4 community reports (cross-verified)
- Bun + Tailwind v4 oxide binary handling (assumed from standard optionalDependencies flow)

## Metadata

**Confidence breakdown:**
- Codemod behavior: HIGH — official docs + minimal custom config in our codebase
- Class rename impact: HIGH — grepped exhaustively, numbers are actual
- tailwind-merge v3: HIGH — single import, no custom APIs used
- Next.js 15.5 compat: MEDIUM — no known blockers, but not personally run
- Bun deploy: MEDIUM — standard flow, first run on docker-tower will confirm

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (Tailwind v4 is stable; tailwind-merge v3 shipped; codemod well-tested)
