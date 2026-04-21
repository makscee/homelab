---
phase: 12-infra-foundation
plan: "07"
subsystem: ops-infra
tags: [systemd, hardening, mcow, homelab-admin, inventory]
dependency_graph:
  requires: [12-03]
  provides: [homelab-admin-service-unit, mcow-port-3847-registered]
  affects: [12-09-PLAN.md]
tech_stack:
  added: []
  patterns: [systemd-strict-hardening, dedicated-service-user]
key_files:
  created:
    - servers/mcow/homelab-admin.service
  modified:
    - servers/mcow/inventory.md
decisions:
  - "KVM confirmed (Plan 12-03) — full strict hardening block used: ProtectSystem=strict + PrivateTmp=yes + ProtectKernelTunables=yes + ProtectControlGroups=yes"
  - "ExecStart uses bun run start (respects package.json) rather than direct next binary"
  - "Restart=on-failure (not always) — avoids crash-loop pinning CPU; self-heals on transient failures"
metrics:
  duration_minutes: 8
  completed_date: "2026-04-17"
  tasks_completed: 2
  files_changed: 2
---

# Phase 12 Plan 07: systemd Unit File + Inventory Update Summary

**One-liner:** homelab-admin.service authored with KVM strict hardening (ProtectSystem=strict, PrivateTmp, ProtectKernelTunables) — runs as homelab-admin user on 127.0.0.1:3847; mcow inventory updated.

## What Was Done

- **Task 1:** Created `servers/mcow/homelab-admin.service` — full strict systemd hardening block transcribed from `lxc-probe.md` KVM recommendation. Unit runs as `homelab-admin:homelab-admin`, binds to `127.0.0.1:3847` via env, sources `/etc/homelab-admin/env` for secrets, `Restart=on-failure` with 5s backoff.
- **Task 2:** Updated `servers/mcow/inventory.md` — added Port Allocation table (port 3847 → homelab-admin, 127.0.0.1) and Systemd Services section with full homelab-admin.service entry (bind, user, install dir, env file, public hostname, status note).

## Privilege Level + Hardening Block Selected

**mcow virtualization type:** KVM (per `servers/mcow/lxc-probe.md`, Plan 12-03)

**Active hardening block transcribed:**
```ini
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ProtectKernelTunables=yes
ProtectControlGroups=yes
ReadWritePaths=/opt/homelab-admin/app/.next /tmp
```

**P-15 degraded path:** NOT used. P-15 only applies to unprivileged LXC containers. mcow is a KVM VM with full Ubuntu 24.04 kernel — all strict directives are safe.

## systemd-analyze verify

`systemd-analyze verify` was not run on the operator laptop (macOS — systemd not available). Syntax correctness verified by grep assertions (all required directives present, exactly one `ProtectSystem=` line). The unit will be validated on first `systemctl daemon-reload` during Plan 09 deploy.

## Deviations from Plan

None — plan executed exactly as written. KVM probe result was already baked into plan context via 12-03-SUMMARY.md decision.

## Known Stubs

None — this plan produces only infrastructure artifact files, no UI or data-flow stubs.

## Threat Flags

None — no new network endpoints introduced. Port 3847 is loopback-only (127.0.0.1); exposure via Caddy is Plan 09's scope.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 45c6632 | feat(12-07): author homelab-admin.service with KVM strict systemd hardening |
| 2 | 160e55f | docs(12-07): register port 3847 + homelab-admin.service in mcow inventory |

## Self-Check: PASSED

- `servers/mcow/homelab-admin.service` exists and contains `User=homelab-admin`, `ProtectSystem=strict`, `EnvironmentFile=/etc/homelab-admin/env`, `PORT=3847`, `Restart=on-failure` ✓
- `servers/mcow/inventory.md` contains `3847`, `homelab-admin`, `127.0.0.1`, `/etc/homelab-admin/env` ✓
- Commits 45c6632 and 160e55f exist in git log ✓
