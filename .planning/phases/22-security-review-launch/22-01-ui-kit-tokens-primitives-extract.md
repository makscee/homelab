---
phase: 22-security-review-launch
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - /Users/admin/hub/knowledge/standards/ui-kit/README.md
  - /Users/admin/hub/knowledge/standards/ui-kit/tokens/tokens.css
  - /Users/admin/hub/knowledge/standards/ui-kit/tokens/index.ts
  - /Users/admin/hub/knowledge/standards/ui-kit/primitives/button.tsx
  - /Users/admin/hub/knowledge/standards/ui-kit/primitives/card.tsx
  - /Users/admin/hub/knowledge/standards/ui-kit/primitives/input.tsx
  - /Users/admin/hub/knowledge/standards/ui-kit/primitives/table.tsx
  - /Users/admin/hub/knowledge/standards/ui-kit/primitives/badge.tsx
  - /Users/admin/hub/knowledge/standards/ui-kit/primitives/dialog.tsx
  - /Users/admin/hub/knowledge/standards/ui-kit/primitives/select.tsx
  - /Users/admin/hub/knowledge/standards/ui-kit/primitives/sonner.tsx
  - /Users/admin/hub/knowledge/standards/ui-kit/primitives/index.ts
  - /Users/admin/hub/knowledge/standards/ui-kit/lib/utils.ts
autonomous: true
requirements: [UI-01]
tags: [ui-kit, extraction, shared-source]
must_haves:
  truths:
    - "ui-kit directory exists at /Users/admin/hub/knowledge/standards/ui-kit/ with tokens/, primitives/, molecules/, lib/"
    - "All 8 shadcn primitives (Button, Card, Input, Table, Badge, Dialog, Select, Toast/sonner) exist under primitives/ and export from primitives/index.ts"
    - "Design tokens split out of apps/admin/app/globals.css into tokens/tokens.css and re-importable"
    - "cn() helper lives at ui-kit/lib/utils.ts using tailwind-merge 3 (matches apps/admin/lib/utils.ts)"
    - "README.md documents usage: relative-import pattern, no build step, no versioning (per D-22-02, D-22-05)"
  artifacts:
    - path: "/Users/admin/hub/knowledge/standards/ui-kit/README.md"
      provides: "Usage docs for shared ui-kit"
      contains: "relative import"
    - path: "/Users/admin/hub/knowledge/standards/ui-kit/tokens/tokens.css"
      provides: "Tailwind v4 @theme block + design tokens"
      contains: "@theme inline"
    - path: "/Users/admin/hub/knowledge/standards/ui-kit/primitives/index.ts"
      provides: "Barrel export of all 8 primitives"
      exports: ["Button", "Card", "Input", "Table", "Badge", "Dialog", "Select"]
    - path: "/Users/admin/hub/knowledge/standards/ui-kit/lib/utils.ts"
      provides: "cn() helper shared across consumers"
      contains: "twMerge"
  key_links:
    - from: "ui-kit/primitives/*.tsx"
      to: "ui-kit/lib/utils.ts"
      via: "import { cn } from '../lib/utils'"
      pattern: "from ['\\\"]\\.\\./lib/utils['\\\"]"
---

<objective>
Extract design tokens + shadcn primitive components + cn() helper from apps/admin into the shared `/Users/admin/hub/knowledge/standards/ui-kit/` tree so animaya and voidnet can consume the same primitives later. This plan only CREATES the ui-kit source of truth — consumer rewiring is plan 22-04.

Purpose: Deliver UI-01 (shared ui-kit created) half of Phase 22 UI track per D-22-01..05. The kit lives alongside `ui-style-spec.md` and `frontend-stack-spec.md` already in `knowledge/standards/`.

