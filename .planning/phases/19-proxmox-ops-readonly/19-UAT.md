---
status: complete
phase: 19-proxmox-ops-readonly
source:
  - 19-01-SUMMARY.md
  - 19-02-SUMMARY.md
  - 19-03-SUMMARY.md
started: 2026-04-19T11:00:00Z
updated: 2026-04-21T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. /proxmox list page renders live LXCs
expected: Table of LXCs from tower with vmid/name/status/cpu/mem. Visual parity with /audit.
result: pass
verified: auto — Playwright MCP 2026-04-19 14:13 UTC. Table rendered rows for vmid 100 (docker) and 101 (jellyfin) with status=running, cpus, memory, uptime. /api/proxmox/lxcs returned 200.

### 2. /proxmox list polls every 10s
expected: After initial render, data refreshes silently every ~10s without full page reload.
result: pass
verified: auto — "Last updated" timestamp advanced from 5:14:26 PM → 5:14:36 PM over a 15s wait (exactly one poll cycle), no full reload.

### 3. /proxmox/[vmid] detail page
expected: Click a row (or navigate /proxmox/101) — detail panel shows network (eth0/bridge/ip/gw), config, status, recent tasks list.
result: pass
verified: auto — /proxmox/101 rendered "LXC 101 — jellyfin", Network block (eth0/vmbr1/BC:24:11:C7:37:75/10.10.20.11 per 24/gw 10.10.20.1), "Config dump (19 keys)" details, Recent Tasks section.

### 4. Click-to-expand task log
expected: In detail page tasks list, clicking a task row expands inline log (first 500 lines).
result: skipped
reason: tower returned no recent tasks for vmid 100 or 101 at test time — nothing to click. Click-handler logic is covered by route.test.ts and the Playwright spec (apps/admin/e2e/proxmox-detail.spec.ts) kept as a forward-looking regression guardrail.

### 5. Tower-unreachable banner
expected: If tower becomes unreachable, a red banner appears above the table/detail; last-known-good data stays visible below (not blanked out).
result: skipped
reason: requires taking tower down; not exercised in live UAT. D-09 banner logic unit-tested in proxmox-list.client behavior and covered by integration test scaffolding.

### 6. Unauth API returns redirect
expected: `curl -sI https://homelab.makscee.ru/api/proxmox/lxcs` returns 307 → /login.
result: pass
verified: auto — 2026-04-19 curl returned HTTP/2 307

## Summary

total: 6
passed: 4
issues: 0
pending: 0
skipped: 2

## Gaps

### G1 — bun 1.1.38 parser bug (RESOLVED)
mcow runs bun 1.1.38 (pinned by QEMU CPU lacking AVX/SSE4.2; newer bun segfaults).
Proxmox routes returned 500 "Unexpected token ','" on require. Root cause: the
pveGet catch block had two identical `throw new PveError(...)` statements; Next's
SWC minifier collapses them into `throw (cond, new PveError(...))`. Bun 1.1.38's
CommonJS require parser rejects that form (Node, Bun.Transpiler, and newer bun all
accept it). Fixed by collapsing the branch to a single throw (commit 78d0abb)
plus an in-source note documenting the hazard.

### G2 — undici bundling (RESOLVED)
Bun's `require("undici")` returns its own builtin Agent/fetch shim, not the
userland package. The shim's Agent ignored `connect.ca`, causing
UNABLE_TO_VERIFY_LEAF_SIGNATURE even though `tls.connect` with the same CA
authorizes. Fixed by letting webpack inline undici@6 (removed serverExternalPackages:
['undici'] added earlier in commit ed3ac49; final state in commit 28b1d77).
Also downgraded undici 8 → 6 since 8 calls webidl.util.markAsUncloneable which
is unimplemented in bun 1.1.38 (commit 3303409).
