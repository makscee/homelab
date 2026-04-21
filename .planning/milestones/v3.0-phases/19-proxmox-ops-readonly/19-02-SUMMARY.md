---
phase: 19-proxmox-ops-readonly
plan: 02
subsystem: apps/admin/api/proxmox
tags: [proxmox, nextjs, api, undici, tls, zod, read-only]
dependency_graph:
  requires:
    - Plan 19-01 env vars (PROXMOX_API_BASE, PROXMOX_TOKEN_ID, PROXMOX_TOKEN_SECRET, PROXMOX_CA_PATH)
    - undici (added as direct dep; Node bundled version is 8.1.0)
  provides:
    - apps/admin/lib/proxmox.server.ts — pveGet<T>(path) + PveError
    - GET /api/proxmox/lxcs
    - GET /api/proxmox/lxcs/{vmid}
    - GET /api/proxmox/lxcs/{vmid}/tasks
    - GET /api/proxmox/lxcs/{vmid}/tasks/{upid}/log
  affects:
    - Plan 19-03 UI consumes all four routes via SWR
tech_stack:
  added: [undici@8.1.0]
  patterns: [ca-pinned-undici-agent, pveapi-token-header, zod-path-params, pve-envelope-unwrap, encodeURIComponent-upid]
key_files:
  created:
    - apps/admin/lib/proxmox.server.ts
    - apps/admin/lib/proxmox.server.test.ts
    - apps/admin/app/api/proxmox/lxcs/route.ts
    - apps/admin/app/api/proxmox/lxcs/route.test.ts
    - apps/admin/app/api/proxmox/lxcs/[vmid]/route.ts
    - apps/admin/app/api/proxmox/lxcs/[vmid]/route.test.ts
    - apps/admin/app/api/proxmox/lxcs/[vmid]/tasks/route.ts
    - apps/admin/app/api/proxmox/lxcs/[vmid]/tasks/route.test.ts
    - apps/admin/app/api/proxmox/lxcs/[vmid]/tasks/[upid]/log/route.ts
    - apps/admin/app/api/proxmox/lxcs/[vmid]/tasks/[upid]/log/route.test.ts
  modified:
    - apps/admin/package.json
    - bun.lock
decisions:
  - "D-07 enforced — all fetches via undici.Agent with connect.ca pinned; no TLS-verify bypass anywhere in apps/admin or ansible"
  - "PROXMOX_TLS_SERVERNAME override NOT needed — tower cert SAN includes DNS:tower (confirmed in 19-01-SUMMARY); env var supported but left unset"
  - "Per-vmid status/current failure in list route falls back to stub fields rather than failing the whole list (resilience over strictness for the overview)"
  - "UPID regex allows [A-Za-z0-9:_.\\-@] to cover PVE's user@realm suffix; encodeURIComponent still applied at URL build time (Pitfall #5)"
  - "Routes return 502 with code field (PVE_UNREACHABLE | PVE_AUTH | PVE_HTTP) so UI can render targeted degraded states"
metrics:
  duration: ~25 min
  completed: 2026-04-19
  tasks: 3
  files_created: 10
  files_modified: 2
  commits: 3
  tests_added: 20
requirements: [PROXMOX-01, PROXMOX-05, PROXMOX-06]
---

# Phase 19 Plan 02: Proxmox API proxy routes — Summary

One-liner: Server-only CA-pinned Proxmox client (`pveGet` / `PveError`) plus four auth-gated, zod-validated GET proxy routes (`/api/proxmox/lxcs` + `/{vmid}` + `/{vmid}/tasks` + `/{vmid}/tasks/{upid}/log`) ready for the UI in Plan 03.

## Task Commits

| # | Task | Commit |
|---|------|--------|
| 1 | Client lib + CA-pinned undici Agent + tests | `737334e` |
| 2 | GET /api/proxmox/lxcs list route + tests | `8313b6d` |
| 3 | [vmid], tasks, and task-log routes + tests | `9b9dbf9` |

## Route Response Shapes (for Plan 03)

### `GET /api/proxmox/lxcs`

```jsonc
{
  "data": [
    {
      "vmid": "100",
      "name": "docker-tower",
      "status": "running",
      "maxmem": 8589934592, "maxdisk": 107374182400,
      // merged from /status/current:
      "cpu": 0.12, "cpus": 4, "mem": 2147483648, "uptime": 3600
      // ...other PVE stub fields pass through
    }
  ]
}
```

### `GET /api/proxmox/lxcs/{vmid}`

```jsonc
{
  "data": {
    "config": { "net0": "name=eth0,bridge=vmbr0,hwaddr=...,ip=10.10.20.100/24,gw=10.10.20.1", "hostname": "docker-tower", "...": "..." },
    "status": { "status": "running", "uptime": 3600, "...": "..." },
    "network": { "name": "eth0", "bridge": "vmbr0", "hwaddr": "BC:24:11:...", "ip": "10.10.20.100/24", "gw": "10.10.20.1" }
  }
}
```

Missing net0 fields render as `null` (defensive, Pitfall A3).

### `GET /api/proxmox/lxcs/{vmid}/tasks`

