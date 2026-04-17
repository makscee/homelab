# Phase 17: ESLint 10 + @types/node 24 Upgrade — Research

**Researched:** 2026-04-17
**Domain:** Frontend tooling / lint + types upgrade (Next.js 15.5 admin app)
**Confidence:** HIGH

## Summary

ESLint 10 upgrade is **mechanically trivial** for this codebase. The apps/admin lint config is already flat-config (`eslint.config.mjs`) and does **not** import `eslint-config-next` — it uses only `@typescript-eslint/parser` + `eslint-plugin-server-only`. typescript-eslint 8.58.2 already declares `eslint ^10.0.0` in its peer range, so no bump required there. `@types/node` 22→24 is a straight runtime-types catchup; Node on mcow is already 22+.

**Primary recommendation:** Single mechanical plan (Phase-16-shaped): bump `eslint ^9` → `^10.2.0`, `@types/node ^22` → `^24`, run `bun install`, verify lint/typecheck/build, deploy, Playwright smoke. Skip `typescript-eslint` and `eslint-config-next` bumps entirely.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-1:** ESLint 10 flat config only — migrate if legacy `.eslintrc.*`. [VERIFIED: repo already flat-config]
- **D-2:** Bump `typescript-eslint` to min ESLint-10-compat version. [VERIFIED: 8.58.2 already compatible — no bump needed]
- **D-3:** `@types/node` 22 → 24 straight bump.
- **D-4:** `eslint-config-next` matching version. [VERIFIED: not imported in config — irrelevant]
- **D-5:** Upgrade-only scope. No rule changes, no mass `--fix`.

### Claude's Discretion
- Exact pinned versions within locked ranges.
- Whether to target `@types/node@24` vs `@types/node@25` (latest is 25.6.0).

### Deferred Ideas (OUT OF SCOPE)
- Rule-set expansion, new plugins, stricter rules
- Prettier changes
- `next lint` → ESLint CLI migration (Next 16 concern, not this phase)
- Runtime behavior changes

## Baseline State

- `bun run lint` in `apps/admin` **exits clean** (`✔ No ESLint warnings or errors`) [VERIFIED: ran 2026-04-17]
- Existing warning (informational only): `next lint is deprecated and will be removed in Next.js 16` and `The Next.js plugin was not detected in your ESLint configuration` — both pre-existing, out of scope per D-5.
- Flat config lives at `apps/admin/eslint.config.mjs` (18 lines). Single rule: `server-only/server-only: error`. No `eslint-config-next` import.
- `@eslint/eslintrc@^3.3.5` devDep is present but **unused** by `eslint.config.mjs` (no `FlatCompat` invocation). Safe to leave pinned; can be dropped later.

## Standard Stack (version pins)

| Package | Current | Target | Verification |
|---------|---------|--------|--------------|
| `eslint` | `^9` | **`^10.2.0`** | [VERIFIED: `npm view eslint version` → `10.2.0`, latest tag 2026-04] |
| `@types/node` | `^22` | **`^24`** (e.g. `^24.0.0` or latest `^25` — see note) | [VERIFIED: `npm view @types/node version` → `25.6.0`; `^24` is the user-requested target] |
| `typescript-eslint` | `^8.58.2` | **`^8.58.2`** (no change) | [VERIFIED: peer `eslint: "^8.57.0 \|\| ^9.0.0 \|\| ^10.0.0"`] |
| `@typescript-eslint/parser` | `^8.58.2` | **`^8.58.2`** (no change) | Same peer range as monorepo sibling |
| `eslint-config-next` | `15.5.15` | **`15.5.15`** (no change) | [VERIFIED: not imported by `eslint.config.mjs` — peer range irrelevant. Package `15.5.15` declares `eslint ^7 \|\| ^8 \|\| ^9` but unused.] |
| `@eslint/eslintrc` | `^3.3.5` | **`^3.3.5`** (no change) | Unused; leave pinned to avoid churn |
| `eslint-plugin-server-only` | `^0.1.1` | **`^0.1.1`** (no change) | Plugin is ESLint-version-agnostic (pure rule) |

**`@types/node` target choice:** CONTEXT says "22 → 24". `@types/node@24` corresponds to Node 24 LTS. Latest is `25.6.0` (Node 25). Recommendation: **pin `^24` exactly as requested** — avoid scope creep. If bun install resolves `^24` to a current `24.x.x`, accept it.

