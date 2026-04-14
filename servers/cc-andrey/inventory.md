# cc-andrey

**Role:** Developer worker LXC on tower
**Proxmox VMID:** 200
**LXC config:** [../tower/lxc-200-cc-andrey.conf](../tower/lxc-200-cc-andrey.conf)
**Hypervisor:** tower (100.101.0.7)

## Network

| Field | Value |
|-------|-------|
| Internal IP (bridge) | 10.10.20.200/24 (vmbr1, gw 10.10.20.1) |
| Tailscale IP | — |
| External SSH | `ssh andrey@95.31.38.176 -p 2201` (router 2201 → tower:2200 → 10.10.20.200:22) |

## Resources

| Field | Value |
|-------|-------|
| Cores | 4 |
| Memory (MB) | 4096 |
| Rootfs | local-lvm:vm-200-disk-0, size=8G |
| OS | debian (unprivileged) |

## Purpose

Dev worker LXC for Andrey's Claude Code sessions. Not a homelab service; owner manages lifecycle. Exposed externally via router port-forward 2201 so Andrey can SSH without needing Tailscale.

## Services

Not a homelab service host — no services documented in this repo.

## History

- 2026-04-14: Inventoried during Phase 2 (SVC-08).

## Orphaned backup LXC (VMID 201)

VMID 201 is a duplicate cc-andrey container with no external port forward. Stopped via
`pct stop 201` on 2026-04-14 (Plan 01 Task 4). Disk retained. Not captured as a .conf
file per D-15 — out of scope for SVC-03.
