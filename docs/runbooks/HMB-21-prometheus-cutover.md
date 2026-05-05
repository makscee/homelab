# HMB-21 — Prometheus cutover docker-tower → mcow

**Date:** 2026-05-05
**Operator:** orchestrator + subagent (claude-opus-4-7)

## TSDB size + gate

- Pre-cutover TSDB on docker-tower: **2.3 GB** (volume `docker-tower_prometheus-data`).
- Plan gate was 2 GB; operator approved bump to 3 GB before cutover (15% over original gate, still inside Tailnet rsync budget — projected wall-clock ~30–60 s for delta).

## Volume-name fix (pre-cutover)

Compose project prefix would have created `mcow_prometheus-data` and orphaned the rsync'd TSDB. Pinned name in `servers/mcow/docker-compose.monitoring.yml`:

```yaml
volumes:
  prometheus-data:
    name: prometheus-data
```

Rendered `docker compose config` confirmed `name: prometheus-data` (unprefixed).

Commit: `913cde3` — `HMB-21: pin prometheus-data volume name to avoid compose project prefix`

## Cutover timeline (UTC)

| Step | Wall time | Notes |
|---|---|---|
| Hot rsync (tower → mcow, direct over Tailnet) | **5 m 38 s** | rsync warning code 24 (`chunks_head/000006` vanished mid-sync — expected, head chunk rotated) |
| `T_stop` — tower prometheus stopped | **2026-05-05T09:01:53Z** | `docker compose stop prometheus` on docker-tower |
| Final delta rsync (`--delete`) | **3.2 s** | clean (no warnings) |
| Compose+monitoring rsync hub→mcow | <1 s | `rsync -a` (Apple openrsync rejected `-X`) |
| `T_start` — `compose up -d prometheus` issued | **2026-05-05T09:02:28Z** | container started but crash-looped |
| Cockpit conflict diagnosed + cleared | ~50 s | `cockpit.socket` was bound on `100.101.0.9:9090`; stopped + disabled |
| `T_ready` — `/-/ready` returned 200 | **2026-05-05T09:03:40Z** | first-try ready after cockpit removal + restart |
| **Scrape gap (T_stop → T_ready)** | **~107 s (~1m47s)** | inside 15 s scrape window means up to 7 missed samples per series |

## Unexpected blocker: cockpit on 9090

mcow had `cockpit.socket` socket-activated by systemd on `100.101.0.9:9090`. Prometheus uses `network_mode: host` and binds `0.0.0.0:9090`, conflicting with the Tailnet-bound cockpit listener. Container crash-looped with:

```
level=ERROR msg="Unable to start web listener" err="listen tcp 0.0.0.0:9090: bind: address already in use"
```

Resolution: `systemctl stop cockpit.socket cockpit.service && systemctl disable cockpit.socket`. Cockpit was not actively used; safe to remove. Should be added to mcow Ansible bootstrap as a permanent fact (track in T7).

## up{} table (post-cutover)

| job | instance | up |
|---|---|---|
| prometheus | localhost:9090 | 1 |
| node | 100.101.0.3:9100 | 1 |
| node | 100.101.0.7:9100 | 1 |
| node | 100.101.0.8:9100 | 1 |
| node | 100.101.0.9:9100 | 1 |
| cadvisor | 100.101.0.9:18080 | 0 |
| cadvisor | localhost:8080 | 1 |
| alertmanager | 100.101.0.9:9093 | 1 |
| alertmanager | localhost:9093 | 0 |
| claude-usage | 100.101.0.9:9101 | 1 |
| claude-usage | localhost:9101 | 0 |
| void-keys | localhost:3000 | 1 |
| homelab-admin | homelab.makscee.ru | 1 |

Note: the `localhost:*` cadvisor/claude-usage/alertmanager rows that are 0 are stale targets carried over from docker-tower — they refer to docker-tower's host loopback. Targets file (`monitoring/prometheus/targets/`) should be cleaned post-T9 to remove these.

## TSDB history smoke

- `node_load1` (current): **4 series** (4 node exporters scraping)
- `node_load1` at `now - 10m`: **4 series** — historical TSDB intact, rsync preserved chunks.

## Mount-source confirmation

```
/opt/homelab/servers/mcow/monitoring/prometheus/prometheus.yml
/opt/homelab/servers/mcow/monitoring/prometheus/alerts
/opt/homelab/servers/mcow/monitoring/prometheus/targets
/var/lib/docker/volumes/prometheus-data/_data
```

Confirmed: TSDB mount source is `/var/lib/docker/volumes/prometheus-data/_data` (the unprefixed pinned name), not `mcow_prometheus-data`.

## Follow-ups

- T6 — point grafana datasource to `localhost:9090` on mcow.
- T7 — Ansible playbook should `systemctl disable --now cockpit.socket` on mcow as part of monitoring bootstrap.
- T9 — decommission tower prometheus, then prune the `localhost:*` cadvisor/claude-usage/alertmanager targets that referred to tower.
