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
Phase 22 (Security + Launch) → depends on 12-17, 19, 20 (Phases 18 and 21 deferred to v4.0)
```

**Scope cut 2026-04-21:** Phases 18 (VoidNet) and 21 (Web Terminal) deferred to v4.0. v3.0 ships with Phase 22 directly after Phase 20 security review.

- [x] **Phase 12: Infra Foundation** - Next.js scaffold, Caddy site block, GitHub OAuth, secrets wiring, base layout, security headers (completed 2026-04-17)
- [x] **Phase 13: Claude Tokens Page** - SOPS registry CRUD, per-token gauges, history chart, exporter rebind (v2.0 debt) (completed 2026-04-17)
- [x] **Phase 14: Global Overview + Audit Log** - First dashboard page with Prometheus data, audit log infrastructure for all writes (completed 2026-04-17)
- [ ] **Phase 15: Tailwind v4 Migration (3.4 → 4.2) + tailwind-merge 3** - Frontend stack upgrade
- [x] **Phase 16: TypeScript 6.0 Upgrade with Deprecation Fixes** - Frontend stack upgrade (completed 2026-04-17)
- [x] **Phase 17: ESLint 10 + Node Types 24 Upgrade** - Frontend stack upgrade (completed 2026-04-17)
- [~] **Phase 18: VoidNet Management** - DEFERRED to v4.0 (2026-04-21) — blocked on voidnet-api admin JSON endpoints; not required to ship v3.0
- [x] **Phase 19: Proxmox Ops** - LXC lifecycle management via Proxmox REST API (read-only token; completed 2026-04-21, UAT 4/2/0)
- [x] **Phase 20: Alerts Panel + Rules** - Alertmanager consumer + Prometheus rules + Telegram delivery (parallel-safe after Phase 17) (completed 2026-04-21)
- [~] **Phase 21: Web Terminal** - DEFERRED to v4.0 (2026-04-21) — node-pty LXC spike + xterm.js integration; not required to ship v3.0
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

**Plans**: 7 plans (all complete)
**UI hint**: yes

Plans:
- [x] 14-01-PLAN.md — audit infra (SQLite + helpers)
- [x] 14-02-PLAN.md — /audit page
- [x] 14-03-PLAN.md — emitAudit wiring across mutation routes
- [x] 14-04-PLAN.md — /overview host tiles + PromQL
- [x] 14-05-PLAN.md — alerts card + nav badge
- [x] 14-06-PLAN.md — gap closure: bun:sqlite shim runtime proxy (UAT tests 3, 4, 6)
- [x] 14-07-PLAN.md — gap closure: PROMETHEUS_URL env + default (UAT test 5)

---

### Phase 14: Global Overview + Audit Log

**Goal**: The `/` dashboard page shows a live snapshot of all 6 Tailnet hosts' health and Claude usage summary, and the audit log infrastructure is in place — every mutation route in any subsequent phase can be wrapped with one import.

**Depends on**: Phase 13
**Requirements**: DASH-01..05, INFRA-05

**Plans**: 7 plans (all complete)
**UI hint**: yes

Plans:
- [x] 14-01-PLAN.md — audit infra (SQLite + helpers)
- [x] 14-02-PLAN.md — /audit page
- [x] 14-03-PLAN.md — emitAudit wiring across mutation routes
- [x] 14-04-PLAN.md — /overview host tiles + PromQL
- [x] 14-05-PLAN.md — alerts card + nav badge
- [x] 14-06-PLAN.md — gap closure: bun:sqlite shim runtime proxy (UAT tests 3, 4, 6)
- [x] 14-07-PLAN.md — gap closure: PROMETHEUS_URL env + default (UAT test 5)

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
**Plans:** 1/1 plans complete

Plans:
- [ ] TBD (run /gsd-plan-phase 17 to break down)

---

### Phase 17.1: Migrate Jellyfin to dedicated LXC on tower (INSERTED)

**Goal:** Jellyfin runs natively on its own Proxmox LXC (CT 101) on tower with exclusive /dev/dri ownership and RO media bindmounts, serving 1080p + 4K without buffering. Old Docker container kept as hot standby through 2026-04-25. (External ingress: `http://jellyfin.makscee.ru:22098/` → router :22098 forward → tower socat `jellyfin-fwd-22098.service` → 10.10.20.11:8096; LAN hairpin :8096 still via iptables DNAT on vmbr0; D-17 HW transcode formally deferred until BIOS iGPU enable — operator signed off CPU-only playback 2026-04-19. 17.1-04's DNAT approach failed WAN UAT — replies policy-routed onto tailscale0 — corrected post-phase 2026-04-19 by replacing with socat.)
**Requirements**: D-01..D-18 (see 17.1-CONTEXT.md)
**Depends on:** Phase 17
**Plans:** 5/5 plans complete

