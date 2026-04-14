# tower — Proxmox VE Host

## Overview

`tower` (Tailscale IP `100.101.0.7`, i7-8700 12C, 16 GB RAM, Moscow) is the Proxmox VE
hypervisor for the homelab. It currently runs 7 LXCs (one stopped, retained as backup):
one production media host, one operator runner, four developer-worker containers, and
one duplicate orphan.

Access:

```
ssh root@tower               # over Tailnet
ssh root@100.101.0.7         # IP form
```

Authoritative source for container state is the Proxmox CLI (`pct`). Repo
`servers/tower/lxc-<vmid>-<hostname>.conf` files are snapshots of `pct config <vmid>`
output at the timestamp of the last refresh (see D-03).

## LXC map

| VMID | Hostname | Config | Inventory | Tailscale | Notes |
|------|----------|--------|-----------|-----------|-------|
| 100 | docker-tower | [lxc-100-docker-tower.conf](lxc-100-docker-tower.conf) | [servers/docker-tower/inventory.md](../docker-tower/inventory.md) | 100.101.0.8 | Media stack (Jellyfin, Navidrome, *arr, qBittorrent) |
| 200 | cc-andrey | [lxc-200-cc-andrey.conf](lxc-200-cc-andrey.conf) | [servers/cc-andrey/inventory.md](../cc-andrey/inventory.md) | — | Dev worker; SSH via tower:2201 (router 2201 → tower:2200 → 10.10.20.200:22) |
| 201 | (orphaned cc-andrey dup) | — | noted in [servers/cc-andrey/inventory.md](../cc-andrey/inventory.md) | — | Stopped 2026-04-14, disk retained (D-15) |
| 202 | cc-dan | [lxc-202-cc-dan.conf](lxc-202-cc-dan.conf) | [servers/cc-dan/inventory.md](../cc-dan/inventory.md) | — | Dev worker |
| 203 | cc-yuri | [lxc-203-cc-yuri.conf](lxc-203-cc-yuri.conf) | [servers/cc-yuri/inventory.md](../cc-yuri/inventory.md) | — | Dev worker |
| 204 | cc-worker | [lxc-204-cc-worker.conf](lxc-204-cc-worker.conf) | [servers/cc-worker/inventory.md](../cc-worker/inventory.md) | 100.99.133.9 | Claude Code operator (renamed from cc-vk, 2026-04-14) |
| 205 | animaya-dev | [lxc-205-animaya-dev.conf](lxc-205-animaya-dev.conf) | [servers/animaya-dev/inventory.md](../animaya-dev/inventory.md) | 100.119.15.122 | Animaya dev |

## Refreshing an LXC config

Per D-03, the Proxmox CLI output is authoritative. The .conf files in this directory
are regenerated directly from `pct config`, never edited by hand:

```bash
# Replace <vmid> and <hostname> with the target container
ssh root@tower "pct config <vmid>" > servers/tower/lxc-<vmid>-<hostname>.conf
```

Do not commit VMID 201 (orphan per D-15). Run the full Phase 2 harness after
refreshing to ensure structural checks still pass:

```bash
bash scripts/verify-phase02.sh
```

## Creating a new LXC

Not automated in this repo yet. Follow the Proxmox upstream pattern (reference:
[pct CLI docs](https://pve.proxmox.com/pve-docs/pct.1.html)):

```bash
# Example shape — adjust storage, network, and template to the tower conventions
ssh root@tower "pct create <vmid> local:vztmpl/debian-<ver>.tar.zst \
    --hostname <name> --cores 4 --memory 4096 --swap 512 \
    --net0 name=eth0,bridge=vmbr1,ip=10.10.20.<x>/24,gw=10.10.20.1 \
    --rootfs local-lvm:8 --ostype debian --unprivileged 1 \
    --features nesting=1 --timezone Europe/Moscow"
ssh root@tower "pct start <vmid>"
```

An Ansible role for LXC provisioning is Phase 3+ scope; until then LXCs are created
manually and captured back into this repo via `pct config` immediately after creation.

## Orphan policy (D-15)

Orphaned or duplicate LXCs are **stopped, not destroyed**. The rationale is that a
stopped LXC on `local-lvm` retains its rootfs and can be restarted or mounted for data
recovery without depending on an external backup. Each orphan is documented in the
owning server's `inventory.md` under an "Orphaned backup LXC" section, including the
VMID, the reason it is stopped, and the date of the action.

Never run `pct destroy` on an orphan unless explicitly cleared by the operator.

## Phase 1 drift note

VMID 101 (`tower-sat`) was listed in Phase 1 inventory and decommissioned upstream
before Phase 2. The repo was reconciled on 2026-04-14 (Plan 02-01):
`servers/tower-sat/` and `lxc-101-tower-sat.conf` were deleted, and the corresponding
row was removed from the `CLAUDE.md` server table. SVC-06 was invalidated in
`REQUIREMENTS.md` with the same rationale. No replacement service was provisioned.
