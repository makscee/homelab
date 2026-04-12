# Homelab Infrastructure

## Servers

| Server | Location | Tailscale IP | Role |
|--------|----------|--------------|------|
| tower | Moscow | 100.101.0.7 | Proxmox host (i7-8700 12C, 16GB RAM) |
| docker-tower | Moscow (LXC 100) | 100.101.0.8 | Media stack: Jellyfin, Navidrome, *arr |
| tower-sat | Moscow (LXC 101) | 100.101.0.10 | Satellite services |
| cc-vk | Moscow (LXC 204) | 100.91.54.83 | Vibe Kanban host: Claude Code runner |
| mcow | Moscow | 100.101.0.9 | VoidNet bot, API, portal, SQLite DB |
| nether | Netherlands | 100.101.0.3 | VPN entry/exit: AmneziaWG, XRay/VLESS |

## Architecture

- All servers on Tailscale mesh
- Proxmox on tower hosts LXCs
- VoidNet users access docker-tower services via VPN
- SSH: `ssh root@<hostname>` via Tailnet

## Services on docker-tower

- **Jellyfin** (:8096) — media streaming
- **Navidrome** (:4533) — music streaming
- **Radarr/Sonarr/Lidarr/Prowlarr** — media automation
- **qBittorrent** — downloads

## Planned

- Monitoring (Grafana + Prometheus + node-exporter)
- NAS on tower
- ~~Self-hosted vibe-kanban~~ → cc-vk (LXC 204) deployed
- Whisper speech-to-text API
