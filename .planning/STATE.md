---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Unified Stack Migration (homelab admin dashboard)
status: planning
stopped_at: v3.0 roadmap created — 8 phases (12-19), ready to plan Phase 12
last_updated: "2026-04-16T21:00:00.000Z"
last_activity: 2026-04-16 -- v3.0 roadmap written (ROADMAP.md + REQUIREMENTS.md traceability)
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-16)

**Core value:** Any server's full stack can be reliably reproduced from this repo alone — no tribal knowledge, no guessing, no data loss on migration.
**Current focus:** v3.0 Phase 12 — Infra Foundation (Next.js scaffold, GitHub OAuth, Caddy, secrets)

## Current Position

Phase: 12 of 19 (Infra Foundation)
Plan: — (not yet planned)
Status: Ready to plan
Last activity: 2026-04-16 — v3.0 roadmap created, 8 phases (12-19), 58 requirements mapped

Progress: [          ] 0% — v3.0 not started

## Performance Metrics

**v1.0 reference (shipped 2026-04-15):**
- Total plans completed: 23
- Timeline: 2026-04-10 → 2026-04-15 (6 days)

**v3.0 scope:** 8 phases (12-19), 58 requirements across 9 categories

## Accumulated Context

### Decisions

- **D-07 (Claude quota access):** Endpoint-scrape validated Phase 05 — production exporter mcow:9101 polling 2 tokens, 0% 429 rate. See PROJECT.md §Key Decisions.
- **v3.0 stack locked:** Bun + Next.js 15.2.4 (CVE-2025-66478 pin) + React 19 + Tailwind + shadcn/ui + Caddy + Drizzle + bun:sqlite. See research/STACK.md.
- **Auth switched:** Tailscale identity headers dropped in favor of GitHub OAuth (Auth.js v5) — eliminates header-spoofing risk (P-02). See PITFALLS.md.
- **Parallel phases:** 15 (VoidNet), 16 (Proxmox), 17 (Alerts) are parallel-safe after Phase 14 completes.

### Blockers/Concerns

- Phase 13 first task: SOPS write spike (`spawnSync('sops', ...)`) + Zod 4 + shadcn forms compat check — must resolve before token CRUD ships
- Phase 15 (VoidNet): blocked on voidnet-api adding JSON admin endpoints (parallel milestone in voidnet repo)
- Phase 18 (Terminal): node-pty LXC feasibility spike is mandatory first task — fallback to ssh2 pure-JS pipe if PTY allocation fails in mcow LXC
- docker-tower cleanup: `docker volume rm monitoring_{grafana,alertmanager}-data` scheduled 2026-04-22

### Pending Todos

- 2026-04-22: docker-tower volume cleanup (grafana + alertmanager data volumes)
- Before Phase 12: verify Cloudflare API token exists in secrets/ (zone:dns:edit for makscee.ru)
- Before Phase 12: confirm tailscale-nginx-auth socket path on mcow (`/run/tailscale/` or `/var/run/tailscale/`)
- Before Phase 12: confirm mcow LXC privilege level (privileged/unprivileged)

## Session Continuity

Last session: 2026-04-16
Stopped at: v3.0 roadmap created — ROADMAP.md written with Phases 12-19, REQUIREMENTS.md traceability updated
Resume file: None — next action is `/gsd-plan-phase 12`
