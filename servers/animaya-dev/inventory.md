# animaya-dev

**Role:** Developer worker LXC on tower
**Proxmox VMID:** 205
**LXC config:** [../tower/lxc-205-animaya-dev.conf](../tower/lxc-205-animaya-dev.conf)
**Hypervisor:** tower (100.101.0.7)

## Network

| Field | Value |
|-------|-------|
| Internal IP (bridge) | 10.10.20.205/24 (vmbr1, gw 10.10.20.1) |
| Tailscale IP | 100.119.15.122 |
| External SSH | — (reach via Tailnet) |

## Resources

| Field | Value |
|-------|-------|
| Cores | 4 |
| Memory (MB) | 4096 |
| Rootfs | local-lvm:vm-205-disk-0, size=8G |
| OS | debian (unprivileged) |

## Purpose

Dev worker LXC for Animaya development. Not a homelab service; owner manages lifecycle. Joined to Tailnet for direct operator access.

## Services

Not a homelab service host — no services documented in this repo.

## History

- 2026-04-14: Inventoried during Phase 2 (SVC-08).
