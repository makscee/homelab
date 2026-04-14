# Homelab Infrastructure

## What This Is

A comprehensive infrastructure-as-code repository that tracks, documents, and automates everything running across the homelab (4 Tailnet hosts + Proxmox LXCs). The repo serves as the single source of truth — if a server dies or needs migration, Claude Code can use this repo to rebuild the entire stack without losing anything.

## Core Value

Any server's full stack can be reliably reproduced from this repo alone — no tribal knowledge, no guessing, no data loss on migration.

## Requirements

### Validated

- [x] Complete server inventory with hardware specs, roles, IPs, and hosted services — Validated in Phase 1: Foundations
- [x] Secrets management (SOPS + age) — Validated in Phase 1: Foundations

### Active

- [ ] Complete server inventory with hardware specs, roles, IPs, and hosted services (inventory docs created in Phase 1; hardware specs pending SSH query)
- [ ] Docker Compose files for every containerized service (Jellyfin, Navidrome, *arr stack, qBittorrent, etc.)
- [ ] Proxmox LXC configuration and provisioning scripts for tower's containers
- [ ] Tailscale mesh networking setup and configuration for all nodes
- [ ] VPN configuration for nether (AmneziaWG, XRay/VLESS)
- [ ] Monitoring stack deployment (Grafana + Prometheus + node-exporter)
- [ ] Per-server deployment scripts that can rebuild a machine's services from scratch
- [ ] Backup and restore procedures for stateful data (databases, media configs, user data)
- [ ] VoidNet infrastructure tracking (bot, API, portal, SQLite DB on mcow)
- [ ] Structured runbooks for common operations (adding a server, migrating a service, disaster recovery)

### Out of Scope

- Fully unattended zero-touch provisioning — Claude Code operates the scripts, human confirms
- Managing the media content itself — only the services that serve it
- VoidNet application code — tracked in its own workspace project, only deployment config here
- Animaya application code — same, only deployment references here

## Context

- **6 servers** across Moscow and Netherlands, all on Tailscale mesh
- **Proxmox** on tower hosts LXCs: docker-tower (media stack), tower-sat (satellite services), cc-vk (Claude Code runner)
- **mcow** runs VoidNet (bot, API, portal, SQLite)
- **nether** is the VPN entry/exit node in Netherlands
- Some Docker Compose files and scripts already exist but coverage is incomplete
- Secrets management needs to be handled at the hub repo level, not per-project
- Claude Code is the intended operator — the repo must be structured so an AI agent can read it and execute migrations/deployments
- Part of a larger hub workspace that also contains animaya and voidnet projects

## Constraints

- **Operator**: Claude Code executes deployments — repo structure and docs must be AI-readable and unambiguous
- **Networking**: All inter-server communication via Tailscale mesh — no public IPs except nether's VPN endpoints
- **Secrets**: Managed globally at hub level — homelab references but doesn't store raw secrets
- **Incremental**: Start by documenting what exists, then build toward automation — don't block on perfection

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Claude Code as operator | Human defines intent, AI executes — scales better than memorizing procedures | — Pending |
| Secrets at hub level | Span multiple projects (animaya, voidnet, homelab) — single source of truth | — Pending |
| Document-first, automate-second | Can't automate what isn't understood — track everything before scripting | — Pending |
| Repo structure TBD | Need to evaluate per-server vs per-service vs hybrid after inventory | — Pending |
| Per-server directory layout | servers/{hostname}/ with inventory.md per server — established in Phase 1 | Validated |
| SOPS naming convention | *.sops.yaml = encrypted (committed), *.yaml = plaintext (blocked) | Validated |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-13 after Phase 1 completion*
