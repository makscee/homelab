# Requirements: Homelab Infrastructure

**Defined:** 2026-04-13
**Core Value:** Any server's full stack can be reliably reproduced from this repo alone — no tribal knowledge, no guessing, no data loss on migration.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Inventory

- [ ] **INV-01**: Complete server inventory documents all 6 servers with hardware specs, roles, Tailscale IPs, and hosted services
- [ ] **INV-02**: Service dependency map shows what depends on what across all servers
- [ ] **INV-03**: Network topology diagram visualizes how servers connect (Tailscale mesh, Proxmox LXCs, VPN paths)

### Service Definitions

- [ ] **SVC-01**: Docker Compose files exist for every containerized service on docker-tower (Jellyfin, Navidrome, *arr stack, qBittorrent) with pinned image tags
- [ ] **SVC-02**: Docker Compose files exist for every containerized service on mcow (VoidNet bot, API, portal)
- [ ] **SVC-03**: Proxmox LXC configurations are captured for containers 100 (docker-tower) and 204 (cc-worker, renamed from cc-vk). Also capture new developer-worker LXCs 200 (cc-andrey), 202 (cc-dan), 203 (cc-yuri), 205 (animaya-dev). VMID 101 removed from scope (decommissioned, see SVC-06).
- [ ] **SVC-04**: AmneziaVPN configuration for nether is documented and reproducible
- [ ] **SVC-05**: Tailscale node provisioning is scripted for all 6 servers
- [~] **SVC-06**: ~~Tower-sat services are documented with Compose files or equivalent configs~~ — **INVALIDATED 2026-04-14**: LXC 101 (tower-sat) was decommissioned and no longer exists on the tower hypervisor. Pre-flight audit during Phase 2 Wave 0 confirmed `pct list` does not include VMID 101. Closing this requirement with action = delete `servers/tower-sat/` and `servers/tower/lxc-101-tower-sat.conf`. No replacement services.
- [ ] **SVC-07**: Phase 1 inventory drift reconciled (added 2026-04-14 via drift discovery): `CLAUDE.md` server table reflects actual infrastructure, `servers/*/inventory.md` files accurate for all active servers, `servers/cc-vk/` renamed to `servers/cc-worker/` with updated Tailscale IP `100.99.133.9`, `servers/tower-sat/` and `servers/tower/lxc-101-tower-sat.conf` deleted, `docs/network-topology.md` updated if it references decommissioned nodes
- [ ] **SVC-08**: Developer-worker LXCs on tower are inventoried (added 2026-04-14): `servers/cc-andrey/inventory.md`, `servers/cc-dan/inventory.md`, `servers/cc-yuri/inventory.md`, `servers/animaya-dev/inventory.md` each exist with minimal fields (VMID, hostname, internal IP, Tailscale IP if present, external SSH port forward if any). VMID 201 stopped (`pct stop 201`) and documented as duplicate-backup under `servers/cc-andrey/inventory.md`

### Disaster Recovery

- [ ] **DR-01**: Per-server rebuild scripts can recreate each machine's services from scratch
- [ ] **DR-02**: Backup procedures document what stateful data exists per service (Jellyfin metadata, *arr DBs, VoidNet SQLite, etc.)
- [ ] **DR-03**: Restore procedures can recover stateful data from backups to a fresh deployment
- [ ] **DR-04**: AI-readable runbooks provide step-by-step instructions with exact commands, hostnames, expected outputs, and stop conditions

### Monitoring

- [x] **MON-01**: Node-exporter is deployed on all hosts providing CPU, memory, and disk metrics
- [x] **MON-02**: Health-check scripts allow Claude Code to verify deployment success on any server

### Secrets & Security

- [ ] **SEC-01**: SOPS + age secrets pattern is established at hub level with homelab referencing encrypted values
- [ ] **SEC-02**: .gitignore patterns prevent secrets, .env files, and credentials from ever being committed

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Monitoring (Extended)

- **MON-03**: Full Prometheus + Grafana + cAdvisor monitoring stack with dashboards
- **MON-04**: Drift detection comparing repo state vs running containers

### Operations

- **OPS-01**: Migration runbooks for moving services between hosts
- **OPS-02**: Deployment logs tracking what was deployed when
- **OPS-03**: Image freshness tracking for outdated container tags
- **OPS-04**: Annotated configs with inline rationale for non-obvious settings

### Security (Extended)

- **SEC-03**: Tailscale ACL policy managed in repo

## Out of Scope

| Feature | Reason |
|---------|--------|
| Kubernetes / Helm / Flux | Overkill at 6-node scale with AI operator |
| Terraform | No cloud resources; Ansible handles everything needed |
| Fully unattended provisioning | Claude Code operates scripts, human confirms — by design |
| CI/CD pipelines | No reliable runner; Claude Code is the operator |
| Media content management | Only the services that serve it, not the content itself |
| VoidNet / Animaya application code | Tracked in their own workspace projects; only deployment configs here |
| XRay/VLESS configuration | No longer in use — only AmneziaVPN + Tailscale |
| Portainer | Adds a service to maintain with no benefit when Claude Code is operator |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INV-01 | Phase 1 | Pending |
| INV-02 | Phase 1 | Pending |
| INV-03 | Phase 1 | Pending |
| SEC-01 | Phase 1 | Pending |
| SEC-02 | Phase 1 | Pending |
| SVC-01 | Phase 2 | Pending |
| SVC-02 | Phase 2 | Pending |
| SVC-03 | Phase 2 | Pending |
| SVC-04 | Phase 2 | Pending |
| SVC-05 | Phase 2 | Pending |
| SVC-06 | Phase 2 | Invalidated (tower-sat decommissioned) |
| SVC-07 | Phase 2 | Pending (inventory drift reconciliation) |
| SVC-08 | Phase 2 | Pending (new dev-worker LXCs) |
| DR-01 | v2 (deferred) | Deferred — context preserved at `.planning/deferred/03-disaster-recovery/` |
| DR-02 | v2 (deferred) | Deferred |
| DR-03 | v2 (deferred) | Deferred |
| DR-04 | v2 (deferred) | Deferred |
| MON-01 | Phase 3 | Complete |
| MON-02 | Phase 3 | Complete |

**Coverage:**
- v1 requirements: 19 total (17 original + SVC-07, SVC-08 added 2026-04-14)
- Active: 18 (SVC-06 invalidated — tower-sat decommissioned)
- Mapped to phases: 19
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-13*
*Last updated: 2026-04-14 after Phase 2 pre-flight drift discovery*
