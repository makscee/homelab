# Phase 16: TypeScript 6.0 Upgrade + Deprecation Fixes — Research

**Researched:** 2026-04-17
**Domain:** TypeScript compiler version bump (5.6 → 6.0) for Next.js 15 / React 19 app
**Confidence:** HIGH
**Risk level:** LOW

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-1 Fix-all-that-surface on deprecations.** Run `bun run typecheck` post-upgrade; fix every TS 6 error or new deprecation warning. Cap at "make typecheck green", no refactor of untouched code.
- **D-2 typescript-eslint sibling bump** to minimum version compatible with TS 6 (research pins).
- **D-3 tsconfig minimal delta** — only change where TS 6 requires.
- **D-4 @types/node** — keep `^22` unless TS 6 needs higher.
- **D-5 Upgrade-only scope** — no refactors, no "while we're here" cleanups.

### Claude's Discretion
- Exact patches for deprecations (mechanical replacements).
- Pin choice for `typescript-eslint` if a bump is needed.

### Deferred Ideas (OUT OF SCOPE)
- ESLint 10 upgrade (Phase 17).
- Strict-mode opt-ins.
- API surface changes in shared `lib/*`.
- Runtime behavior changes.
</user_constraints>

## Summary

TS 6.0.3 is current stable on npm (released recently, with 6.0.2 and 6.0.1-rc preceding). Baseline typecheck on current TS 5.6 against `apps/admin` is **clean (0 errors)**. TS 6's headline deprecations (`outFile`, `module=None/AMD`, `moduleResolution=classic`, ES5 target, `downlevelIteration`) are all **options the app does not use** — the tsconfig already targets ES2017, `module=esnext`, `moduleResolution=Bundler`. Expected deprecation surface: **near zero**.

`typescript-eslint@8.58.2` (already pinned) declares peer `typescript: ">=4.8.4 <6.1.0"` — it **already supports TS 6.0.x**. No v10 line exists; D-2 becomes a no-op. `@types/node@22` has no TS-6-forced bump requirement (D-4 stays put).

**Primary recommendation:** Single PLAN — bump `typescript ^5.6.0 → ^6.0.3`, run typecheck, run build, deploy, Playwright smoke. No other dep touches expected.

## TS 6.0 Breaking Changes Relevant to This Codebase

Sourced from Context7 `/microsoft/typescript` docs + npm registry.

| Change | Relevance to apps/admin | Action |
|--------|------------------------|--------|
| `outFile` deprecated (TS5107) | Not used | None |
| `module=None` / `module=AMD` deprecated | Uses `esnext` | None |
| `moduleResolution=classic` deprecated | Uses `Bundler` | None |
| `target=ES5` deprecated | Uses `ES2017` | None |
| `downlevelIteration` deprecated | Not set | None |
| Stricter `any`/implicit checks | Possible minor surface | Fix per D-1 if surfaced |
| Lib `.d.ts` shape updates (DOM/ES) | Possible minor surface | Fix per D-1 if surfaced |

**Escape hatch available:** `"ignoreDeprecations": "6.0"` in tsconfig silences TS5101/TS5107 warnings if any unexpected deprecation surfaces. [CITED: github.com/microsoft/typescript baselines]

## Baseline Typecheck (current TS 5.6)

```
cd apps/admin && bun x tsc --noEmit
→ 0 errors
```

**Grep audit:**
- `@ts-ignore` in `.ts`/`.tsx`: **0 in source** (matches only in `.next/types/validator.ts` — generated, ignored by build)
- `@ts-expect-error`: 0
- `: Function` type: **0 in source** (matches only in `.next/types/app/**` — generated)
- `: any` / `: any[]` / `<any>`: 91 occurrences across source — all permitted under non-strict-new settings; no TS 6 plan to break these

**Conclusion:** No latent debt. Upgrade should be mechanical.

## Compat Matrix

