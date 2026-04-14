---
plan: 03-03
phase: 03-health-monitoring
status: complete
completed: 2026-04-14
requirements: [MON-01, partial MON-02]
---

# 03-03 SUMMARY — Compose migration: Alertmanager + cAdvisor, nether decommission

## Outcome

The docker-tower monitoring stack now runs Alertmanager (Telegram-wired via SOPS-mounted bot token), cAdvisor (docker-tower + mcow), and Prometheus with 720h retention. Grafana is bound to the Tailnet IP. The nether secondary monitoring stack has been brought down and the compose file removed from the repo. Prometheus targets show all expected endpoints healthy except animaya-dev (pre-existing deferred).

## Live verify (post-deploy, 2026-04-14)

```
Prometheus  http://100.101.0.8:9090   self-scrape up
Alertmanager http://100.101.0.8:9093/-/healthy -> 200
cAdvisor    http://100.101.0.8:8080/healthz    -> 200   (docker-tower)
cAdvisor    http://100.101.0.9:18080/healthz   -> 200   (mcow)

Prometheus active targets:
  node     100.101.0.7:9100       up   tower
  node     100.101.0.8:9100       up   docker-tower
  node     100.99.133.9:9100      up   cc-worker
  node     100.101.0.9:9100       up   mcow
  node     100.101.0.3:9100       up   nether
  node     100.119.15.122:9100    down animaya-dev (deferred — see 03-02 SUMMARY)
  cadvisor 100.101.0.8:8080       up   docker-tower
  cadvisor 100.101.0.9:18080      up   mcow
  prometheus localhost:9090        up

nether ports post-decommission:
  :9090   GONE
  :9093   GONE
  :9100   STILL UP — now served by native systemd node_exporter (03-02),
          not the removed container. Intentional.
```

## Key files changed

Repo:
- `secrets/docker-tower.sops.yaml` — `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` added
- `servers/docker-tower/docker-compose.monitoring.yml` — rewritten: Alertmanager + cAdvisor added, faux node-exporter / mislabeled docker-exporter removed, retention 720h, Grafana bound to 100.101.0.8:3000
- `servers/docker-tower/monitoring/alertmanager/alertmanager.yml` — Telegram receiver (`bot_token_file`, `chat_id: 193835258`, HTML template)
- `servers/docker-tower/monitoring/alertmanager/README.md` — SOPS secret deploy flow
- `servers/docker-tower/monitoring/prometheus/targets/cadvisor.yml` — mcow target changed to `100.101.0.9:18080`
- `servers/mcow/docker-compose.cadvisor.yml` — new
- `servers/mcow/README.md` — new §7 on cAdvisor
- `servers/nether/docker-compose.monitoring.yml` — **DELETED**
- `servers/nether/README.md` — decommission noted
- `scripts/tests/phase-03/03-compose-validate.sh` — docker-tower compose + alertmanager amtool gate
- `scripts/tests/phase-03/03-live-targets.sh` — Prometheus API targets probe

Live hosts:
- `docker-tower`: /opt/homestack/docker-compose.monitoring.yml synced + `docker compose up -d`
- `mcow`: /root/homelab/servers/mcow/docker-compose.cadvisor.yml deployed
- `nether`: `docker compose -f /opt/homestack/monitoring/docker-compose.yml down` — volumes preserved but containers/networks removed

## Commits

- `d94bdbf` feat(03-03): add alertmanager.yml + deploy README + config validation script
- `44cb2f1` feat(03-03): deploy monitoring stack — alertmanager + cAdvisor + retention 720h
- `d6ae429` feat(03-03): deploy cAdvisor on mcow (port 18080, non-host net)
- `a37ac63` feat(03-03): decommission nether monitoring stack

## Deviations

### mcow cAdvisor bound to `:18080`, not `:8080`

voidnet-api on mcow already binds `0.0.0.0:8080`. `network_mode: host` with cAdvisor default port would collide. Resolution: bridge networking with explicit Tailnet-IP port mapping `100.101.0.9:18080 → container :8080`. Prometheus scrape target updated correspondingly. Documented in `servers/mcow/README.md §7`.

### Alertmanager wiring deferred end-to-end Telegram test

The bot token is installed at `/run/secrets/telegram_token` on docker-tower, Alertmanager config validated, container healthy. The actual "alert fires → Telegram message received" test is the Manual-Only test in plan 03-05 (`05-alert-fire.sh`). Not run here — out of scope for 03-03.

### nether secrets cleanup deferred

`secrets/nether.sops.yaml` still contains `GF_SECURITY_ADMIN_*` keys that are no longer referenced post-decommission. README notes this; actual `sops --set` pruning deferred to a cleanup plan so this phase stays focused.

## Requirements covered

- MON-01 (node-exporter on all hosts): holds from 03-02; scraping confirmed by this plan's target verify.
- MON-02 (health-check from Claude Code): **partially** — cAdvisor + Alertmanager pipeline is live; the actual `scripts/healthcheck.sh` CLI comes in 03-05.

## Next

Plan 03-04 provisions Grafana datasource + dashboards against this now-wired Prometheus. After that, plan 03-05 delivers `healthcheck.sh` and runs the manual Telegram-alert E2E test.
