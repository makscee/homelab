# Roadmap: Homelab Infrastructure

## Overview

Starting from an incomplete patchwork of configs and tribal knowledge, this roadmap builds a single source of truth for a 6-server homelab. The work moves from foundations (secrets, inventory) through service capture to monitoring — ending with Claude Code able to verify any server's health programmatically. Disaster recovery deferred to v2.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundations** - Establish secrets pattern and complete server inventory before any config is committed
- [ ] **Phase 2: Service Documentation** - Capture all running service configs as reproducible Docker Compose and LXC files
- [ ] **Phase 3: Health Monitoring** - Deploy node-exporter, Prometheus, Grafana, and health-check scripts so Claude Code can verify deployments

**Deferred to v2:**
- Disaster Recovery (rebuild scripts, backup/restore, AI-readable runbooks) — CONTEXT preserved at `.planning/deferred/03-disaster-recovery/`

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
- [x] 02-02-PLAN.md — docker-tower compose: pin image tags, move Grafana password to SOPS, .env.example + README (SVC-01)
- [x] 02-03-PLAN.md — mcow systemd audit + README; flag stale voidnet-overseer/satellite units (SVC-02)
- [x] 02-04-PLAN.md — nether services compose + Caddyfile sync + AmneziaWG template with SOPS-encrypted keys (SVC-04)
- [x] 02-05-PLAN.md — Fresh pct config pulls for 6 LXCs + inventory files for 4 new dev-workers + tower README (SVC-03, SVC-08)
- [x] 02-06-PLAN.md — tailscale-provision.sh + scripts/README.md + final phase-wide secret sweep (SVC-05)

### Phase 3: Health Monitoring
**Goal**: Any server's health and deployment status can be verified programmatically by Claude Code
**Depends on**: Phase 2
**Requirements**: MON-01, MON-02
**Success Criteria** (what must be TRUE):
  1. Node-exporter is running on all 6 hosts and exposes CPU, memory, disk metrics
  2. Prometheus scrapes all node-exporters over Tailscale; retention and target config committed
  3. Grafana is deployed with prebuilt node-exporter dashboards; access via Tailscale
  4. cAdvisor runs on docker-tower and mcow; container metrics flow to Prometheus
  5. Health-check scripts allow Claude Code to confirm a deployment succeeded on any given server without manual SSH inspection
**Plans:** 5 plans

Plans:
- [ ] 03-01-PLAN.md — Prometheus config capture + alerts + file_sd targets + phase-03 test harness
- [ ] 03-02-PLAN.md — Ansible node-exporter playbook + inventory deploying native systemd binary to all 6 hosts
- [ ] 03-03-PLAN.md — Compose migration: Alertmanager + cAdvisor, remove faux node-exporters + blackbox, decommission nether stack
- [ ] 03-04-PLAN.md — Grafana datasource + dashboards provisioning (Node Exporter Full, cAdvisor, Homelab Summary)
- [ ] 03-05-PLAN.md — scripts/healthcheck.sh + promtool rule tests + phase-wide 99-final gate

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundations | 3/3 | Complete | 2026-04-13 |
| 2. Service Documentation | 6/6 | Complete | 2026-04-14 |
| 3. Health Monitoring | 0/5 | Not started | - |
