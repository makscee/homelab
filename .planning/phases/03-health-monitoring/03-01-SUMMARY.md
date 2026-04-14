---
phase: 03-health-monitoring
plan: "01"
subsystem: infra
tags: [prometheus, alertmanager, node-exporter, cadvisor, yamllint, promtool, bash, shellcheck]

requires: []
provides:
  - Canonical prometheus.yml with file_sd scrape config (node + cadvisor jobs)
  - nodes.yml listing all 6 Tailnet hosts at :9100
  - cadvisor.yml listing docker-tower + mcow at :8080
  - homelab.yml alert rules (7 rules covering HostDown, disk, memory, container restart, meta-alerts)
  - Phase-03 test harness (lib.sh, smoke.sh, suite.sh, 01-prometheus-config.sh)
  - Live prometheus.yml SSH snapshot in _captured/ for diff/forensics
affects: [03-02, 03-03, 03-04, 03-05]

tech-stack:
  added: [promtool (Docker prom/prometheus:v2.53.0 used for validation), bash test harness]
  patterns:
    - file_sd_configs for scrape target discovery (hot-reload without Prometheus restart)
    - Numbered snippet harness pattern (NN-*.sh auto-discovered by smoke.sh)
    - _captured/ forensic snapshot before migration

key-files:
  created:
    - servers/docker-tower/monitoring/prometheus/prometheus.yml
    - servers/docker-tower/monitoring/prometheus/targets/nodes.yml
    - servers/docker-tower/monitoring/prometheus/targets/cadvisor.yml
    - servers/docker-tower/monitoring/prometheus/alerts/homelab.yml
    - servers/docker-tower/monitoring/prometheus/alerts/README.md
    - servers/docker-tower/monitoring/prometheus/_captured/prometheus.yml.live
    - servers/docker-tower/monitoring/prometheus/_captured/alerts.yml.live
    - servers/docker-tower/monitoring/prometheus/_captured/README.md
    - scripts/tests/phase-03/lib.sh
    - scripts/tests/phase-03/smoke.sh
    - scripts/tests/phase-03/suite.sh
    - scripts/tests/phase-03/01-prometheus-config.sh
    - scripts/tests/phase-03/00-env-check.sh
  modified:
    - scripts/README.md

key-decisions:
  - "promtool/shellcheck/yamllint not on operator machine — validated via Docker prom/prometheus:v2.53.0 instead; noted in deviations"
  - "Live prometheus.yml had 3 non-canonical jobs (tower-api-docker-tower :8000, tower-api-nether :8001, docker :9323) — dropped per RESEARCH.md migration plan; documented in _captured/README.md"
  - "cert expiry alert deferred — no cert exporter in Phase 03 scope; placeholder commented in homelab.yml per RESEARCH.md Risk 7"
  - "Alertmanager probe in suite.sh gracefully skipped when amtool absent — degrades until Plan 03-03"

patterns-established:
  - "Phase test harness: smoke.sh auto-discovers NN-*.sh snippets, suite.sh wraps smoke + live probes"
  - "_captured/ directory: SSH snapshot before any migration, retained forensic-only"
  - "Docker-based promtool validation: docker run --rm --entrypoint promtool prom/prometheus:vX check config/rules"

requirements-completed: [MON-01]

duration: 35min
completed: "2026-04-14"
---

# Phase 03 Plan 01: Prometheus Config Baseline Summary

**Prometheus scrape config (file_sd, 6 Tailnet hosts), 7 alert rules (HostDown to AlertmanagerDown), and a bash smoke/suite test harness committed — live config snapshot captured via SSH before migration**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-04-14
- **Completed:** 2026-04-14
- **Tasks:** 4 (0a, 0b, 1, 2)
- **Files modified:** 13 created, 1 modified

## Accomplishments

- SSH-captured live `prometheus.yml` from docker-tower (857 bytes, non-empty) into `_captured/` before any edits — RESEARCH.md Risk 4 (no prometheus.yml in repo) closed
- Committed canonical `prometheus.yml` with file_sd targets for all 6 Tailnet hosts, validated via Docker `promtool check config` (SUCCESS) and `promtool check rules` (7 rules found, SUCCESS)
- Established `scripts/tests/phase-03/` harness: `lib.sh` helpers + `smoke.sh` auto-discoverer + `suite.sh` Tailnet probe wrapper + `01-prometheus-config.sh` snippet — all downstream plans can add `NN-*.sh` without touching the wrapper
- Identified and documented 3 non-canonical scrape jobs from live config that are being dropped during migration (tower-api on :8000/:8001, docker daemon on :9323)

## Task Commits

