---
phase: 01-foundations
plan: "02"
subsystem: inventory
tags: [inventory, documentation, servers]
requires: ["01-01"]
provides: ["server-inventory-all-6"]
affects: ["01-03"]
key-files:
  created:
    - servers/tower/inventory.md
    - servers/docker-tower/inventory.md
    - servers/tower-sat/inventory.md
    - servers/mcow/inventory.md
    - servers/nether/inventory.md
    - servers/cc-vk/inventory.md
  modified: []
key-decisions:
  - "tower-sat services documented as pending SSH query — LXC exists with 2 cores/2GB but running services unknown from static files"
  - "mcow cross-server dependency table added (Rule 2) — critical for understanding blast radius if docker-tower fails"
  - "nether Caddy routes table added to inventory — all public domain routing is now documented in one place"
  - "cc-vk age key path (~/.config/sops/age/keys.txt) flagged as CRITICAL single point of failure for secrets"
patterns-established:
  - "inventory.md template: field table + Hosted Services + Storage Layout + Notes"
  - "Cross-server dependency tables for servers with outbound API calls"
  - "Pending SSH query markers for facts not derivable from static repo files"
requirements-completed: [INV-01]
duration: "25 minutes"
completed: "2026-04-13"
---

# Phase 01 Plan 02: Server Inventory Summary

All 6 servers have inventory.md files with D-08 required fields populated from repo files. Hardware specs for tower-sat, mcow, nether, and cc-vk are marked pending SSH query — those servers have no static hardware config files in the repo.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Tower cluster inventories (tower, docker-tower, tower-sat) | 3bf8ccf | servers/tower/inventory.md, servers/docker-tower/inventory.md, servers/tower-sat/inventory.md |
| 2 | Standalone server inventories (mcow, nether, cc-vk) | e8d2f66 | servers/mcow/inventory.md, servers/nether/inventory.md, servers/cc-vk/inventory.md |

## Key Facts Captured

**tower:** Proxmox host with 3 LXCs. Two external HDDs (`wdc`, `sea`) bind-mounted into docker-tower as `/media/wdc` and `/media/sea`.

**docker-tower:** 24 running containers inventoried from running-containers.txt. Grafana+Prometheus monitoring co-located here. Workspace/opencode dev containers also running.

**tower-sat:** LXC 101, 2 vCPUs / 2 GB RAM / 40 GB disk. Has `/dev/net/tun` mount suggesting VPN use. Running services require live SSH to determine.

**mcow:** VoidNet runs as Rust systemd binaries (not Docker). 8 cross-server API dependencies on docker-tower. SQLite at `/opt/voidnet/voidnet.db` is the only copy of user data — no backup currently documented. Also serves animaya and notes (PocketBase at :8090).

**nether:** All 12 public domain routes documented from Caddyfile. AmneziaWG on port 46476/UDP. Void overseer+uplink containers (separate from mcow VoidNet). Monitoring stack duplicated here (Grafana :3001, Prometheus :9090).

**cc-vk:** Operator machine. Age key at `~/.config/sops/age/keys.txt` is master decryption key for all hub secrets.

## Deviations from Plan

### Auto-added Missing Critical Functionality

**1. [Rule 2 - Missing] Cross-server dependency table for mcow**
- **Found during:** Task 2
- **Issue:** Plan listed dependencies in prose; a structured table is needed for Plan 03 dependency map
- **Fix:** Added "Cross-server Dependencies" table with target IPs, connection method, and purpose for all 8 deps
- **Files modified:** servers/mcow/inventory.md

**2. [Rule 2 - Missing] Caddy routes table for nether**
- **Found during:** Task 2
- **Issue:** Caddyfile has 11 routes across 7 domains; prose summary would lose detail needed for Plan 03 topology
- **Fix:** Added "Caddy Reverse Proxy Routes" table capturing all upstream targets
- **Files modified:** servers/nether/inventory.md

## Known Stubs

| File | Field | Reason |
|------|-------|--------|
| servers/tower-sat/inventory.md | Hosted Services | No static files reveal running containers; requires live SSH |
| servers/mcow/inventory.md | Hardware | No LXC config (mcow is a standalone VM, not a tower LXC) |
| servers/nether/inventory.md | Hardware | VPS with no static hardware files in repo |
| servers/cc-vk/inventory.md | Hardware, Vibe Kanban port | LXC 204 config not in repo yet |

All stubs are marked "pending SSH query" in the inventory files. These do not block Plan 03 (dependency map uses IPs and service names, not hardware specs).

## Threat Flags

None. Inventory files contain internal Tailscale IPs and service names only. All secret values replaced with REDACTED in source files. No new trust boundaries introduced.

## Self-Check: PASSED

All 6 inventory files exist and contain required fields verified by automated check.
