---
phase: 04-operator-dashboard
verified: 2026-04-15T18:35:00Z
status: passed
score: 4/4 success criteria verified
overrides_applied: 0
decisions_verified: 19/19
---

# Phase 04: Operator Dashboard — Verification Report

**Phase Goal:** One-page Grafana dashboard on mcow showing all hosts and services at a glance; Telegram alerts proven end-to-end.

**Verified:** 2026-04-15T18:35:00Z (live state + repo artifacts)
**Status:** PASSED
**Re-verification:** No — initial verification

## Success Criteria Verdict

| # | SC | Status | Evidence |
|---|----|--------|----------|
| 1 | Grafana on mcow (Tailnet-only), pointed at docker-tower Prometheus; docker-tower Grafana decommissioned | PASS | See SC#1 below |
| 2 | Single overview dashboard as home showing all 6 hosts | PASS | See SC#2 below |
| 3 | Real Alertmanager rule fire delivers Telegram message (FIRING + RESOLVED) | PASS | See SC#3 below |
| 4 | Operator UAT approval | PASS | See SC#4 below |

## SC #1 — Grafana on mcow, docker-tower Grafana decommissioned

| Check | Expected | Actual | Verdict |
|-------|----------|--------|---------|
| `curl http://100.101.0.9:3000/api/health` | `database:ok`, v12.x | `{"database":"ok","version":"12.3.1"}` | PASS |
| mcow containers | `grafana` + `alertmanager` up | `grafana Up 4h`, `alertmanager Up 52m`, `cadvisor Up 21h` | PASS |
| docker-tower grafana/alertmanager | absent | `NONE_RUNNING` | PASS |
| docker-tower volumes preserved (rollback) | present | `monitoring_grafana-data`, `monitoring_alertmanager-data` | PASS |
| Grafana bind | `100.101.0.9:3000` (Tailnet) | `LISTEN 100.101.0.9:3000` (not 0.0.0.0) | PASS |
| Alertmanager bind | `100.101.0.9:9093` (Tailnet) | `LISTEN 100.101.0.9:9093` (not 0.0.0.0) | PASS |
| Prometheus→AM target | `100.101.0.9:9093` | `['http://100.101.0.9:9093/api/v2/alerts']` | PASS |
| docker-tower compose | `DECOMMISSIONED` banners on grafana/alertmanager stanzas | 3 DECOMMISSIONED markers present | PASS |

## SC #2 — Overview dashboard as home, all 6 hosts

| Check | Expected | Actual | Verdict |
|-------|----------|--------|---------|
| Home dashboard pinned | UID `homelab-overview` | `/api/org/preferences` → `{"homeDashboardUID":"homelab-overview"}` | PASS |
| Dashboard UID + title | `homelab-overview` / `Operator Overview` | UID + title match | PASS |
| Panel count | ≥ KPI strip + 6 per-host rows | **32 panels** (KPI + 6 rows × multiple panels each) | PASS |
| All 6 Tailnet IPs in queries | 6 hosts incl. animaya-dev (100.119.15.122) | Found: 100.101.0.7 (tower), 100.101.0.8 (docker-tower), 100.99.133.9 (cc-worker), 100.101.0.9 (mcow), 100.101.0.3 (nether), 100.119.15.122 (animaya-dev) | PASS |
| Alertmanager datasource usage (not Prom ALERTS) | AM datasource refs, 0 `ALERTS{alertstate=` | 2 alertmanager-homelab refs + 0 ALERTS antipattern (combined count = 2) | PASS |
| All 6 node_exporter targets up | 6/6 `up` | tower, docker-tower, cc-worker, mcow, nether, animaya-dev all `up` | PASS |

## SC #3 — Telegram E2E alert delivery

| Check | Expected | Actual | Verdict |
|-------|----------|--------|---------|
| `send_resolved: true` in AM config | present | Not explicit in `alertmanager.yml` but default-on in AM Telegram receiver; FIRING + RESOLVED both observed | PASS |
| Prometheus `alertmanagers:` → mcow | `100.101.0.9:9093` | `targets: ['100.101.0.9:9093']` (line 8) | PASS |
| telegram_token perms | `0440 root:nogroup` (gid 65534) | `440 root:nogroup` | PASS |
| Telegram receiver configured | `telegram-homelab` with `bot_token_file` | `receiver: telegram-homelab`, `bot_token_file: /etc/alertmanager/telegram_token` | PASS |
| Operator-confirmed FIRING + RESOLVED delivery | both confirmed | 04-03-SUMMARY records: "Both FIRING and RESOLVED telegram deliveries confirmed by operator in @void_homelab_bot chat." Counter: 1→2→5 deltas. | PASS |
| No active stale silences | 0 | `active_silences: 0` | PASS |

## SC #4 — Operator UAT approval

| Check | Expected | Actual | Verdict |
|-------|----------|--------|---------|
| Dashboard UAT (04-02) | Operator approved | 04-02-SUMMARY: "**APPROVED** on 2026-04-15 after verifying the full checklist" | PASS |
| Telegram FIRING + RESOLVED UAT (04-03) | Operator confirmed | 04-03-SUMMARY: "Both FIRING and RESOLVED telegram deliveries confirmed by operator" | PASS |

## Decision Coverage (D-01..D-19)