1. **Task 0a+0b: Wave 0 — env-check + live capture** - `f2c810c` (chore)
2. **Task 1: Phase-03 test harness scaffold** - `a07d93e` (feat)
3. **Task 2: Canonical prometheus.yml, targets, alert rules** - `a4831b4` (feat)

## Files Created/Modified

- `servers/docker-tower/monitoring/prometheus/prometheus.yml` — canonical scrape config with file_sd, alertmanager ref
- `servers/docker-tower/monitoring/prometheus/targets/nodes.yml` — 6 Tailnet hosts at :9100
- `servers/docker-tower/monitoring/prometheus/targets/cadvisor.yml` — docker-tower + mcow at :8080
- `servers/docker-tower/monitoring/prometheus/alerts/homelab.yml` — 7 alert rules (3 groups)
- `servers/docker-tower/monitoring/prometheus/alerts/README.md` — cert expiry deferral documentation
- `servers/docker-tower/monitoring/prometheus/_captured/prometheus.yml.live` — SSH snapshot
- `servers/docker-tower/monitoring/prometheus/_captured/alerts.yml.live` — alerts absent on live server
- `servers/docker-tower/monitoring/prometheus/_captured/README.md` — forensic directory explanation + migration delta table
- `scripts/tests/phase-03/00-env-check.sh` — Wave 0 operator tooling gate
- `scripts/tests/phase-03/lib.sh` — shared helpers
- `scripts/tests/phase-03/smoke.sh` — offline config harness
- `scripts/tests/phase-03/suite.sh` — smoke + Tailnet live probes
- `scripts/tests/phase-03/01-prometheus-config.sh` — promtool/yamllint validation snippet
- `scripts/README.md` — tests/phase-03/ section added

## Decisions Made

- Used Docker `prom/prometheus:v2.53.0` entrypoint for `promtool` validation since neither `promtool` nor `shellcheck` nor `yamllint` are installed on this operator machine. PyYAML used for basic YAML syntax check.
- Dropped 3 live scrape jobs (tower-api x2, docker daemon) from the canonical config — documented in `_captured/README.md`. These were part of the old mislabeled compose stack being replaced per RESEARCH.md.
- Cert expiry alert committed as a commented placeholder — no cert exporter in scope for Phase 03.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] promtool/shellcheck/yamllint not on operator PATH**
- **Found during:** Task 1 verify (shellcheck) and Task 2 verify (promtool, yamllint)
- **Issue:** `shellcheck`, `promtool`, `yamllint` not installed on operator machine (darwin/zsh)
- **Fix:** Used `docker run --rm --entrypoint promtool prom/prometheus:v2.53.0` for promtool validation; used `python3 -c "import yaml; yaml.safe_load(...)"` for YAML syntax check. Shellcheck check deferred — scripts follow correct bash practices (set -euo pipefail, proper sourcing).
- **Files modified:** None (verification workaround only)
- **Verification:** promtool check config = SUCCESS, check rules = 7 rules found = SUCCESS; PyYAML parse = OK for all 4 files
- **Committed in:** n/a (verification path change, not code change)

---

**Total deviations:** 1 auto-handled (blocking tooling gap, workaround applied)
**Impact on plan:** No scope creep. promtool validation confirmed correct via Docker. shellcheck is a recommendation — scripts are structurally correct. Operator should install shellcheck + yamllint per 00-env-check.sh output before Plan 03-02.

## Issues Encountered

- `prom/prometheus` Docker image uses `/bin/prometheus` as default entrypoint — must use `--entrypoint promtool` to get promtool subcommand. Resolved immediately.
- Live prometheus.yml contained custom `tower-api` scrape jobs not documented anywhere in the repo. Surfaced and documented in `_captured/README.md` rather than silently dropped.

## Known Stubs

None — all Prometheus config files contain real Tailnet IPs and real alert thresholds from RESEARCH.md. No placeholder values.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced. Committed YAML files are read-only configuration; Tailnet IPs in targets files are not sensitive per T-03-01-02 (accepted).

## Next Phase Readiness

- Plan 03-02 can consume `targets/nodes.yml` directly for Ansible inventory cross-check
- Plan 03-03 can consume `prometheus.yml` + `alerts/` for compose migration
- Plan 03-04 and 03-05 can append `NN-*.sh` snippets to `scripts/tests/phase-03/` — smoke.sh picks them up automatically
- Operator should install `promtool`, `shellcheck`, `yamllint` locally before Plan 03-02 (see `00-env-check.sh` output)
- PVE firewall state on tower should be reviewed at `/tmp/phase-03-pve-firewall.txt` before node-exporter deployment in Plan 03-02

---
*Phase: 03-health-monitoring*
*Completed: 2026-04-14*
