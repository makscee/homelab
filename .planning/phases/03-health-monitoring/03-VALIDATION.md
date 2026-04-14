---
phase: 03
slug: health-monitoring
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bash smoke scripts + `promtool` + `amtool` + `shellcheck` |
| **Config file** | `scripts/tests/phase-03/` (Wave 0 creates) |
| **Quick run command** | `bash scripts/tests/phase-03/smoke.sh` |
| **Full suite command** | `bash scripts/tests/phase-03/suite.sh` |
| **Estimated runtime** | ~30 seconds (config checks) / ~90 seconds (with remote curl probes over Tailnet) |

---

## Sampling Rate

- **After every task commit:** Run `bash scripts/tests/phase-03/smoke.sh` (config-only, offline)
- **After every plan wave:** Run `bash scripts/tests/phase-03/suite.sh` (includes Tailnet probes)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds for smoke; 90 seconds for suite

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _(planner fills rows per plan task)_ | | | | | | | | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/tests/phase-03/smoke.sh` — config-only probes (promtool/amtool/shellcheck/yamllint)
- [ ] `scripts/tests/phase-03/suite.sh` — wraps smoke + remote curl probes over Tailnet
- [ ] `scripts/tests/phase-03/lib.sh` — shared helpers (jq assertions, PromQL query wrapper)
- [ ] Install `promtool`, `amtool`, `shellcheck`, `yamllint` on operator machine (document in scripts/README.md)
- [ ] SSH capture of live `/opt/homestack/monitoring/prometheus/prometheus.yml` from docker-tower into repo — blocking for Plan 03-01

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Telegram alert message delivery | MON-02 | Requires live Telegram bot + chat; deterministic automated check would need a mock bot | Trigger a test alert via `amtool alert add`; confirm message arrives in target chat within 60s |
| Grafana dashboards render correctly | Phase SC #3 | Visual verification; provisioning success does not prove UX correctness | Open Grafana over Tailnet, open each of 3 dashboards, confirm panels populate with data |
| cAdvisor privileged cgroup access on mcow | Phase SC #4 | LXC capability drift possible; cAdvisor health depends on container cgroup access | SSH mcow; `curl localhost:8080/healthz`; verify `container_*` metrics appear in Prometheus target scrape |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
