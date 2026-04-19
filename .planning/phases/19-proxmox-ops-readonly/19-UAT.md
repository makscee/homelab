---
status: testing
phase: 19-proxmox-ops-readonly
source:
  - 19-01-SUMMARY.md
  - 19-02-SUMMARY.md
  - 19-03-SUMMARY.md
started: 2026-04-19T11:00:00Z
updated: 2026-04-19T11:00:00Z
---

## Current Test

number: 1
name: /proxmox list page renders live LXCs
expected: |
  Navigate to https://homelab.makscee.ru/proxmox (logged in). Page shows a table of
  LXCs from tower (vmid, name, status badge, cpu, mem). Rows populate within a few
  seconds. Visual parity with /audit and /alerts (same shadcn Table, Badge styling).
awaiting: user response

## Tests

### 1. /proxmox list page renders live LXCs
expected: Table of LXCs from tower with vmid/name/status/cpu/mem. Visual parity with /audit.
result: [pending]

### 2. /proxmox list polls every 10s
expected: After initial render, data refreshes silently every ~10s without full page reload.
result: [pending]

### 3. /proxmox/[vmid] detail page
expected: Click a row (or navigate /proxmox/101) — detail panel shows network (eth0/bridge/ip/gw), config, status, recent tasks list.
result: [pending]

### 4. Click-to-expand task log
expected: In detail page tasks list, clicking a task row expands inline log (first 500 lines).
result: [pending]

### 5. Tower-unreachable banner
expected: If tower becomes unreachable, a red banner appears above the table/detail; last-known-good data stays visible below (not blanked out).
result: [pending]

### 6. Unauth API returns redirect
expected: `curl -sI https://homelab.makscee.ru/api/proxmox/lxcs` returns 307 → /login.
result: pass
verified: auto — 2026-04-19 curl returned HTTP/2 307

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0

## Gaps

[none yet]