## Flat-Config Migration Requirement

**NONE.** The repo is already on flat config:

- `apps/admin/eslint.config.mjs` exists and is the active config.
- No `.eslintrc*` files present [VERIFIED: `ls .eslintrc*` → no matches].
- ESLint 10 requires flat config only — this repo is already compliant.

## Breaking Changes (ESLint 9 → 10) Relevant to This Codebase

[CITED: ESLint 10 release notes / migration guide]

| Change | Impact here | Action |
|--------|-------------|--------|
| Legacy eslintrc config removed | None — already flat | None |
| Node.js <18 support dropped | None — mcow on Node 22+ | None |
| Some formatters removed (`checkstyle`, `jslint-xml`, `junit`, `tap`) | None — `next lint` uses default stylish formatter | None |
| `no-unused-vars` default behavior tweaks | Low — we don't override; typescript-eslint handles TS | Watch during verification |
| `context.getScope()` etc. removed from rule APIs | None — we don't author custom rules. `eslint-plugin-server-only` is tiny; if it breaks, pin or patch. | Verify in Wave 0 |
| Built-in `recommended` config shape adjusted | None — we don't extend any shared config | None |

[ASSUMED] Since the only custom rule surface is `eslint-plugin-server-only@0.1.1` (last updated 2024-ish), there's a non-zero chance it uses a removed rule API. Mitigation: the lint already passes cleanly; if ESLint 10 errors on plugin load, pin ESLint to `^10.0.x` latest patch or patch the plugin. **Risk: LOW but verify in install step.**

## Next.js 15.5 Compatibility

- `next@15.5.15` ships its own `next lint` command, which today (clean run) **works without `eslint-config-next` being imported**. The "plugin not detected" warning is informational.
- `eslint-config-next@15.5.15` peer is `eslint ^7 || ^8 || ^9` — **would block ESLint 10 if imported.** Since it's not imported, no blocker.
- `next lint` is deprecated in Next 16. Out of scope here — handle when Next 16 upgrade lands.
- Next.js 15.5 does **not** force a specific ESLint version on the CLI path; it invokes whatever `eslint` is resolved from `node_modules`. [VERIFIED: baseline run succeeded with existing `eslint ^9`]

## `@types/node` 22 → 24 Implications

- Node 24 adds/refines types for: `node:test` mock timers, `Buffer` vs `Uint8Array` narrowing in some streams APIs, new `crypto` primitives, updated `WebSocket`/`fetch` globals.
- apps/admin is a Next.js app — minimal direct `node:*` usage. Most Node types come through Next's own stubs or transitively via `next-auth`, `recharts` (none use cutting-edge node APIs).
- `typescript ^6.0.3` (Phase 16) comfortably supports `@types/node@24`. [ASSUMED — no known incompatibility; TS 6 targets lib.esnext.d.ts which composes fine with Node 24 types]
- Expected: zero TS errors from the bump. If any surface, they'll be narrow-type issues in server-side code (minimal surface: `app/api/**`, `lib/**`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| ESLint config migration | Manual flat-config rewrite | Already done (D-1 is satisfied) |
| Peer-dep compat check | Guessing | `npm view <pkg> peerDependencies` (used here) |
| Lint-rule regressions | Running `--fix` across repo | D-5 forbids — fix only the errors that actually appear |

## Common Pitfalls