Output: Complete `ui-kit/` directory with tokens, primitives, lib, and README. apps/admin is NOT yet migrated; its current components keep working until plan 22-04 rewires imports.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/22-security-review-launch/22-CONTEXT.md
@/Users/admin/hub/knowledge/standards/ui-style-spec.md
@/Users/admin/hub/knowledge/standards/frontend-stack-spec.md
@apps/admin/app/globals.css
@apps/admin/lib/utils.ts
@apps/admin/components/ui/button.tsx
@apps/admin/components/ui/card.tsx
@apps/admin/components/ui/input.tsx
@apps/admin/components/ui/table.tsx
@apps/admin/components/ui/badge.tsx
@apps/admin/components/ui/dialog.tsx
@apps/admin/components/ui/select.tsx
@apps/admin/components/ui/sonner.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create ui-kit directory skeleton + tokens + utils</name>
  <files>
    /Users/admin/hub/knowledge/standards/ui-kit/README.md,
    /Users/admin/hub/knowledge/standards/ui-kit/tokens/tokens.css,
    /Users/admin/hub/knowledge/standards/ui-kit/tokens/index.ts,
    /Users/admin/hub/knowledge/standards/ui-kit/lib/utils.ts
  </files>
  <read_first>
    - apps/admin/app/globals.css (source of @theme inline block + design tokens)
    - apps/admin/lib/utils.ts (current cn() implementation to mirror exactly)
    - /Users/admin/hub/knowledge/standards/ui-style-spec.md (locked visual contract)
    - /Users/admin/hub/knowledge/standards/frontend-stack-spec.md (Tailwind v4, tailwind-merge 3 lock)
  </read_first>
  <action>
    Per D-22-01, D-22-04: create the shared kit layout.

    1. `mkdir -p /Users/admin/hub/knowledge/standards/ui-kit/{tokens,primitives,molecules,lib}`

    2. Create `ui-kit/tokens/tokens.css`:
       - Copy the entire `@theme inline` block + `@custom-variant dark` + `:root { --* }` token declarations + global `* { @apply border-border }` rule from `apps/admin/app/globals.css` verbatim.
       - Do NOT copy the `@import "tailwindcss"` line — that stays in the consumer's entry CSS.
       - Top-of-file comment: `/* Shared design tokens — consumed via @import "../../../knowledge/standards/ui-kit/tokens/tokens.css" from app globals.css. */`

    3. Create `ui-kit/tokens/index.ts` with a single re-export line so TS path alias resolves the folder:
       ```ts
       // Re-export point for tokens. Import CSS directly in consumer globals.css.
       export {};
       ```

    4. Create `ui-kit/lib/utils.ts` — verbatim copy of `apps/admin/lib/utils.ts` (cn() using clsx + tailwind-merge). Same `"use client"` directive handling as source (omit if source omits).

    5. Create `ui-kit/README.md`:
       - Heading: `# hub-standards ui-kit`
       - Section "Usage": document relative-import pattern. Consumer example:
         `import { Button } from "@ui-kit/primitives"` (after TS path alias) OR
         `import { Button } from "../../../knowledge/standards/ui-kit/primitives/button"` (without alias).
       - Section "Tokens": instruct consumer's `app/globals.css` to `@import "../../../knowledge/standards/ui-kit/tokens/tokens.css";` BEFORE `@import "tailwindcss";` is evaluated (Tailwind v4 reads @theme before layers compile).
       - Section "No versioning, no build step": per D-22-05, this is shared source. Breakage risk is managed by consumer tests.
       - Section "Layout": list `tokens/`, `primitives/`, `molecules/`, `lib/`.
       - Section "Adding a component": document the convention — leaf primitives under `primitives/`, homelab-specific composites under `molecules/`.

    Do NOT delete or modify `apps/admin/app/globals.css` or `apps/admin/lib/utils.ts` in this task — that happens in plan 22-04 after all consumers are switched.
  </action>
  <verify>
    <automated>test -f /Users/admin/hub/knowledge/standards/ui-kit/tokens/tokens.css && test -f /Users/admin/hub/knowledge/standards/ui-kit/lib/utils.ts && test -f /Users/admin/hub/knowledge/standards/ui-kit/README.md && grep -q '@theme inline' /Users/admin/hub/knowledge/standards/ui-kit/tokens/tokens.css && grep -q 'tailwind-merge' /Users/admin/hub/knowledge/standards/ui-kit/lib/utils.ts</automated>
  </verify>
  <acceptance_criteria>
    - ui-kit/ directory exists with tokens/, primitives/, molecules/, lib/ subdirs.
    - tokens/tokens.css contains the full @theme inline block from apps/admin globals.css.
    - lib/utils.ts contains cn() using tailwind-merge 3.
    - README.md documents relative import usage, no-build-step, no-versioning.
  </acceptance_criteria>
  <done>ui-kit skeleton + tokens + utils + README committed; apps/admin untouched.</done>
</task>

