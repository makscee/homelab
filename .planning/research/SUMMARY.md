# Research Summary — Homelab Infrastructure-as-Code

## Executive Summary

Reproducibility-first IaC repository for a 6-server homelab (Moscow + Netherlands) with Proxmox LXCs, Docker Compose stacks, and Tailscale mesh. Claude Code is the primary operator.

## Recommended Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Configuration management | Ansible 2.17+ | No cloud resources, no state files needed; handles LXC + Docker in one tool |
| Docker module | `community.docker` v2 (`docker_compose_v2`) | V1 module removed in collection 4.0.0 |
| Proxmox module | `community.proxmox` | New dedicated collection; replaces `community.general.proxmox` |
| Secrets | SOPS + age | Encrypts in-place in YAML/ENV; no external service; fits hub-level architecture |
| Tailscale | `artis3n.tailscale` role | Handles node provisioning |
| Monitoring | Prometheus + Grafana + node-exporter | Docker Compose deployed; cAdvisor for container metrics |
| NOT using | Terraform, Kubernetes, Portainer | Overkill at 6-node scale with AI operator |

## Table Stakes Features

1. Server inventory with hardware specs, roles, IPs
2. Docker Compose files per service (pinned image tags)
3. Per-server rebuild scripts
4. Proxmox LXC configuration dumps
5. Tailscale mesh setup
6. VPN configuration (nether — AmneziaWG, XRay/VLESS)
7. Secrets reference model (SOPS + age at hub level)
8. Backup/restore procedures for stateful data
9. AI-readable runbooks (exact commands, hostnames, expected outputs)
10. Service dependency map

## Key Architecture Decisions

- **Hybrid directory layout**: Primary axis by server (`hosts/<server>/`), secondary by service type; `inventory/` as cross-host ground truth
- **6 top-level directories**: `inventory/`, `hosts/`, `network/`, `monitoring/`, `runbooks/`, `scripts/`
- **Secrets at hub level**: Only stubs/variable names in homelab repo
- **AI-operator runbook format**: Numbered steps, explicit hostnames, expected outputs, defined stop conditions

## Critical Pitfalls

1. **Secrets leakage** — Must establish `.gitignore` and SOPS pattern before any config is committed
2. **Repo-vs-reality drift** — Running containers diverge from committed Compose files via manual hotfixes
3. **Stateful data ≠ infrastructure** — Jellyfin metadata, *arr DBs, VoidNet SQLite need explicit backup paths
4. **LXC config blind spot** — Proxmox LXC settings not captured by Docker Compose; need `pct config` dumps
5. **Runbook ambiguity** — Instructions that humans interpret with judgment become literal commands for AI operator
6. **nether is SPOF** — Sole Netherlands VPN node; needs Phase 1 priority

## Suggested Phase Order

1. **Inventory & Foundations** — secrets pattern, LXC configs, nether VPN, node-exporter on all hosts
2. **Service Documentation** — Docker Compose files, per-service BACKUP.md for stateful volumes
3. **Provisioning & Runbooks** — Ansible playbooks, deploy scripts, AI-readable runbooks
4. **Monitoring Stack** — Prometheus + Grafana + cAdvisor after hosts are stable
5. **Operational Polish** — drift detection, topology diagram, update runbook, deployment logs

## Research Confidence

| Area | Level |
|------|-------|
| Ansible as primary tool | HIGH |
| SOPS + age for secrets | HIGH |
| Secrets/drift/stateful pitfalls | HIGH |
| Directory structure | MEDIUM |
| community.proxmox maturity | MEDIUM |
| AI-operator runbook patterns | LOW (emerging) |

## Open Questions

- Monitoring host placement: which server runs Grafana/Prometheus?
- Tailscale ACL policy: managed in repo or externally?
- Backup target destination: not yet specified
- nether VPN config paths: verify against running server
