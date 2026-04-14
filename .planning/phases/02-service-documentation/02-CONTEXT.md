# Phase 2: Service Documentation - Context

**Gathered:** 2026-04-13
**Revised:** 2026-04-14 (infrastructure drift discovered during Wave 0 pre-flight)
**Status:** Ready for re-planning

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

### Infrastructure reality reconciliation (added 2026-04-14)
Wave 0 pre-flight on 2026-04-14 revealed Phase 1 inventory drift. New decisions:
- **D-12 (tower-sat decommissioning):** LXC 101 no longer exists on tower. Delete `servers/tower-sat/` directory entirely. Delete `servers/tower/lxc-101-tower-sat.conf`. Remove the tower-sat row from CLAUDE.md server table. Mark SVC-06 as invalidated in REQUIREMENTS.md with a note that tower-sat was decommissioned. No replacement service.
- **D-13 (cc-vk rename to cc-worker):** LXC 204 was renamed on Proxmox from `cc-vk` to `cc-worker` with new Tailscale IP `100.99.133.9` (was `100.91.54.83`). Rename `servers/cc-vk/` → `servers/cc-worker/`. Update CLAUDE.md row (new name, new IP). Update all in-repo references from `cc-vk` to `cc-worker`.
- **D-14 (new LXCs inventoried):** Four additional LXCs on tower not captured in Phase 1 inventory. Create `servers/{name}/inventory.md` for each with minimal fields (hostname, VMID, role, Tailscale IP if present). Full service documentation is out of scope here; these are developer worker containers, not core homelab services:
  - VMID 200: `cc-andrey` (reachable externally via `ssh andrey@95.31.38.176 -p 2201` — router forwards 2201 → tower:2200 → 10.10.20.200:22)
  - VMID 202: `cc-dan`
  - VMID 203: `cc-yuri`
  - VMID 205: `animaya-dev` (Tailscale IP 100.119.15.122)
- **D-15 (VMID 201 stop-but-keep):** Orphaned duplicate `cc-andrey` at VMID 201 (no external port forward, not reachable) will be stopped via `pct stop 201` on tower. Disk is retained. Document in `servers/cc-andrey/inventory.md` as "VMID 201 stopped, disk retained as backup — active container is VMID 200". Do NOT `pct destroy 201`.
- **D-16 (Phase 1 inventory fixed in-place):** Per user decision, stale Phase 1 inventory gets corrected within Phase 2 rather than reopening Phase 1 for gap closure. Targets: `CLAUDE.md` server table, `servers/*/inventory.md` for any drift, `docs/network-topology.md` if it references decommissioned nodes.
- **D-17 (canonical server list):** The homelab inventory is now 9 servers / containers after revision (was 6): tower (hypervisor), docker-tower, mcow, nether, cc-worker (renamed from cc-vk), cc-andrey, cc-dan, cc-yuri, animaya-dev. The 4 new ones are developer-worker LXCs with minimal docs.

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
- ~~`servers/tower/lxc-101-tower-sat.conf`~~ — DELETE (D-12: LXC 101 decommissioned)
- Fresh pulls needed: `pct config 100`, `pct config 204`, `pct config 200`, `pct config 202`, `pct config 203`, `pct config 205` (new LXCs from D-14)

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
