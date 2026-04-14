---
phase: 03
slug: health-monitoring
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-14
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bash smoke scripts + `promtool` + `amtool` + `shellcheck` + `yamllint` |
| **Config file** | `scripts/tests/phase-03/` (created by Plan 03-01 Task 1) |
| **Quick run command** | `bash scripts/tests/phase-03/smoke.sh` |
| **Full suite command** | `bash scripts/tests/phase-03/suite.sh` |
| **Phase gate** | `bash scripts/tests/phase-03/99-final.sh` (invoked by `/gsd-verify-work`) |
| **Estimated runtime** | ~30 seconds (smoke, offline) / ~90 seconds (suite, Tailnet probes) / ~2 min (99-final: suite + healthcheck --all + promtool tests + secret scan) |

---

## Sampling Rate

- **After every task commit:** Run `bash scripts/tests/phase-03/smoke.sh` (config-only, offline)
- **After every plan wave:** Run `bash scripts/tests/phase-03/suite.sh` (includes Tailnet probes)
- **Before `/gsd-verify-work`:** `bash scripts/tests/phase-03/99-final.sh` must be green
- **Max feedback latency:** 30 seconds for smoke; 90 seconds for suite; 2 minutes for final gate

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01.0a | 03-01 | 0 | MON-01 | T-03-02-01 | Operator tooling present; PVE firewall state captured | env | `bash scripts/tests/phase-03/00-env-check.sh` | ❌ W0 | ⬜ pending |
| 03-01.0b | 03-01 | 0 | MON-01 | T-03-01-05 | Live prometheus.yml snapshotted before edits (no data loss risk) | capture | `test -s servers/docker-tower/monitoring/prometheus/_captured/prometheus.yml.live && yamllint -d relaxed servers/docker-tower/monitoring/prometheus/_captured/prometheus.yml.live` | ❌ W0 | ⬜ pending |
| 03-01.1 | 03-01 | 1 | MON-01 | — | Test harness scaffold is shellcheck-clean | harness | `shellcheck scripts/tests/phase-03/lib.sh scripts/tests/phase-03/smoke.sh scripts/tests/phase-03/suite.sh scripts/tests/phase-03/01-prometheus-config.sh` | ❌ W0 | ⬜ pending |
| 03-01.2 | 03-01 | 1 | MON-01 | T-03-01-01, T-03-01-04 | Committed Prometheus config + target files + alert rules pass promtool/yamllint | config | `bash scripts/tests/phase-03/smoke.sh` | ❌ W0 | ⬜ pending |
| 03-02.1 | 03-02 | 2 | MON-01 | T-03-02-02 | Ansible inventory reaches all 6 hosts | connectivity | `cd ansible && ansible-galaxy collection install -r requirements.yml -p ./collections && ansible -m ping monitored_hosts` | ❌ W0 | ⬜ pending |
| 03-02.2 | 03-02 | 2 | MON-01 | T-03-02-01, T-03-02-04 | node_exporter installed + reachable on all 6 Tailnet IPs:9100 | integration | `bash scripts/tests/phase-03/02-node-exporter-ansible.sh && bash scripts/tests/phase-03/02-node-exporter-reachable.sh` | ❌ W0 | ⬜ pending |
| 03-03.1 | 03-03 | 3 | MON-01 | T-03-03-01, T-03-03-02 | Alertmanager config valid; bot_token file-mounted; chat_id is integer; no raw token in repo | config | `bash scripts/tests/phase-03/03-alertmanager-config.sh` | ❌ W0 | ⬜ pending |
| 03-03.2 | 03-03 | 3 | MON-01 | T-03-03-03, T-03-03-04, T-03-03-07 | Compose migration: old services removed, new services live, volumes preserved, Grafana bound to Tailnet IP | integration | `bash scripts/tests/phase-03/03-compose-validate.sh && bash scripts/tests/phase-03/03-live-targets.sh` | ❌ W0 | ⬜ pending |
| 03-03.3 | 03-03 | 3 | MON-01 | T-03-03-03 | cAdvisor on mcow live; nether monitoring decommissioned | integration | `bash scripts/tests/phase-03/suite.sh` | ❌ W0 | ⬜ pending |
| 03-04.1 | 03-04 | 4 | MON-01 | T-03-04-02, T-03-04-05 | Datasource + dashboard YAMLs valid; dashboard JSONs UID-normalized; no string datasource refs | config | `bash scripts/tests/phase-03/04-grafana-provisioning.sh` | ❌ W0 | ⬜ pending |
| 03-04.2 | 03-04 | 4 | MON-01 | T-03-04-01, T-03-04-04 | Grafana live API returns provisioned datasource + 3 dashboards in Homelab folder | integration | `bash scripts/tests/phase-03/04-grafana-live.sh` | ❌ W0 | ⬜ pending |
| 03-04.3 | 03-04 | 4 | MON-01 (Phase SC #3) | T-03-04-02 | Dashboards render data for all 6 hosts | human | See Manual-Only: "Grafana dashboards render correctly" | N/A | ⬜ pending |
| 03-05.1 | 03-05 | 5 | MON-02 | T-03-05-01, T-03-05-03 | healthcheck.sh produces locked-schema JSON; exit codes correct; --all iterates 6 hosts | unit+integration | `bash scripts/tests/phase-03/05-healthcheck.sh` | ❌ W0 | ⬜ pending |
| 03-05.2 | 03-05 | 5 | MON-01 | T-03-05-02, T-03-05-07 | promtool rule unit tests pass; 99-final gate green; secret scan clean | unit | `bash scripts/tests/phase-03/05-promtool-rules-test.sh && bash scripts/tests/phase-03/99-final.sh` | ❌ W0 | ⬜ pending |
| 03-05.3 | 03-05 | 5 | MON-02 (Phase SC #5) | T-03-05-05, T-03-05-06 | Alertmanager delivers to Telegram end-to-end (FIRING + RESOLVED) | human | See Manual-Only: "Telegram alert message delivery" | N/A | ⬜ pending |
| 03-05.4 | 03-05 | 5 | — | — | VALIDATION.md nyquist/wave_0 flags flipped to true | meta | `grep -q '^nyquist_compliant: true$' .planning/phases/03-health-monitoring/03-VALIDATION.md && grep -q '^wave_0_complete: true$' .planning/phases/03-health-monitoring/03-VALIDATION.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*File Exists column: ❌ W0 = file to be created during Wave 0 or in its defining plan; ✅ = committed; N/A = no automated file dependency (human-only).*

---

## Wave 0 Requirements

- [x] `scripts/tests/phase-03/smoke.sh` — config-only probes (promtool/amtool/shellcheck/yamllint) — **scheduled in Plan 03-01 Task 1**
- [x] `scripts/tests/phase-03/suite.sh` — wraps smoke + remote curl probes over Tailnet — **scheduled in Plan 03-01 Task 1**
- [x] `scripts/tests/phase-03/lib.sh` — shared helpers (jq assertions, PromQL query wrapper) — **scheduled in Plan 03-01 Task 1**
- [x] Install `promtool`, `amtool`, `shellcheck`, `yamllint` on operator machine — **scheduled in Plan 03-01 Task 0a (00-env-check.sh)**
- [x] SSH capture of live `/opt/homestack/monitoring/prometheus/prometheus.yml` from docker-tower into repo — **scheduled in Plan 03-01 Task 0b (blocking for Task 2)**
- [x] PVE firewall state on tower captured for port 9100 review — **scheduled in Plan 03-01 Task 0a**
- [x] animaya-dev Python3 availability confirmed (Ansible dependency per A6) — **scheduled in Plan 03-01 Task 0a**

*Boxes ticked = scheduled in a plan, not yet executed. Flip to ❌ in Per-Task Verification Map → ✅ as each task commits.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Referenced By |
|----------|-------------|------------|-------------------|---------------|
| Telegram alert message delivery | MON-02 / Phase SC #4 | Requires live Telegram bot + chat; deterministic automated check would need a mock bot | Trigger a test alert via `amtool --alertmanager.url=http://100.101.0.8:9093 alert add alertname=HostDown severity=critical instance=100.101.0.99:9100 summary="synthetic"`; confirm message arrives in target chat within 60s | Plan 03-05 Task 3 |
| Grafana dashboards render correctly | Phase SC #3 | Visual verification; provisioning success does not prove UX correctness | Open Grafana at `http://100.101.0.8:3000` over Tailnet, open each of 3 dashboards, confirm panels populate with data for all 6 hosts | Plan 03-04 Task 3 |
| cAdvisor privileged cgroup access on mcow | Phase SC #4 | LXC capability drift possible; cAdvisor health depends on container cgroup access | SSH mcow; `curl localhost:8080/healthz`; verify `container_*` metrics appear in Prometheus `/api/v1/targets` for the mcow cadvisor endpoint | Plan 03-03 Task 3 (covered by `03-live-targets.sh`) |
| PVE firewall on tower permits 9100 from Tailnet | MON-01 | Requires Proxmox-side rule + operator confirmation | Review `/tmp/phase-03-pve-firewall.txt` from Plan 03-01 Task 0a; if firewall enabled and blocks 9100, add rule via `pve-firewall` or disable firewall on tower (operator decision) | Plan 03-01 Task 0a + Plan 03-02 Task 2 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or explicit Manual-Only entry
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every plan's final task has a smoke or suite gate)
- [x] Wave 0 covers all MISSING references (prometheus.yml, alert rules, target files, harness, env checks)
- [x] No watch-mode flags (all commands are one-shot, deterministic)
- [x] Feedback latency < 90s for smoke/suite; < 120s for phase gate
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** granted 2026-04-14 (planning phase). Wave 0 complete flag flips true only after Plan 03-01 Tasks 0a/0b execute cleanly.
