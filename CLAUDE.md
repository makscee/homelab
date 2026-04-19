# Homelab Infrastructure

## Servers

| Server | Location | Tailscale IP | Role |
|--------|----------|--------------|------|
| tower | Moscow | 100.101.0.7 | Proxmox host (i7-8700 12C, 16GB RAM) |
| docker-tower | Moscow (LXC 100) | 100.101.0.8 | Media stack: Navidrome, *arr (Jellyfin moved to CT 101 on 2026-04-18) |
| jellyfin | Moscow (LXC 101) | 100.77.246.74 | Jellyfin (native deb, iGPU QSV when BIOS enabled; CPU-only as of 2026-04-19) |
| cc-worker | Moscow (LXC 204) | 100.99.133.9 | Claude Code runner (renamed from cc-vk 2026-04-14) |
| cc-andrey | Moscow (LXC 200) | — | Developer worker (SSH via tower:2201 → 10.10.20.200:22) |
| cc-dan | Moscow (LXC 202) | — | Developer worker |
| cc-yuri | Moscow (LXC 203) | — | Developer worker |
| animaya-dev | Moscow (LXC 205) | 100.119.15.122 | Animaya development LXC |
| mcow | Moscow | 100.101.0.9 | VoidNet bot, API, portal, SQLite DB |
| nether | Netherlands | 100.101.0.3 | VPN entry/exit: AmneziaWG, XRay/VLESS |

## Architecture

- All servers on Tailscale mesh
- Proxmox on tower hosts LXCs
- VoidNet users access docker-tower services via VPN
- SSH: `ssh root@<hostname>` via Tailnet

## Services on docker-tower

- **Jellyfin** (:8096) — media streaming
- **Navidrome** (:4533) — music streaming
- **Radarr/Sonarr/Lidarr/Prowlarr** — media automation
- **qBittorrent** — downloads

## Planned

- Monitoring (Grafana + Prometheus + node-exporter)
- NAS on tower
- ~~Self-hosted vibe-kanban~~ → cc-worker (LXC 204) deployed (renamed from cc-vk 2026-04-14)
- Whisper speech-to-text API

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Homelab Infrastructure**

A comprehensive infrastructure-as-code repository that tracks, documents, and automates everything running across the homelab (4 Tailnet hosts + Proxmox LXCs). The repo serves as the single source of truth — if a server dies or needs migration, Claude Code can use this repo to rebuild the entire stack without losing anything.

**Core Value:** Any server's full stack can be reliably reproduced from this repo alone — no tribal knowledge, no guessing, no data loss on migration.

### Constraints

- **Operator**: Claude Code executes deployments — repo structure and docs must be AI-readable and unambiguous
- **Networking**: All inter-server communication via Tailscale mesh — no public IPs except nether's VPN endpoints
- **Secrets**: Managed globally at hub level — homelab references but doesn't store raw secrets
- **Incremental**: Start by documenting what exists, then build toward automation — don't block on perfection
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Configuration Management (Primary IaC Layer)
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Ansible | 2.17+ (core) | Server config, service deployment, Docker Compose orchestration | No state file complexity; YAML playbooks are AI-readable; works over SSH with no agent; perfect for Claude Code as operator |
| community.docker collection | 5.1.0+ | Managing Docker Compose stacks on remote hosts | `docker_compose_v2` module is the current standard; old V1 module removed in collection 4.0.0 |
| community.proxmox collection | 1.x (new) | LXC container lifecycle on tower | Migrated from `community.general.proxmox`; use `community.proxmox.proxmox` going forward |
### Secrets Management
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| SOPS | 3.9+ | Encrypt secrets committed to git | Encrypts values, leaves keys readable; native git integration; no external service |
| age | 1.2+ | Encryption backend for SOPS | Simpler than PGP, modern cryptography, no key management complexity, SSH key support |
### Inventory and Host Management
| Technology | Purpose | Why |
|------------|---------|-----|
| Ansible static inventory (INI or YAML) | Declare all 6 servers with Tailscale IPs, groups, vars | Static is appropriate — servers are known and stable; dynamic inventory adds complexity with no benefit |
### Repository Structure
### Monitoring Stack
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Prometheus | 2.x (latest) | Metrics collection | Standard; integrates with all services |
| Grafana | 11.x (latest) | Dashboards | Standard; node-exporter dashboards prebuilt |
| node-exporter | 1.8+ | Host metrics | Standard; one per host |
| cAdvisor | 0.49+ | Container metrics | Docker-native; integrates with Prometheus |
### Networking (Tailscale)
| Technology | Purpose | Why |
|------------|---------|-----|
| Tailscale | Mesh VPN, all inter-server comms | Already deployed; SSH over Tailnet is the standard operator path |
| Tailscale Ansible role (`artis3n.tailscale`) | Automate Tailscale install/auth on new nodes | Well-maintained community role; avoids reimplementing auth key flow |
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Config management | Ansible | Terraform+Ansible | Terraform state file adds overhead; no cloud resources to justify it |
| Config management | Ansible | SaltStack | More complex architecture (master+minions); smaller homelab community |
| Secrets | SOPS+age | Ansible Vault | Per-project vault passwords; doesn't span hub repos cleanly |
| Secrets | SOPS+age | HashiCorp Vault | Server to maintain; overkill for 6-node homelab |
| Container management | Docker Compose (managed by Ansible) | Portainer | Portainer GitOps requires Portainer server; adds a service to maintain; Ansible direct is simpler for AI operator |
| Container management | Docker Compose | Kubernetes/k3s | Massive complexity increase; no benefit at this scale |
| Monitoring | Prometheus+Grafana | Netdata | Less flexible; harder to extend; Prometheus/Grafana is better for long-term |
## Installation Bootstrap
# On operator machine (Claude Code runner — cc-vk or local)
# SOPS + age
# or: curl -sLO sops release, apt install age
# Verify connectivity
## Confidence Notes
| Decision | Confidence | Basis |
|----------|------------|-------|
| Ansible as primary tool | HIGH | Official docs + strong 2025 community consensus for homelab |
| community.proxmox (new collection) | MEDIUM | Verified module migration in official Ansible docs; collection still maturing |
| community.docker v2 module | HIGH | Official Ansible docs confirm V1 removed, V2 is current standard |
| SOPS+age for secrets | HIGH | Multiple 2025 sources + active project (SOPS 3.9 released 2024) |
| No Terraform | MEDIUM | Logical for this use case; no long-lived state needed; validated by homelab community advice |
| Monitoring stack versions | MEDIUM | Current major versions correct as of training; verify latest tags at deploy time |
## Sources
- [Ansible community.docker collection — docker_compose_v2 module](https://docs.ansible.com/projects/ansible/latest/collections/community/docker/docker_compose_v2_module.html)
- [Community.Proxmox Ansible collection](https://docs.ansible.com/projects/ansible/latest/collections/community/proxmox/index.html)
- [SOPS GitHub](https://github.com/getsops/sops)
- [Managing secrets with SOPS in homelab](https://www.codedge.de/posts/managing-secrets-sops-homelab/)
- [Ansible made homelab reproducible](https://www.xda-developers.com/ansible-made-my-entire-homelab-reproducible-with-one-command/)
- [Terraform vs Ansible for homelab 2025](https://medium.com/@kanishetty/terraform-vs-ansible-which-one-should-you-use-in-2025-6adc58ef84a6)
- [Homelab GitOps IaC — Proxmox + Ansible](https://github.com/jarkinV/homelab-infrastructure)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
