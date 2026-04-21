---
phase: 22-security-review-launch
plan: 04
type: execute
wave: 2
depends_on: [22-01]
files_modified:
  - /Users/admin/hub/knowledge/standards/ui-kit/molecules/HostTile.tsx
  - /Users/admin/hub/knowledge/standards/ui-kit/molecules/AlertCard.tsx
  - /Users/admin/hub/knowledge/standards/ui-kit/molecules/AuditRow.tsx
  - /Users/admin/hub/knowledge/standards/ui-kit/molecules/NavAlertBadge.tsx
  - /Users/admin/hub/knowledge/standards/ui-kit/molecules/index.ts
  - apps/admin/tsconfig.json
  - apps/admin/components/ui/button.tsx
  - apps/admin/components/ui/card.tsx
  - apps/admin/components/ui/input.tsx
  - apps/admin/components/ui/table.tsx
  - apps/admin/components/ui/badge.tsx
  - apps/admin/components/ui/dialog.tsx
  - apps/admin/components/ui/select.tsx
  - apps/admin/components/ui/sonner.tsx
  - apps/admin/lib/utils.ts
  - apps/admin/app/globals.css
  - apps/admin/app/(auth)/_components/NavAlertBadge.tsx
autonomous: false
requirements: [UI-02]
tags: [ui-kit, migration, admin, molecules]
must_haves:
  truths:
    - "Molecules HostTile, AlertCard, AuditRow, NavAlertBadge live in ui-kit/molecules/ and export via molecules/index.ts"
    - "apps/admin tsconfig.json has path alias `@ui-kit/*` resolving to the hub-relative ui-kit path"
    - "Every apps/admin source import that previously resolved to components/ui/* now resolves to @ui-kit/primitives"
    - "apps/admin/app/globals.css imports tokens from ui-kit instead of declaring them inline"
    - "apps/admin builds cleanly (`bun run build`) and Playwright visual checkpoint shows no regression vs pre-migration on /, /audit, /alerts"
  artifacts:
    - path: "/Users/admin/hub/knowledge/standards/ui-kit/molecules/index.ts"
      provides: "Barrel export for homelab-specific molecules"
    - path: "apps/admin/tsconfig.json"
      provides: "Path alias @ui-kit/* pointing to hub-relative ui-kit path"
      contains: "@ui-kit/*"
    - path: "apps/admin/app/globals.css"
      provides: "CSS entry that @imports shared tokens"
      contains: "ui-kit/tokens"
  key_links:
    - from: "apps/admin/*.tsx"
      to: "/Users/admin/hub/knowledge/standards/ui-kit/primitives/*"
      via: "@ui-kit/primitives barrel import"
      pattern: "from ['\\\"]@ui-kit/"
---

<objective>
Complete the UI-02 half: create the four homelab-specific molecules under ui-kit/molecules/, wire TS path alias `@ui-kit/*` in apps/admin, migrate every admin import from local primitives + globals tokens to the shared kit. This plan depends on 22-01 (which creates the kit).

Purpose: With this plan complete, admin consumes the shared kit end-to-end; future animaya + voidnet can do the same by copying only the path-alias snippet.

Output: Molecules populated; admin build green; visual regression checkpoint passed.

**Note on molecules:** CONTEXT.md D-22-03 names HostTile, AlertCard, AuditRow, NavAlertBadge as existing. Of these, only `NavAlertBadge.tsx` currently exists at `apps/admin/app/(auth)/_components/NavAlertBadge.tsx`. The other three do NOT exist as dedicated files today — the relevant JSX is inlined in the dashboard/audit/alerts pages. Task 1 extracts them to dedicated files AS PART OF this migration, so the kit contract in D-22-03 is honored.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/22-security-review-launch/22-CONTEXT.md
@.planning/phases/22-security-review-launch/22-01-SUMMARY.md
@/Users/admin/hub/knowledge/standards/ui-style-spec.md
@/Users/admin/hub/knowledge/standards/frontend-stack-spec.md
@apps/admin/tsconfig.json
@apps/admin/app/globals.css
@apps/admin/app/(auth)/_components/NavAlertBadge.tsx
@apps/admin/app/page.tsx
@apps/admin/app/audit/page.tsx
@apps/admin/app/alerts/page.tsx

