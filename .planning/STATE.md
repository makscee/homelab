---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: — Claude Code Usage Monitor
status: executing
stopped_at: Completed 12-01-PLAN.md
last_updated: "2026-04-16T22:33:35.038Z"
last_activity: 2026-04-16
progress:
  total_phases: 8
  completed_phases: 5
  total_plans: 33
  completed_plans: 24
  percent: 73
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-16)

**Core value:** Any server's full stack can be reliably reproduced from this repo alone — no tribal knowledge, no guessing, no data loss on migration.
**Current focus:** Phase 12 — infra-foundation

## Current Position

Phase: 12 (infra-foundation) — EXECUTING
Plan: 2 of 10
Status: Ready to execute
Last activity: 2026-04-16

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
- [Phase 12-infra-foundation]: Next.js bumped to 15.5.15 (from 15.2.4) — 15.2.x fails bun audit due to GHSA-q4gf-8mx6-v5v3 DoS CVE affecting <15.5.15
- [Phase 12-infra-foundation]: bun.lock (text format) committed as lockfile — Bun 1.3.5 generates .lock not .lockb binary

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

Last session: 2026-04-16T22:33:35.035Z
Stopped at: Completed 12-01-PLAN.md
Resume file: None
