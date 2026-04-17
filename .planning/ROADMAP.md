# Roadmap: Homelab Infrastructure

## Milestones

- **v1.0 Homelab IaC** — Phases 1-4 (shipped 2026-04-15) — see `.planning/milestones/v1.0-ROADMAP.md`
- **v2.0 Claude Code Usage Monitor** — Phases 05-11 (closed with pivot 2026-04-16) — see `.planning/milestones/v2.0-ROADMAP.md`
- **v3.0 Unified Stack Migration** — Phases 12-22 (active) — homelab admin dashboard at `homelab.makscee.ru`

## Phases

<details>
<summary>v1.0 Homelab Infrastructure-as-Code (Phases 1-4) — SHIPPED 2026-04-15</summary>

- [x] Phase 1: Foundations (3/3 plans) — completed 2026-04-13
- [x] Phase 2: Service Documentation (6/6 plans) — completed 2026-04-14
- [x] Phase 3: Health Monitoring (5/5 plans) — completed 2026-04-15
- [x] Phase 4: Operator Dashboard (4/4 plans) — completed 2026-04-15

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>v2.0 Claude Code Usage Monitor (Phases 05-11) — CLOSED WITH PIVOT 2026-04-16</summary>

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

### v3.0 — Unified Stack Migration (Active)

**Milestone Goal:** Build the homelab admin dashboard at `homelab.makscee.ru` — a mutation-capable internal tool that proxies writes to SOPS, VoidNet API, Proxmox REST API, and Alertmanager, while reading from Prometheus + claude-usage-exporter. Kill Grafana-as-dashboard. Unify homelab + VoidNet + Animaya on one TypeScript/Next.js stack with a shared `hub-shared/ui-kit`.

**Dependency graph:**
```
Phase 12 (Infra Foundation) → all downstream phases
Phase 13 (Tokens) → depends on Phase 12
Phase 14 (Overview + Audit Log) → depends on Phase 13
Phases 15, 16, 17 (Tailwind v4, TypeScript 6, ESLint 10) → frontend stack upgrades, sequential after Phase 14
Phases 18, 19, 20 (VoidNet, Proxmox, Alerts) → parallel-safe after Phase 17
Phase 21 (Web Terminal) → depends on Phase 19 (needs Proxmox LXC context)
Phase 22 (Security + Launch) → depends on all others
```

- [x] **Phase 12: Infra Foundation** - Next.js scaffold, Caddy site block, GitHub OAuth, secrets wiring, base layout, security headers (completed 2026-04-17)
- [x] **Phase 13: Claude Tokens Page** - SOPS registry CRUD, per-token gauges, history chart, exporter rebind (v2.0 debt) (completed 2026-04-17)
- [x] **Phase 14: Global Overview + Audit Log** - First dashboard page with Prometheus data, audit log infrastructure for all writes (completed 2026-04-17)
- [ ] **Phase 15: Tailwind v4 Migration (3.4 → 4.2) + tailwind-merge 3** - Frontend stack upgrade
- [x] **Phase 16: TypeScript 6.0 Upgrade with Deprecation Fixes** - Frontend stack upgrade (completed 2026-04-17)
- [ ] **Phase 17: ESLint 10 + Node Types 24 Upgrade** - Frontend stack upgrade
- [ ] **Phase 18: VoidNet Management** - Proxy to voidnet-api admin JSON endpoints: users, credits, boxes (parallel-safe after Phase 17)
- [ ] **Phase 19: Proxmox Ops** - LXC lifecycle management via Proxmox REST API (parallel-safe after Phase 17)
- [ ] **Phase 20: Alerts Panel + Rules** - Alertmanager consumer + Prometheus rules + Telegram delivery (parallel-safe after Phase 17)
- [ ] **Phase 21: Web Terminal** - xterm.js + ssh2 PTY relay; node-pty feasibility spike required first
- [ ] **Phase 22: Security Review + Launch** - Hardening, audit, ui-kit extraction finalization, launch checklist

## Phase Details

### Phase 12: Infra Foundation

