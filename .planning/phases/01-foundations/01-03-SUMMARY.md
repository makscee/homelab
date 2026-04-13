---
phase: 01-foundations
plan: "03"
subsystem: docs
tags: [diagrams, mermaid, dependency-map, network-topology, documentation]
requires: ["01-02"]
provides: ["docs/dependency-map.md", "docs/network-topology.md"]
affects: []
key-files:
  created:
    - docs/dependency-map.md
    - docs/network-topology.md
  modified: []
key-decisions:
  - "Used Mermaid flowchart (not graph) directive for GitHub compatibility"
  - "Dependency map includes all Caddy routes sourced from nether inventory"
  - "tower-sat services left as 'pending SSH query' — no inventory data available"
patterns-established:
  - "docs/ directory at repo root holds cross-cutting visual documentation"
  - "Mermaid subgraphs per server, nodes include port numbers"
requirements-completed: [INV-02, INV-03]
duration: "~10 minutes"
completed: "2026-04-13"
---

# Phase 1 Plan 03: Mermaid Architecture Diagrams Summary

Mermaid flowchart diagrams for service dependency map and network topology, sourced entirely from Wave 2 inventory files. Both render natively on GitHub without plugins.

## What Was Built

**docs/dependency-map.md** — Service dependency flowchart covering all 6 servers:
- All *arr suite internal deps (radarr/sonarr/lidarr -> qBittorrent, prowlarr, flaresolverr)
- All cross-server deps: mcow voidnet-bot -> docker-tower (jellyfin, radarr, sonarr, lidarr, navidrome via API keys)
- mcow voidnet-bot -> nether AmneziaWG (SSH for VPN peer management)
- All 11 Caddy reverse proxy routes from nether inventory (voidnet.makscee.ru, makscee.ru, notes, animaya, n8n, aoi, sync)
- Proxmox hosting relationships (LXC 100/101/204)
- Cross-server dependency summary table

**docs/network-topology.md** — Network topology flowchart:
- Tailscale mesh with key inter-server links
- tower Proxmox hierarchy with 3 LXC containers (LXC 100/101/204) showing resource allocations
- nether with public IP 77.239.110.57 and AmneziaWG :46476/UDP
- VPN client ingress path: external -> nether -> Tailscale -> docker-tower
- Public domain ingress: browser -> nether Caddy -> mcow/docker-tower via Tailscale
- cc-vk operator SSH access to all 5 servers
- Physical storage bind-mounts (wdc/sea HDDs -> docker-tower)
- Network Facts table, Access Patterns, Key Network Risks sections

## Deviations from Plan

None — plan executed exactly as written. Template Mermaid was used as a starting base and expanded with actual data from all inventory files.

## Known Stubs

- tower-sat services node shows "services pending SSH query" — accurate reflection of inventory state; no services were discovered in Wave 2
- Several mcow service ports (voidnet-portal, voidnet-overseer) shown without ports — port data pending SSH query per mcow inventory

## Threat Flags

None beyond what the plan's threat model already accepted:
- T-03-01: network-topology.md contains Tailscale IPs (internal only) and nether public IP (already exposed by design). Repo is private.
- T-03-02: dependency-map.md contains service names and ports, no secrets.

## Self-Check: PASSED

- FOUND: docs/dependency-map.md (commit caa0225)
- FOUND: docs/network-topology.md (commit ce18bb7)