| Component | Current | TS 6 compat | Action |
|-----------|---------|-------------|--------|
| `typescript` | `^5.6.0` | — | Bump to `^6.0.3` [VERIFIED: npm view typescript version → 6.0.3] |
| `typescript-eslint` | `^8.58.2` | Peer: `typescript: >=4.8.4 <6.1.0` [VERIFIED: npm view typescript-eslint@latest peerDependencies] | **No bump needed** |
| `@typescript-eslint/parser` | `^8.58.2` | Same peer range as umbrella | No bump |
| `@types/node` | `^22` | No TS-6-forced bump | Keep `^22` (Phase 17 bumps to 24) |
| `next` | `15.5.15` | Next 15 supports TS 5.x + 6.x [ASSUMED — no blocker docs found; Next.js typically tolerates major TS bumps since TS is a peer of the app, not Next itself] | Monitor build |
| `eslint-config-next` | `15.5.15` | Same as Next | No bump |
| `@types/react` / `@types/react-dom` | `^19` | TS 6 compatible [ASSUMED] | No bump |
| `@types/bun` | `^1.3.12` | TS 6 compatible [ASSUMED] | No bump |

## Recommended Plan Breakdown

**Single PLAN: `16-01-PLAN.md` — TypeScript 6.0 bump + verify**

Tasks:
1. Edit `apps/admin/package.json` — set `typescript` to `^6.0.3`.
2. `cd apps/admin && bun install` — refresh lockfile.
3. `cd apps/admin && bun x tsc --noEmit` — must exit 0. If errors surface, apply D-1 mechanical fixes (touch only broken lines).
4. `cd apps/admin && bun run build` — must exit 0.
5. `cd apps/admin && bun run lint` — confirm typescript-eslint still operates (sanity).
6. Deploy via `ansible/playbooks/deploy-homelab-admin.yml`.
7. Playwright smoke: `/`, `/audit`, `/alerts`, `/login` render; no console errors.

**No tsconfig changes expected.** Only add `"ignoreDeprecations": "6.0"` if a legitimate deprecation warning surfaces on an option we cannot trivially replace — document and escalate rather than silence reflexively.

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Lib `.d.ts` reshape (DOM/ES) produces new errors in Radix/Recharts/SWR call sites | LOW-MEDIUM | Fix per D-1; cast narrowly, no refactor |
| `next build` regresses due to Next's bundled TS expectations | LOW | Next treats TS as a peer; if `next` warns, re-check release notes |
| Bun's bundled TS lags behind — affects `bun test` type-only paths | LOW | `typecheck` uses `bun x tsc` which resolves from `node_modules` — respects our bump |
| typescript-eslint 8.58.2 has undocumented TS 6 edge cases | LOW | Peer range explicitly covers `<6.1.0`; canary `8.58.3-alpha.4` available as fallback |
| New `strict` defaults break 91 `any` sites | VERY LOW | TS 6 does not flip strict defaults; `any` remains permitted |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Next.js 15.5 tolerates TS 6 without plugin update | Compat Matrix | `next build` fails; mitigation = check Next 15.5.x patch releases, fall back to TS 5.9 if truly blocked |
| A2 | `@types/react@19` / `@types/react-dom@19` compatible with TS 6 | Compat Matrix | Typecheck errors in component signatures; fix per D-1 |
| A3 | `@types/bun@1.3.12` compatible with TS 6 | Compat Matrix | Minor; `@types/bun` is dev-only, can bump if needed |

## Sources

### Primary (HIGH confidence)
- Context7 `/microsoft/typescript` — TS 6 deprecation codes (TS5101, TS5107) and `ignoreDeprecations: "6.0"` escape hatch
- `npm view typescript version` → `6.0.3`
- `npm view typescript-eslint@latest peerDependencies` → `typescript: ">=4.8.4 <6.1.0"`
- `npm view @types/node version` → `25.6.0` (but `^22` stays per D-4)

### Secondary (MEDIUM)
- Local baseline `bun x tsc --noEmit` → 0 errors on TS 5.6
- Grep audit of `apps/admin` source

## Metadata

**Confidence breakdown:**
- TS 6 deprecation surface: HIGH — verified via Context7 docs, tsconfig does not use any deprecated option
- typescript-eslint compat: HIGH — verified peer range explicitly allows TS 6.0.x
- Next.js 15.5 + TS 6: MEDIUM — ASSUMED (A1); Next does not bundle TS, so low practical risk
- Baseline clean: HIGH — direct measurement

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (30 days; TS ecosystem stable on 6.0.x)
