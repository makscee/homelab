# Homelab Infrastructure

## What This Is

A comprehensive infrastructure-as-code repository that tracks, documents, and automates everything running across the homelab (4 Tailnet hosts + Proxmox LXCs, 6 monitored hosts total). The repo serves as the single source of truth — if a server dies or needs migration, Claude Code can use this repo to rebuild the entire stack without losing anything.

## Core Value

Any server's full stack can be reliably reproduced from this repo alone — no tribal knowledge, no guessing, no data loss on migration.

## Current State

**v1.0 shipped 2026-04-15.** Foundations (SOPS+age, server inventories, dependency + topology maps), service documentation (Docker Compose with pinned tags, LXC configs, AmneziaWG, Tailscale provisioning), health monitoring (Prometheus + Alertmanager + cAdvisor + node-exporter across 6/6 hosts, Grafana dashboards, healthcheck CLI with promtool rule tests), and operator dashboard (Grafana + Alertmanager on mcow Tailnet-only; overview dashboard pinned as home; Telegram alert delivery proven E2E). All 18 active v1 requirements satisfied. See `.planning/milestones/v1.0-ROADMAP.md` and `.planning/MILESTONES.md`.

## Current Milestone: v2.0 Claude Code Usage Monitor

**Goal:** Centralized SOPS-encrypted registry of 2-5 Claude Code OAuth tokens (personal + worker LXCs), with per-token weekly + 5-hour-session quota dashboard on mcow Grafana and Telegram alerts at configurable thresholds.

**Target features:**
- SOPS token registry (`secrets/claude-tokens.sops.yaml`) — label, token, owner-host, subscription tier, added-on per entry
- Multi-token Prometheus exporter on mcow — emits `claude_code_weekly_used_ratio{label}` + `claude_code_session_used_ratio{label}` + per-model breakdown if API exposes
- Grafana dashboard with token-selector variable + per-token gauges + historical timeseries
- Telegram alerts: `WeeklyQuotaHigh` (80%) / `WeeklyQuotaCritical` (95%), same tiers for session
- 720h retention (matches v1.0 stack)
- Ansible playbook for deploy (pattern from `ansible/playbooks/deploy-docker-tower.yml`)

**Key context:**
- **Feasibility risk:** Anthropic has no documented OAuth-quota endpoint. Phase 1 research is non-optional; may fall back to local token counter if no stable endpoint.
- **Subscription tier focus:** Max 20x ($100/mo, 5-hour sessions, weekly reset, ~20% Opus budget)
- **Host:** exporter on mcow; scraped by docker-tower Prometheus over Tailnet
- **Rotation:** manual (Shape A — edit SOPS + redeploy)

## Deferred for Future Milestones

- **Disaster Recovery** — rebuild scripts, backup/restore, AI-readable runbooks (DR-01..04)
- **Tech-debt cleanup** — VALIDATION.md retro-flip, 03-VERIFICATION.md backfill, D-06 ADR update, nether secrets cleanup, docker-tower volume cleanup (2026-04-22)
- **Drift detection** (MON-04) — auto-catch `homestack → homelab`-style path drift (root-cause partially addressed out-of-band 2026-04-16)
- **Tailscale ACL in repo** (SEC-03)
- **Token distribution** (Shape B) — ansible-push tokens to worker hosts

## Requirements

### Validated

- Complete server inventory with hardware specs, roles, IPs, and hosted services — v1.0
- Service dependency map — v1.0
- Network topology diagram — v1.0
- Secrets management (SOPS + age) — v1.0
- .gitignore blocks plaintext secrets — v1.0
- Docker Compose for all docker-tower services with pinned tags — v1.0
- mcow service documentation (systemd + compose) — v1.0
- Proxmox LXC configs captured for all active VMIDs — v1.0
- AmneziaWG for nether with SOPS-encrypted keys — v1.0
- Tailscale provisioning script — v1.0
- Phase 1 drift reconciled (cc-vk→cc-worker, tower-sat removed) — v1.0
- Dev-worker LXCs inventoried — v1.0
- node-exporter on all hosts — v1.0 (6/6)
- Prometheus + Alertmanager + cAdvisor — v1.0
- Grafana dashboards provisioned — v1.0
- Healthcheck scripts — v1.0
- Operator overview dashboard on mcow — v1.0
- Telegram alert delivery proven E2E — v1.0

### Active

(v2.0 requirements pending — will be captured in `.planning/REQUIREMENTS.md` after research phase.)

### Out of Scope

- Kubernetes / Helm / Flux — overkill at 6-node scale with AI operator
- Terraform — no cloud resources; Ansible handles everything needed
- Fully unattended zero-touch provisioning — Claude Code operates, human confirms
- CI/CD pipelines — no reliable runner; Claude Code is the operator
- Media content management — only the services that serve it
- VoidNet / Animaya application code — tracked in their own workspace projects
- XRay/VLESS — no longer in use, only AmneziaVPN + Tailscale
- Portainer — adds a service to maintain with no benefit

## Context

- **6 monitored hosts** across Moscow and Netherlands, all on Tailscale mesh
- **tower** (Proxmox hypervisor) hosts LXCs: docker-tower (media + Prometheus data plane), cc-worker, cc-andrey, cc-dan, cc-yuri, animaya-dev
- **mcow** runs VoidNet (bot, API, portal, SQLite) and the operator plane (Grafana + Alertmanager)
- **nether** is the AmneziaVPN entry/exit node in Netherlands; also runs Tailscale App Connector for IPv4 Telegram egress fallback
- Post-v1.0: secrets via SOPS+age at hub level; healthcheck CLI + promtool rule tests; operator dashboard pinned as Grafana home
- Part of a larger hub workspace that also contains animaya and voidnet projects

## Constraints

- **Operator**: Claude Code executes deployments — repo structure and docs must be AI-readable and unambiguous
- **Networking**: All inter-server communication via Tailscale mesh — no public IPs except nether's VPN endpoints
- **Secrets**: Managed globally at hub level — homelab references but doesn't store raw secrets
- **Incremental**: Document-first, automate-second — don't block on perfection

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Claude Code as operator | Human defines intent, AI executes — scales better than memorizing procedures | Validated (v1.0) |
| Secrets at hub level | Span multiple projects (animaya, voidnet, homelab) — single source of truth | Validated (v1.0) |
| Document-first, automate-second | Can't automate what isn't understood — track everything before scripting | Validated (v1.0) |
| Per-server directory layout | `servers/{hostname}/` with inventory.md per server | Validated (v1.0) |
| SOPS naming convention | `*.sops.yaml` encrypted (committed), `*.yaml` plaintext (blocked) | Validated (v1.0) |
| AmneziaVPN only on nether | XRay/VLESS out of scope | Validated (v1.0) |
| Operator plane on mcow | Grafana + Alertmanager migrated off docker-tower (Tailnet-only) | Validated (v1.0) |
| Data plane on docker-tower | Prometheus + cAdvisor + media services stay co-located | Validated (v1.0) |
| Tailscale App Connector on nether | IPv4 Telegram egress fallback (Moscow IPv6-only path blocked by Telegram) | Validated (v1.0 via E2E Telegram smoke) |
| Token file perms `install -m 0440 root:65534` | prom/alertmanager container user is `nobody(65534)` | Validated (v1.0) |

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
*Last updated: 2026-04-16 — v2.0 milestone started (Claude Code Usage Monitor)*
