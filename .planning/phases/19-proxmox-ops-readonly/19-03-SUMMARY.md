---
phase: 19-proxmox-ops-readonly
plan: 03
subsystem: admin-ui
tags: [nextjs, react, proxmox, ui, observability, playwright]
requires:
  - phase-19-02: proxmox API proxy routes (lxcs, [vmid], tasks, task log)
provides:
  - admin-ui-proxmox-list: "/proxmox — operator-facing LXC list with 10s polling"
  - admin-ui-proxmox-detail: "/proxmox/[vmid] — detail panel with network, config, recent tasks + click-to-expand log"
affects:
  - apps/admin (Next.js 15 / React 19)
tech-stack:
  added: []
  patterns:
    - "Server Component initial fetch + Client Component polling (mirror /audit pattern)"
    - "shadcn Alert/Badge/Button/Table reused — no new UI primitives"
    - "Last-known-good data retained on tower-down; red banner shown above (D-09)"
key-files:
  created:
    - apps/admin/app/(auth)/proxmox/proxmox-list.client.tsx
    - apps/admin/app/(auth)/proxmox/[vmid]/page.tsx
    - apps/admin/app/(auth)/proxmox/[vmid]/proxmox-detail.client.tsx
    - apps/admin/e2e/proxmox-list.spec.ts
    - apps/admin/e2e/proxmox-detail.spec.ts
  modified:
    - apps/admin/app/(auth)/proxmox/page.tsx (replaced ComingSoon with real page)
    - apps/admin/lib/proxmox.server.ts (added parseNet0 export)
    - apps/admin/app/api/proxmox/lxcs/[vmid]/route.ts (import parseNet0 from lib)
    - apps/admin/app/api/proxmox/lxcs/[vmid]/route.test.ts (local helpers)
    - apps/admin/app/api/proxmox/lxcs/route.test.ts (mock includes parseNet0)
    - apps/admin/app/api/proxmox/lxcs/[vmid]/tasks/route.test.ts (mock includes parseNet0)
    - apps/admin/app/api/proxmox/lxcs/[vmid]/tasks/[upid]/log/route.test.ts (mock includes parseNet0)
decisions:
  - "Moved parseNet0 from route.ts to lib/proxmox.server.ts — Next 15 rejects non-route exports from route files (Rule 3 blocking fix)"
  - "Playwright specs written as forward-looking regression guardrails (skip when PW_SESSION_COOKIE unset); live UAT via Playwright MCP against homelab.makscee.ru is the Phase 19-03 primary gate"
metrics:
  duration: 35m
  completed: 2026-04-19
requirements: [PROXMOX-01, PROXMOX-05]
---

# Phase 19 Plan 03: Proxmox UI Pages Summary

**One-liner:** Built `/proxmox` LXC list + `/proxmox/[vmid]` detail pages on the admin dashboard with 10s / 30s polling, shadcn visual parity to /audit + /alerts, click-to-expand task logs, and tower-unreachable banners preserving last-known-good data.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `4fe132a` | feat(19-03): build /proxmox list page + move parseNet0 to lib |
| 2 | `dcfb80d` | feat(19-03): build /proxmox/[vmid] detail page |
| 3 | `b56c997` | test(19-03): add Playwright smoke specs for /proxmox + /proxmox/[vmid] |

## Verification

### Automated gates

- `bun run lint` — PASSED (no warnings/errors)
- `bun run build` — PASSED (/proxmox = 4.13 kB, /proxmox/[vmid] = 4.74 kB First Load)
- `bun test app/api/proxmox` — 20/20 PASS
- `grep -r "NODE_TLS_REJECT_UNAUTHORIZED" apps/admin/ ansible/` — EMPTY (PROXMOX-06 criterion)

### Deploy

- Playbook: `ansible/playbooks/deploy-homelab-admin.yml` — 32 ok, 6 changed
- Commit `dcfb80d` live on mcow as of 2026-04-19
- Local `/api/health`: `{"ok":true,"commit_sha":"dcfb80d"}`
- Public `/api/health` via `https://homelab.makscee.ru`: 200 ok=true
- `/api/proxmox/lxcs` (unauth): 307 → /login (as expected)

### Playwright specs

- `apps/admin/e2e/proxmox-list.spec.ts` — skip when `PW_SESSION_COOKIE` env unset
- `apps/admin/e2e/proxmox-detail.spec.ts` — skip when `PW_SESSION_COOKIE` env unset
- Primary live-gate is Playwright MCP against https://homelab.makscee.ru driven interactively by the operator during the Task 4 checkpoint (per project memory `feedback_test_with_playwright`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Move `parseNet0` out of Next 15 route file**
- **Found during:** Task 1 `bun run build`
- **Issue:** Build failed — `"parseNet0" is not a valid Route export field. app/api/proxmox/lxcs/[vmid]/route.ts does not match the required types of a Next.js Route.` Next 15 disallows non-route exports (GET/POST/runtime/etc.) from `route.ts` files.
- **Fix:** Moved the `parseNet0(raw)` helper from `app/api/proxmox/lxcs/[vmid]/route.ts` into `lib/proxmox.server.ts` (the existing Proxmox helper module). Route file now imports it. Updated the route test to define a local helper and import via the mock. Updated sibling route tests' `mock.module('@/lib/proxmox.server', ...)` factories to also export `parseNet0` so bun's mock registry remains consistent across the proxmox test suite (fixed cross-test-file cache leakage).
- **Files modified:** `lib/proxmox.server.ts`, `app/api/proxmox/lxcs/[vmid]/route.ts`, all four proxmox route test files
- **Commit:** `4fe132a`

## Live UAT — Task 4 checkpoint

**Status:** AWAITING OPERATOR SIGN-OFF

Deploy is live. Operator must visually verify on `https://homelab.makscee.ru/proxmox` and `/proxmox/101`, drive Playwright MCP if desired, and check visual parity against /audit + /alerts. See checkpoint return message for exact steps.

## Known Stubs

None — both pages wire real data from the Plan 19-02 API routes. Empty states are intentional (no rows vs. no tasks handled).

## Self-Check: PASSED

- FOUND: apps/admin/app/(auth)/proxmox/proxmox-list.client.tsx
- FOUND: apps/admin/app/(auth)/proxmox/[vmid]/page.tsx
- FOUND: apps/admin/app/(auth)/proxmox/[vmid]/proxmox-detail.client.tsx
- FOUND: apps/admin/e2e/proxmox-list.spec.ts
- FOUND: apps/admin/e2e/proxmox-detail.spec.ts
- FOUND commit: 4fe132a
- FOUND commit: dcfb80d
- FOUND commit: b56c997
