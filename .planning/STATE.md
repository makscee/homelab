---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: — Claude Code Usage Monitor
status: planning
stopped_at: Phase 05 context gathered
last_updated: "2026-04-16T13:30:34.995Z"
last_activity: "2026-04-16 — v2.0 roadmap written: 7 phases, 33 requirements, 100% coverage"
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-16)

**Core value:** Any server's full stack can be reliably reproduced from this repo alone — no tribal knowledge, no guessing, no data loss on migration.
**Current focus:** v2.0 — Claude Code Usage Monitor. Roadmap created. Phase 05 is a feasibility go/no-go gate — validate `api.anthropic.com/api/oauth/usage` is reachable from mcow via nether App Connector, survives 300s polling with <5% 429 rate, and schema matches expectations before committing to implementation work.

## Current Position

Phase: 05 — Feasibility Gate (not started)
Plan: — (awaiting `/gsd-plan-phase 05`)
Status: ROADMAP created, awaiting phase planning
Last activity: 2026-04-16 — v2.0 roadmap written: 7 phases, 33 requirements, 100% coverage

Progress: [          ] 0% (0/7 v2.0 phases)

## Performance Metrics

**v1.0 reference (shipped 2026-04-15):**

- Total plans completed: 18
- Timeline: 2026-04-10 → 2026-04-15 (6 days)
- Git: 116 commits, 190 files changed (+44,833 / -2)

**v2.0 targets:**

- 7 phases (05-11), 33 requirements across 6 categories (TOKEN, EXP, MON, DASH, ALERT, DEPLOY)
- Phase 05 is a go/no-go gate — milestone may halt here if feasibility fails (pivot to local-log approach, replan, or abandon)

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. v1.0 decisions are in Validated status.

**v2.0 pending ADR:**

- **D-07 (Phase 05 output):** ToS interpretation + endpoint-scrape approach rationale — user considers monitoring-own-CC tokens in-scope; ADR must be written during Phase 05 feasibility work

### Open Blockers/Concerns (carried from v1.0)

- ~~DiskUsageCritical persistent on tower + docker-tower~~ — root cause fixed 2026-04-16 (path drift `/opt/homestack` → `/opt/homelab`, rule threshold raised to 0.98)
- ~~stale compose path cleanup~~ — `/opt/homestack` + `/opt/docker-tower-api` deleted 2026-04-16
- docker-tower cleanup scheduled 2026-04-22: `docker volume rm monitoring_{grafana,alertmanager}-data` after 7-day rollback window expires
- nether secrets cleanup — `GF_SECURITY_ADMIN_*` unreferenced post-decommission (v1.0 tech-debt)
- D-06 ADR update pending (v1.0 tech-debt)
- Backup target destination not yet specified — needed before DR phases (future milestone)

### v2.0 Risks

- **Feasibility (Phase 05 dominant):** Anthropic `/api/oauth/usage` is undocumented, has known 429-storm bug, and ToS-adjacent (Feb 2026 policy restricts OAuth tokens to Claude Code + Claude.ai). Phase 05 is the go/no-go gate.
- **Egress (Phase 05 pre-work):** Moscow ISP behavior vs `api.anthropic.com` unverified. Base rate says assume hostile (Telegram v1.0 precedent). First Phase 05 action must be `ssh root@mcow 'curl -m 8 -sSIL https://api.anthropic.com/'` BEFORE writing exporter code.
- **Secret leakage (Phases 06-08):** v1.0 S-03 bug replay risk — token file perms `install -m 0440 root:65534` lesson must transfer verbatim.
- **Alert flap (Phase 09):** Weekly reset boundary triggers HIGH→RESOLVE→HIGH flap; `for: 15m` + hysteresis mandatory.

### Pending Todos

- 2026-04-22: `docker volume rm monitoring_grafana-data monitoring_alertmanager-data` on docker-tower
- v2.0 Phase 05 first action: `curl -m 8 -sSIL https://api.anthropic.com/` from mcow to validate Moscow egress path before anything else

## Session Continuity

Last session: 2026-04-16T13:30:34.974Z
Stopped at: Phase 05 context gathered
Resume file: .planning/phases/05-feasibility-gate/05-CONTEXT.md
