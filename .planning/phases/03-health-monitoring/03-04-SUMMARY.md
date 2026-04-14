---
phase: 03
plan: 04
subsystem: monitoring/grafana
tags: [grafana, provisioning, dashboards, datasource, prometheus]
dependency_graph:
  requires: [03-03]
  provides: [grafana-dashboards-as-code, prometheus-datasource-provisioned]
  affects: [03-05]
tech_stack:
  added: []
  patterns:
    - Grafana provisioning via YAML (datasources + dashboards)
    - Dashboard JSON UID stabilization (no __inputs, no string datasource refs)
    - Grafana SQLite DB UID migration for existing datasources
key_files:
  created:
    - servers/docker-tower/monitoring/grafana/provisioning/datasources/prometheus.yml
    - servers/docker-tower/monitoring/grafana/provisioning/dashboards/dashboards.yml
    - servers/docker-tower/monitoring/grafana/provisioning/dashboards/json/node-exporter-full.json
    - servers/docker-tower/monitoring/grafana/provisioning/dashboards/json/cadvisor-containers.json
    - servers/docker-tower/monitoring/grafana/provisioning/dashboards/json/homelab-summary.json
    - servers/docker-tower/monitoring/grafana/README.md
    - scripts/tests/phase-03/04-grafana-provisioning.sh
    - scripts/tests/phase-03/04-grafana-live.sh
  modified: []
decisions:
  - cAdvisor dashboard id 14282 chosen (Docker cAdvisor Compute Resources) — plan listed as preferred; dashboard fetched and verified
  - Homelab Summary dashboard hand-authored (approach a) with per-IP instance regex matchers for 5 hosts
  - Existing Prometheus datasource UID in Grafana SQLite DB migrated from auto-generated value to prometheus-homelab before restart (one-time migration)
  - animaya-dev excluded from Homelab Summary (host is down per CLAUDE.md)
metrics:
  duration: ~45 minutes
  completed: 2026-04-14
  tasks_completed: 2
  tasks_total: 3
  files_created: 8
---

# Phase 03 Plan 04: Grafana Provisioning Summary

**One-liner:** Grafana auto-provisions Prometheus datasource (uid=prometheus-homelab) and 3 dashboards (Node Exporter Full id 1860, cAdvisor id 14282, Homelab Summary custom) from committed JSON files — no manual UI clicks required.

## What Was Built

### Datasource Provisioning
- `provisioning/datasources/prometheus.yml` — declares Prometheus at `http://100.101.0.8:9090` with `uid: prometheus-homelab`, `isDefault: true`, `timeInterval: 15s`

### Dashboard Loader Config
- `provisioning/dashboards/dashboards.yml` — provider `homelab`, folder `Homelab`, `updateIntervalSeconds: 30`, `allowUiUpdates: false`, path `/etc/grafana/provisioning/dashboards/json`

### Dashboard JSONs
- `node-exporter-full.json` — Grafana.com id 1860 (Node Exporter Full), uid `node-exporter-full`, all datasource refs normalized to `{"type":"prometheus","uid":"prometheus-homelab"}`, `__inputs` removed
- `cadvisor-containers.json` — Grafana.com id 14282 (Cadvisor exporter), uid `cadvisor-containers`, same normalization
- `homelab-summary.json` — hand-authored, uid `homelab-summary`, 5 hosts x 5 stat panels (up/CPU%/RAM%/Disk%/Uptime), PromQL expressions with per-IP instance matchers

### Test Scripts
- `04-grafana-provisioning.sh` — static: file presence, UID correctness, no `__inputs`, no residual string datasource refs, compose mount present
- `04-grafana-live.sh` — live API: Grafana health, datasource uid/type/url, all 3 dashboards in Homelab folder

## Verification Output

### Static (04-grafana-provisioning.sh)
All checks passed:
- 5 files present
- `uid: prometheus-homelab` in datasource YAML
- `allowUiUpdates: false` + `updateIntervalSeconds: 30` in dashboards YAML
- All 3 JSONs valid and UIDs correct
- No `__inputs` or residual string datasource refs
- Compose bind-mount `/etc/grafana/provisioning` confirmed

### Live (04-grafana-live.sh)
```
Grafana 12.3.1 healthy
uid=prometheus-homelab type=prometheus url=http://100.101.0.8:9090 [OK]
uid=node-exporter-full title='Node Exporter Full' folder='Homelab' [OK]
uid=cadvisor-containers title='Cadvisor exporter' folder='Homelab' [OK]
uid=homelab-summary title='Homelab Summary' folder='Homelab' [OK]
```

### Task 3 (human-verify checkpoint)
Per the no_orchestrator_handoffs directive, visual panel rendering verification was not executed. The API evidence (all 3 dashboards load with correct UIDs and folder placement) is conclusive for automated validation. Human visual verification (panel data rendering per host) remains for the operator to confirm at `http://100.101.0.8:3000`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Grafana crash-loop on restart due to datasource UID mismatch**
- **Found during:** Task 2 deploy
- **Issue:** Existing Grafana SQLite DB had Prometheus datasource with auto-generated UID `bf9ztt9fx68zka`. Provisioning YAML declared `uid: prometheus-homelab`. Grafana 12.x provisioning fails with "data source not found" when the provisioned UID doesn't match the stored UID.
- **Fix:** One-time DB migration via `sqlite3` on docker-tower: `UPDATE data_source SET uid="prometheus-homelab" WHERE name="Prometheus"`. Grafana then started cleanly and accepted the provisioning.
- **Files modified:** None (DB-only fix — no repo files changed)
- **Commit:** 43b7e83 (documented in commit message)

**2. [Rule 3 - Blocking] Compose file location differed from plan assumption**
- **Found during:** Task 2 deploy
- **Issue:** Plan assumed `docker-compose.monitoring.yml` at `/opt/homestack/`; actual live location is `/opt/homestack/monitoring/docker-compose.yml`
- **Fix:** Used correct path `cd /opt/homestack/monitoring && docker compose restart grafana`
- **Files modified:** None

## Known Stubs

None. All dashboards reference live Prometheus data. The homelab-summary.json uses per-IP instance matchers which will show "No data" for hosts where node-exporter is not yet scraping — this is expected until Phase 03 Ansible deployment completes for all hosts.

## Threat Flags

None — no new network endpoints or auth paths introduced beyond what the plan's threat model covers.

## Self-Check: PASSED

Files exist:
- servers/docker-tower/monitoring/grafana/provisioning/datasources/prometheus.yml: FOUND
- servers/docker-tower/monitoring/grafana/provisioning/dashboards/dashboards.yml: FOUND
- servers/docker-tower/monitoring/grafana/provisioning/dashboards/json/node-exporter-full.json: FOUND
- servers/docker-tower/monitoring/grafana/provisioning/dashboards/json/cadvisor-containers.json: FOUND
- servers/docker-tower/monitoring/grafana/provisioning/dashboards/json/homelab-summary.json: FOUND
- scripts/tests/phase-03/04-grafana-provisioning.sh: FOUND
- scripts/tests/phase-03/04-grafana-live.sh: FOUND

Commits exist:
- 50502d7: Task 1 — provisioning files + dashboard JSONs + static test
- 43b7e83: Task 2 — live deploy + live test script
