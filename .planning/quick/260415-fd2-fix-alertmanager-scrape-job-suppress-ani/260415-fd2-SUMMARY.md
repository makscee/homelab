---
phase: 260415-fd2
plan: 01
subsystem: monitoring
tags: [prometheus, alertmanager, alerts, docker-tower, node-exporter, deferred-work]
requires:
  - Prometheus container on docker-tower with `--web.enable-lifecycle` enabled
  - Alertmanager listening on localhost:9093 (network_mode: host)
provides:
  - alertmanager scrape job (satisfies `up{job="alertmanager"}` used by AlertmanagerDown rule)
  - node scrape target set with animaya-dev (100.119.15.122) suppressed
affects:
  - servers/docker-tower/monitoring/prometheus/prometheus.yml
  - servers/docker-tower/monitoring/prometheus/targets/nodes.yml
  - runtime: /opt/homestack/monitoring/prometheus/ on docker-tower (deployed via scp)
tech-stack:
  added: []
  patterns:
    - "Prometheus live reload via `curl -X POST :9090/-/reload` (no restart, no scrape gap)"
    - "Defer-via-comment: keep removed targets as commented lines with DEFERRED marker + audit doc reference"
key-files:
  created: []
  modified:
    - servers/docker-tower/monitoring/prometheus/prometheus.yml
    - servers/docker-tower/monitoring/prometheus/targets/nodes.yml
decisions:
  - "Used HTTP reload (preferred) over SIGHUP — both supported, HTTP cleaner"
  - "Runtime path corrected from plan's `/opt/homestack/prometheus/` to actual `/opt/homestack/monitoring/prometheus/` (verified via `docker inspect prometheus`)"
  - "Both config edits shipped in one Conventional Commit (325c3f5) per plan Task 3 spec"
metrics:
  duration: ~6min (excluding wait for alerts to clear via staleness)
  completed: 2026-04-15
---

# Quick 260415-fd2: Fix AlertmanagerDown + suppress animaya-dev HostDown Summary

**One-liner:** Added missing `alertmanager` scrape job and commented out animaya-dev node target so both false-positive Telegram alerts stop firing; deployed via scp + HTTP reload, no container restart.

## What Changed

### `servers/docker-tower/monitoring/prometheus/prometheus.yml`

Added a third scrape job (ordered: prometheus → alertmanager → node → cadvisor):

```yaml
  # Alertmanager self-scrape (satisfies AlertmanagerDown rule in alerts/homelab.yml)
  - job_name: 'alertmanager'
    static_configs:
      - targets: ['localhost:9093']
```

Job name is the literal string `alertmanager` so `up{job="alertmanager"}` in `alerts/homelab.yml` (rule `AlertmanagerDown`) has data to evaluate. `localhost:9093` works because both Prometheus and Alertmanager run with `network_mode: host` on docker-tower.

### `servers/docker-tower/monitoring/prometheus/targets/nodes.yml`

Suppressed animaya-dev (node-exporter not deployable — SSH blocked, deferred per `v1.0-MILESTONE-AUDIT.md`):

```yaml
    - '100.101.0.3:9100'    # nether
    # DEFERRED: node-exporter blocked on animaya-dev (SSH unavailable) — see .planning/v1.0-MILESTONE-AUDIT.md
    # - '100.119.15.122:9100' # animaya-dev (LXC 205)
```

Commented (not deleted) so re-enable is a one-line uncomment once SSH is restored.

## Deployment

1. `promtool check config` (prom/prometheus:latest in docker) → **SUCCESS** (prometheus.yml + 7 rules in homelab.yml).
2. YAML parse check via `python3 -c "import yaml"` on both files → **OK**.
3. `scp` both files to `root@100.101.0.8:/opt/homestack/monitoring/prometheus/` (correct path discovered from `docker inspect prometheus`; plan's guess of `/opt/homestack/prometheus/` was wrong — see Deviations).
4. Reload: `curl -fsS -X POST http://localhost:9090/-/reload` on docker-tower → `RELOADED_HTTP` (no SIGHUP fallback needed).
5. `docker logs --since 2m prometheus` post-reload → **clean** (no error/fail lines).

## Verification Results

| Check | Result |
|-------|--------|
| promtool check config | SUCCESS |
| `/api/v1/targets` — `alertmanager` job present | UP (health=up) |
| `/api/v1/targets` — `100.119.15.122` scraped | NO (suppressed) |
| Prometheus container logs post-reload | clean |
| `ALERTS{alertname="AlertmanagerDown",alertstate="firing"}` | 0 results (cleared) |
| `ALERTS{alertname="HostDown",instance="100.119.15.122:9100",alertstate="firing"}` | 1 result at t+0 (see below) |

### Expected Clear Timing for HostDown(animaya-dev)

At the moment of reload, Prometheus still has the `up{instance="100.119.15.122:9100",job="node"} == 0` series from prior scrapes in memory, with the `for: 5m` rule already satisfied. After removing the target from the file_sd list:

- Prometheus stops scraping immediately.
- The `up{...}` series goes stale within ~5 minutes (one evaluation cycle after missing scrapes + staleness markers).
- `HostDown{instance="100.119.15.122:9100"}` transitions firing → resolved → absent.
- Alertmanager sends resolution to Telegram, then drops the alert.

**Expected full clear: ≤5 min after reload.** This is the documented `for: 5m` behaviour and is not a test failure. A Telegram-level confirmation (no new fires in 10 min) is a passive manual check outlined in the plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug/Config] Corrected runtime deploy path**
- **Found during:** Task 2 first scp attempt.
- **Issue:** Plan specified `/opt/homestack/prometheus/` but actual mount on docker-tower is `/opt/homestack/monitoring/prometheus/` (per `docker inspect prometheus --format '{{range .Mounts}}{{.Source}}{{end}}'`).
- **Fix:** Retried scp against the correct path; deploy succeeded immediately.
- **Files modified:** None in repo — runtime-only discovery. Path updated in this SUMMARY's `affects:` field for future plans.
- **Commit:** N/A (no repo change).

No other deviations. No Rule 4 (architectural) issues.

## Deferred / Follow-up

- **animaya-dev node-exporter** — remains deferred per `v1.0-MILESTONE-AUDIT.md`. No audit edit needed; the tech-debt entry there already captures this. To re-enable: SSH must be restored to LXC 205, install node-exporter, then uncomment the line in `nodes.yml` + reload Prometheus.
- **Telegram passive check** — user should observe silence in alert channel for ~10 min post-reload. If AlertmanagerDown or the animaya-dev HostDown re-fires after 10 min, investigate.

## Commits

- `325c3f5` — fix(monitoring): add alertmanager scrape job + suppress animaya-dev target

## Self-Check: PASSED

- File exists: `servers/docker-tower/monitoring/prometheus/prometheus.yml` — FOUND (contains `job_name: 'alertmanager'`).
- File exists: `servers/docker-tower/monitoring/prometheus/targets/nodes.yml` — FOUND (contains `DEFERRED` marker).
- Commit exists: `325c3f5` — FOUND in `git log`.
- promtool: SUCCESS.
- Runtime: alertmanager target UP, animaya-dev not scraped, logs clean.