**Goal**: The admin dashboard skeleton is deployed on mcow, reachable at `homelab.makscee.ru` over Tailnet only, secured by GitHub OAuth, with hardened HTTP headers and all secrets in SOPS — every subsequent phase can ship a page into this shell without touching infrastructure.

**Depends on**: v2.0 closed
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-06, INFRA-07, INFRA-08, UI-03, UI-04, SEC-02, SEC-04, SEC-05, SEC-06, SEC-07

**Plans**: 10 plans (all complete)
**UI hint**: yes

---

### Phase 13: Claude Tokens Page

**Goal**: Operator can manage all Claude Code tokens from the web UI — view live utilization gauges, add/rotate/disable/delete tokens via SOPS backend writes — and the v2.0 exporter tech-debt is paid (Tailnet-only bind, uid 65534).

**Depends on**: Phase 12
**Requirements**: TOKEN-01..07, SEC-03

**Plans**: 7 plans (5 complete, 2 gap-closure pending)
**UI hint**: yes

Plans:
- [x] 14-01-PLAN.md — audit infra (SQLite + helpers)
- [x] 14-02-PLAN.md — /audit page
- [x] 14-03-PLAN.md — emitAudit wiring across mutation routes
- [x] 14-04-PLAN.md — /overview host tiles + PromQL
- [x] 14-05-PLAN.md — alerts card + nav badge
- [x] 14-06-PLAN.md — gap closure: bun:sqlite shim runtime proxy (UAT tests 3, 4, 6)
- [ ] 14-07-PLAN.md — gap closure: PROMETHEUS_URL env + default (UAT test 5)

---

### Phase 14: Global Overview + Audit Log

**Goal**: The `/` dashboard page shows a live snapshot of all 6 Tailnet hosts' health and Claude usage summary, and the audit log infrastructure is in place — every mutation route in any subsequent phase can be wrapped with one import.

**Depends on**: Phase 13
**Requirements**: DASH-01..05, INFRA-05

**Plans**: 7 plans (5 complete, 2 gap-closure pending)
**UI hint**: yes

Plans:
- [x] 14-01-PLAN.md — audit infra (SQLite + helpers)
- [x] 14-02-PLAN.md — /audit page
- [x] 14-03-PLAN.md — emitAudit wiring across mutation routes
- [x] 14-04-PLAN.md — /overview host tiles + PromQL
- [x] 14-05-PLAN.md — alerts card + nav badge
- [ ] 14-06-PLAN.md — gap closure: bun:sqlite shim runtime proxy (UAT tests 3, 4, 6)
- [ ] 14-07-PLAN.md — gap closure: PROMETHEUS_URL env + default (UAT test 5)

---

### Phase 15: Tailwind v4 migration (3.4 to 4.2) + tailwind-merge 3

**Goal:** apps/admin frontend stack upgraded from Tailwind v3.4 → v4.2 (CSS-first config, autoprefixer dropped) and tailwind-merge v2.5 → v3.0 via official codemod, zero visual or build regression, scope strictly upgrade-only.
**Requirements**: D-1, D-2, D-3, D-4, D-5 (see 15-CONTEXT.md)
**Depends on:** Phase 14
**Plans:** 2 plans

Plans:
- [x] 15-01-PLAN.md — codemod + CSS-first migration + autoprefixer drop + human-verify visual fidelity (completed 2026-04-17)
- [ ] 15-02-PLAN.md — tailwind-merge v3 bump + Playwright visual spot-check (fix-on-break)

---

### Phase 16: TypeScript 6.0 upgrade with deprecation fixes

**Goal:** apps/admin upgraded from TypeScript ^5.6.0 → ^6.0.3 with zero refactor surface — typecheck, build, and lint all green, deployed to mcow, Playwright smoke clean on /, /audit, /alerts. Research confirmed baseline is clean and tsconfig uses no TS-6-deprecated options, so this is a single mechanical bump + verification.
**Requirements**: D-1, D-2, D-3, D-4, D-5 (see 16-CONTEXT.md)
**Depends on:** Phase 15
**Plans:** 1/1 plans complete

Plans:
- [x] 16-01-PLAN.md — typescript ^6.0.3 bump + typecheck/build/lint + Ansible deploy + Playwright smoke on /, /audit, /alerts

