---
phase: 19-proxmox-ops-readonly
status: discussed
discussed: 2026-04-19
---

# Phase 19 — Proxmox Ops (read-only)

## Phase Boundary

Operator can open `/proxmox` in the admin dashboard on mcow and see a live, read-only list of all LXCs on tower with their health/resources, plus drill into a detail panel showing config dump, recent task log, and network info. No destructive or mutating operations from the dashboard — all state changes (start/stop/spawn/destroy) remain in the Proxmox web UI. Goal is observability + stability check, not remote control.

## Scope (IN)

- **PROXMOX-01** `/proxmox` page lists LXCs on tower: vmid, hostname, status (running/stopped), cpu/mem/disk config, current uptime. Polling auto-refresh.
- **PROXMOX-05** LXC detail panel (modal or `/proxmox/{vmid}`): config dump, recent task log tail, network info (IP, bridge, MAC).
- **PROXMOX-06** Proxmox API token `dashboard-operator@pve!readonly`, role scoped to `VM.Audit` + `Datastore.Audit` ONLY (no `VM.PowerMgmt`). Token + CA cert in SOPS. CA cert pinned via `tls.createSecureContext` + `undici.Agent` — never `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Scope (OUT — deferred)

- **PROXMOX-02** start/shutdown/restart/hard-stop — deferred; operator uses Proxmox web UI for power ops
- **PROXMOX-03** spawn new LXC from template — deferred; use Proxmox web UI
- **PROXMOX-04** destroy LXC — deferred; use Proxmox web UI

These remain in REQUIREMENTS.md but are re-scoped as "future phase 19.x / deferred" pending operator demand.

## Key Decisions

- **D-01 Proxmox API client:** raw `fetch` (Bun native) with `Authorization: PVEAPIToken=<user>@pve!<tokenid>=<secret>` header. CA pinned via `tls.createSecureContext({ca: readFileSync(caPath)})` passed to `undici.Agent`. No third-party proxmox client npm (ecosystem is stale).
- **D-02 Token provisioning:** Ansible Plan 01 creates `dashboard-operator@pve` user, `DashboardReadOnly` role (`VM.Audit`+`Datastore.Audit`), token `readonly`, writes token secret + tower CA cert into `secrets/mcow.sops.yaml`. No manual operator ops.
- **D-03 Token role:** strictly read-only. If future phase needs power ops, a separate role/token is added — keeps this phase's blast radius nil.
- **D-04 Auto-refresh cadence:** list page 10s poll, detail panel 30s poll. Manual refresh button on both. No SSE.
- **D-05 Audit log:** no writes in this phase; audit-log integration skipped. Re-introduced if PROXMOX-02 is ever un-deferred.
- **D-06 Route:** `/proxmox` list, `/proxmox/[vmid]` detail. Under existing auth-gated layout in `apps/admin/app/(auth)/`.
- **D-07 API proxy routes:** `/api/proxmox/lxcs` (list), `/api/proxmox/lxcs/[vmid]` (config + network), `/api/proxmox/lxcs/[vmid]/tasks` (recent task log). Server-side only — client never sees token or talks to tower directly.
- **D-08 Detail panel log:** pulls last N tasks from `/nodes/tower/tasks?vmid={id}&limit=20`, shows one-click task log expansion. No live shell (Phase 21 Web Terminal covers that).
- **D-09 Error surfacing:** network errors (tower unreachable, token expired, CA mismatch) render a red banner with actionable message ("tower unreachable via Tailnet", "token rejected — check SOPS"). Dashboard must remain usable even if tower is down.

## Requirements → In-Scope / Deferred

| Req | Status | Notes |
|-----|--------|-------|
| PROXMOX-01 | IN | list page |
| PROXMOX-02 | DEFERRED | power ops stay in Proxmox web UI |
| PROXMOX-03 | DEFERRED | spawn via Proxmox web UI |
| PROXMOX-04 | DEFERRED | destroy via Proxmox web UI |
| PROXMOX-05 | IN | detail panel (read-only) |
| PROXMOX-06 | IN (modified) | role scoped tighter: VM.Audit + Datastore.Audit only, no PowerMgmt |

## Open Questions

None — ready for research + plan.

## Success Criteria

- `/proxmox` renders live list from tower via Tailnet with CA-pinned TLS
- Detail panel shows config + recent task log + network info
- `dashboard-operator@pve!readonly` token exists on tower, provisioned via Ansible (idempotent)
- Tower CA cert pinned — `NODE_TLS_REJECT_UNAUTHORIZED=0` absent from repo grep
- No mutation routes, no audit-log writes from this phase
- Playwright smoke: `/proxmox` loads, at least 3 LXC rows visible (CT 100, 101, 204 minimum), detail panel opens for CT 101

## Dependencies

- Phase 12 (infra foundation — auth, SOPS, audit infra)
- Phase 14 (global overview — shares layout, Tailnet-aware fetch patterns)
- Tower Proxmox API reachable via Tailnet at `https://tower:8006/api2/json` (mcow → tower)

## Patterns to Follow

- `apps/admin/app/api/tokens/` — mcow-side API proxy route pattern (auth check → SOPS secret load → upstream fetch → typed response)
- `ansible/playbooks/deploy-homelab-admin.yml` + `secrets/mcow.sops.yaml` — token/cert provisioning pattern
- `apps/admin/app/(auth)/voidnet/users/` — list + detail page pattern (if present)
