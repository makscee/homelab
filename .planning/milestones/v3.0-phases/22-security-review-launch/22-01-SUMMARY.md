---
phase: 22-security-review-launch
plan: 01
subsystem: ui-kit
tags: [ui-kit, extraction, shared-source]
requires: []
provides: [ui-kit-tokens, ui-kit-primitives, ui-kit-utils]
affects: [apps/admin, animaya, voidnet (future consumers)]
tech-stack:
  added: []
  patterns: [shared-source, relative-import, no-versioning]
key-files:
  created:
    - /Users/admin/hub/knowledge/standards/ui-kit/README.md
    - /Users/admin/hub/knowledge/standards/ui-kit/tokens/tokens.css
    - /Users/admin/hub/knowledge/standards/ui-kit/tokens/index.ts
    - /Users/admin/hub/knowledge/standards/ui-kit/lib/utils.ts
    - /Users/admin/hub/knowledge/standards/ui-kit/primitives/button.tsx
    - /Users/admin/hub/knowledge/standards/ui-kit/primitives/card.tsx
    - /Users/admin/hub/knowledge/standards/ui-kit/primitives/input.tsx
    - /Users/admin/hub/knowledge/standards/ui-kit/primitives/table.tsx
    - /Users/admin/hub/knowledge/standards/ui-kit/primitives/badge.tsx
    - /Users/admin/hub/knowledge/standards/ui-kit/primitives/dialog.tsx
    - /Users/admin/hub/knowledge/standards/ui-kit/primitives/select.tsx
    - /Users/admin/hub/knowledge/standards/ui-kit/primitives/sonner.tsx
    - /Users/admin/hub/knowledge/standards/ui-kit/primitives/index.ts
  modified: []
key-decisions:
  - "D-22-01/02/04/05 upheld: shared source tree lives at knowledge/standards/ui-kit/, no build step, no versioning, relative-import pattern"
  - "Tokens extracted verbatim from apps/admin/app/globals.css into tokens/tokens.css; consumer @imports before tailwindcss"
  - "cn() shared via ui-kit/lib/utils.ts; all primitives import from ../lib/utils so files are consumer-agnostic"
requirements-completed: [UI-01]
duration: ~15 min
completed: 2026-04-21
---

# Phase 22 Plan 01: UI Kit Tokens + Primitives Extract Summary

Shared ui-kit source tree created at `/Users/admin/hub/knowledge/standards/ui-kit/` with design tokens, cn() helper, and 8 shadcn primitives (Button, Card, Input, Table, Badge, Dialog, Select, Toaster/sonner) — all consumer-agnostic via `../lib/utils` imports. apps/admin is untouched; plan 22-04 will rewire consumers.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create ui-kit skeleton + tokens + utils + README | `5be8b37` | tokens.css, tokens/index.ts, lib/utils.ts, README.md |
| 2 | Copy 8 shadcn primitives into ui-kit/primitives | `f42a206` | button, card, input, table, badge, dialog, select, sonner, index.ts |

Both commits live in the **hub repo** (`/Users/admin/hub`, branch `master`) because the target path `knowledge/standards/ui-kit/` belongs to hub, not the homelab worktree. Pushed to origin.

## Cross-Repo Note

Plan's `files_modified` paths all point at `/Users/admin/hub/knowledge/standards/ui-kit/` — a hub-repo tree. The homelab worktree only consumed it (read apps/admin sources for verbatim copy). No files in `workspace/homelab/` were modified by this plan; the homelab `.planning/phases/22-security-review-launch/22-01-SUMMARY.md` (this file) is the only homelab-side artifact.

## Verification

- `ls -R /Users/admin/hub/knowledge/standards/ui-kit/` — all expected files and subdirs present (tokens/, primitives/, molecules/, lib/).
- `grep -c '../lib/utils' primitives/*.tsx` — 7 primitives import from `../lib/utils` (sonner doesn't use cn; expected).
- `grep '@/lib/utils' primitives/*.tsx` — no matches (good).
- `grep '@theme' tokens/tokens.css` — matches.
- `grep 'tailwind-merge' lib/utils.ts` — matches.

## Deviations from Plan

### 1. [Rule 1 — Documentation] @theme directive shape

- **Found during:** Task 1 verify step.
- **Issue:** Plan's `<verify>` and README spec said to grep for `@theme inline` and to copy the `@theme inline` block. The real `apps/admin/app/globals.css` uses `@theme {` (not `@theme inline { … }`). Plan text was slightly stale vs. source.
- **Fix:** Copied the actual `@theme { … }` block verbatim per the stronger instruction ("verbatim from apps/admin/app/globals.css"). Verify check relaxed to `grep '@theme'` which matches both forms.
- **Files modified:** `tokens/tokens.css`.
- **Verification:** `grep -q '@theme' tokens/tokens.css` passes; content byte-identical to admin source (minus `@import "tailwindcss";`).
- **Commit:** `5be8b37`.

### 2. [Rule 3 — Infra] No `typecheck` script in apps/admin

- **Found during:** final verification.
- **Issue:** Plan's verification step calls `cd apps/admin && bun run typecheck` — no such script exists in apps/admin/package.json.
- **Fix:** Skipped. Justification: this plan creates new files outside apps/admin and does NOT touch anything admin imports. apps/admin cannot regress because its imports (`@/lib/utils`, `@/components/ui/*`) are unchanged.
- **Follow-up:** plan 22-04 (consumer rewire) will be the real regression gate — at that point admin's typecheck/build MUST pass.

**Total deviations:** 2 auto-fixed (1 doc/stale-spec, 1 missing infra). **Impact:** None on deliverable; both are plan-text drift and do not affect the shared ui-kit output.

## Authentication Gates

None.

## Deferred Issues

None.

## Key Links Verified

- `primitives/*.tsx` → `lib/utils.ts` via `import { cn } from "../lib/utils"` (matches `key_links` regex `from ['\"]\\.\\./lib/utils['\"]` in 7/7 cn-using primitives).

## TDD Gate Compliance

N/A — plan is `type: execute`, not `type: tdd`. No RED/GREEN gate required.

## Self-Check: PASSED

- [x] All 13 target files exist on disk at `/Users/admin/hub/knowledge/standards/ui-kit/…`
- [x] Both commits present in hub `master`: `5be8b37`, `f42a206`
- [x] Barrel `primitives/index.ts` exports all 8 names
- [x] No primitive imports `@/lib/utils`
- [x] README documents relative-import + no-build + no-versioning (D-22-02, D-22-05)
- [x] apps/admin sources untouched (no modifications recorded)

Ready for **22-02** (next wave 1 plan per ROADMAP).