Plans:
- [x] 17.1-01-PLAN.md — LXC 101 provisioning (pct create, dev0:, mp0/mp1 RO, Tailscale join, inventory)
- [x] 17.1-02-PLAN.md — Jellyfin deb install + systemd tmpfs + verify probe *(complete with deferred acceptance: D-17 HW transcode deferred to later BIOS window — operator chose CPU-only for perf testing; see 17.1-02-SUMMARY.md)*
- [x] 17.1-03-PLAN.md — state rsync + cutover (user-gated maintenance window)
- [x] 17.1-04-PLAN.md — iptables DNAT ingress swap on tower vmbr0 + Tailscale accept-routes=false
- [x] 17.1-05-PLAN.md — verification + docs + 2026-04-25 cleanup scheduling

### Phase 18: VoidNet Management (DEFERRED — handled in voidnet repo)

**Goal**: Operator can manage VoidNet users and Claude boxes from the admin dashboard — view user list, adjust credits, ban/unban, and inspect per-user boxes with masked SSH credentials — all writes audit-logged.

**Status**: Deferred 2026-04-19 — ongoing work by another agent in the voidnet repo supersedes this scope in the homelab admin dashboard. Revisit if/when operator wants admin-dashboard surfacing; VOIDNET-01..08 remain pending under that future reopen.

**Depends on**: Phase 17 (parallel-safe with Phases 19 and 20)
**Requirements**: VOIDNET-01..08 (pending, deferred)

**Plans**: deferred
**UI hint**: yes

---

### Phase 19: Proxmox Ops (read-only)

**Goal**: Operator can open `/proxmox` in the admin dashboard and see a live, read-only list of all LXCs on tower with health/resources, plus drill into a detail panel (config dump + recent task log + network info). No destructive or mutating operations from the dashboard — start/stop/spawn/destroy remain in Proxmox web UI. Observability + stability check, not remote control.

**Scope note (2026-04-19):** Shrunk from original "full ops" scope. PROXMOX-02/03/04 deferred to future phases pending operator demand. PROXMOX-06 tightened: role scoped to VM.Audit + Datastore.Audit only (no VM.PowerMgmt).

**Depends on**: Phase 17 (parallel-safe with Phases 18 and 20)
**Requirements**: PROXMOX-01, PROXMOX-05, PROXMOX-06 (IN) · PROXMOX-02, PROXMOX-03, PROXMOX-04 (DEFERRED)

**Plans**: 3 plans

Plans:
- [x] 19-01-PLAN.md — Ansible: provision PVE role/user/token + tower CA into SOPS; extend deploy to render env + CA on mcow
- [x] 19-02-PLAN.md — Next.js API proxy: lib/proxmox.server.ts (CA-pinned undici) + 4 read-only routes (lxcs list, detail, tasks, task log)
- [ ] 19-03-PLAN.md — UI: /proxmox list (10s poll) + /proxmox/[vmid] detail (30s poll, click-to-expand task log) + Playwright MCP smoke + grep gate

**UI hint**: yes

---

### Phase 20: Alerts Panel + Rules

**Goal**: Operator can see all current Alertmanager firing alerts on `/alerts`, Claude quota alert rules are deployed and unit-tested, and Telegram delivery is proven end-to-end — absorbing v2.0 Phase 09 scope entirely.

**Depends on**: Phase 17 (parallel-safe with Phases 18 and 19)
**Requirements**: ALERT-01..06

**Plans:** 3/3 plans complete
**UI hint**: yes

Plans:
- [x] 20-01-PLAN.md — /alerts page + /api/alerts/list + SWR table (ALERT-01, ALERT-02, ALERT-06)
- [x] 20-02-PLAN.md — claude-usage.yml rule migration + promtool tests + ALERTMANAGER_URL env (ALERT-03, ALERT-04)
- [x] 20-03-PLAN.md — Telegram E2E smoke ritual (ALERT-05)

