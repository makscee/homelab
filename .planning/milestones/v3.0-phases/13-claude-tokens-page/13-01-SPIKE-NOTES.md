# Phase 13 Plan 01 — Spike Notes (P-03 resolution)

**Date:** 2026-04-17
**Outcome:** P-03 resolved. Runtime SOPS subprocess + Zod v4 + shadcn Form + react-hook-form all compile and exercise cleanly. Downstream plans (13-02..13-05) are unblocked.

## SOPS version
- Observed: `sops --version` output: `sops 3.12.1 (latest: 3.12.2)`
- `sops --set` syntax verified: yes
- Syntax used: `sops --set '<jsonPath> <jsonEncodedValue>' <file>`
- Example that worked (on the seed file at `secrets/claude-tokens.sops.yaml` after
  seeding one entry for the test): `sops --set '["tokens"][0]["enabled"] false' secrets/claude-tokens.sops.yaml`
  — round-trip `sops -d --output-type json` confirmed the `enabled` flag flipped from `true` to `false`.
- Gotcha: the `[key][N]` path expression needs the value to be **JSON-encoded**.
  Strings get quotes (`"foo"`), booleans/numbers bare (`true`, `42`). The wrapper
  at `apps/admin/lib/sops.server.ts::setRegistryField` delegates JSON-encoding to
  the caller (the caller already has a validated value).
- Gotcha: sops walks up from `cwd` to find `.sops.yaml`. If one is found but no
  creation_rule matches the path, sops errors `no matching creation rules
  found` even for `-d` / `--set` on an already-encrypted file under some flag
  combinations. The repo `.sops.yaml` now has a dedicated rule for
  `secrets/claude-tokens\.sops\.yaml$` ahead of the catch-all so this is a
  non-issue for the production path.

## Zod version
- Installed: `zod@4.3.6` (admin workspace). A transitive `zod@3.24.1` is
  present via `next-auth`; isolated store keeps the two from interfering.
- Schema patterns used: `z.object`, `z.enum`, `z.string().regex`,
  `z.string().datetime({ offset: true }).or(z.string().datetime())`,
  `z.string().uuid()`, `z.array`.
- Breaking changes hit (from Zod v3 → v4): none in this plan. The admin code
  had no prior Zod usage to migrate.

## @hookform/resolvers adapter
- Installed: `@hookform/resolvers@5.2.2` (plus `react-hook-form@7.72.1`).
- Import path that compiles: `@hookform/resolvers/zod`.
  v5.x of resolvers ships a single entry that auto-detects Zod v3 vs v4 via
  schema shape (sniffs `_zod` for v4, `_def.typeName` for v3). No `/v4` subpath
  needed. Source: `@hookform/resolvers/zod/src/zod.ts` — `isZod4Schema` /
  `isZod3Schema` gates.
- Minimal working snippet (typechecks clean — `bunx tsc --noEmit --skipLibCheck`
  on a throwaway file in `lib/` exited 0):
  ```tsx
  import { z } from "zod";
  import { zodResolver } from "@hookform/resolvers/zod";
  import { useForm } from "react-hook-form";

  const TokenEntrySchema = z.object({
    label: z.string().min(1),
    value: z.string().regex(/^sk-ant-oat01-[A-Za-z0-9_-]+$/),
    tier: z.enum(["pro", "max", "enterprise"]),
    enabled: z.boolean(),
  });

  const form = useForm({ resolver: zodResolver(TokenEntrySchema) });
  ```

## Shadcn form install
- `bunx --bun shadcn@latest add form input label select dialog alert-dialog badge progress tooltip alert table sonner --yes`
  ran clean end-to-end after a first attempt required a second `--overwrite`
  pass to pick up `form.tsx` and `alert-dialog.tsx` (the first run stopped at
  an interactive overwrite prompt for `button.tsx`; in the second pass I
  accepted the overwrite — the shadcn-distributed `button.tsx` is backward-
  compatible with the previous Phase 12 drop and existing call sites still
  type-check).