<interfaces>
After 22-01 runs, the kit exposes:

```ts
// @ui-kit/primitives/index.ts
export * from "./button";  // Button, buttonVariants
export * from "./card";    // Card, CardHeader, CardContent, CardTitle, CardDescription, CardFooter
export * from "./input";   // Input
export * from "./table";   // Table, TableHeader, TableRow, TableCell, TableBody, TableHead
export * from "./badge";   // Badge, badgeVariants
export * from "./dialog";  // Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription
export * from "./select";  // Select, SelectTrigger, SelectValue, SelectContent, SelectItem
export * from "./sonner";  // Toaster

// @ui-kit/lib/utils
export function cn(...inputs: ClassValue[]): string;
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract + place four molecules under ui-kit/molecules</name>
  <files>
    /Users/admin/hub/knowledge/standards/ui-kit/molecules/HostTile.tsx,
    /Users/admin/hub/knowledge/standards/ui-kit/molecules/AlertCard.tsx,
    /Users/admin/hub/knowledge/standards/ui-kit/molecules/AuditRow.tsx,
    /Users/admin/hub/knowledge/standards/ui-kit/molecules/NavAlertBadge.tsx,
    /Users/admin/hub/knowledge/standards/ui-kit/molecules/index.ts
  </files>
  <read_first>
    - apps/admin/app/(auth)/_components/NavAlertBadge.tsx (exists — direct move)
    - apps/admin/app/page.tsx (to locate HostTile JSX)
    - apps/admin/app/audit/page.tsx (to locate AuditRow JSX)
    - apps/admin/app/alerts/page.tsx (to locate AlertCard JSX)
    - /Users/admin/hub/knowledge/standards/ui-style-spec.md (spacing/typography rules to preserve)
  </read_first>
  <action>
    For each molecule, produce a self-contained component file under `ui-kit/molecules/`. All cn() imports use `../lib/utils`; all primitive imports use `../primitives`.

    1. **NavAlertBadge** — direct move. Copy `apps/admin/app/(auth)/_components/NavAlertBadge.tsx` verbatim to `ui-kit/molecules/NavAlertBadge.tsx`. Rewrite any `@/components/ui/*` or `@/lib/utils` imports to `../primitives` + `../lib/utils`. The original file stays in place temporarily; task 3 will rewire admin to import from the new location and delete the stub.

    2. **HostTile** — extract. Read `apps/admin/app/page.tsx`. Locate the per-host row markup (the component rendering hostname, CPU%, memory%, disk%, container count per DASH-01). Extract into `ui-kit/molecules/HostTile.tsx` with this explicit props contract:
       ```ts
       export interface HostTileProps {
         hostname: string;
         tailscaleIp?: string;
         cpuPct: number;
         memPct: number;
         diskPct: number;
         containerCount?: number;
         status?: "up" | "down" | "unknown";
         className?: string;
       }
       export function HostTile(props: HostTileProps): JSX.Element;
       ```
       Use Card + Badge from `../primitives`. Use `cn` from `../lib/utils`. Preserve exact visual structure from page.tsx (copy classNames verbatim).

    3. **AlertCard** — extract. Read `apps/admin/app/alerts/page.tsx`. Locate the per-alert card markup (ALERT-01 row: severity, summary, duration, labels). Extract into `ui-kit/molecules/AlertCard.tsx`:
       ```ts
       export interface AlertCardProps {
         alertname: string;
         severity: "critical" | "warning" | "info";
         summary: string;
         startsAt: string; // ISO
         labels: Record<string, string>;
         className?: string;
       }
       export function AlertCard(props: AlertCardProps): JSX.Element;
       ```
       Preserve the Badge variant mapping (critical/warning/info → badge variant) used in the current page.

    4. **AuditRow** — extract. Read `apps/admin/app/audit/page.tsx`. Locate the row markup for `audit_log` entries. Extract into `ui-kit/molecules/AuditRow.tsx`:
       ```ts
       export interface AuditRowProps {
         createdAt: string; // ISO
         user: string;
         action: string;
         target: string;
         payload?: unknown;
         className?: string;
       }
       export function AuditRow(props: AuditRowProps): JSX.Element;
       ```
       This is a `<tr>` expected to live inside a Table from `../primitives`. Document usage in a JSDoc comment at the top of the file.

    5. Create `ui-kit/molecules/index.ts`:
       ```ts
       export * from "./HostTile";
       export * from "./AlertCard";
       export * from "./AuditRow";
       export * from "./NavAlertBadge";
       ```

    Do NOT yet modify the source pages — task 3 rewires them. Keep admin buildable at all points.
  </action>
  <verify>
    <automated>ls /Users/admin/hub/knowledge/standards/ui-kit/molecules/ | sort | tr '\n' ' ' | grep -q 'AlertCard.tsx AuditRow.tsx HostTile.tsx NavAlertBadge.tsx index.ts' && ! grep -rn '@/components/ui' /Users/admin/hub/knowledge/standards/ui-kit/molecules/ && ! grep -rn '@/lib/utils' /Users/admin/hub/knowledge/standards/ui-kit/molecules/</automated>
  </verify>
  <acceptance_criteria>
    - All 4 molecule files exist, exporting the documented prop interfaces.
    - molecules/index.ts barrels all 4.
    - No molecule imports from `@/...`; only relative `../primitives` + `../lib/utils`.
  </acceptance_criteria>
  <done>Molecules populated; kit is feature-complete.</done>
</task>

<task type="auto">
  <name>Task 2: Wire TS path alias + globals.css import</name>
  <files>
    apps/admin/tsconfig.json,
    apps/admin/app/globals.css
  </files>
  <read_first>
    - apps/admin/tsconfig.json (current paths block)
    - apps/admin/app/globals.css (current token block)
    - /Users/admin/hub/knowledge/standards/ui-kit/tokens/tokens.css (created in 22-01)
    - /Users/admin/hub/knowledge/standards/ui-kit/README.md (consumption contract)
  </read_first>
  <action>
    Per D-22-02 (relative import) + CONTEXT.md §specifics (TS path alias for ergonomics).

    1. **tsconfig.json path alias.** Add to `compilerOptions.paths` (relative to apps/admin/):
       ```json
       "@ui-kit/*": ["../../knowledge/standards/ui-kit/*"]
       ```
       Resolve from apps/admin to /Users/admin/hub/knowledge/standards/ui-kit — that's `../../knowledge/...` because apps/admin is at `/Users/admin/hub/workspace/homelab/apps/admin/` and the kit is at `/Users/admin/hub/knowledge/standards/ui-kit/`. VERIFY the depth on disk before writing (count `../`s from apps/admin/tsconfig.json to `/Users/admin/hub/knowledge/standards/ui-kit/`). If Next.js's `baseUrl` is set, the alias is relative to baseUrl — compute accordingly.

       Also add `"include"` covers so TS picks up `.ts/.tsx` from the kit:
       ```json
       "include": [
         "next-env.d.ts",
         "**/*.ts",
         "**/*.tsx",
         "../../knowledge/standards/ui-kit/**/*.ts",
         "../../knowledge/standards/ui-kit/**/*.tsx"
       ]
       ```

    2. **globals.css tokens import.** Edit `apps/admin/app/globals.css`:
       - Replace the inline `@theme inline { ... }` block + `:root { --* }` declarations + `* { @apply border-border }` with a single `@import` at the top (AFTER the `@import "tailwindcss"` line — Tailwind v4 needs tailwindcss imported first, then CSS variable theme layers can override):
         ```css
         @import "tailwindcss";
         @import "../../../knowledge/standards/ui-kit/tokens/tokens.css";
         @custom-variant dark (&:where(.dark, .dark *));
         ```
       - Keep any admin-specific overrides (page-level custom utilities) below the import. Remove only the content that was duplicated into `ui-kit/tokens/tokens.css` in plan 22-01.
       - If Next.js fails to resolve the filesystem path via PostCSS, fall back to an absolute-from-monorepo path using `next.config` CSS loader options OR copy the tokens.css content into globals.css with a `/* sourced from ui-kit/tokens/tokens.css */` header comment + add a CI check that the two stay in sync. Prefer the @import path — only fall back if PostCSS explicitly errors.

    3. Build check: `cd apps/admin && bun install --frozen-lockfile && bun run build`. Must succeed. If typecheck complains about the kit types, adjust `include` or `typeRoots`.
  </action>
  <verify>
    <automated>grep -q '@ui-kit/\*' apps/admin/tsconfig.json && grep -q 'knowledge/standards/ui-kit/tokens' apps/admin/app/globals.css && cd apps/admin && bun run typecheck 2>&1 | tail -5 | grep -q -i 'no errors\|Done\|^$' || (cd apps/admin && bun run build 2>&1 | tail -20)</automated>
  </verify>
  <acceptance_criteria>
    - tsconfig.json has `@ui-kit/*` path alias resolving to the hub-relative kit path.
    - globals.css @imports tokens from ui-kit; no duplicated @theme inline block.
    - `bun run build` succeeds from apps/admin.
  </acceptance_criteria>
  <done>Path alias live; tokens centralised; admin still builds.</done>
</task>

<task type="auto">
  <name>Task 3: Rewire all apps/admin imports to @ui-kit and delete local primitives</name>
  <files>
    apps/admin/components/ui/button.tsx,
    apps/admin/components/ui/card.tsx,
    apps/admin/components/ui/input.tsx,
    apps/admin/components/ui/table.tsx,
    apps/admin/components/ui/badge.tsx,
    apps/admin/components/ui/dialog.tsx,
    apps/admin/components/ui/select.tsx,
    apps/admin/components/ui/sonner.tsx,
    apps/admin/lib/utils.ts,
    apps/admin/app/(auth)/_components/NavAlertBadge.tsx
  </files>
  <read_first>
    - apps/admin/**/*.tsx (to find every import site)
    - /Users/admin/hub/knowledge/standards/ui-kit/primitives/index.ts (the barrel)
  </read_first>
  <action>
    Swap admin consumers to the kit, then delete the admin-local duplicates.

    1. **Codemod every import.** In apps/admin, replace:
       - `from "@/components/ui/button"` → `from "@ui-kit/primitives"`
       - `from "@/components/ui/card"` → `from "@ui-kit/primitives"`
       - ...same for input, table, badge, dialog, select, sonner, alert-dialog, progress, tooltip, skeleton, label, dropdown-menu, textarea, form, avatar, alert (for primitives NOT in the kit's 8-primitive scope, leave them under apps/admin/components/ui/ — they stay admin-local until scope expands).
       - `from "@/lib/utils"` → `from "@ui-kit/lib/utils"` ONLY in files that import primitives from the kit. Other admin code can keep using `@/lib/utils` (which itself becomes a re-export of `@ui-kit/lib/utils` — see step 3).

       Scope of the swap: the 8 primitives named in D-22-03 (button, card, input, table, badge, dialog, select, sonner). Do NOT touch non-kit primitives.

    2. **Replace local molecule imports.** Every page that currently has inlined HostTile/AlertCard/AuditRow JSX (extracted in task 1) now `import { HostTile, AlertCard, AuditRow } from "@ui-kit/molecules"` and renders them with the extracted props contract. This is a structural edit — be surgical to avoid behavior drift.

       For `apps/admin/app/(auth)/_components/NavAlertBadge.tsx`: replace the file's content with a single re-export shim:
       ```ts
       // Moved to @ui-kit/molecules in Phase 22 plan 04. Kept as shim to avoid ripple edits.
       export { NavAlertBadge } from "@ui-kit/molecules";
       ```
       OR do a bulk rewrite of every NavAlertBadge importer and delete this file. Prefer the bulk rewrite + delete (cleaner). Shim only if the import fan-out is > 6 files.

    3. **Delete duplicated primitives.** After all imports compile against `@ui-kit/primitives`:
       - Delete `apps/admin/components/ui/{button,card,input,table,badge,dialog,select,sonner}.tsx`.
       - Update `apps/admin/lib/utils.ts` to be a one-line re-export: `export { cn } from "@ui-kit/lib/utils";`. This preserves `@/lib/utils` as a valid import for any admin-local code that still uses it.

    4. **Build + typecheck + prod smoke.**
       - `cd apps/admin && bun run build` — must succeed.
       - `cd apps/admin && bun run typecheck` — zero errors.
       - Deploy to mcow via `ansible-playbook -i ansible/inventory/hosts.yml ansible/playbooks/deploy-homelab-admin.yml`.

       After deploy, drive Playwright MCP against https://homelab.makscee.ru:
       - Visit `/`, `/audit`, `/alerts`, `/login`.
       - Screenshot each (explicit out-of-repo path, e.g. `/tmp/phase22-04-<page>.png` — per memory `feedback_playwright_screenshot_path`).
       - Compare to the Phase 15 baselines if stored, otherwise to visual memory — no new misalignments, no color shifts, no missing components, no focus-ring regressions.

       This is the checkpoint in task 4.
  </action>
  <verify>
    <automated>cd apps/admin && bun run build 2>&1 | tail -5 | grep -qi 'successful\|compiled' && ! ls apps/admin/components/ui/button.tsx 2>/dev/null && ! ls apps/admin/components/ui/card.tsx 2>/dev/null && grep -rq '@ui-kit/primitives' apps/admin/app apps/admin/components 2>/dev/null</automated>
  </verify>
  <acceptance_criteria>
    - Zero imports remain to `@/components/ui/{button,card,input,table,badge,dialog,select,sonner}`.
    - Those 8 files are deleted from apps/admin/components/ui/.
    - apps/admin/lib/utils.ts re-exports cn from the kit.
    - Build + typecheck green; prod deploys and serves.
  </acceptance_criteria>
  <done>Admin fully on shared kit; local duplicates deleted.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Visual regression checkpoint — Playwright-driven + operator eyeball</name>
  <what-built>ui-kit migration: admin now sources primitives, tokens, cn() helper, and 4 molecules from /Users/admin/hub/knowledge/standards/ui-kit/ via @ui-kit/* path alias. Local duplicates deleted.</what-built>
  <how-to-verify>
    Claude's automated pre-check (run before surfacing this checkpoint):
    1. `ansible-playbook -i ansible/inventory/hosts.yml ansible/playbooks/deploy-homelab-admin.yml` → PLAY RECAP ok, zero failed.
    2. Playwright MCP → navigate to `https://homelab.makscee.ru/`, `/audit`, `/alerts`, `/login`.
    3. For each, `browser_take_screenshot` to `/tmp/phase22-04-<page>.png` (explicit out-of-repo path per memory `feedback_playwright_screenshot_path`).
    4. Verify no console errors via Playwright's console inspection.
    5. Verify page shape: `/` shows 6 host rows, `/audit` shows table, `/alerts` shows cards, `/login` shows GitHub button.

    Present to operator:
    - 4 screenshot paths
    - Console log tail (should be empty or benign)
    - PLAY RECAP summary
    - Confirmed zero import diffs to `@/components/ui/{8 primitives}`

    Operator checks:
    - Layouts match prior v3.0 baseline (spacing, typography, colors, dark mode).
    - Focus rings intact (Phase 15 lesson — v3→v4 Tailwind regression surface).
    - No obvious visual drift on the 4 molecules.
  </how-to-verify>
  <resume-signal>Type "approved" or describe visual issues with page + element + expected vs actual.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

No new runtime boundaries. This is pure code relocation within the same build/deploy chain.

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-22-04-01 | Tampering | ui-kit shared source | accept | Consumer tests + Playwright checkpoint guard against regressions per D-22-05 |
| T-22-04-02 | Denial of service | build pipeline | mitigate | Full `bun run build` + deploy before checkpoint; checkpoint blocks on visual PASS |
</threat_model>

<verification>
- `! ls apps/admin/components/ui/button.tsx` (and 7 other primitives) — deleted.
- `grep -rq '@ui-kit/primitives' apps/admin/` — present.
- `cd apps/admin && bun run build` — succeeds.
- Deploy PLAY RECAP ok.
- 4 Playwright screenshots captured + approved.
</verification>

<success_criteria>
- UI-01 + UI-02 closed: shared kit exists, admin consumes it exclusively for the 8 primitives + 4 molecules + cn + tokens.
- Zero visual regressions vs pre-migration baseline.
- Admin lib/utils.ts is a one-line re-export.
</success_criteria>

<output>
After completion, create `.planning/phases/22-security-review-launch/22-04-SUMMARY.md`:
- Import swap count (number of files edited)
- Files deleted from apps/admin/components/ui/
- tsconfig alias + globals.css diff summary
- 4 screenshot paths + operator verdict
</output>