---

### Phase 21: Web Terminal

**Goal**: Operator can open an in-browser SSH terminal to any Proxmox LXC via xterm.js — session is auth-gated, resource-limited, audit-logged, and cleans up on disconnect.

**Depends on**: Phase 19 (needs Proxmox LXC context + SSH credential retrieval pattern)
**Requirements**: TERM-01..06

**Plans**: TBD (node-pty feasibility spike is mandatory first task)
**UI hint**: yes

---

### Phase 22: Security Review + Launch

**Goal**: The dashboard passes a security review (Caddy per-IP rate limit on auth routes, bun audit, bundle secret scan, deployed-header re-audit, header-spoofing integration test, Proxmox token scope verify, Tailnet-only ingress verify, cross-phase SECURITY aggregation), the shared ui-kit is extracted to /Users/admin/hub/knowledge/standards/ui-kit/ and consumed by apps/admin via @ui-kit/* path alias (relative-import shared source — no package/publish), and the launch checklist is complete (audit.db backup/restore drill + cron, operator runbook, documented rollback, admin self-monitoring + alert rule, DNS/TLS validity check, operator handoff README).

**Depends on**: Phase 20 (Phase 21 deferred to v4.0)
**Requirements**: UI-01, UI-02, SEC-08 · **SEC-01 deferred to v3.1** (2026-04-21: caddyserver.com/api/download upstream outage + operator chose defer over xcaddy self-build to accelerate launch) · **SEC-11 deferred to v3.1** (2026-04-21: strict CSP / nonce-based — internal 2-user panel + GitHub OAuth gated, defense-in-depth belongs in v3.1 hardening pass)

**Plans**: 6 plans
**UI hint**: yes

Plans:
- [ ] 22-01-PLAN.md — ui-kit tokens + primitives extract (UI-01)
- [x] 22-02-PLAN.md — security bun audit + bundle scan + header re-audit (SEC-08) · SEC-01 rate limit + SEC-11 strict CSP deferred to v3.1
- [ ] 22-03-PLAN.md — launch backup/restore drill + v3.0 runbook + rollback doc (SEC-08)
- [ ] 22-04-PLAN.md — ui-kit molecules + apps/admin migration to @ui-kit (UI-02)
- [ ] 22-05-PLAN.md — security aggregation + header-spoofing/proxmox-token/tailnet-ingress tests (SEC-08)
- [x] 22-06-PLAN.md — self-monitoring + DNS/TLS check + operator handoff README (SEC-08)

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 12. Infra Foundation | v3.0 | 10/10 | Complete | 2026-04-17 |
| 13. Claude Tokens Page | v3.0 | 5/5 | Complete | 2026-04-17 |
| 14. Global Overview + Audit Log | v3.0 | 6/7 | In Progress|  |
| 15. Tailwind v4 Migration | v3.0 | 2/2 | Complete | 2026-04-19 |
| 16. TypeScript 6.0 Upgrade | v3.0 | 1/1 | Complete   | 2026-04-17 |
| 17. ESLint 10 + Node Types 24 | v3.0 | 1/1 | Complete   | 2026-04-17 |
| 17.1. Jellyfin LXC Migration | v3.0 | 5/5 | Complete    | 2026-04-21 |
| 18. VoidNet Management | v3.0 | 0/? | Not started | - |
| 19. Proxmox Ops | v3.0 | 2/3 | In Progress|  |
| 20. Alerts Panel + Rules | v3.0 | 3/3 | Complete    | 2026-04-21 |
| 21. Web Terminal | v3.0 | 0/? | Not started | - |
| 22. Security Review + Launch | v3.0 | 0/? | Not started | - |

## Backlog (Unscheduled)

Captured issues not yet scoped to a phase. Promote to a numbered phase when ready.

- ~~**999.1 — /tokens sops PATH (homelab-admin.service)**~~ — CLOSED 2026-04-21 by Phase 13 gap Plan 13-07 (Task 3). `Environment=PATH=/usr/local/bin:/usr/bin:/bin` added to `servers/mcow/homelab-admin.service`.
