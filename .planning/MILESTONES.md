# Milestones

## v1.0 — Homelab Infrastructure-as-Code

**Shipped:** 2026-04-15
**Phases:** 4 (foundations, service-documentation, health-monitoring, operator-dashboard)
**Plans:** 18
**Requirements:** 18/18 satisfied (SVC-06 invalidated, DR-01..04 deferred to v2)
**Git Range:** `7b643b1` → `9ac1956` (6 days, 116 commits, 190 files, +44,833 / -2)
**Tag:** `v1.0`

### Delivered

Any server's full stack is reproducible from this repo alone. 6/6 Tailnet hosts monitored via Prometheus + node-exporter; operator overview dashboard on mcow; Telegram alert delivery proven end-to-end.

### Key Accomplishments

1. **SOPS + age secrets foundation** with hardened .gitignore (Phase 01).
2. **Full service reproducibility** — Docker Compose + LXC configs + AmneziaWG + Tailscale provisioning (Phase 02).
3. **Monitoring stack** — Prometheus + Alertmanager + cAdvisor + Grafana + node-exporter across all hosts with healthcheck CLI (Phase 03).
4. **Operator plane on mcow** — Grafana 12.3.1 + Alertmanager migrated; overview dashboard pinned as home (Phase 04-01/02).
5. **Alert pipeline proven E2E** — real rule fire → Telegram delivery via `@void_homelab_bot`; App Connector fallback for IPv4 egress (Phase 04-03).
6. **6/6 host monitoring coverage** — animaya-dev unblocked via `pct exec` (Phase 04-04).

### Audit

`tech_debt` (non-blocking). All requirements satisfied with E2E integration evidence. See `.planning/v1.0-MILESTONE-AUDIT.md`.

### Known Tech Debt (carried forward)

- DiskUsageCritical persistent on tower + docker-tower (root cause outstanding).
- Phase 01 + 02 VALIDATION.md status: draft (pre-Nyquist framework).
- Phase 03 missing VERIFICATION.md (procedural).
- nether secrets cleanup — `GF_SECURITY_ADMIN_*` unreferenced post-decommission.
- docker-tower volume + stale compose path cleanup scheduled 2026-04-22.
- D-06 ADR update pending.

### Archives

- `.planning/milestones/v1.0-ROADMAP.md` — full phase details
- `.planning/milestones/v1.0-REQUIREMENTS.md` — requirements with outcomes
- `.planning/v1.0-MILESTONE-AUDIT.md` — audit report

---

## v2.0 — Claude Code Usage Monitor

**Closed with pivot:** 2026-04-16
**Phases:** 7 scoped (05-11), 3 shipped (05 formal + 06-07 operational), 4 pivoted into v3.0 (08 superseded, 09 moved, 10 killed, 11 absorbed)
**Tag:** `v2.0`

### Delivered (operational)

1. **Feasibility gate formally passed** — ADR D-07 locked (Claude Code quota access via OAuth endpoint) with GATE-PASSED evidence.
2. **Python Claude-usage exporter** running as systemd on mcow:9101 — per-token gauges for weekly/session utilization live since 2026-04-16.
3. **Prometheus scraping operational** — docker-tower Prometheus `up{job="claude-usage"}==1`; metrics flowing into TSDB.
4. **2 real tokens live** — personal + worker LXC tokens emitting distinct label series (Phase 11 scale-out achieved operationally before formal plan).

### Why the pivot

Mid-Phase-05 realization: (1) feasibility already proven by ad-hoc production exporter; (2) a custom Next.js admin dashboard covering VoidNet + Animaya + homelab in one UI is higher-value than Grafana-only; (3) unifying all 3 projects on one TypeScript stack accelerates AI-agent development.

### Tech Debt (carried forward / resolved in v3.0)

- Exporter ran as root (should be uid 65534) → **resolved v3.0 Phase 13-02**
- Exporter bound 0.0.0.0:9101 (should be 100.101.0.9:9101) → **resolved v3.0 Phase 13-02**
- `promtool check metrics` never run against prod
- Prometheus scrape config not captured in repo
- 429 backoff never load-tested (0% 429 in prod so far)

### Archives

- `.planning/milestones/v2.0-ROADMAP.md` — full phase dispositions
- `.planning/milestones/v2.0-REQUIREMENTS.md` — requirement carry-forward map
- `.planning/milestones/v2.0-MILESTONE-CLOSE.md` — close memo

---
