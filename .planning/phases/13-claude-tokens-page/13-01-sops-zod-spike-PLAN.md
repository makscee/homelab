---
phase: 13
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/admin/lib/sops.server.ts
  - apps/admin/lib/sops.server.test.ts
  - apps/admin/package.json
  - secrets/claude-tokens.sops.yaml
  - .planning/phases/13-claude-tokens-page/13-01-SPIKE-NOTES.md
autonomous: true
requirements:
  - TOKEN-01
user_setup: []
tags:
  - sops
  - zod
  - runtime-secrets
  - spike

must_haves:
  truths:
    - "Admin app can decrypt secrets/claude-tokens.sops.yaml at runtime via spawnSync"
    - "Admin app can edit a single field in the registry via sops --set and re-verify on re-decrypt"
    - "Zod v4 schema for TokenEntry parses a real decrypted registry without throwing"
    - "shadcn Form + react-hook-form + Zod v4 compiles without peer-dep errors"
    - "Concurrent writes serialize through an in-process async mutex (verified by test)"
  artifacts:
    - path: "apps/admin/lib/sops.server.ts"
      provides: "spawnSync('sops', ...) wrapper: decrypt, setField, replaceDoc; async mutex; error mapping"
      exports: ["decryptRegistry", "setRegistryField", "replaceRegistry", "sopsAvailable"]
    - path: "apps/admin/lib/sops.server.test.ts"
      provides: "Bun test: mutex serialization, decrypt round-trip, error when sops binary missing"
    - path: "secrets/claude-tokens.sops.yaml"
      provides: "Seed registry with 1 placeholder entry encrypted with existing mcow age key"
      contains: "sops:"
    - path: ".planning/phases/13-claude-tokens-page/13-01-SPIKE-NOTES.md"
      provides: "Findings: sops --set syntax verified on v3.9, Zod v4 + shadcn form compat result"
  key_links:
    - from: "apps/admin/lib/sops.server.ts"
      to: "sops binary at /usr/local/bin/sops or PATH"
      via: "node:child_process spawnSync"
      pattern: "spawnSync\\(.sops."
    - from: "secrets/claude-tokens.sops.yaml"
      to: ".sops.yaml age recipients"
      via: "sops creation rule matching path"
      pattern: "path_regex:.*claude-tokens"
---

<objective>
Resolve PITFALLS P-03: validate that runtime SOPS subprocess + Zod v4 + shadcn Form work together before the rest of Phase 13 builds on them. Produce the production `lib/sops.server.ts` wrapper (decrypt, set-field, replace-doc, mutex, error mapping), seed `secrets/claude-tokens.sops.yaml`, and document the spike findings.

Purpose: Every token mutation and read in plans 13-03/04/05 depends on this module. Proving it here — with tests and real `sops` calls — prevents cascading rework.
Output: `sops.server.ts` + test + seeded registry + spike notes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/research/PITFALLS.md
@.planning/research/STACK.md
@.planning/phases/13-claude-tokens-page/13-CONTEXT.md
@.planning/phases/12-infra-foundation/12-CONTEXT.md
@apps/admin/package.json
@apps/admin/lib/auth-allowlist.server.ts
@.sops.yaml

<interfaces>
<!-- Conventions from Phase 12 server-only modules (auth-allowlist.server.ts). -->
<!-- Filename suffix `.server.ts` is enforced by eslint-plugin-server-only. -->
<!-- All secret-touching code MUST live in `lib/*.server.ts`. -->

From Phase 12 pattern:
- Module file: `apps/admin/lib/{name}.server.ts`
- First line: `import 'server-only';`
- No top-level side effects (read env inside function bodies)
- Use `node:child_process` `spawnSync` (not `spawn`) for deterministic behaviour in RSC

