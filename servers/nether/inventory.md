# nether

| Field | Value |
|-------|-------|
| Hostname | nether |
| Tailscale IP | 100.101.0.3 |
| Public IP | 77.239.110.57 |
| Role | VPN entry/exit point (Netherlands), reverse proxy for all public domains |
| Hardware | VPS — hardware pending SSH query: `ssh root@nether "lscpu | head -15 && free -h && df -h"` |
| Access | `ssh root@nether` via Tailnet |

## Hosted Services

| Service | Port | Image/Binary | Notes |
|---------|------|-------------|-------|
| AmneziaWG | 46476/UDP | amnezia-awg2 (Docker) | VPN server; obfuscated WireGuard |
| Caddy | 80, 443, 2053 | caddy:latest (Docker) | Reverse proxy for all public domains |
| void-overseer | 8000 | Custom build (Docker) | Void overseer central controller |
| void-uplink | 8001 | Custom build (Docker) | Void uplink satellite agent (dev/test) |
| n8n | 5678 | n8n (Docker) | Workflow automation (n8n.makscee.ru) |
| SpacetimeDB | 3000 | spacetimedb (Docker) | Database (aoi.makscee.ru:3000) |
| CouchDB | 5984 | couchdb (Docker) | Document database (sync.makscee.ru) |
| x-ui | 2053 | xui (Docker) | XRay/VLESS management panel (internal TLS) |
| Prometheus | 9090 | prom/prometheus:latest (Docker) | Metrics collection |
| Grafana | 3001 | grafana/grafana:latest (Docker) | Monitoring dashboards (port 3001) |
| node-exporter-docker-tower | 9100 | quay.io/prometheus/node-exporter:latest | Remote exporter scrape |
| node-exporter-nether | 9100 | quay.io/prometheus/node-exporter:latest | Host metrics for nether |
| docker-exporter | 9115 | prom/blackbox-exporter:latest | Docker container probing |

## Caddy Reverse Proxy Routes

| Domain | Upstream | Notes |
|--------|----------|-------|
| makscee.ru | 100.101.0.8:8085 | Personal page on docker-tower |
| voidnet.makscee.ru | 100.101.0.9:8080 | VoidNet API on mcow |
| voidnet.makscee.ru/jellyfin/* | 100.101.0.8:8096 | Jellyfin on docker-tower |
| voidnet.makscee.ru/navidrome* | 100.101.0.8:4533 | Navidrome on docker-tower |
| notes.makscee.ru | 100.101.0.9:8090 | Notes/PocketBase on mcow |
| animaya.makscee.ru | 100.101.0.9:3090 | Animaya frontend on mcow |
| animaya.makscee.ru/api/* | 100.101.0.9:8090 | Animaya API on mcow |
| n8n.makscee.ru | n8n:5678 | n8n (local container) |
| aoi.makscee.ru:3000 | spacetimedb:3000 | SpacetimeDB (local container) |
| sync.makscee.ru | couchdb:5984 | CouchDB (local container) |
| https://nether:2053 | xui:2053 | XRay panel (internal TLS) |

## Storage Layout

| Path | Purpose | Stateful Data |
|------|---------|--------------|
| /opt/void/overseer/void.db | Void overseer SQLite DB | Overseer state |
| /opt/void/overseer/clones | Git clone directory | Repo clones for overseer |
| Prometheus Docker volume: prometheus-data | Prometheus metrics | TSDB retention 200h |
| Grafana Docker volume: grafana-data | Grafana state | Dashboards, users |
| AmneziaWG config | Pending SSH query | VPN peer keys and config |

## Notes

Only server outside Moscow — Netherlands location provides VPN exit point. AmneziaWG (obfuscated WireGuard, port 46476/UDP) is the active VPN protocol. XRay/VLESS is present via x-ui panel but is out of scope per project decisions. This is the TLS termination point for all public domains (*.makscee.ru). nether is a SPOF: if it goes down, all public VPN access and domain routing is lost. AmneziaWG config capture is a priority in Phase 2.