- Peer dep warnings: none. Bun surfaced no peer-dep mismatches for
  `react@19.2.5` / `react-dom@19.2.5` / `react-hook-form@7.72.1`.
- Files produced in `apps/admin/components/ui/`: `alert-dialog.tsx`,
  `alert.tsx`, `badge.tsx`, `dialog.tsx`, `form.tsx`, `input.tsx`, `label.tsx`,
  `progress.tsx`, `select.tsx`, `sonner.tsx`, `table.tsx`, `tooltip.tsx`.
  (Existing: `avatar.tsx`, `button.tsx`, `card.tsx`, `dropdown-menu.tsx`,
  `skeleton.tsx`.)
- New peers now in `package.json`:
  `@hookform/resolvers@^5.2.2`, `@radix-ui/react-alert-dialog@^1.1.15`,
  `@radix-ui/react-dialog@^1.1.15`, `@radix-ui/react-label@^2.1.8`,
  `@radix-ui/react-progress@^1.1.8`, `@radix-ui/react-select@^2.2.6`,
  `@radix-ui/react-tooltip@^1.2.8`, `next-themes@^0.4.6`,
  `react-hook-form@^7.72.1`, `sonner@^2.0.7`.

## Mutex evidence
- Test `sops.server.test.ts` case "concurrent setRegistryField calls serialize
  through mutex" output:
  ```
   9 pass
   0 fail
   24 expect() calls
   Ran 9 tests across 1 file. [799.00ms]
  ```
  The mutex test (test 5 of the 7 listed in the plan) asserts:
  1. `maxActive === 1` — no two `spawnSync` calls are in flight concurrently
  2. Event order is strictly `start:a → end:a → start:b → end:b → start:c → end:c`
  Both assertions pass.

## Test harness notes
- Bun's test runner loads `node_modules` before plugins in `preload` fire, so
  the simplest reliable fix for the `server-only` sentinel module is
  `mock.module("server-only", () => ({}))` registered in `test-setup.ts`
  (wired via `[test] preload` in `apps/admin/bunfig.toml`). The `react-server`
  resolution condition also works as a CLI flag (`bun --conditions=react-server
  test`) but is not honored via bunfig in 1.3.5; the `mock.module` approach
  is keyed to a stable API.
- `SopsDecryptError`, `SopsWriteError`, and `SopsUnavailableError` all route
  their `.message` and `.toString()` through a `TOKEN_PATTERN` redactor so
  `sk-ant-oat01-…` substrings in stderr are replaced with `[REDACTED_TOKEN]`
  before being composed into the final error message. Tests 6+7 explicitly
  assert this for both error classes.

## Decision for downstream plans
- **Toast library chosen:** `sonner` (shadcn recommends sonner over the legacy
  toast primitive as of the 2025 registry update). `apps/admin/components/ui/sonner.tsx`
  present.
- **Form resolver import path for Plan 13-05:** `@hookform/resolvers/zod`
  (no `/v4` subpath needed on `@hookform/resolvers@5.2.2`).
- **SOPS config bypass for runtime writes outside `secrets/`:** when
  `SOPS_AGE_RECIPIENTS` env is set the module passes `--config /dev/null
  --age <recipients>` — used by tests writing to `/tmp`. Prod writes to
  `secrets/claude-tokens.sops.yaml` under the matching creation_rule so the
  env override stays empty.
- **Jsonpath shape guard:** `setRegistryField` rejects any `jsonPath` that does
  not match `^(\[[^\[\]]+\])+$` — argv-spawn makes shell injection
  impossible, but the guard is belt-and-suspenders against typoed callers.
- **bun audit:** exit 0 with 1 LOW (`cookie` transitive, GHSA-pxg6-pf52-xh8x).
  0 HIGH/CRITICAL — success criterion met.