### P-1: `eslint-plugin-server-only` uses removed ESLint 10 API
**What goes wrong:** Plugin fails to load with cryptic "context.getScope is not a function" or similar.
**How to avoid:** Run `bun run lint` immediately after `bun install`. If it breaks, options: (a) pin to a newer plugin version if one exists, (b) inline the one rule into `eslint.config.mjs` as a custom rule (it's ~20 LOC), (c) apply a tiny patch via `patch-package`-equivalent.
**Warning signs:** Install succeeds but lint throws plugin error.

### P-2: bun.lock resolves `@types/node@^24` unexpectedly
**What goes wrong:** `^24` could resolve to `24.0.0` if registry cache is stale, missing newer types.
**How to avoid:** After `bun install`, grep `bun.lock` for `@types/node` and confirm a reasonably recent 24.x.

### P-3: `@eslint/eslintrc@^3.3.5` incompat with ESLint 10
**What goes wrong:** If ESLint 10 changed the config-loader interface, leaving the dep could cause resolution warnings.
**How to avoid:** It's unused at runtime (not imported by `eslint.config.mjs`). Safe to leave. If `bun install` surfaces a peer warning, drop it.

## Recommended Plan Shape

**Single mechanical plan** (Phase-16 style). Est: 1-2 tasks.

```
Task 1: Bump package.json + install + verify
  - Edit apps/admin/package.json:
      "eslint": "^9" → "^10.2.0"
      "@types/node": "^22" → "^24"
  - cd apps/admin && bun install
  - bun run lint (exits 0)
  - bun run typecheck (exits 0)
  - bun run build (exits 0)

Task 2: Deploy + smoke
  - ansible-playbook ansible/playbooks/deploy-homelab-admin.yml -l mcow
  - Playwright smoke: /, /audit, /alerts — no console errors
```

No flat-config migration task (already done). No typescript-eslint bump task (already compatible). No eslint-config-next task (not imported).

**Contingency task (only if P-1 triggers):** inline `server-only/server-only` rule, drop `eslint-plugin-server-only` devDep.

## Runtime State Inventory

Not applicable — this is a pure dependency upgrade, no renames or stored state.

## Environment Availability

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| bun | install/build | ✓ | Existing toolchain |
| Node 22+ | runtime | ✓ | mcow |
| ansible | deploy | ✓ | Existing |
| Playwright MCP | UAT | ✓ | Existing (per global memory) |

## Validation Architecture

Following `workflow.nyquist_validation` default (enabled).

| Property | Value |
|----------|-------|
| Framework | Next lint (ESLint) + tsc + next build + Playwright (manual via MCP) |
| Config file | `apps/admin/eslint.config.mjs`, `apps/admin/tsconfig.json` |
| Quick run | `cd apps/admin && bun run lint` |
| Full suite | `cd apps/admin && bun run lint && bun run typecheck && bun run build` |

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Command |
|-----|----------|-----------|---------|
| lint-clean | ESLint 10 passes | automated | `cd apps/admin && bun run lint` |
| types-clean | @types/node 24 typechecks | automated | `cd apps/admin && bun run typecheck` |
| build-clean | Next build succeeds | automated | `cd apps/admin && bun run build` |
| deploy | mcow deploy green | automated | `ansible-playbook ansible/playbooks/deploy-homelab-admin.yml -l mcow` |
| smoke | /, /audit, /alerts render | manual (Playwright MCP) | browser-driven |

### Sampling
- Per task commit: `bun run lint`
- Phase gate: full suite + deploy + Playwright smoke

### Wave 0 Gaps
None — existing scripts cover all verification.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `eslint-plugin-server-only@0.1.1` works on ESLint 10 | Breaking Changes / P-1 | LOW — inline-rule fallback ready (~20 LOC) |
| A2 | `@types/node@^24` typechecks cleanly with `typescript@^6.0.3` | @types/node | LOW — narrow server-side usage, TS 6 composes fine |
| A3 | Next.js 15.5.15's `next lint` CLI invokes resolved-eslint (not vendored) | Next.js compat | LOW — baseline run confirmed behavior on eslint ^9 |

## Open Questions

1. **Should we also drop `@eslint/eslintrc` devDep?**
   - Known: unused by current config.
   - Recommendation: leave pinned this phase (D-5 scope discipline). Drop in a future cleanup.

2. **Target `@types/node@^24` or `^25`?**
   - Known: CONTEXT says "22 → 24". Latest is 25.6.0.
   - Recommendation: honor CONTEXT — pin `^24`.

## Sources

### Primary (HIGH)
- Local `bun run lint` baseline output (2026-04-17)
- `npm view eslint / typescript-eslint / eslint-config-next / @types/node version peerDependencies` (registry query, 2026-04-17)
- Local file inspection: `apps/admin/eslint.config.mjs`, `apps/admin/package.json`

### Secondary (MEDIUM)
- ESLint 10 release notes / migration guide (general knowledge, 2026-01-ish cutoff)
- `next lint` deprecation warning observed in baseline run

## Metadata

- Standard stack: HIGH — registry-verified pins
- Architecture: HIGH — config file inspected directly
- Pitfalls: MEDIUM — P-1 is hypothetical, validated by running install

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (30 days — stable tooling)
