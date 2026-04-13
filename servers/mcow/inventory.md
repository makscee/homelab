# mcow

| Field | Value |
|-------|-------|
| Hostname | mcow |
| Tailscale IP | 100.101.0.9 |
| Role | VoidNet bot, API, portal, SQLite database |
| Hardware | Hardware pending SSH query: `ssh root@mcow "lscpu | head -15 && free -h && df -h"` |
| Access | `ssh root@mcow` via Tailnet |

## Hosted Services

| Service | Port | Image/Binary | Notes |
|---------|------|-------------|-------|
| voidnet-api | 8080 | /opt/voidnet/voidnet-api (Rust binary) | VoidNet REST API; bind 0.0.0.0:8080; systemd unit |
| voidnet-bot | — | /opt/voidnet/voidnet-bot (Rust binary) | Telegram bot (@void_net_bot); systemd unit |
| voidnet-overseer | — | Pending SSH query | Management/monitoring service |
| voidnet-satellite | — | Pending SSH query | Satellite service |
| voidnet-portal | — | Pending SSH query | Web portal (check for port in running processes) |
| PocketBase / Notes | 8090 | Pending SSH query | notes.makscee.ru → 100.101.0.9:8090 via Caddy |
| Animaya API | 8090 | Pending SSH query | animaya.makscee.ru /api/* → 100.101.0.9:8090 |
| Animaya Frontend | 3090 | Pending SSH query | animaya.makscee.ru → 100.101.0.9:3090 |
| SOCKS5 proxy | 1080 | Pending SSH query | Local SOCKS5 proxy used by Telegram bot |

## Cross-Server Dependencies

| Dependency | Target | Connection | Purpose |
|------------|--------|------------|---------|
| Jellyfin | docker-tower (100.101.0.8:8096) | DOCKER_TOWER_IP + JELLYFIN_API_KEY | Media library integration |
| Radarr | docker-tower (100.101.0.8:7878) | DOCKER_TOWER_IP + RADARR_API_KEY | Movie requests |
| Sonarr | docker-tower (100.101.0.8:8989) | DOCKER_TOWER_IP + SONARR_API_KEY | TV show requests |
| Navidrome | docker-tower (100.101.0.8:4533) | DOCKER_TOWER_IP + NAVIDROME_ADMIN_PASS | Music library |
| Lidarr | docker-tower (100.101.0.8:8686) | DOCKER_TOWER_IP + LIDARR_API_KEY | Music automation |
| AmneziaWG | nether (NETHER_SSH=root@nether) | SSH + AWG_CONTAINER=amnezia-awg2 | VPN peer management |
| SMTP (Resend) | smtp.resend.com | SMTP_HOST/USER/PASSWORD | Email notifications |

## Storage Layout

| Path | Purpose | Stateful Data |
|------|---------|--------------|
| /opt/voidnet/voidnet.db | SQLite database (CRITICAL) | All VoidNet user data, sessions, state |
| /opt/voidnet/.env | Environment config | Secrets and service configuration |
| /opt/voidnet/voidnet-api | VoidNet API binary | Rust executable |
| /opt/voidnet/voidnet-bot | VoidNet bot binary | Rust executable |
| (additional paths pending SSH query) | — | — |

## Notes

mcow has the most cross-server dependencies of any server. VoidNet services require docker-tower to be operational for media integration. The voidnet.db SQLite file at `/opt/voidnet/voidnet.db` is the only copy of critical user data — backup strategy is required. Services are Rust binaries managed by systemd units, not Docker containers. Telegram bot uses a local SOCKS5 proxy (port 1080) for connectivity. Nether's Caddy routes `voidnet.makscee.ru` traffic to mcow:8080 (VoidNet API) and proxies media requests to docker-tower.