---

### Phase 17: ESLint 10 + Node types 24 upgrade

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 16
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 17 to break down)

---

### Phase 18: VoidNet Management

**Goal**: Operator can manage VoidNet users and Claude boxes from the admin dashboard — view user list, adjust credits, ban/unban, and inspect per-user boxes with masked SSH credentials — all writes audit-logged.

**Depends on**: Phase 17 (parallel-safe with Phases 19 and 20)
**Requirements**: VOIDNET-01..08

**Plans**: TBD
**UI hint**: yes

---

### Phase 19: Proxmox Ops

**Goal**: Operator can manage LXC containers on tower from the admin dashboard — view all containers, start/shutdown/restart with graceful default, spawn new containers, and inspect config — all destructive operations guarded and audit-logged.

**Depends on**: Phase 17 (parallel-safe with Phases 18 and 20)
**Requirements**: PROXMOX-01..06

**Plans**: TBD
**UI hint**: yes

---

### Phase 20: Alerts Panel + Rules

**Goal**: Operator can see all current Alertmanager firing alerts on `/alerts`, Claude quota alert rules are deployed and unit-tested, and Telegram delivery is proven end-to-end — absorbing v2.0 Phase 09 scope entirely.

**Depends on**: Phase 17 (parallel-safe with Phases 18 and 19)
**Requirements**: ALERT-01..06

**Plans**: TBD
**UI hint**: yes

---

### Phase 21: Web Terminal

**Goal**: Operator can open an in-browser SSH terminal to any Proxmox LXC via xterm.js — session is auth-gated, resource-limited, audit-logged, and cleans up on disconnect.

**Depends on**: Phase 19 (needs Proxmox LXC context + SSH credential retrieval pattern)
**Requirements**: TERM-01..06

**Plans**: TBD (node-pty feasibility spike is mandatory first task)
**UI hint**: yes

---

### Phase 22: Security Review + Launch

**Goal**: The dashboard passes a security review (bundle analysis, header audit, Proxmox token scope check, bun audit), the shared ui-kit repo is fully extracted and wired as a git submodule, and the app is ready for ongoing operator use.

**Depends on**: Phase 21 (all features complete)
**Requirements**: UI-01, UI-02, SEC-01, SEC-08

**Plans**: TBD
**UI hint**: yes

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 12. Infra Foundation | v3.0 | 10/10 | Complete | 2026-04-17 |
| 13. Claude Tokens Page | v3.0 | 5/5 | Complete | 2026-04-17 |
| 14. Global Overview + Audit Log | v3.0 | 6/7 | In Progress|  |
| 15. Tailwind v4 Migration | v3.0 | 1/2 | In Progress | - |
| 16. TypeScript 6.0 Upgrade | v3.0 | 1/1 | Complete   | 2026-04-17 |
| 17. ESLint 10 + Node Types 24 | v3.0 | 0/? | Not started | - |
| 18. VoidNet Management | v3.0 | 0/? | Not started | - |
| 19. Proxmox Ops | v3.0 | 0/? | Not started | - |
| 20. Alerts Panel + Rules | v3.0 | 0/? | Not started | - |
| 21. Web Terminal | v3.0 | 0/? | Not started | - |
| 22. Security Review + Launch | v3.0 | 0/? | Not started | - |

## Backlog (Unscheduled)

Captured issues not yet scoped to a phase. Promote to a numbered phase when ready.

- **999.1 — /tokens sops PATH (homelab-admin.service)** — Captured 2026-04-17 during Phase 15-01 UAT. `/tokens` throws digest error `1852942543`; journal: `Error [TypeError]: Executable not found in $PATH: "sops"`. Root cause: systemd unit `homelab-admin.service` uses `ProtectSystem=strict` which hides `/usr/local/bin/sops` from the admin user's `$PATH`. **Not a Tailwind regression.** Fix: extend service unit `Environment=PATH=...` to include `/usr/local/bin` (or add explicit `BindReadOnlyPaths=/usr/local/bin/sops`) in `ansible/playbooks/deploy-homelab-admin.yml`. Likely Phase 13 follow-up.
