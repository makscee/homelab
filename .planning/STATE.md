---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: — Claude Code Usage Monitor
status: executing
stopped_at: Completed 14-01-PLAN.md (checkpoint at Task 3 — operator deploy required)
last_updated: "2026-04-17T11:39:47.564Z"
last_activity: 2026-04-17
progress:
  total_phases: 10
  completed_phases: 7
  total_plans: 43
  completed_plans: 39
  percent: 91
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-16)

**Core value:** Any server's full stack can be reliably reproduced from this repo alone — no tribal knowledge, no guessing, no data loss on migration.
**Current focus:** Phase 14 — global-overview-audit-log

## Current Position

Phase: 14 (global-overview-audit-log) — EXECUTING
Plan: 2 of 5
Status: Ready to execute
Last activity: 2026-04-17

Progress: [          ] 0% — v3.0 not started

## Performance Metrics

**v1.0 reference (shipped 2026-04-15):**

- Total plans completed: 33
- Timeline: 2026-04-10 → 2026-04-15 (6 days)

**v3.0 scope:** 8 phases (12-19), 58 requirements across 9 categories

## Accumulated Context

### Decisions

- **D-07 (Claude quota access):** Endpoint-scrape validated Phase 05 — production exporter mcow:9101 polling 2 tokens, 0% 429 rate. See PROJECT.md §Key Decisions.
- **v3.0 stack locked:** Bun + Next.js 15.2.4 (CVE-2025-66478 pin) + React 19 + Tailwind + shadcn/ui + Caddy + Drizzle + bun:sqlite. See research/STACK.md.
- **Auth switched:** Tailscale identity headers dropped in favor of GitHub OAuth (Auth.js v5) — eliminates header-spoofing risk (P-02). See PITFALLS.md.
- **Parallel phases:** 15 (VoidNet), 16 (Proxmox), 17 (Alerts) are parallel-safe after Phase 14 completes.
- [Phase 12-infra-foundation]: Next.js bumped to 15.5.15 (from 15.2.4) — 15.2.x fails bun audit due to GHSA-q4gf-8mx6-v5v3 DoS CVE affecting <15.5.15
- [Phase 12-infra-foundation]: bun.lock (text format) committed as lockfile — Bun 1.3.5 generates .lock not .lockb binary
- [Phase 12]: bun_version pinned to 1.1.38 in group_vars/all.yml (do not bump to 1.2.x without P-05 re-validation)
- [Phase 12]: mcow confirmed KVM — strict systemd hardening safe for Plan 07 (ProtectSystem=strict, PrivateTmp=yes); P-15 degraded path not needed
- [Phase 12-infra-foundation]: KVM confirmed — full strict systemd hardening block used for homelab-admin.service (ProtectSystem=strict + PrivateTmp=yes)
- [Phase 12-infra-foundation]: Used sops --set for non-interactive key injection into mcow.sops.yaml; OAuth creds are placeholders pending operator GitHub app creation
- [Phase 12-infra-foundation]: Ansible task include pattern established: delegate_to localhost decrypt + no_log + drop facts after render
- [Phase 12-infra-foundation]: blockinfile is ansible.builtin (core), not community.general — FQCN corrected from plan spec
- [Phase 12-infra-foundation]: Next.js 15.5.15 satisfies >=15.2.4 SC; bun audit clean; SC #5 idempotency exceptions documented (env render + rsync ownership + handler restart)
- [Phase 14]: cAdvisor uses community.docker.docker_container directly (not role) for explicit Tailnet-bind control; mcow uses port 18080 (voidnet-api owns 8080)

### Blockers/Concerns

- Phase 13 first task: SOPS write spike (`spawnSync('sops', ...)`) + Zod 4 + shadcn forms compat check — must resolve before token CRUD ships
- Phase 15 (VoidNet): blocked on voidnet-api adding JSON admin endpoints (parallel milestone in voidnet repo)
- Phase 18 (Terminal): node-pty LXC feasibility spike is mandatory first task — fallback to ssh2 pure-JS pipe if PTY allocation fails in mcow LXC
- docker-tower cleanup: `docker volume rm monitoring_{grafana,alertmanager}-data` scheduled 2026-04-22

### Pending Todos

- 2026-04-22: docker-tower volume cleanup (grafana + alertmanager data volumes)

### Resolved Pre-Phase-12 Todos (closed 2026-04-17 by Plan 12-03)

- ~~Before Phase 12: verify Cloudflare API token exists~~ — OBSOLETE. Phase 12 CONTEXT.md D-12-12 switched from LE DNS-01 to LE HTTP-01 (mirrors `vibe.makscee.ru`); no Cloudflare API integration needed.
- ~~Before Phase 12: confirm tailscale-nginx-auth socket path on mcow~~ — OBSOLETE. Phase 12 CONTEXT.md D-12-06 switched from Tailscale header auth to GitHub OAuth (Auth.js v5); tailscale-nginx-auth not used.
- ~~Before Phase 12: confirm mcow LXC privilege level~~ — RESOLVED. mcow is KVM (not LXC). See `servers/mcow/lxc-probe.md`; strict hardening block wired into Plan 12-07.

## Session Continuity

Last session: 2026-04-17T11:39:47.561Z
Stopped at: Completed 14-01-PLAN.md (checkpoint at Task 3 — operator deploy required)
Resume file: None
