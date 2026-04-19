# docker-tower (LXC 100 on tower)

**Tailscale IP:** 100.101.0.8
**Host:** tower (Proxmox, LXC VMID 100)
**Role:** Media streaming + homelab services + monitoring stack

This LXC runs the bulk of the homelab's user-facing Docker services.
Every live container is reproducible from the compose files in this directory
plus the SOPS-encrypted secrets file at `secrets/docker-tower.sops.yaml`.

## Overview

Four compose files split by purpose:

| File | Purpose |
|------|---------|
| `docker-compose.services.yml` | Media stack (Jellyfin, *arr, qBittorrent, Filebrowser, FlareSolverr, docker-socket-proxy, personal-page) |
| `docker-compose.monitoring.yml` | Prometheus + Grafana + node-exporters + blackbox-exporter |
| `docker-compose.homestack.yml` | Shared workspace + opencode containers on the `homestack` external network |
| `docker-compose.extras.yml` | Services discovered on live docker-tower that were not covered by the other files: navidrome, slskd, docker-tower-api, portainer_agent |

## Stacks (deploy order)

On a fresh docker-tower LXC, after installing Docker and joining Tailscale:

```bash
# 1. Create external networks the compose files expect
docker network create homestack 2>/dev/null || true
docker network create monitoring 2>/dev/null || true

# 2. Decrypt the shared secret file (see "Secrets" below)
mkdir -p /run/secrets
sops --decrypt --output-type dotenv ../../secrets/docker-tower.sops.yaml > /run/secrets/docker-tower.env
cp /run/secrets/docker-tower.env /run/secrets/grafana.env    # monitoring.yml references grafana.env
chmod 600 /run/secrets/*.env

# 3. Bring up each stack
docker compose -f docker-compose.services.yml   up -d
docker compose -f docker-compose.monitoring.yml up -d
docker compose -f docker-compose.homestack.yml  up -d
docker compose -f docker-compose.extras.yml     up -d
```

## Secrets

All non-trivial secrets for this host live in **one** SOPS-encrypted file:

- `secrets/docker-tower.sops.yaml` — encrypted with age; round-trip: `sops --decrypt --output-type dotenv secrets/docker-tower.sops.yaml`

Keys currently stored:

| Key | Used by |
|-----|---------|
| `GF_SECURITY_ADMIN_USER` / `GF_SECURITY_ADMIN_PASSWORD` | Grafana (monitoring.yml) |
| `ND_SPOTIFY_ID` / `ND_SPOTIFY_SECRET` | Navidrome Spotify integration (extras.yml) |
| `ND_LASTFM_APIKEY` / `ND_LASTFM_SECRET` | Navidrome last.fm integration (extras.yml) |
| `DOCKER_TOWER_API_KEY` | docker-tower-api (extras.yml) |

Compose references the decrypted file via `env_file:` at `/run/secrets/grafana.env` (Grafana) and `/run/secrets/docker-tower.env` (others).
`env_file: required: false` is set so `docker compose config` validates even when the decrypted file is not yet on disk — **this does not mean the service runs without it**; on `up` the env vars will simply not be set.
`/run/secrets/` is gitignored; never commit the decrypted output.

To rotate: `sops secrets/docker-tower.sops.yaml` (opens $EDITOR with decrypted content), save, SOPS re-encrypts in place.

## Env

`.env.example` documents every non-secret `${VAR}` reference discovered in the compose files. As of 2026-04-14 there is exactly one: `PROMETHEUS_CONFIG`. Copy it to `.env` for overrides:

```bash
cp .env.example .env
# edit values as needed
```

Docker Compose auto-loads `.env` from the compose project directory; compose file refs like `${PROMETHEUS_CONFIG:-prometheus.yml}` fall back to the default when `.env` is absent.

## Volumes / bind mounts

Derived from `docker inspect` on 2026-04-14. Named volumes are declared by monitoring.yml; everything else is a host bind mount.

| Mount / volume | Purpose |
|----------------|---------|
| `prometheus-data` (named) | Prometheus TSDB |
| `grafana-data` (named) | Grafana dashboards + state |
| `/media/...` → container `/media` or `/music` | Shared media library (Jellyfin, *arr, Navidrome, slskd, qBittorrent) |
| `/opt/docker-configs/shared/<service>` → container `/config` | Per-service config (Jellyfin, *arr, qBittorrent, Filebrowser, Navidrome, slskd) |
| `/var/opt/homestack/workspace` → container `/workspace` | Homestack workspace (shared between `workspace` and `opencode`) |
| `/opt/homestack/workspaces/opencode-config` → `/root/.config/opencode` | opencode config persistence |
| `/var/opt/homestack/opencode/share` and `.../state` | opencode local state/cache |
| `/opt/docker-tower-api` → `/app` | docker-tower-api Python source |
| `/var/run/docker.sock` | dockerproxy, portainer_agent, docker-tower-api |
| `/var/lib/docker/volumes` → same | portainer_agent volume browser |

## Post-deploy gotchas

> **Moved 2026-04-18:** Jellyfin migrated to CT 101 (`jellyfin` LXC) on tower per Phase 17.1.
> The Jellyfin QSV note below is kept for historical reference through 2026-04-25 hot-standby window.
> Config dir `/opt/docker-configs/shared/jellyfin/` slated for purge 2026-05-02 (see `.planning/STATE.md` §Pending Todos).

- **Jellyfin QSV (historical — docker-tower container is hot standby until 2026-04-25):** hardware-accelerated transcoding needs Intel QSV enabled on the host kernel. Run `scripts/enable-jellyfin-qsv.sh` from the repo root **once** after deploying Jellyfin.
- **Prometheus config:** the file referenced by `${PROMETHEUS_CONFIG:-prometheus.yml}` must exist under `./prometheus/` **before** compose up — compose will fail the bind mount otherwise.
- **Homestack workspace network:** `homestack` is declared `external: true` in multiple files. Create it with `docker network create homestack` before first `up`.
- **docker-tower-api runs on host network** (port 8000). If the LXC has anything else on 8000 it will collide.
- **portainer_agent binds to /var/lib/docker/volumes rslave** — requires the LXC to be privileged-enough to allow rshared mount propagation; already set on LXC 100.

## Not captured (by design)

These containers appear in `running-containers.txt` but are intentionally **not** reproduced by any compose file here:

- `workspace-vault-of-mine`, `opencode-vault-of-mine` — per-project dev workspace for the `vault-of-mine` Claude Code project. Spun up on demand by project-local tooling; lifetime is tied to the active dev session, not the homelab baseline.
- `workspace-arena-game`, `opencode-arena-game` — same pattern for the `arena-game` project. The `workspace-arena-game` image is a locally-built `arena-game-workspace` (not in any registry), so committing a compose file here would be unreproducible anyway.

These can be removed at any time with no homelab-level impact.

## Verification

After `docker compose up -d` for all four stacks, verify the repo side of SVC-01:

```bash
bash scripts/verify-phase02.sh --quick
# Expect: SVC-07 OK, SVC-01 OK
```
