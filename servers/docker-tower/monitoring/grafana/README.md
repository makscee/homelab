# Grafana Provisioning

Grafana is configured via code — no manual UI clicks required. On every container start,
Grafana auto-loads the datasource and all three dashboards from the provisioning directory.

## Source Dashboards

| File | Grafana ID | Description |
|------|-----------|-------------|
| `provisioning/dashboards/json/node-exporter-full.json` | 1860 | Node Exporter Full — per-host CPU/RAM/disk/network |
| `provisioning/dashboards/json/cadvisor-containers.json` | 14282 | cAdvisor Docker Containers (Docker cAdvisor Compute Resources) |
| `provisioning/dashboards/json/homelab-summary.json` | custom | Hand-authored per-host summary: up/CPU/RAM/disk/uptime |

## UID Stability Contract

Every committed JSON has an explicit `uid` field. These UIDs are authoritative:

| Dashboard | UID |
|-----------|-----|
| Node Exporter Full | `node-exporter-full` |
| cAdvisor Containers | `cadvisor-containers` |
| Homelab Summary | `homelab-summary` |

`allowUiUpdates: false` in `dashboards.yml` means UI edits will NOT persist across container
restarts. All changes must be made to the committed JSON files.

## Datasource

All panels reference the provisioned Prometheus datasource by UID `prometheus-homelab`.
This datasource is defined in `provisioning/datasources/prometheus.yml` and loaded once
at Grafana startup.

## Refresh Behavior

- **Dashboard changes**: Grafana polls every 30 seconds (`updateIntervalSeconds: 30`).
  Edit any JSON file and changes appear within 30s — no container restart required.
- **Datasource changes**: Loaded once at startup. If `prometheus.yml` changes, restart:
  `docker compose -f docker-compose.monitoring.yml restart grafana`

## Deploying Changes

```bash
# Sync provisioning files to docker-tower
rsync -a servers/docker-tower/monitoring/grafana/ root@docker-tower:/opt/homestack/monitoring/grafana/

# Restart Grafana (only needed for datasource changes)
ssh root@docker-tower 'cd /opt/homestack && docker compose -f docker-compose.monitoring.yml restart grafana'
```

## Admin Credentials

Stored in `secrets/docker-tower.sops.yaml` under `GF_SECURITY_ADMIN_USER` and
`GF_SECURITY_ADMIN_PASSWORD`. Decrypt with `sops -d secrets/docker-tower.sops.yaml`.
The decrypted env file is written to `/run/secrets/grafana.env` on docker-tower at deploy
time — never committed to git.

## Access

Grafana is bound to the Tailscale IP only: `http://100.101.0.8:3000`. Must be on Tailscale
to access. No Caddy proxy, no public exposure.
