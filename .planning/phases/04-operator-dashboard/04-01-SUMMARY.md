---
phase: 04-operator-dashboard
plan: 01
subsystem: monitoring
tags: [grafana, alertmanager, prometheus, mcow, docker-tower, migration, sops, telegram]
requires: [MON-01, MON-02, 03-05-SUMMARY]
provides: [grafana-on-mcow, alertmanager-on-mcow, prometheus-rewired, grafana-datasources]
affects: [servers/mcow, servers/docker-tower, secrets/mcow.sops.yaml]
tech-stack:
  added: []
  patterns: [sops-decrypt-pipe-ssh, bind-mount-inode-restart, tailnet-only-binds, datasource-uid-pinning]
key-files:
  created: []
  modified:
    - servers/mcow/docker-compose.monitoring.yml
    - servers/docker-tower/docker-compose.monitoring.yml
    - servers/docker-tower/monitoring/prometheus/prometheus.yml
    - servers/docker-tower/monitoring/alertmanager/README.md
decisions:
  - Remove GF_INSTALL_PLUGINS (unreliable egress on mcow; piechart unused)
  - Decommission docker-tower Grafana/AM by commenting stanzas (not deleting) — 7d rollback
  - Preserve monitoring_grafana-data + monitoring_alertmanager-data volumes until 2026-04-22
  - Operator removed obsidian container (unrelated port 3000 occupant) per explicit decision
  - Push plaintext env via ssh stdin pipe (mcow has no sops/age installed)
metrics:
  duration: "~30min"
  completed: "2026-04-15T13:55:12Z"
  tasks_completed: 2
  commits: 2
---

# Phase 04 Plan 01: Grafana + Alertmanager Migration to mcow — Summary

**One-liner:** Migrated Grafana 12.3.1 + Alertmanager v0.27.0 from docker-tower to mcow (Tailnet-bound 100.101.0.9:3000/:9093), rewired Prometheus on docker-tower to alert to mcow, preserved docker-tower volumes for 7d rollback, enforced `0440 root:65534` perms on telegram_token.

## What Was Built

**mcow stack (new):**
- Grafana on `100.101.0.9:3000`, credentials sourced from SOPS via `/run/secrets/grafana.env` (mode 0600)
- Alertmanager on `100.101.0.9:9093`, Telegram bot_token_file at `/etc/alertmanager/telegram_token` (mode 0440 root:65534)
- Both containers on bridge network `monitoring`; Grafana reaches Alertmanager via docker-DNS `alertmanager:9093`
- Provisioned datasources: `prometheus-homelab` (→ `http://100.101.0.8:9090`) and `alertmanager-homelab` (→ `http://alertmanager:9093`)

**docker-tower (modified):**
- Prometheus alerting target flipped `localhost:9093` → `100.101.0.9:9093`
- Alertmanager scrape job target flipped same
- Grafana + Alertmanager service stanzas commented with `DECOMMISSIONED 2026-04-15` banner
- Containers `grafana` + `alertmanager` stopped and removed
- Volumes `monitoring_grafana-data` and `monitoring_alertmanager-data` preserved (1-week rollback until 2026-04-22)

## Verification

| Check | Result |
|-------|--------|
| `curl http://100.101.0.9:3000/api/health` | `{"database":"ok","version":"12.3.1"}` |
| `curl http://100.101.0.9:9093/-/healthy` | HTTP 200 |
| `stat -c %a /run/secrets/telegram_token` on mcow | `440` |
| `stat -c %g /run/secrets/telegram_token` on mcow | `65534` (nogroup) |
| `stat -c %a /run/secrets/grafana.env` on mcow | `600` |
| Prometheus active alertmanagers | `http://100.101.0.9:9093/api/v2/alerts` |
| docker-tower `grafana` / `alertmanager` in `docker ps` | absent |
| docker-tower volumes preserved | `monitoring_grafana-data`, `monitoring_alertmanager-data` present |
| Grafana datasource Prometheus `/health` | `OK` |
| Grafana datasource Alertmanager configured | yes (uid=`alertmanager-homelab`, url=`http://alertmanager:9093`) |

