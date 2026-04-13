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
- [ ] **SVC-03**: Proxmox LXC configurations are captured for containers 100 (docker-tower), 101 (tower-sat), and 204 (cc-vk)
- [ ] **SVC-04**: AmneziaVPN configuration for nether is documented and reproducible
- [ ] **SVC-05**: Tailscale node provisioning is scripted for all 6 servers
- [ ] **SVC-06**: Tower-sat services are documented with Compose files or equivalent configs

### Disaster Recovery

- [ ] **DR-01**: Per-server rebuild scripts can recreate each machine's services from scratch
- [ ] **DR-02**: Backup procedures document what stateful data exists per service (Jellyfin metadata, *arr DBs, VoidNet SQLite, etc.)
- [ ] **DR-03**: Restore procedures can recover stateful data from backups to a fresh deployment
- [ ] **DR-04**: AI-readable runbooks provide step-by-step instructions with exact commands, hostnames, expected outputs, and stop conditions

### Monitoring

- [ ] **MON-01**: Node-exporter is deployed on all hosts providing CPU, memory, and disk metrics
- [ ] **MON-02**: Health-check scripts allow Claude Code to verify deployment success on any server

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
| SVC-06 | Phase 2 | Pending |
| DR-01 | Phase 3 | Pending |
| DR-02 | Phase 3 | Pending |
| DR-03 | Phase 3 | Pending |
| DR-04 | Phase 3 | Pending |
| MON-01 | Phase 4 | Pending |
| MON-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-13*
*Last updated: 2026-04-13 after roadmap creation*
