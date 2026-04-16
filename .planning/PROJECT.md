# Homelab Infrastructure

## What This Is

A comprehensive infrastructure-as-code repository that tracks, documents, and automates everything running across the homelab (4 Tailnet hosts + Proxmox LXCs, 6 monitored hosts total). The repo serves as the single source of truth — if a server dies or needs migration, Claude Code can use this repo to rebuild the entire stack without losing anything.

## Core Value

Any server's full stack can be reliably reproduced from this repo alone — no tribal knowledge, no guessing, no data loss on migration.

## Current State

**v1.0 shipped 2026-04-15.** Foundations, service docs, monitoring, operator dashboard — 18/18 active requirements. See `.planning/milestones/v1.0-ROADMAP.md`.

**v2.0 closed 2026-04-16 with pivot.** Feasibility gate PASSED formally (ADR D-07); exporter + Prometheus scraping running operationally on mcow. Phases 08-11 pivoted into v3.0. See `.planning/MILESTONE-CLOSE-v2.0.md`.

## Current Milestone: v3.0 Unified Stack Migration (homelab scope)

**Goal:** Build the homelab admin dashboard at `homelab.makscee.ru` using a new TypeScript/Next.js stack, consuming a shared `hub-shared/ui-kit` component library that will later be reused by VoidNet + Animaya (separate milestones in their own repos). Kill Grafana-as-dashboard.

**Target features:**
- Shared ui-kit repo (`hub-shared/ui-kit`) — design tokens, shadcn components extracted/adopted, referenced by homelab-admin as git submodule
- Homelab admin Next.js app on mcow — Tailnet-only bind, auth via Tailscale identity headers, Caddy + LE DNS-01 via Cloudflare for `homelab.makscee.ru`
- Global overview page — Prometheus HTTP client + Recharts, key homelab metrics in one view
- Claude Code tokens page — SOPS registry CRUD + per-token graphs (consumes mcow:9101 exporter) + add/rotate flow; absorbs v2.0 Phases 08/11
- VoidNet management page — consumes voidnet-api admin endpoints over Tailnet: users, credits, boxes
- Proxmox ops — LXC restart/spawn/destroy, box info (ssh cmd + password view), token rotation, xterm.js web terminal
- Alerts — Prometheus rules → Telegram (absorbs v2.0 Phase 09)
- Ansible playbook for deploy + exporter hardening (rebind Tailnet-only, uid 65534 — v2.0 tech-debt)
- Security review + launch

**Key context:**
- **Stack:** Bun + Next.js 15 + React 19 + TypeScript + Tailwind + shadcn/ui (see ADR D-08 when written)
- **Auth:** Tailscale identity headers (`Tailscale-User-Login`), zero-config, no login form
- **DNS/TLS:** public A-record `homelab.makscee.ru` → `100.101.0.9`, LE DNS-01 via Cloudflare API, ACL-restricted to Tailnet
- **Repo layout:** hybrid — this repo hosts `apps/admin/` (or similar) Next.js app; `hub-shared/ui-kit` is a separate repo referenced via git submodule
- **Scope boundary:** VoidNet + Animaya migrations are NOT part of this milestone — they are parallel milestones in their own repos that consume the ui-kit once stable
- **Host:** runs on mcow alongside existing services, systemd-managed Bun runtime

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

(v3.0 requirements pending — captured in `.planning/REQUIREMENTS.md` after scope locked.)

**v2.0 validated (carried forward):**
- Direct Moscow ISP egress to api.anthropic.com confirmed (Phase 05)
- OAuth endpoint-scrape approach for Claude Code quotas validated operationally (ADR D-07; 2 tokens live on mcow:9101)
- Exporter + Prometheus scraping operational (Phases 06/07 short-circuit) — tech-debt carried to v3.0

### Out of Scope

- Kubernetes / Helm / Flux — overkill at 6-node scale with AI operator
- Terraform — no cloud resources; Ansible handles everything needed
- Fully unattended zero-touch provisioning — Claude Code operates, human confirms
- CI/CD pipelines — no reliable runner; Claude Code is the operator
- Media content management — only the services that serve it
- VoidNet / Animaya backend application code — tracked in their own workspace projects (v3.0 homelab repo only hosts the admin dashboard that CONSUMES their APIs over Tailnet)
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
| D-07: Claude Code quota access strategy | Endpoint-scrape `/api/oauth/usage` with 300s+jitter cadence, halt on persistent 401/403. No official API exists. Own tokens, own homelab, own-quota reads only. ToS residual A-01 accepted: Feb 2026 OAuth-token policy is gray not red; fingerprint-minimal UA mitigates detection. | Validated (Phase 05, 2026-04-16 — production exporter `mcow:9101` polling 2 tokens with 0% 429 rate; formal 24h soak short-circuited by operational evidence) |

### ADR D-07 detail (2026-04-16, Phase 05 feasibility gate)

**Context.** v2.0 milestone requires per-token weekly + 5h session utilization for 2-5 OAuth tokens. No official API exposes this. `/api/oauth/usage` is the endpoint Claude Code itself consumes; schema (`five_hour.utilization`, `seven_day.utilization`, `seven_day_opus.utilization`, `resets_at`) stable since April 2025.

**Decision.** Endpoint-scrape from mcow — direct Moscow ISP egress works (no App Connector needed, Plan 05-01 evidence). Cadence 300s +/-60s jitter per token, exponential backoff on 429, halt-on-persistent-401/403.

**ToS reasoning.** Anthropic's Feb 2026 policy restricts OAuth tokens to "Claude Code and Claude.ai". Homelab monitor of own tokens is within-spirit (observability of own-account state, tokens still primarily consumed by Claude Code on same hosts, data never leaves Tailnet). Residual enforcement risk accepted: Anthropic may silently revoke tokens detected as non-CLI. Mitigation: fingerprint-minimal UA; halt-on-401/403 caps blast radius to one revocation per token.

**Alternatives rejected.**
- Local-log tail (ccusage-style) — ruled out by D-05-01: "find way to get same data with only auth token"
- Claude Console Admin API — API-key-auth only, not Max subscribers
- No monitoring — v1.0 observability requirement

**Sign-off conditions that flip this decision.**
- Anthropic explicitly prohibits `/api/oauth/usage` for non-CLI clients, OR
- Silent token revocation with non-CLI detection as trigger, OR
- Official quota API ships (GitHub issues #19880, #32796)

**Short-circuit justification.** Formal 24h disposable soak (Plan 05-03 Task 2, Plan 05-04) skipped. Production exporter was already running when Phase 05 execution started. Live evidence (118 successful polls across 2 tokens, 0% 429 rate) supersedes throwaway soak evidence.

**Operator sign-off:** Maksim Chugunov (shadeoflance@gmail.com), 2026-04-16.

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
*Last updated: 2026-04-16 — v2.0 closed with pivot; v3.0 milestone started (Unified Stack Migration — homelab admin dashboard)*
