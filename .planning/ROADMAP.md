# Roadmap: Homelab Infrastructure

## Milestones

- ✅ **v1.0 Homelab IaC** — Phases 1-4 (shipped 2026-04-15) — see `.planning/milestones/v1.0-ROADMAP.md`
- ✅ **v2.0 Claude Code Usage Monitor** — Phases 05-11 (closed with pivot 2026-04-16) — see `.planning/milestones/v2.0-ROADMAP.md`
- ✅ **v3.0 Unified Stack Migration** — Phases 12-22 (shipped 2026-04-21) — see `.planning/milestones/v3.0-ROADMAP.md`

## Phases

<details>
<summary>✅ v1.0 Homelab Infrastructure-as-Code (Phases 1-4) — SHIPPED 2026-04-15</summary>

- [x] Phase 1: Foundations (3/3 plans) — completed 2026-04-13
- [x] Phase 2: Service Documentation (6/6 plans) — completed 2026-04-14
- [x] Phase 3: Health Monitoring (5/5 plans) — completed 2026-04-15
- [x] Phase 4: Operator Dashboard (4/4 plans) — completed 2026-04-15

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v2.0 Claude Code Usage Monitor (Phases 05-11) — CLOSED WITH PIVOT 2026-04-16</summary>

- [x] Phase 05: Feasibility Gate — COMPLETE formal (ADR D-07 locked)
- [x] Phase 06: Exporter Skeleton — COMPLETE operational (running on mcow:9101)
- [x] Phase 07: Prometheus Wiring — COMPLETE operational (docker-tower scraping)
- [~] Phase 08: SOPS Token Registry — SUPERSEDED by v3.0 Phase 13
- [~] Phase 09: Alerts — MOVED to v3.0 Phase 20
- [~] Phase 10: Grafana Dashboard — KILLED (replaced by v3.0 Next.js dashboard)
- [~] Phase 11: Multi-token Scale-out — ABSORBED into v3.0 token CRUD

Full details: `.planning/milestones/v2.0-ROADMAP.md`
Close notes: `.planning/milestones/v2.0-MILESTONE-CLOSE.md`

</details>

<details>
<summary>✅ v3.0 Unified Stack Migration (Phases 12-22) — SHIPPED 2026-04-21</summary>

- [x] Phase 12: Infra Foundation (10/10 plans) — completed 2026-04-17
- [x] Phase 13: Claude Tokens Page (7/7 plans) — completed 2026-04-17
- [x] Phase 14: Global Overview + Audit Log (7/7 plans) — completed 2026-04-17
- [x] Phase 15: Tailwind v4 Migration + tailwind-merge 3 (2/2 plans) — completed 2026-04-19
- [x] Phase 16: TypeScript 6.0 Upgrade (1/1 plan) — completed 2026-04-17
- [x] Phase 17: ESLint 10 + Node Types 24 Upgrade (1/1 plan) — completed 2026-04-17
- [x] Phase 17.1: Jellyfin LXC Migration (INSERTED, 5/5 plans) — completed 2026-04-21
- [~] Phase 18: VoidNet Management — DEFERRED to v4.0
- [x] Phase 19: Proxmox Ops read-only (3/3 plans) — completed 2026-04-21
- [x] Phase 20: Alerts Panel + Rules (3/3 plans) — completed 2026-04-21
- [~] Phase 21: Web Terminal — DEFERRED to v4.0
- [x] Phase 22: Security Review + Launch (6/6 plans) — completed 2026-04-21

Full details: `.planning/milestones/v3.0-ROADMAP.md`

</details>

### 🚧 v4.0 — (Planned)

Deferred from v3.0:
- Phase 18: VoidNet Management (blocked on voidnet-api admin JSON endpoints)
- Phase 21: Web Terminal (node-pty feasibility spike + xterm.js)

v3.1 hardening backlog:
- SEC-01: Caddy per-IP rate limit on auth routes (xcaddy self-build or upstream fix)
- SEC-11: Strict CSP / nonce-based (drop `unsafe-inline`)

Run `/gsd-new-milestone` to scope.

## Backlog (Unscheduled)

Captured issues not yet scoped to a phase. Promote to a numbered phase when ready.

- ~~**999.1 — /tokens sops PATH (homelab-admin.service)**~~ — CLOSED 2026-04-21 by Phase 13 gap Plan 13-07 (Task 3). `Environment=PATH=/usr/local/bin:/usr/bin:/bin` added to `servers/mcow/homelab-admin.service`.