| D | Description | Evidence | Status |
|---|-------------|----------|--------|
| D-01 | Clean Grafana install on mcow, dashboards-as-code | 04-01-SUMMARY: "SQLite starts empty...provisioning...source of truth" | VERIFIED |
| D-02 | Pin Prometheus datasource UID | 04-01: `prometheus-homelab` pinned | VERIFIED |
| D-03 | Grafana Tailnet-only bind | Live: `LISTEN 100.101.0.9:3000` | VERIFIED |
| D-04 | Prom datasource → `http://100.101.0.8:9090` | 04-01-SUMMARY: "prometheus-homelab → http://100.101.0.8:9090" | VERIFIED |
| D-05 | docker-tower Grafana decommissioned, volume preserved 1 week | Live: stopped+removed; `monitoring_grafana-data` present; banner "deletion date 2026-04-22" | VERIFIED |
| D-06 | Alertmanager co-located on mcow; Prom alerts to `100.101.0.9:9093` | Prom API returns `['http://100.101.0.9:9093/api/v2/alerts']`. **Note:** 04-03 flags D-06 egress assumption was invalid; mitigated via Tailscale App Connector on nether + IPv6 path. AM remains on mcow. | VERIFIED (with mitigation) |
| D-07 | Telegram secret `0440 root:65534` on mcow | `stat`: `440 root:nogroup` | VERIFIED |
| D-08 | AM config lifted from docker-tower | `telegram-homelab` receiver, `bot_token_file` pattern | VERIFIED |
| D-09 | "Operator Overview" UID stable, home dashboard | `/api/org/preferences.homeDashboardUID = homelab-overview`; title `Operator Overview` | VERIFIED |
| D-10 | KPI strip + 6 per-host rows | 32 panels; dashboard JSON contains CPU/RAM/disk/uptime/net queries per host | VERIFIED |
| D-11 | Active-alerts via AM datasource (not ALERTS metric) | 2 `alertmanager-homelab` refs, 0 `ALERTS{alertstate=` refs | VERIFIED |
| D-12 | Container counts from cAdvisor with N/A fallback | 04-02-SUMMARY deferred item notes mcow N/A fallback | VERIFIED |
| D-13 | animaya-dev in overview | `100.119.15.122` present in dashboard queries | VERIFIED |
| D-14 | Natural-trigger smoke test (cc-worker) | 04-03-SUMMARY: `node_exporter stop` on cc-worker at 17:26:20Z | VERIFIED |
| D-15 | Proof artifacts (timestamps, counter deltas) | Counter 1→2→5 captured; SMOKE-LOG file present | VERIFIED |
| D-16 | Plan 04-04 folded in | `.planning/phases/04-operator-dashboard/04-04-SUMMARY.md` present | VERIFIED |
| D-17 | `pct exec 205` push of ed25519 key | Commit `d7fdb16`; SSH-UNBLOCK-LOG.md | VERIFIED |
| D-18 | node-exporter deploy + `deferred:` removed | Commit `4c882e8`; `grep 'deferred'` on inventory returns no match (only commented history line) | VERIFIED |
| D-19 | animaya-dev `up` in Prometheus, HostDown cleared | Live: `100.119.15.122:9100 up`; 0 active HostDown alerts | VERIFIED |

## Requirements Coverage

| Req | Description | Status | Evidence |
|-----|-------------|--------|----------|
| MON-01 | Monitoring all hosts | SATISFIED | 6/6 node_exporter targets `up` incl. animaya-dev |
| MON-02 | Alerting end-to-end | SATISFIED | FIRING + RESOLVED Telegram delivery confirmed |

## Anti-Pattern Scan

| Check | Result |
|-------|--------|
| Grafana/AM bound to `0.0.0.0` | NONE — both Tailnet-only |
| `ALERTS{alertstate=` antipattern in dashboard | NONE — uses AM datasource |
| `deferred: true` lingering on animaya-dev | NONE — only commented history line |
| docker-tower Grafana/AM containers still running | NONE — stopped and removed |
| Stale active silences | NONE — 0 active silences |

## Behavioral Spot-Checks

| Behavior | Result | Status |
|----------|--------|--------|
| Grafana API responds | `database:ok`, v12.3.1 | PASS |
| Home dashboard resolves to homelab-overview | YES | PASS |
| Prom→AM wiring delivers alerts (live) | 2 DiskUsageCritical alerts currently active (operational, not Phase 04 concern) | PASS |
| All 6 node targets scraped `up` | 6/6 | PASS |

## Known Operational State (Not Phase 04 Gaps)

- **DiskUsageCritical firing on tower + docker-tower** — pre-existing tech debt from 03-05, explicitly tracked in 04-03 follow-ups as "root-cause disk pressure investigation out of Phase 04 scope." Not a Phase 04 blocker; flagged here for visibility.
- **mcow row "Containers" shows N/A** — cAdvisor/LXC cgroup-v2 quirk deferred from 04-02 to Phase 05. Documented. Not a Phase 04 gap.
- **docker-tower volume deletion 2026-04-22** — scheduled post-rollback-window cleanup, tracked in 04-01 follow-up TODOs.
- **D-06 egress mitigation** — AM on mcow works via nether app connector + IPv6 path; documented in 04-03-APP-CONNECTOR-SETUP.md. AM remains on mcow per goal; mitigation is in place and proven.

## Final Verdict

**All 4 Success Criteria: PASS. All 19 decisions: VERIFIED. Goal achieved.**

Phase 04 delivers a single-pane Grafana overview on mcow with all 6 Tailnet hosts at a glance, with proven end-to-end Alertmanager → Telegram delivery. Operator UAT approval recorded for both dashboard (04-02) and alert path (04-03).

## VERIFICATION PASSED

---

_Verified: 2026-04-15T18:35:00Z_
_Verifier: Claude (gsd-verifier)_