Required exports for this plan:
```typescript
export type TokenEntry = {
  id: string;          // uuid v4
  label: string;
  value: string;       // sk-ant-oat01-*
  tier: 'pro' | 'max' | 'enterprise';
  owner_host: string;
  enabled: boolean;
  added_at: string;    // ISO 8601
  rotated_at?: string;
  deleted_at?: string;
  notes?: string;
};
export type TokenRegistry = { tokens: TokenEntry[] };
export function sopsAvailable(): boolean;
export function decryptRegistry(path?: string): Promise<TokenRegistry>;
export function setRegistryField(
  path: string,
  jsonPath: string,   // e.g. '["tokens"][0]["enabled"]'
  value: string
): Promise<void>;
export function replaceRegistry(path: string, next: TokenRegistry): Promise<void>;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement lib/sops.server.ts wrapper with async mutex</name>
  <files>apps/admin/lib/sops.server.ts, apps/admin/lib/sops.server.test.ts</files>
  <read_first>
    - apps/admin/lib/auth-allowlist.server.ts (server-only module convention)
    - apps/admin/package.json (confirm Zod version and test runner)
    - .planning/phases/12-infra-foundation/12-CONTEXT.md (env loading + systemd binary PATH)
    - .planning/research/PITFALLS.md §P-03 (SOPS write spike requirements)
  </read_first>
  <behavior>
    - Test 1: sopsAvailable() returns true when sops binary on PATH, false otherwise (mock via PATH env override)
    - Test 2: decryptRegistry() parses a fixture SOPS file and returns TokenRegistry with typed entries
    - Test 3: decryptRegistry() throws SopsDecryptError when given a non-existent path
    - Test 4: decryptRegistry() throws SopsDecryptError when spawnSync exits non-zero
    - Test 5: setRegistryField() serializes concurrent calls (mutex) — two parallel invocations observed in order via spy on spawnSync
    - Test 6: replaceRegistry() writes plaintext to temp file, runs `sops -e -i` on it, atomically renames to target path
    - Test 7: Error messages NEVER include the decrypted registry content (grep-assertable: no 'sk-ant-oat01-' substring in thrown error message even when throw path is the success case)
  </behavior>
  <action>
    Create `apps/admin/lib/sops.server.ts` with:

    1. First line: `import 'server-only';`
    2. Named export `type TokenEntry` and `type TokenRegistry` with the exact shape from D-13-13:
       - `id: string` (uuid v4), `label: string`, `value: string`, `tier: 'pro' | 'max' | 'enterprise'`, `owner_host: string`, `enabled: boolean`, `added_at: string` (ISO), `rotated_at?: string`, `deleted_at?: string`, `notes?: string`
    3. Zod v4 schema `TokenEntrySchema` and `TokenRegistrySchema` matching those types (use `z.object`, `z.enum(['pro','max','enterprise'])`, `z.string().uuid()`, `z.string().regex(/^sk-ant-oat01-[A-Za-z0-9_-]+$/)` for value, `z.string().datetime()` for timestamps).
    4. Module-level `let mutex: Promise&lt;void&gt; = Promise.resolve();` and helper `withMutex&lt;T&gt;(fn: () =&gt; Promise&lt;T&gt;): Promise&lt;T&gt;` that chains work so concurrent callers serialize.
    5. Constants:
       - `const DEFAULT_REGISTRY_PATH = process.env.CLAUDE_TOKENS_SOPS_PATH ?? 'secrets/claude-tokens.sops.yaml';`
       - `const SOPS_BIN = process.env.SOPS_BIN ?? 'sops';`
    6. `sopsAvailable(): boolean` — calls `spawnSync(SOPS_BIN, ['--version'])` with `stdio: 'pipe'`, returns `status === 0`.
    7. `decryptRegistry(path = DEFAULT_REGISTRY_PATH): Promise&lt;TokenRegistry&gt;`:
       - `spawnSync(SOPS_BIN, ['-d', '--output-type', 'json', path])` (NOT yaml — use json output for deterministic parsing)
       - If `status !== 0` throw `new SopsDecryptError(path, stderr.toString())` (error message MUST be sanitized: only includes path and sanitized stderr — stderr is scanned for `sk-ant-oat01-` and any match is redacted to `[REDACTED_TOKEN]`)
       - `JSON.parse(stdout)` then `TokenRegistrySchema.parse()` and return
    8. `setRegistryField(path, jsonPath, value): Promise&lt;void&gt;` — runs inside `withMutex`:
       - `spawnSync(SOPS_BIN, ['--set', `${jsonPath} "${value}"`, path])`
       - If exit != 0 throw `SopsWriteError`
    9. `replaceRegistry(path, next): Promise&lt;void&gt;` — runs inside `withMutex`:
       - Validate via `TokenRegistrySchema.parse(next)` first
       - Write plaintext JSON to `${path}.tmp` with `fs.writeFileSync(..., { mode: 0o600 })`
       - `spawnSync(SOPS_BIN, ['-e', '-i', '--input-type', 'json', '--output-type', 'yaml', `${path}.tmp`])`
       - `fs.renameSync(`${path}.tmp`, path)` (atomic rename on same filesystem)
       - On any failure: `fs.rmSync(`${path}.tmp`, { force: true })` and rethrow
    10. Custom error classes `SopsDecryptError extends Error`, `SopsWriteError extends Error`, `SopsUnavailableError extends Error` — each has `name` set to the class name and `toString()` that never includes registry content.

    Create `apps/admin/lib/sops.server.test.ts` (Bun test) implementing the 7 behaviors above. Use `bun:test`'s `mock.module` or a test fixture in `apps/admin/lib/__fixtures__/claude-tokens.test.sops.yaml` (pre-encrypted with a test age key committed under `tests/fixtures/age.key` — NEVER the mcow production key).

    If the test-fixture age key is non-trivial to generate, stub `spawnSync` via dependency injection: export `_setSpawnSyncForTest(fn)` from the module (named with leading underscore) used only by tests.
  </action>
  <verify>
    <automated>cd apps/admin &amp;&amp; bun test lib/sops.server.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `apps/admin/lib/sops.server.ts` exists and its first line is `import 'server-only';`
    - grep `^export type TokenEntry` in sops.server.ts returns 1 line
    - grep `^export type TokenRegistry` in sops.server.ts returns 1 line
    - grep `export function sopsAvailable` in sops.server.ts returns 1 line
    - grep `export function decryptRegistry` in sops.server.ts returns 1 line
    - grep `export function setRegistryField` in sops.server.ts returns 1 line
    - grep `export function replaceRegistry` in sops.server.ts returns 1 line
    - grep `withMutex` in sops.server.ts returns at least 2 lines (helper + each mutation call site)
    - grep `sk-ant-oat01-` in sops.server.ts returns at most 1 line (only the Zod regex; NOT in any string concatenation, log, or throw)
    - `cd apps/admin && bun test lib/sops.server.test.ts` exits 0
    - Test output shows all 7 behaviors pass
  </acceptance_criteria>
  <done>Module compiles, all 7 tests green, no `sk-ant-oat01-` string interpolation in error paths.</done>
</task>

<task type="auto">
  <name>Task 2: Seed secrets/claude-tokens.sops.yaml and .sops.yaml rule</name>
  <files>secrets/claude-tokens.sops.yaml, .sops.yaml</files>
  <read_first>
    - .sops.yaml (existing creation rules for secrets/mcow.sops.yaml)
    - secrets/mcow.sops.yaml (encrypted header format reference)
    - .planning/phases/13-claude-tokens-page/13-CONTEXT.md §D-13-13 (schema)
    - .planning/phases/13-claude-tokens-page/13-CONTEXT.md §D-13-06 (file split rationale)
  </read_first>
  <action>
    1. Add a new creation rule to `.sops.yaml` BELOW the existing `secrets/mcow.sops.yaml` rule:
       ```yaml
       - path_regex: secrets/claude-tokens\.sops\.yaml$
         encrypted_regex: '^(tokens|value)$'
         key_groups:
           - age:
               - &lt;SAME age recipient(s) as mcow rule&gt;
       ```
       Copy the age recipient list verbatim from the existing mcow rule — do NOT guess the key. If the existing rule uses `age: [...]` inline, mirror that form.

    2. Create the seed registry file. First produce plaintext `/tmp/claude-tokens-seed.yaml`:
       ```yaml
       tokens: []
       ```
       Then encrypt:
       ```bash
       sops -e --input-type yaml --output-type yaml /tmp/claude-tokens-seed.yaml &gt; secrets/claude-tokens.sops.yaml
       rm /tmp/claude-tokens-seed.yaml
       ```
       Verify the result is a valid SOPS document with a `sops:` metadata block at the end.

    3. Verify decrypt round-trip:
       ```bash
       sops -d --output-type json secrets/claude-tokens.sops.yaml
       ```
       must print `{"tokens":[]}` (or equivalent JSON).

    Note: The empty `tokens: []` is intentional — Phase 13 Plan 05 is the first flow that adds real tokens via the UI. Do NOT add any `sk-ant-oat01-*` value to this file manually.
  </action>
  <verify>
    <automated>sops -d --output-type json secrets/claude-tokens.sops.yaml | grep -q '"tokens":\[\]' && grep -q 'path_regex: secrets/claude-tokens' .sops.yaml</automated>
  </verify>
  <acceptance_criteria>
    - File `secrets/claude-tokens.sops.yaml` exists
    - grep `^sops:` in `secrets/claude-tokens.sops.yaml` returns at least 1 line (SOPS metadata present)
    - grep `sk-ant-oat01-` in `secrets/claude-tokens.sops.yaml` returns 0 lines (no accidental plaintext token)
    - `sops -d --output-type json secrets/claude-tokens.sops.yaml` exits 0 and stdout parses to `{ "tokens": [] }`
    - grep `path_regex: secrets/claude-tokens` in `.sops.yaml` returns 1 line
    - The age recipient list in the new rule matches the mcow rule exactly (verifiable via `yq` or diff of rule blocks)
  </acceptance_criteria>
  <done>Seed registry decrypts to `{tokens: []}`, `.sops.yaml` covers the new file with the same recipients as mcow.</done>
</task>

<task type="auto">
  <name>Task 3: Document Zod v4 + shadcn Form compat check in SPIKE-NOTES.md</name>
  <files>.planning/phases/13-claude-tokens-page/13-01-SPIKE-NOTES.md, apps/admin/package.json</files>
  <read_first>
    - apps/admin/package.json (current dependency versions)
    - .planning/research/STACK.md (locked versions: Zod v4, shadcn form, react-hook-form)
    - .planning/research/PITFALLS.md §P-03 (compat check requirements)
  </read_first>
  <action>
    1. If not already installed in `apps/admin/package.json`, install shadcn form block and its peers. From `apps/admin/`:
       ```bash
       bunx shadcn@latest add form input label select dialog alert-dialog badge progress tooltip alert table sonner
       bun add react-hook-form @hookform/resolvers
       # Verify zod is v4 (should already be from Phase 12 SEC-05 wiring)
       bun pm ls zod
       ```
       If `zod` shows anything below `4.0.0`, run `bun add zod@^4` and record the upgrade in SPIKE-NOTES.
       If the `@hookform/resolvers/zod` import pathway requires an adapter change for Zod v4 (the v4 `.parseAsync` / issue shape differs from v3), record the exact import path used: either `@hookform/resolvers/zod` or `@hookform/resolvers/zod/v4`.

    2. Create `.planning/phases/13-claude-tokens-page/13-01-SPIKE-NOTES.md` with the following sections filled in with actual observed results (not plan predictions):

       ```markdown
       # Phase 13 Plan 01 — Spike Notes (P-03 resolution)

       ## SOPS version
       - Observed: `sops --version` output: &lt;paste&gt;
       - `sops --set` syntax verified: &lt;yes/no&gt;
       - Syntax used: `sops --set '&lt;jsonPath&gt; "&lt;value&gt;"' &lt;file&gt;`
       - Example that worked (non-secret): `sops --set '["tokens"][0]["enabled"] true' secrets/claude-tokens.sops.yaml`

       ## Zod version
       - Installed: &lt;version from bun pm ls&gt;
       - Schema patterns used: `z.object`, `z.enum`, `z.string().regex`, `z.string().datetime`, `z.string().uuid`
       - Breaking changes hit (if any): &lt;list or "none"&gt;

       ## @hookform/resolvers adapter
       - Import path that compiles: `@hookform/resolvers/zod` OR `@hookform/resolvers/zod/v4`
       - Minimal working snippet:
         ```tsx
         import { zodResolver } from '&lt;verified path&gt;';
         import { useForm } from 'react-hook-form';
         const form = useForm({ resolver: zodResolver(TokenEntrySchema) });
         ```

       ## Shadcn form install
       - `bunx shadcn@latest add form input label select dialog alert-dialog badge progress tooltip alert table sonner` ran clean: &lt;yes/no&gt;
       - Peer dep warnings: &lt;list or "none"&gt;

       ## Mutex evidence
       - Test `sops.server.test.ts` case "concurrent setRegistryField serializes" output: &lt;paste PASS line&gt;

       ## Decision for downstream plans
       - Toast library chosen: `sonner` (shadcn recommends sonner over legacy toast as of 2025)
       - Form resolver import path for Plan 13-05: &lt;verified path&gt;
       ```

    3. Commit `apps/admin/package.json` + `apps/admin/bun.lock` changes alongside.
  </action>
  <verify>
    <automated>test -f .planning/phases/13-claude-tokens-page/13-01-SPIKE-NOTES.md &amp;&amp; grep -q 'SOPS version' .planning/phases/13-claude-tokens-page/13-01-SPIKE-NOTES.md &amp;&amp; grep -q 'Decision for downstream plans' .planning/phases/13-claude-tokens-page/13-01-SPIKE-NOTES.md &amp;&amp; cd apps/admin &amp;&amp; bun audit</automated>
  </verify>
  <acceptance_criteria>
    - File `.planning/phases/13-claude-tokens-page/13-01-SPIKE-NOTES.md` exists
    - grep `SOPS version` in SPIKE-NOTES.md returns 1 line
    - grep `Zod version` in SPIKE-NOTES.md returns 1 line
    - grep `@hookform/resolvers` in SPIKE-NOTES.md returns at least 1 line
    - grep `Decision for downstream plans` in SPIKE-NOTES.md returns 1 line
    - Placeholder `<paste>` and `<yes/no>` strings are REPLACED with actual values (grep for `&lt;paste&gt;` returns 0 lines)
    - `bunx shadcn@latest add form` has run — `apps/admin/components/ui/form.tsx` exists
    - `bun pm ls zod` in `apps/admin/` prints a version matching `4.*`
    - `cd apps/admin && bun audit` exits 0 with no HIGH/CRITICAL
  </acceptance_criteria>
  <done>Spike notes have real values (not placeholders); shadcn form block installed; Zod v4 confirmed; bun audit clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| admin app process → sops binary | Untrusted registry content becomes plaintext inside admin process memory |
| admin process memory → error/log sinks | Plaintext must never escape to stderr/stdout/journald |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-13-01-01 | Information Disclosure | sops.server.ts error paths | mitigate | stderr scanned for `sk-ant-oat01-` pattern; matches redacted to `[REDACTED_TOKEN]` before throwing; test 7 asserts no token substring in error messages |
| T-13-01-02 | Tampering | replaceRegistry race on concurrent server actions | mitigate | in-process `withMutex` serializes all mutation-path calls; test 5 asserts serialization; single-node deploy makes in-process mutex sufficient |
| T-13-01-03 | Denial of Service | sops binary missing at runtime | mitigate | sopsAvailable() probed at page load → triggers degraded mode in Plan 13-04; Plan 13-03 API routes return 503 if false |
| T-13-01-04 | Elevation of Privilege | arbitrary command injection via jsonPath or value | mitigate | spawnSync used with argv array (NOT shell string); jsonPath is constructed server-side from a whitelist of shapes (`[tokens][N][field]`); value is validated by Zod before call |
| T-13-01-05 | Information Disclosure | plaintext tmp file written by replaceRegistry lingers on crash | accept | tmp file created with 0o600 in app-owned dir; try/finally unlinks; risk is bounded to crash-between-write-and-rename window; mcow is single-tenant |
| T-13-01-06 | Repudiation | mutations without audit trail | transfer | this plan does NOT emit audit events (that is Plan 13-03's `audit.server.ts`); sops.server.ts exposes primitives only |

All threats have a disposition. No high-severity unmitigated.
</threat_model>

<verification>
- `cd apps/admin && bun test lib/sops.server.test.ts` — all 7 tests pass
- `sops -d --output-type json secrets/claude-tokens.sops.yaml` prints `{"tokens":[]}`
- `bun pm ls zod` reports 4.x
- `cd apps/admin && bun audit` — 0 HIGH/CRITICAL
- SPIKE-NOTES.md has no `<paste>` / `<yes/no>` placeholders remaining
</verification>

<success_criteria>
PITFALLS P-03 is resolved: the runtime SOPS subprocess works, Zod v4 parses the registry schema, shadcn Form + react-hook-form + Zod v4 compiles, and the sops.server.ts module is the single source of truth for all downstream token mutations.
</success_criteria>

<output>
After completion, create `.planning/phases/13-claude-tokens-page/13-01-SUMMARY.md` noting: final SOPS version, final Zod version, decision for `sonner` vs `toast`, exact `@hookform/resolvers` import path, and any pivot from plan spec.
</output>
