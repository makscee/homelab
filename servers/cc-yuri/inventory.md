# cc-yuri

**Role:** Developer worker LXC on tower
**Proxmox VMID:** 203
**LXC config:** [../tower/lxc-203-cc-yuri.conf](../tower/lxc-203-cc-yuri.conf)
**Hypervisor:** tower (100.101.0.7)

## Network

| Field | Value |
|-------|-------|
| Internal IP (bridge) | 10.10.20.203/24 (vmbr1, gw 10.10.20.1) |
| Tailscale IP | — |
| External SSH | — |

## Resources

| Field | Value |
|-------|-------|
| Cores | 4 |
| Memory (MB) | 4096 |
| Rootfs | local-lvm:vm-203-disk-0, size=8G |
| OS | debian (unprivileged) |

## Purpose

Dev worker LXC for Yuri's Claude Code sessions. Not a homelab service; owner manages lifecycle. Reachable from the LAN / Tailnet via tower only.

## Services

Not a homelab service host — no services documented in this repo.

## History

- 2026-04-14: Inventoried during Phase 2 (SVC-08).
