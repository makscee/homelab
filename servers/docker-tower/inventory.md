# docker-tower

| Field | Value |
|-------|-------|
| Hostname | docker-tower |
| Tailscale IP | 100.101.0.8 |
| Role | Media stack — Jellyfin, Navidrome, *arr suite, downloads, monitoring |
| Hardware | LXC 100 on tower: 8 vCPUs, 12 GB RAM, 100 GB root disk; disk info pending SSH query |
| Access | `ssh root@docker-tower` via Tailnet |

## Hosted Services

| Service | Port | Image/Binary | Notes |
|---------|------|-------------|-------|
| Jellyfin | 8096 | jellyfin/jellyfin:latest | Media streaming |
| Navidrome | 4533 | deluan/navidrome:latest | Music streaming |
| qBittorrent | 8080, 6881 | lscr.io/linuxserver/qbittorrent:latest | Downloads; 6881 is peer port |
| Radarr | 7878 | lscr.io/linuxserver/radarr:latest | Movie automation |
| Sonarr | 8989 | lscr.io/linuxserver/sonarr:latest | TV show automation |
| Lidarr | 8686 | lscr.io/linuxserver/lidarr:latest | Music automation |
| Prowlarr | 9696 | lscr.io/linuxserver/prowlarr:latest | Indexer management |
| slskd | 5030, 50300 | slskd/slskd:latest | Soulseek client; 50300 is peer port |
| FlareSolverr | 8191 | flaresolverr/flaresolverr:latest | Captcha solving for *arr |
| FileBrowser | 8081 | filebrowser/filebrowser:latest | Web file manager |
| personal-page | 8085 | nginx:alpine | Personal website |
| docker-tower-api | — | python:3.12-slim | Custom REST API (no external port mapped) |
| Grafana | 3000 | grafana/grafana:latest | Monitoring dashboards |
| Prometheus | 9090 | prom/prometheus:latest | Metrics collection (no external port) |
| node-exporter-docker-tower | 9100 | quay.io/prometheus/node-exporter:latest | Host metrics for docker-tower |
| node-exporter-nether | 9100 | quay.io/prometheus/node-exporter:latest | Remote node-exporter scrape target |
| docker-exporter | 9115 | prom/blackbox-exporter:latest | Docker container probing |
| dockerproxy | — | tecnativa/docker-socket-proxy:latest | Safe Docker socket proxy |
| Portainer Agent | 9001 | portainer/agent | Container management agent |
| workspace-vault-of-mine | — | node:22-bookworm | Dev workspace container |
| opencode-vault-of-mine | — | codeyhj/opencode-docker:latest | OpenCode dev container |
| opencode-arena-game | — | codeyhj/opencode-docker:latest | OpenCode dev container |
| workspace-arena-game | — | arena-game-workspace | Dev workspace container |

## Storage Layout

| Path | Purpose | Stateful Data |
|------|---------|--------------|
| /media/wdc | WDC HDD (bind-mounted from tower mp0) | Primary media library |
| /media/sea | Seagate HDD (bind-mounted from tower mp1) | Secondary media library |
| /var/opt/homestack/workspace | Homestack workspace volume | Git repos, workspace state |
| /var/opt/homestack/opencode/ | OpenCode state/share volumes | OpenCode session state |
| /opt/homestack/workspaces/opencode-config | OpenCode config | OpenCode configuration |
| Grafana Docker volume: grafana-data | Grafana state | Dashboards, users, datasources |
| Prometheus Docker volume: prometheus-data | Prometheus state | Metrics TSDB |

## Notes

Most service-dense server in the homelab. All media automation (*arr suite) routes downloads through qBittorrent and files land on `/media/wdc` or `/media/sea`. VoidNet users on nether access Jellyfin (:8096) and Navidrome (:4533) via the Caddy reverse proxy on nether. The `dockerproxy` container provides safe Docker socket access to avoid exposing the raw socket. Monitoring stack (Grafana + Prometheus + exporters) is co-located here.
