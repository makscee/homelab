# Phase 2: Service Documentation - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Capture all running service configs as reproducible Docker Compose files, LXC configs, systemd units, and supporting documentation. Every containerized and LXC service gets a complete, version-controlled definition that can reproduce the service from scratch. Data is collected via SSH from live servers to ensure repo matches reality.

</domain>

<decisions>
## Implementation Decisions

### Data collection method
- **D-01:** SSH into each server via Tailscale to extract running configs — `docker inspect`, `cat` compose files, `pct config` for LXC, etc.
- **D-02:** Verify existing compose files against what's actually running — flag and fix any drift between repo and reality
- **D-03:** Pull fresh LXC configs from Proxmox CLI (`pct config <vmid>`) for containers 100, 101, and 204 — don't trust existing .conf files in repo

### Compose completeness standard
- **D-04:** A complete service definition includes: docker-compose.yml, .env.example with placeholder values, sidecar configs (Caddy, QSV setup, etc.), per-server README with post-deploy steps and gotchas, and volume/mount documentation
- **D-05:** Image tags pinned to exact versions (e.g., `jellyfin/jellyfin:10.9.6`) — query running containers during SSH pull for actual tags
- **D-06:** Docker-level configs only — application-internal settings (Radarr quality profiles, Sonarr indexers, Prowlarr setup) are stateful data belonging to Phase 3 backup/restore scope

### mcow service handling
- **D-07:** SSH into mcow and audit which VoidNet systemd services are actually running vs stale leftovers — overseer and satellite are likely obsolete
- **D-08:** Document only what's actually live — flag stale units for cleanup/deletion
- **D-09:** Claude's discretion on documentation format for live mcow services after SSH inspection reveals what's actually running

### Tailscale provisioning
- **D-10:** Standalone bash script that installs Tailscale and joins the mesh with an auth key — no Ansible dependency for this phase

### AmneziaVPN documentation
- **D-11:** Config files only — pull AmneziaWG configs from nether and commit (keys encrypted via SOPS). No setup procedure or automation script

### Claude's Discretion
- Documentation format for live VoidNet services on mcow (D-09 — decide after SSH inspection)
- README structure and level of detail per server
- Handling of any unexpected services discovered during SSH audit
- Whether to create a single compose file or split into functional stacks per server

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing service configs (verify against live)
- `servers/docker-tower/docker-compose.homestack.yml` — Media stack compose (Jellyfin, Navidrome, *arr) — verify against running containers
- `servers/docker-tower/docker-compose.services.yml` — Additional docker-tower services — verify against running
- `servers/docker-tower/docker-compose.monitoring.yml` — Monitoring compose on docker-tower — verify against running
- `servers/docker-tower/running-containers.txt` — Snapshot of running containers (may be stale)
- `servers/mcow/.env.example` — Environment variable template for mcow services
- `servers/mcow/voidnet-bot.service` — Systemd unit for VoidNet bot — verify if still active
- `servers/mcow/voidnet-api.service` — Systemd unit for VoidNet API — verify if still active
- `servers/mcow/voidnet-overseer.service` — Likely stale — verify and flag for deletion
- `servers/mcow/voidnet-satellite.service` — Likely stale — verify and flag for deletion
- `servers/nether/Caddyfile` — Caddy reverse proxy config on nether
- `servers/nether/docker-compose.void.yml` — VoidNet-related compose on nether
- `servers/nether/docker-compose.monitoring.yml` — Monitoring compose on nether
- `servers/tower/lxc-100-docker-tower.conf` — LXC config (replace with fresh pull from Proxmox)
- `servers/tower/lxc-101-tower-sat.conf` — LXC config (replace with fresh pull from Proxmox)

### Phase 1 outputs (context for this phase)
- `servers/*/inventory.md` — Server inventories with hosted services, IPs, hardware specs
- `docs/dependency-map.md` — Service dependency map across all servers
- `docs/network-topology.md` — Tailscale mesh, LXC relationships, VPN paths
- `secrets/` — SOPS-encrypted secrets directory (hub level)

### Project-level
- `.planning/REQUIREMENTS.md` — SVC-01 through SVC-06 requirements for this phase
- `CLAUDE.md` — Server table with Tailscale IPs and SSH access info

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `servers/` directory structure with per-hostname layout — extend with compose files, READMEs, env templates
- 3 existing compose files on docker-tower — baseline to verify and augment
- 4 existing systemd units on mcow — audit for liveness before documenting
- 2 existing compose files on nether — verify against running state
- 2 existing LXC configs on tower — replace with fresh Proxmox pulls
- `scripts/enable-jellyfin-qsv.sh` — example sidecar config/script pattern

### Established Patterns
- Docker Compose naming: `docker-compose.{purpose}.yml` (from Phase 1)
- Systemd units: `voidnet-{component}.service` naming on mcow
- LXC configs: `lxc-{id}-{name}.conf` in `servers/tower/`
- SOPS-encrypted secrets: `*.sops.yaml` in `secrets/` at hub level

### Integration Points
- SSH access via `ssh root@<hostname>` over Tailnet for all 6 servers
- `pct config <vmid>` on tower for LXC configs (requires Proxmox CLI)
- `docker inspect` / `docker compose config` on docker-tower, nether for compose verification
- `systemctl status` / `cat` on mcow for systemd unit verification
- Secrets referenced from `secrets/*.sops.yaml` via env_file or variable substitution in compose files

</code_context>

<specifics>
## Specific Ideas

- User notes that VoidNet overseer and satellite services on mcow are from old implementations and likely stale — prioritize auditing these for deletion
- User selected all completeness options (env templates, sidecar configs, READMEs, volume docs) — indicates preference for thorough documentation
- User consistently chose recommended/standard approaches for all other areas

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-service-documentation*
*Context gathered: 2026-04-13*
