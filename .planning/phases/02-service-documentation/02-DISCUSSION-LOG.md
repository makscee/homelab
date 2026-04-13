# Phase 2: Service Documentation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 02-service-documentation
**Areas discussed:** Data collection method, Compose completeness, mcow service format, Tailscale & VPN approach

---

## Data Collection Method

| Option | Description | Selected |
|--------|-------------|----------|
| SSH and pull | Claude Code SSHes into each server via Tailscale, extracts running configs | ✓ |
| Work from repo only | Use only what's already committed, ask user to paste gaps | |
| Ansible extraction | Write Ansible playbooks to collect configs from all servers | |

**User's choice:** SSH and pull
**Notes:** Most accurate — captures what's actually running

### Follow-up: Verify existing files?

| Option | Description | Selected |
|--------|-------------|----------|
| Verify against live | SSH in, compare running containers to committed compose files, flag drift | ✓ |
| Trust existing files | Assume existing compose files are accurate, only SSH for missing servers | |

**User's choice:** Verify against live
**Notes:** Critical for the "rebuild from repo" promise

### Follow-up: LXC config source?

| Option | Description | Selected |
|--------|-------------|----------|
| Pull fresh from Proxmox | Run `pct config <vmid>` on tower for containers 100, 101, 204 | ✓ |
| Use existing + supplement | Keep existing .conf files, SSH only for cc-vk (204) | |

**User's choice:** Pull fresh from Proxmox

---

## Compose Completeness

### What should a complete service definition include?

| Option | Description | Selected |
|--------|-------------|----------|
| Env templates | .env.example per stack with placeholder values | ✓ |
| Sidecar configs | Non-secret config files (Jellyfin QSV, Caddy, etc.) | ✓ |
| Per-service README | README.md per server/stack with post-deploy steps and gotchas | ✓ |
| Volume/mount docs | Document bind mounts and named volumes with host path requirements | ✓ |

**User's choice:** All four options selected
**Notes:** Thorough documentation preferred

### Follow-up: Image tag pinning?

| Option | Description | Selected |
|--------|-------------|----------|
| Pin to exact version | e.g., `jellyfin/jellyfin:10.9.6` — query running containers for tags | ✓ |
| Latest + version comment | Use `:latest` with version comment | |

**User's choice:** Pin to exact version

### Follow-up: App-level configs?

| Option | Description | Selected |
|--------|-------------|----------|
| Docker-level only | Compose files, env vars, volume mounts, container configs only | ✓ |
| Include app configs | Also extract application-internal settings | |

**User's choice:** Docker-level only
**Notes:** App-internal settings are stateful data — belongs in Phase 3 backup/restore

---

## mcow Service Format

| Option | Description | Selected |
|--------|-------------|----------|
| Systemd as-is | Document systemd units as they run | |
| Systemd + Docker alternative | Document current + create docker-compose migration option | |
| Convert to Docker Compose | Replace systemd with docker-compose | |

**User's choice:** Other — "these are from old implementations, overseer and satellite at least for sure, check what they actually are and whether we can delete those"
**Notes:** User indicated some VoidNet systemd services (especially overseer and satellite) are stale/obsolete. Must audit via SSH before documenting.

### Follow-up: Format for live services?

| Option | Description | Selected |
|--------|-------------|----------|
| Systemd as-is | Document live systemd units with configs and dependencies | |
| You decide | Claude determines best format after SSH inspection | ✓ |

**User's choice:** You decide

---

## Tailscale & VPN Approach

### Tailscale provisioning script form?

| Option | Description | Selected |
|--------|-------------|----------|
| Shell script | Standalone bash script, no Ansible dependency | ✓ |
| Ansible playbook | Use artis3n.tailscale role | |
| Document only | Runbook with exact commands, no script | |

**User's choice:** Shell script

### AmneziaVPN documentation depth?

| Option | Description | Selected |
|--------|-------------|----------|
| Config + setup procedure | Config files AND full setup procedure for fresh VPS | |
| Config files only | Pull configs, encrypt keys via SOPS, no procedure docs | ✓ |
| Full playbook | Automated setup script for AmneziaVPN from scratch | |

**User's choice:** Config files only

---

## Claude's Discretion

- Documentation format for live VoidNet services on mcow (after SSH audit)
- README structure and detail level per server
- Handling unexpected services discovered during SSH audit
- Additional inventory fields per server

## Deferred Ideas

None — discussion stayed within phase scope.
