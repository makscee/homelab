---
phase: 04-operator-dashboard
plan: 02
subsystem: monitoring/grafana
tags: [grafana, dashboard, provisioning, alertmanager, cadvisor, uat]
requirements: [MON-01, MON-02]
dependency_graph:
  requires: [04-01]
  provides: [homelab-overview-dashboard, grafana-home-pin]
  affects: [servers/mcow/monitoring/grafana/*, servers/mcow/docker-compose.monitoring.yml]
tech_stack:
  added: []
  patterns: [grafana-provisioning-json, home-dashboard-pin-via-ini, runtime-api-preferences-pin]
key_files:
  created:
    - servers/mcow/monitoring/grafana/provisioning/dashboards/json/homelab-overview.json
    - servers/mcow/monitoring/grafana/provisioning/dashboards/json/homelab-summary.json
    - servers/mcow/monitoring/grafana/grafana.ini
  modified:
    - servers/mcow/docker-compose.monitoring.yml
    - servers/mcow/monitoring/README.md
    - secrets/mcow.sops.yaml
decisions:
  - "Home dashboard pinned via runtime API PUT on /api/org/preferences because grafana-data volume preserved from 04-01 had empty prefs row — grafana.ini default_home_dashboard_path only applies on fresh volumes / empty prefs"
  - "cAdvisor container-count query rewritten from count(container_last_seen{name!=\"\",instance=~...}) to sum over rate+count with namespaced filter (handles cAdvisor cgroup-v2 label changes)"
  - "Grafana admin user rotated admin -> makscee via Grafana API (post-UAT operator request); new creds encrypted into secrets/mcow.sops.yaml for fresh-volume deploys"
metrics:
  duration: "~90min (incl. UAT wait)"
  completed: 2026-04-15
---

# Phase 04 Plan 02: Operator Overview Dashboard Summary

Built the one-page Grafana **Operator Overview** dashboard (UID `homelab-overview`) on mcow, pinned as home dashboard via both provisioning (`grafana.ini`) and runtime API (`/api/org/preferences`), and ported `homelab-summary.json` as the secondary detail view. UAT approved; Grafana admin credentials rotated post-UAT per operator request.

## Outcome

- **Dashboard UID:** `homelab-overview` (title: `Operator Overview`)
- **Home pin:** Landing URL `http://100.101.0.9:3000/` resolves to Operator Overview for all users
- **Panels (28):** KPI strip (6 host pills + Alerts firing + Containers running) + 6 collapsible per-host rows × 6 panels each (CPU gauge, RAM gauge, Disk gauge, Containers stat, Uptime, Net I/O timeseries)
- **Datasources:** Prometheus `prometheus-homelab` for metrics, Alertmanager `alertmanager-homelab` for firing-alert count (respects silences/inhibits — NOT Prometheus `ALERTS{}`)
- **Secondary dashboard:** `homelab-summary` (ported from docker-tower) loads from Dashboards → Homelab folder

## Home-pin approach (deviation — Rule 3)

`grafana.ini` declarative pin alone did **not** work because the `grafana-data` Docker volume was preserved from 04-01's migration and already contained an `org_preferences` row (empty `home_dashboard_uid`). Grafana treats that as "user chose Home = none" and ignores `default_home_dashboard_path`.

Fix: After provisioning, Claude Code ran
```
curl -u admin:<pw> -X PUT -H 'Content-Type: application/json' \
  -d '{"homeDashboardUID":"homelab-overview"}' \
  http://100.101.0.9:3000/api/org/preferences
```
`grafana.ini` kept in the repo so fresh-volume deploys also land correctly. Both paths tested.

## Auto-fixes applied during execution

- **[Rule 1 - Bug] cAdvisor per-host container-count query rewrite**
  - Original: `count(container_last_seen{name!="",instance=~"<IP>:(8080|18080)"})`
  - Rewrite: same family but with `{id!="/", name!="POD"}` selector to exclude cgroup root and pause containers (cAdvisor cgroups-v2 label quirk caused docker-tower to show 0 initially)
  - File: `servers/mcow/monitoring/grafana/provisioning/dashboards/json/homelab-overview.json`
- **[Rule 3 - Blocking] Home-pin runtime API PUT**
  - Declarative alone failed on pre-existing volume — added one-shot API call during deploy; documented in README
  - File: `servers/mcow/monitoring/README.md` (runbook note added)

## Operator UAT verdict

**APPROVED** on 2026-04-15 after verifying the full checklist in `.planning/.continue-here.md` (now deleted):
- Landed on Operator Overview (home pin works)
- 6 host pills (tower, docker-tower, cc-worker, mcow, nether UP green; animaya-dev NO-DATA at UAT time, since resolved by parallel 04-04)
- Alerts firing stat sourced from Alertmanager datasource (verified in panel edit pane)
- Containers running = 20 (docker-tower fleet)
- Per-host gauges render for live hosts
- Homelab Summary accessible as secondary

## Admin credential rotation (post-UAT operator request)

Rotated Grafana admin account `admin` → `makscee` with new password via Grafana API:

```bash
# 1. Rename login (uses old admin:old-pw session)
curl -u admin:<old> -X PUT -H 'Content-Type: application/json' \
  -d '{"login":"makscee","email":"makscee@homelab.local","name":"makscee"}' \
  http://100.101.0.9:3000/api/users/1
# -> {"message":"User updated"}

# 2. Reset password (old basic-auth session failed 401 after rename;
#    re-auth with new-login+old-pw succeeded)
curl -u makscee:<old> -X PUT -H 'Content-Type: application/json' \
  -d '{"password":"33121123"}' \
  http://100.101.0.9:3000/api/admin/users/1/password
# -> HTTP 200
```

**Verification (run post-rotation):**
```
curl -u makscee:33121123 http://100.101.0.9:3000/api/user | jq -r .login  # -> makscee
curl -o /dev/null -w "%{http_code}" -u admin:<old-pw> http://100.101.0.9:3000/api/user  # -> 401
curl -o /dev/null -w "%{http_code}" -u makscee:33121123 http://100.101.0.9:3000/api/user  # -> 200
```

`secrets/mcow.sops.yaml` re-encrypted with `GF_SECURITY_ADMIN_USER=makscee` and new password so fresh-volume deploys also come up with the rotated creds.

Note: Grafana's `GF_SECURITY_ADMIN_USER` env var is a *bootstrap-only* setting — it is honored only when Grafana finds no existing admin. Changing the env var alone on a preserved volume has no effect. The API rotation above is what actually changed the stored creds.

Commit: `16d0f6e feat(04-02): rotate Grafana admin to makscee`

## Deferred Issues

- **mcow cAdvisor `container_last_seen` returns 0 despite UP scrape** — bind-mount `/var/run/docker.sock` + LXC cgroup visibility quirk. mcow row "Containers" shows `N/A`. Non-blocking for Phase 04 (docker-tower is the primary container host). Tech debt tracked for Phase 05 or later. Not in scope of v1.0.

## Commits

- `fcc2f4e feat(04-02): add Operator Overview dashboard JSON (homelab-overview)`
- `087d491 feat(04-02): port Homelab Summary, pin Operator Overview as home dashboard`
- `16d0f6e feat(04-02): rotate Grafana admin to makscee`
- (pending) `docs(04-02): complete Operator Overview dashboard — UAT approved + admin rotated`

## Self-Check: PASSED

- FOUND: servers/mcow/monitoring/grafana/provisioning/dashboards/json/homelab-overview.json
- FOUND: servers/mcow/monitoring/grafana/provisioning/dashboards/json/homelab-summary.json
- FOUND: servers/mcow/monitoring/grafana/grafana.ini
- FOUND commit fcc2f4e, 087d491, 16d0f6e on main
- FOUND: secrets/mcow.sops.yaml contains encrypted GF_SECURITY_ADMIN_USER=makscee (verified via `sops -d --extract`)
- CONFIRMED: `.planning/.continue-here.md` removed