## Deviations from Plan

### Pre-execution blocker resolution

**[Operator decision — Obsidian removal]**
Port 3000 on mcow was occupied by an undocumented `lscr.io/linuxserver/obsidian:latest` container binding `0.0.0.0:3000`. Planner paused with checkpoint. Operator chose removal. Actions:
- Captured volumes pre-removal:
  - `bind: /root/.openclaw/workspace/.obsidian-docker-config -> /config` (RW)
  - `bind: /root/.openclaw/workspace -> /vault` (RW)
- Command used: `docker stop obsidian && docker rm obsidian` (no `-v` flag — volume data on host preserved; bind-mount source paths untouched)
- Verified: `docker ps -a --filter name=obsidian` returns empty; port 3000 free.
- **Data recovery:** All Obsidian vault data remains on mcow host at `/root/.openclaw/workspace` — operator can recreate the container by running `docker run -d --name obsidian -p <some-port>:3000 -v /root/.openclaw/workspace/.obsidian-docker-config:/config -v /root/.openclaw/workspace:/vault lscr.io/linuxserver/obsidian:latest`.

### Auto-fixed Issues

**1. [Rule 3 - Blocking] mcow has no `sops` or `age` installed**
- **Found during:** Task 2 Step A (deploy secrets).
- **Issue:** Plan prescribes `sops --decrypt` run *on* mcow, but `command -v sops` returned empty; `apt list --installed` confirmed absent.
- **Fix:** Ran `sops -d` on the operator machine and piped plaintext into `ssh root@mcow bash -s` stdin. Env never written to disk on operator; mcow writes to `/run/secrets/mcow.env` mode 0600 as planned.
- **Files modified:** none (runtime-only deviation).
- **Follow-up:** Consider installing `sops` + `age` on mcow in a future plan so the flow matches docker-tower — currently documented in the mcow alertmanager README but not installed.

**2. [Rule 1 - Bug] Grafana `GF_INSTALL_PLUGINS` crash-loops**
- **Found during:** Task 2 Step B (health check).
- **Issue:** Grafana failed to start: `failed to install plugin grafana-piechart-panel@: dial udp 8.8.8.8:53: connect: network is unreachable`. mcow's host DNS works but Grafana's Go resolver bypasses the docker embedded DNS (127.0.0.11) and tries UDP:53 to 8.8.8.8 directly, which is blocked/filtered. Container crash-looped before binding port 3000.
- **Fix:** Removed `GF_INSTALL_PLUGINS=grafana-piechart-panel` line from `servers/mcow/docker-compose.monitoring.yml` with a banner explaining the rationale. `piechart-panel` is not referenced by any 03-04/04-02 homelab dashboard.
- **Files modified:** `servers/mcow/docker-compose.monitoring.yml`
- **Commit:** `e08156a`
- **Re-enable condition:** only if a future dashboard needs it AND egress stability confirmed.

**3. [Rule 1 - Bug] Prometheus alertmanager scrape job would trigger `AlertmanagerDown`**
- **Found during:** Task 2 Step C (prometheus rewire).
- **Issue:** The plan specified updating only the `alerting:` block, but `scrape_configs:` also had `job_name: 'alertmanager'` → `targets: ['localhost:9093']`. With docker-tower Alertmanager gone, that scrape would fail and trigger the `AlertmanagerDown` alert rule in `alerts/homelab.yml`.
- **Fix:** Updated the same file to point scrape target at `100.101.0.9:9093`.
- **Files modified:** `servers/docker-tower/monitoring/prometheus/prometheus.yml`
- **Commit:** `e08156a`

**4. [Rule 3 - Blocking] Live compose path on docker-tower differs from plan assumption**
- **Found during:** Task 2 Step D (decommission deploy).
- **Issue:** Plan assumed `/opt/homestack/docker-compose.monitoring.yml` as the live path. Actual live path (from existing container labels) is `/opt/homestack/monitoring/docker-compose.yml` under compose project name `monitoring`. First rsync + compose run failed with "Container name already in use" because compose re-created under project `homestack` instead of updating project `monitoring`.
- **Fix:** rsynced to `/opt/homestack/monitoring/docker-compose.yml` and ran `docker compose up -d --remove-orphans` from that directory.
- **Files modified:** none in repo (path discovery / runtime deviation).
- **Follow-up:** `/opt/homestack/docker-compose.monitoring.yml` leftover copy on docker-tower is stale — a future plan may reconcile.

