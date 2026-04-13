# Phase 1: Foundations - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the secrets pattern (SOPS + age) and complete server inventory before any configuration is committed to the repo. Every server gets a documented inventory, and cross-server views (dependency map, network topology) are created. This is the documentation-first foundation that all subsequent phases build on.

</domain>

<decisions>
## Implementation Decisions

### Repository structure
- **D-01:** Hybrid layout — `servers/{hostname}/` for per-server configs and inventory, `shared/` for cross-cutting concerns (monitoring templates, common scripts), `docs/` for cross-server documentation
- **D-02:** Cross-server docs (dependency map, network topology, architecture) live in `docs/` at repo root
- **D-03:** Consolidate the root-level `docker-tower/` directory into `servers/docker-tower/` — one canonical location per server, no duplication

### SOPS + age setup
- **D-04:** `.sops.yaml` config lives at hub repo root (`../` relative to homelab), not in homelab itself — all projects share one SOPS config
- **D-05:** Encrypted value files pattern — `secrets/` directory with SOPS-encrypted YAML files (e.g., `secrets/docker-tower.sops.yaml`). Compose files reference via env_file or variable substitution
- **D-06:** Age private key lives only on operator machines (cc-vk and local dev machine). Key is never committed. Decrypt happens at deploy time

### Inventory document format
- **D-07:** Markdown format — `inventory.md` per server in `servers/{hostname}/`. Human-readable, AI-readable, renders on GitHub
- **D-08:** Required fields: hostname, Tailscale IP, role, hardware specs, hosted services with ports, storage layout (disks, mounts, important data paths), access info (SSH user, connection method, special notes)
- **D-09:** Claude has discretion on additional per-server fields — not every server needs identical structure

### Dependency & topology format
- **D-10:** Service dependency map as Mermaid flowchart in `docs/dependency-map.md` — renders on GitHub, version-controllable, AI can read and update
- **D-11:** Network topology as Mermaid diagram in `docs/network-topology.md` — shows Tailscale mesh, Proxmox LXC relationships, VPN paths

### Claude's Discretion
- Additional inventory fields per server beyond the required set (D-09)
- Mermaid diagram style choices (flowchart direction, grouping, color coding)
- `shared/` directory internal structure (will emerge as needed in later phases)
- `.gitignore` additions beyond what already exists for secrets patterns

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing server configs
- `servers/docker-tower/docker-compose.homestack.yml` — Current media stack compose (Jellyfin, Navidrome, *arr)
- `servers/docker-tower/docker-compose.services.yml` — Additional docker-tower services
- `servers/docker-tower/docker-compose.monitoring.yml` — Monitoring compose on docker-tower
- `servers/docker-tower/running-containers.txt` — Snapshot of running containers
- `servers/mcow/.env.example` — Environment variable template for mcow services
- `servers/mcow/voidnet-*.service` — Systemd unit files for VoidNet services
- `servers/nether/Caddyfile` — Caddy reverse proxy config on nether
- `servers/nether/docker-compose.void.yml` — VoidNet-related compose on nether
- `servers/nether/docker-compose.monitoring.yml` — Monitoring compose on nether
- `servers/tower/lxc-100-docker-tower.conf` — LXC config for docker-tower container
- `servers/tower/lxc-101-tower-sat.conf` — LXC config for tower-sat container

### Project-level
- `.planning/REQUIREMENTS.md` — SEC-01, SEC-02, INV-01, INV-02, INV-03 requirements for this phase
- `.planning/research/STACK.md` — Technology stack decisions (Ansible, SOPS+age, etc.)
- `CLAUDE.md` — Server table with Tailscale IPs, roles, and architecture notes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `servers/` directory structure already groups configs by hostname — extend, don't replace
- `.gitignore` already blocks `.env`, `*.key`, `*.pem` — augment for SOPS patterns
- `scripts/enable-jellyfin-qsv.sh` — example of operational script pattern

### Established Patterns
- Docker Compose files use descriptive suffixes: `docker-compose.{purpose}.yml`
- Systemd units on mcow follow `voidnet-{component}.service` naming
- LXC configs named `lxc-{id}-{name}.conf`

### Integration Points
- Hub repo root needs `.sops.yaml` — coordinate with parent workspace
- `secrets/` directory will be referenced by compose files in `servers/*/`
- `docs/` will contain cross-references to server inventory docs

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for all areas. User consistently chose recommended options, indicating preference for conventional, well-understood patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundations*
*Context gathered: 2026-04-13*