```jsonc
{
  "data": [
    { "upid": "UPID:tower:...", "type": "vzstart", "status": "OK", "starttime": 1700000000, "endtime": 1700000003, "user": "root@pam" }
  ]
}
```

Last 20 tasks for that vmid.

### `GET /api/proxmox/lxcs/{vmid}/tasks/{upid}/log`

```jsonc
{ "data": [ { "n": 1, "t": "starting container" }, { "n": 2, "t": "..." } ] }
```

First 500 log lines.

## Error Responses

| Status | Body | Trigger |
|--------|------|---------|
| 401 | `{ "error": "unauthorized" }` | No NextAuth session |
| 400 | `{ "error": "invalid vmid" }` / `{ "error": "invalid params" }` | Zod regex mismatch on path params |
| 502 | `{ "error": "tower unreachable", "code": "PVE_UNREACHABLE" }` | ECONNREFUSED / ETIMEDOUT / ENOTFOUND from tower |
| 502 | `{ "error": "proxmox error", "code": "PVE_AUTH" }` | Tower rejected token (401/403) |
| 502 | `{ "error": "proxmox error", "code": "PVE_HTTP" }` | Other PVE non-2xx |

## PROXMOX_TLS_SERVERNAME

**Not needed.** Plan 19-01 confirmed tower cert SAN contains `DNS:tower`, which matches the default SNI undici derives from `PROXMOX_API_BASE=https://tower:8006/api2/json`. The env var is still plumbed through `lib/proxmox.server.ts::loadAgent` for operator override if a future SAN change is introduced.

## Sample curl against live tower (via mcow env)

```bash
# executed over Tailnet from this workstation → mcow → tower:8006
$ ssh root@mcow '. /etc/homelab-admin/env && curl -sS --cacert "$PROXMOX_CA_PATH" \
  -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN_ID=$PROXMOX_TOKEN_SECRET" \
  "$PROXMOX_API_BASE/nodes/tower/lxc" | head -c 300'

{"data":[{"diskwrite":5724139520,"maxmem":4294967296,"vmid":203, ..., "name":"cc-yuri", ..., "status":"running", ...}, ...]}
```

LXC list returns live data; CA pin (`--cacert`) and token header (`PVEAPIToken=ID=SECRET` literal-`=`) are exactly the contract the TypeScript client implements.

## Deviations from Plan

### Rule 3 (unblocker): add `undici` as direct dep

- **Found during:** Task 1
- **Issue:** `lib/proxmox.server.ts` imports `{ Agent } from "undici"`, but `undici` was not in `apps/admin/package.json`. Node ships undici internally but the package path is not resolvable without an explicit dep.
- **Fix:** `bun add undici` → `undici@8.1.0` pinned.
- **Files modified:** `apps/admin/package.json`, `bun.lock`
- **Commit:** folded into `737334e`

### Rule 2 (critical): per-vmid stat failure in list route

- **Found during:** Task 2 design
- **Issue:** Plan said "fetch status/current for each in parallel." If any one `/status/current` hop fails (tower flaky, LXC stuck), the entire list would error out and the UI couldn't render any LXCs.
- **Fix:** Wrap each `pveGet` in try/catch; return the stub with just the vmid normalized when the per-row fetch fails. The top-level PveError is still surfaced for the outer `/nodes/tower/lxc` call (the actual "tower unreachable" case).
- **Rationale:** Per D-09 (tower-down must not crash dashboard) — partial degradation is strictly better than full failure for the overview.

### Next.js 15 dynamic params shape

- **Note:** In Next.js 15 the route handler's second arg is `{ params: Promise<{...}> }` (not plain object). All three dynamic routes `await context.params` before zod-parsing. No plan deviation — just implementation detail.

## Known Stubs

None. All four routes are wired to live `pveGet` with no placeholders. Plan 03 consumes the real shapes.

## Threat Flags

None — all surface is within the plan's `<threat_model>` (T-19-06 through T-19-11).

## Verification

- `bun test lib/proxmox.server.test.ts` → 5 pass
- `bun test app/api/proxmox/` → 20 pass total (5 client + 4 list + 5 detail + 4 tasks + 5 log; some tests cover helper `parseNet0`)
- `bunx tsc --noEmit` in `apps/admin/` → clean
- `grep -r NODE_TLS_REJECT_UNAUTHORIZED apps/admin/ ansible/` → empty
- Live curl through mcow's provisioned env against tower:8006 → returns real LXC list (cc-yuri, etc.)

## Self-Check: PASSED

- `apps/admin/lib/proxmox.server.ts` — FOUND
- `apps/admin/lib/proxmox.server.test.ts` — FOUND
- `apps/admin/app/api/proxmox/lxcs/route.ts` — FOUND
- `apps/admin/app/api/proxmox/lxcs/[vmid]/route.ts` — FOUND
- `apps/admin/app/api/proxmox/lxcs/[vmid]/tasks/route.ts` — FOUND
- `apps/admin/app/api/proxmox/lxcs/[vmid]/tasks/[upid]/log/route.ts` — FOUND
- Commit `737334e` — FOUND