<task type="auto">
  <name>Task 2: Copy all 8 shadcn primitives into ui-kit/primitives</name>
  <files>
    /Users/admin/hub/knowledge/standards/ui-kit/primitives/button.tsx,
    /Users/admin/hub/knowledge/standards/ui-kit/primitives/card.tsx,
    /Users/admin/hub/knowledge/standards/ui-kit/primitives/input.tsx,
    /Users/admin/hub/knowledge/standards/ui-kit/primitives/table.tsx,
    /Users/admin/hub/knowledge/standards/ui-kit/primitives/badge.tsx,
    /Users/admin/hub/knowledge/standards/ui-kit/primitives/dialog.tsx,
    /Users/admin/hub/knowledge/standards/ui-kit/primitives/select.tsx,
    /Users/admin/hub/knowledge/standards/ui-kit/primitives/sonner.tsx,
    /Users/admin/hub/knowledge/standards/ui-kit/primitives/index.ts
  </files>
  <read_first>
    - apps/admin/components/ui/button.tsx
    - apps/admin/components/ui/card.tsx
    - apps/admin/components/ui/input.tsx
    - apps/admin/components/ui/table.tsx
    - apps/admin/components/ui/badge.tsx
    - apps/admin/components/ui/dialog.tsx
    - apps/admin/components/ui/select.tsx
    - apps/admin/components/ui/sonner.tsx
  </read_first>
  <action>
    Per D-22-03: copy the 8 shadcn primitives listed in CONTEXT.md to the kit. Sonner is the Toast primitive.

    For each of the 8 primitives under `apps/admin/components/ui/`:
    1. Copy the file verbatim to `ui-kit/primitives/<name>.tsx`.
    2. Rewrite the cn() import from `import { cn } from "@/lib/utils"` (or whatever local path the source uses) to `import { cn } from "../lib/utils"`.
    3. Leave every other import (react, radix, class-variance-authority, lucide-react, sonner) untouched — those resolve via consumer's node_modules.

    Then create `ui-kit/primitives/index.ts` as a barrel:
    ```ts
    export * from "./button";
    export * from "./card";
    export * from "./input";
    export * from "./table";
    export * from "./badge";
    export * from "./dialog";
    export * from "./select";
    export * from "./sonner";
    ```

    Do NOT delete the originals under apps/admin/components/ui — plan 22-04 handles the swap.

    Note: This is SHARED SOURCE. No versioning, no changelog (per D-22-05). Do not add a package.json.
  </action>
  <verify>
    <automated>ls /Users/admin/hub/knowledge/standards/ui-kit/primitives/ | sort | tr '\n' ' ' | grep -q 'badge.tsx button.tsx card.tsx dialog.tsx index.ts input.tsx select.tsx sonner.tsx table.tsx' && ! grep -rn '@/lib/utils' /Users/admin/hub/knowledge/standards/ui-kit/primitives/</automated>
  </verify>
  <acceptance_criteria>
    - All 8 primitive files exist under ui-kit/primitives/.
    - primitives/index.ts re-exports all 8.
    - No primitive file imports from @/lib/utils; every cn() import is `../lib/utils`.
    - apps/admin/components/ui/ still contains its originals untouched.
  </acceptance_criteria>
  <done>All 8 primitives copied, cn() rewired to ui-kit/lib/utils.ts, barrel exports all.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| filesystem → hub tree | No network/privilege boundary crossed; shared source lives in the same repo set |

## STRIDE Threat Register (aggregation posture — this plan introduces no new runtime surface)

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-22-01-01 | Tampering | ui-kit shared source | accept | No runtime impact; consumer tests guard against breaking changes per D-22-05. No new CVE surface — primitives are existing shadcn code already audited in Phase 12 SEC-02/04/05. |
| T-22-01-02 | Information disclosure | design tokens | accept | Tokens are non-secret; already published in public apps/admin bundle. |
</threat_model>

<verification>
- `ls -R /Users/admin/hub/knowledge/standards/ui-kit/` shows all expected files.
- `grep -rn 'from "../lib/utils"' /Users/admin/hub/knowledge/standards/ui-kit/primitives/ | wc -l` >= 6 (most primitives use cn()).
- `grep -q '@theme inline' /Users/admin/hub/knowledge/standards/ui-kit/tokens/tokens.css`.
- apps/admin build is NOT broken because nothing was deleted: `cd apps/admin && bun run typecheck` still passes.
</verification>

<success_criteria>
- ui-kit directory fully populated with tokens, primitives (8), lib/utils, README.
- apps/admin continues to build and run untouched (no imports rewired yet).
- README documents the relative-import + no-build-step consumption pattern.
</success_criteria>

<output>
After completion, create `.planning/phases/22-security-review-launch/22-01-SUMMARY.md` with:
- List of files created under ui-kit/
- Any verbatim-copy drift noted (e.g. if cn() import path required a different relative depth)
- Confirmation apps/admin still compiles
</output>