**5. [Rule 1 - Bug] Prometheus bind-mount inode invalidated by rsync**
- **Found during:** Task 2 Step C (verify Prometheus sees new config).
- **Issue:** After rsyncing the new `prometheus.yml`, `curl -X POST /-/reload` returned HTTP 200 but Prometheus still loaded the old `localhost:9093` target — rsync replaced the file atomically via tmpfile + rename, breaking the bind-mount inode.
- **Fix:** `docker restart prometheus` to re-resolve the bind mount.
- **Re-verified:** `activeAlertmanagers[0].url = http://100.101.0.9:9093/api/v2/alerts` ✓

### Known Grafana quirk (non-blocking)

Grafana `/api/datasources/uid/alertmanager-homelab/health` returns HTTP 500 `plugin unavailable`. This is a Grafana 12.x behavior for the core alertmanager datasource, which is frontend-only and has no backend `/health` handler. The datasource IS correctly provisioned (visible in `/api/datasources`, queryable from dashboards). No action required; 04-02 dashboards will confirm functional use.

## Authentication Gates

None encountered during execution.

## Threat Flags

None introduced. All mitigations from the plan `<threat_model>` honored:
- T-04-01-01/02: Tailnet-only binds verified via grep + `ss -tlnp`
- T-04-01-03: telegram_token mode `0440 root:65534` — verified twice (after install, after compose up)
- T-04-01-04: GF_SECURITY_ADMIN_* sourced from `env_file: /run/secrets/grafana.env` only; no plaintext literals in repo
- T-04-01-05: `GF_USERS_ALLOW_SIGN_UP=false` retained
- T-04-01-06: datasource UIDs `prometheus-homelab` and `alertmanager-homelab` pinned
- T-04-01-08: volumes preserved; banners document 2026-04-22 deletion date

## Decisions Made

1. **Remove GF_INSTALL_PLUGINS on mcow** — unreliable external egress + unused plugin.
2. **Decommission via comment-out, not deletion** — allows rollback uncomment in <60s.
3. **Preserve volumes 7 days** — banners in compose header + README track deletion date 2026-04-22.
4. **sops-on-operator + ssh-stdin-pipe** for secret deployment — avoids installing sops/age on mcow for a one-off.
5. **Alertmanager datasource uses docker-DNS name** (`alertmanager:9093`) — intra-stack stays resilient across IP changes; Prometheus reaches via Tailnet IP.

## Self-Check: PASSED

- FOUND: servers/mcow/docker-compose.monitoring.yml
- FOUND: servers/mcow/monitoring/alertmanager/alertmanager.yml
- FOUND: servers/mcow/monitoring/grafana/provisioning/datasources/prometheus.yml
- FOUND: servers/mcow/monitoring/grafana/provisioning/datasources/alertmanager.yml
- FOUND: secrets/mcow.sops.yaml
- FOUND: commit 3863a87 (Task 1 scaffold — pre-existing from earlier attempt)
- FOUND: commit e08156a (Task 2 deploy + fixes)
- LIVE: grafana running on mcow, alertmanager running on mcow, prometheus running on docker-tower, docker-tower grafana/alertmanager removed, volumes preserved

## Post-plan cleanup TODO (tracked for 04-02+)

- [ ] 2026-04-22: `ssh root@docker-tower 'docker volume rm monitoring_grafana-data monitoring_alertmanager-data'` after rollback window.
- [ ] 2026-04-22: Remove commented-out `grafana:` and `alertmanager:` service blocks from `servers/docker-tower/docker-compose.monitoring.yml`.
- [ ] Reconcile stale `/opt/homestack/docker-compose.monitoring.yml` on docker-tower (superseded by `/opt/homestack/monitoring/docker-compose.yml`).
- [ ] Consider installing sops+age on mcow for self-service secret rotation.
