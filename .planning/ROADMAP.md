# Roadmap: Homelab Infrastructure

## Overview

Starting from an incomplete patchwork of configs and tribal knowledge, this roadmap builds a single source of truth for a 6-server homelab. The work moves from foundations (secrets, inventory) through service capture and disaster recovery to monitoring — ending with Claude Code able to rebuild any server's full stack from this repo alone.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundations** - Establish secrets pattern and complete server inventory before any config is committed
- [ ] **Phase 2: Service Documentation** - Capture all running service configs as reproducible Docker Compose and LXC files
- [ ] **Phase 3: Disaster Recovery** - Build rebuild scripts, backup/restore procedures, and AI-readable runbooks
- [ ] **Phase 4: Monitoring** - Deploy node-exporter and health-check scripts so Claude Code can verify deployments

## Phase Details

### Phase 1: Foundations
**Goal**: Secrets are safe and every server is fully documented before any config hits the repo
**Depends on**: Nothing (first phase)
**Requirements**: SEC-01, SEC-02, INV-01, INV-02, INV-03
**Success Criteria** (what must be TRUE):
  1. No .env file, raw secret, or credential can be committed — .gitignore and SOPS + age pattern are in place
  2. Every one of the 6 servers has an inventory document with hardware specs, Tailscale IP, role, and hosted services
  3. A service dependency map shows which services on which servers depend on others
  4. A network topology document describes the Tailscale mesh, Proxmox LXC relationships, and nether VPN paths
**Plans:** 3 plans

Plans:
- [x] 01-01-PLAN.md — SOPS+age secrets pattern, repo scaffold, .gitignore hardening
- [x] 01-02-PLAN.md — Server inventory documents for all 6 servers
- [x] 01-03-PLAN.md — Cross-server dependency map and network topology diagrams

### Phase 2: Service Documentation
**Goal**: Every containerized and LXC service has a reproducible config file committed to the repo. Also: reconcile Phase 1 inventory drift discovered during Wave 0 pre-flight (tower-sat decommissioned, cc-vk renamed to cc-worker, four new dev-worker LXCs on tower).
**Depends on**: Phase 1
**Requirements**: SVC-01, SVC-02, SVC-03, SVC-04, SVC-05, ~~SVC-06~~ (invalidated), SVC-07, SVC-08
**Scope revision (2026-04-14):** Phase 2 re-scoped after Wave 0 pre-flight revealed: LXC 101 decommissioned, LXC 204 renamed cc-vk→cc-worker (new Tailscale IP `100.99.133.9`), four new developer-worker LXCs on tower (VMID 200 cc-andrey, 202 cc-dan, 203 cc-yuri, 205 animaya-dev), orphaned duplicate VMID 201 to stop (keep disk).
**Success Criteria** (what must be TRUE):
  1. Docker Compose files with pinned image tags exist for all docker-tower services (Jellyfin, Navidrome, *arr stack, qBittorrent)
  2. Docker Compose files exist (or systemd units audited and documented) for all mcow services (VoidNet bot, API; overseer/satellite audited for stale-unit flagging per D-07/D-08)
  3. Proxmox LXC configs pulled fresh from `pct config` exist for 100 (docker-tower), 204 (cc-worker), 200 (cc-andrey), 202 (cc-dan), 203 (cc-yuri), 205 (animaya-dev)
  4. AmneziaVPN configuration for nether is documented with config files committed (keys encrypted via SOPS) — reproducible from the config alone
  5. A Tailscale provisioning script exists that can add any server to the mesh
  6. ~~Tower-sat services documented~~ INVALIDATED — LXC 101 decommissioned; `servers/tower-sat/` and `servers/tower/lxc-101-tower-sat.conf` removed from repo
  7. Phase 1 drift reconciled: CLAUDE.md server table accurate, `servers/cc-vk/` renamed to `servers/cc-worker/`, `servers/tower-sat/` deleted
  8. Developer-worker LXCs (cc-andrey, cc-dan, cc-yuri, animaya-dev) have minimal `inventory.md` files; VMID 201 stopped but disk retained
**Plans:** 6 plans (re-planned 2026-04-14 after drift discovery; original 6 archived to `.planning/phases/02-service-documentation/_archived-2026-04-14/`)

Plans:
- [x] 02-01-PLAN.md — Infrastructure reconciliation (SVC-07): delete tower-sat, rename cc-vk→cc-worker, CLAUDE.md update, stop VMID 201, seed verify-phase02 harness
- [ ] 02-02-PLAN.md — docker-tower compose: pin image tags, move Grafana password to SOPS, .env.example + README (SVC-01)
- [ ] 02-03-PLAN.md — mcow systemd audit + README; flag stale voidnet-overseer/satellite units (SVC-02)
- [ ] 02-04-PLAN.md — nether services compose + Caddyfile sync + AmneziaWG template with SOPS-encrypted keys (SVC-04)
- [ ] 02-05-PLAN.md — Fresh pct config pulls for 6 LXCs + inventory files for 4 new dev-workers + tower README (SVC-03, SVC-08)
- [ ] 02-06-PLAN.md — tailscale-provision.sh + scripts/README.md + final phase-wide secret sweep (SVC-05)

### Phase 3: Disaster Recovery
**Goal**: Claude Code can rebuild any server's services from scratch using only this repo
**Depends on**: Phase 2
**Requirements**: DR-01, DR-02, DR-03, DR-04
**Success Criteria** (what must be TRUE):
  1. Per-server rebuild scripts exist that install dependencies, pull images, and start services in correct order
  2. A backup manifest documents every stateful data path per service (Jellyfin metadata, *arr DBs, VoidNet SQLite, etc.)
  3. Restore procedures exist that recover stateful data from a backup into a fresh deployment
  4. AI-readable runbooks provide numbered steps with exact hostnames, commands, expected outputs, and explicit stop conditions — no judgment calls required
**Plans**: TBD

### Phase 4: Monitoring
**Goal**: Any server's health and deployment status can be verified programmatically
**Depends on**: Phase 3
**Requirements**: MON-01, MON-02
**Success Criteria** (what must be TRUE):
  1. Node-exporter is running on all 6 hosts and exposes CPU, memory, and disk metrics
  2. Health-check scripts allow Claude Code to confirm a deployment succeeded on any given server without manual SSH inspection
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundations | 0/3 | Planning complete | - |
| 2. Service Documentation | 0/6 | Planning complete | - |
| 3. Disaster Recovery | 0/TBD | Not started | - |
| 4. Monitoring | 0/TBD | Not started | - |
