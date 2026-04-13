# Phase 2: Service Documentation - Research

**Researched:** 2026-04-13
**Domain:** Docker Compose documentation, systemd unit audit, LXC config capture, Tailscale provisioning, AmneziaVPN config capture
**Confidence:** HIGH (primary sources are the live running-containers.txt snapshots and existing repo files; SSH queries needed at execution time to verify drift)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** SSH into each server via Tailscale to extract running configs — `docker inspect`, `cat` compose files, `pct config` for LXC, etc.
- **D-02:** Verify existing compose files against what's actually running — flag and fix any drift between repo and reality
- **D-03:** Pull fresh LXC configs from Proxmox CLI (`pct config <vmid>`) for containers 100, 101, and 204 — don't trust existing .conf files in repo
- **D-04:** A complete service definition includes: docker-compose.yml, .env.example with placeholder values, sidecar configs (Caddy, QSV setup, etc.), per-server README with post-deploy steps and gotchas, and volume/mount documentation
- **D-05:** Image tags pinned to exact versions (e.g., `jellyfin/jellyfin:10.9.6`) — query running containers during SSH pull for actual tags
- **D-06:** Docker-level configs only — application-internal settings (Radarr quality profiles, Sonarr indexers, Prowlarr setup) are stateful data belonging to Phase 3 backup/restore scope
- **D-07:** SSH into mcow and audit which VoidNet systemd services are actually running vs stale leftovers — overseer and satellite are likely obsolete
- **D-08:** Document only what's actually live — flag stale units for cleanup/deletion
- **D-09:** Claude's discretion on documentation format for live mcow services after SSH inspection reveals what's actually running
- **D-10:** Standalone bash script that installs Tailscale and joins the mesh with an auth key — no Ansible dependency for this phase
- **D-11:** Config files only — pull AmneziaWG configs from nether and commit (keys encrypted via SOPS). No setup procedure or automation script

### Claude's Discretion

- Documentation format for live VoidNet services on mcow (D-09 — decide after SSH inspection)
- README structure and level of detail per server
- Handling of any unexpected services discovered during SSH audit
- Whether to create a single compose file or split into functional stacks per server

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SVC-01 | Docker Compose files with pinned image tags for all docker-tower services (Jellyfin, Navidrome, *arr, qBittorrent) | Existing compose files verified against running-containers.txt; gap: tags are all `latest` — need SSH to pin exact digests |
| SVC-02 | Docker Compose files for all mcow services (VoidNet bot, API, portal) | mcow runs systemd units, not Docker containers; existing .service files in repo; SSH audit needed to confirm what's live |
| SVC-03 | Proxmox LXC configs for containers 100, 101, 204 | LXC 100 and 101 exist in repo (may be stale); LXC 204 (cc-vk) missing — needs `pct config 204` SSH pull |
| SVC-04 | AmneziaVPN config for nether documented and reproducible | amnezia-awg2 container confirmed running on nether; config files need SSH extraction and SOPS encryption |
| SVC-05 | Tailscale provisioning script for all 6 servers | No script exists yet; pattern is well-known (curl install + auth key join) |
| SVC-06 | Tower-sat services documented with Compose files or equivalent | tower-sat inventory explicitly says "services pending SSH query" — entirely unknown until SSH |
</phase_requirements>

---

## Summary

This phase is primarily a data-collection-and-documentation phase, not a code-authoring phase. The majority of work is: SSH into each server, compare what is actually running against what the repo already has, update divergent files, create missing files, pin image tags, and encrypt secrets with SOPS.

The existing repo already contains a significant baseline: three compose files on docker-tower, two on nether, four systemd units on mcow, and two LXC configs on tower. However, all image tags are `latest` (unpinned), several services visible in running-containers.txt are absent from any compose file (slskd, navidrome, portainer, spacetimedb, couchdb, n8n, caddy, personal-page, amnezia-awg2), and the mcow overseer/satellite units are flagged as likely stale.

The single biggest unknown is tower-sat — its services are entirely undocumented and will only be revealed by live SSH query. The second biggest gap is LXC 204 (cc-vk), which has no .conf file in the repo at all.

**Primary recommendation:** Execute the phase as a server-by-server SSH audit loop: query live state, diff against repo, write/update files, pin tags, encrypt secrets. Do not author compose files from memory — always derive from `docker inspect` or `docker compose config` output from the live host.

---

## Standard Stack

### Core Tools (used during execution)

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| SSH over Tailscale | — | Access all 6 servers | Already established; all hosts on Tailnet |
| `docker inspect` | — | Extract running container config | Canonical source of truth for image tags, env vars, mounts |
| `docker compose config` | — | Resolve and validate compose files | Merges overrides and env substitutions |
| `pct config <vmid>` | — | Extract LXC config from Proxmox | Official Proxmox CLI; authoritative source for LXC params |
| `systemctl show <unit>` | — | Inspect systemd unit state | Reveals whether unit is enabled, active, or failed |
| SOPS + age | 3.9+ / 1.2+ | Encrypt secrets before commit | Already established at hub level (D-11) |

### No New Dependencies

This phase adds no new runtime dependencies. All tools are either already installed on cc-vk (SOPS, age, SSH) or built into the target servers (Docker, systemd, Proxmox CLI).

---

## Architecture Patterns

### Recommended Repository Structure After Phase 2

```
servers/
├── docker-tower/
│   ├── docker-compose.services.yml       # Media stack (Jellyfin, *arr, qBittorrent, etc.)
│   ├── docker-compose.monitoring.yml     # Prometheus, Grafana, node-exporter
│   ├── docker-compose.homestack.yml      # Workspace/opencode containers
│   ├── docker-compose.extras.yml         # NEW: slskd, navidrome, personal-page, portainer_agent
│   ├── .env.example                      # NEW: placeholder env vars
│   └── README.md                         # NEW: post-deploy steps, volume layout, gotchas
├── mcow/
│   ├── voidnet-bot.service               # EXISTS: verify live
│   ├── voidnet-api.service               # EXISTS: verify live
│   ├── voidnet-overseer.service          # EXISTS: audit — likely stale, flag for deletion
│   ├── voidnet-satellite.service         # EXISTS: audit — likely stale, flag for deletion
│   ├── .env.example                      # EXISTS: already has all vars with REDACTED
│   └── README.md                         # NEW: service layout, binary locations, restart procedures
├── nether/
│   ├── docker-compose.services.yml       # NEW: caddy, spacetimedb, couchdb, n8n, amnezia-awg2
│   ├── docker-compose.monitoring.yml     # EXISTS: verify against live
│   ├── Caddyfile                         # EXISTS: verify against live
│   ├── .env.example                      # NEW: placeholder for secrets used by nether services
│   └── README.md                         # NEW: AmneziaWG notes, Caddy TLS, VPN entry point
├── tower/
│   ├── lxc-100-docker-tower.conf         # EXISTS: replace with fresh pct config 100
│   ├── lxc-101-tower-sat.conf            # EXISTS: replace with fresh pct config 101
│   ├── lxc-204-cc-vk.conf               # NEW: pct config 204
│   └── README.md                         # NEW: Proxmox host notes, LXC creation commands
├── tower-sat/
│   ├── docker-compose.*.yml              # NEW: unknown until SSH — derive from live
│   ├── .env.example                      # NEW: if services use env vars
│   └── README.md                         # NEW: service layout
└── cc-vk/
    ├── README.md                         # NEW: operator machine setup, age key location, GSD tools
    └── (no compose — cc-vk runs no Docker services per inventory)

scripts/
└── tailscale-provision.sh               # NEW: standalone install + auth key join script
```

### Pattern 1: SSH-Pull-Then-Commit

**What:** SSH into server, run diagnostic commands, write output to local files, commit.
**When to use:** Every service on every server — never author from memory.

```bash
# Source: established homelab SSH-over-Tailscale pattern
# Step 1: Get exact running image tags
ssh root@docker-tower "docker ps --format 'table {{.Names}}\t{{.Image}}'"

# Step 2: Get full container config for a service
ssh root@docker-tower "docker inspect jellyfin"

# Step 3: Get LXC config from Proxmox host
ssh root@tower "pct config 100 && pct config 101 && pct config 204"

# Step 4: Check systemd unit status on mcow
ssh root@mcow "systemctl is-active voidnet-bot voidnet-api voidnet-overseer voidnet-satellite"
```

### Pattern 2: Image Tag Pinning

**What:** Replace `image: service:latest` with exact version tag from running container.
**When to use:** Every compose service — D-05 is a locked decision.

```bash
# Get running image with digest or tag
ssh root@docker-tower "docker inspect jellyfin --format '{{.Config.Image}}'"
# Returns: jellyfin/jellyfin:10.9.6 (or similar — verify at execution time)

# If running tag is still 'latest', get the actual digest:
ssh root@docker-tower "docker inspect jellyfin --format '{{.Image}}'"
# Returns: sha256:... — use this as the pin if no explicit tag
```

### Pattern 3: SOPS Encryption for Secrets in Compose

**What:** Any secret value extracted from live servers goes into a SOPS-encrypted file, not plaintext.
**When to use:** AmneziaWG private keys, API tokens from .env files.

```bash
# Encrypt a new secrets file (age key already at ~/.config/sops/age/keys.txt on cc-vk)
sops --encrypt --age $(cat ~/.config/sops/age/keys.txt | grep 'public key' | awk '{print $NF}') \
     secrets/nether-awg.sops.yaml > secrets/nether-awg.sops.yaml

# Reference encrypted value in compose via env_file or in ansible vars
```

### Pattern 4: Tailscale Provisioning Script Structure

**What:** Standalone bash script — install Tailscale, join mesh with auth key.
**When to use:** Any new server being added to the homelab.

```bash
#!/usr/bin/env bash
# scripts/tailscale-provision.sh
# Usage: TAILSCALE_AUTH_KEY=<key> bash tailscale-provision.sh
set -euo pipefail

TAILSCALE_AUTH_KEY="${TAILSCALE_AUTH_KEY:?Must set TAILSCALE_AUTH_KEY}"

# Install Tailscale (works on Debian/Ubuntu)
curl -fsSL https://tailscale.com/install.sh | sh

# Join mesh
tailscale up --auth-key="${TAILSCALE_AUTH_KEY}" --accept-routes

echo "Tailscale status:"
tailscale status
```

### Anti-Patterns to Avoid

- **Do not use `image: service:latest` in committed compose files.** The entire point of D-05 is reproducibility — `latest` resolves differently over time.
- **Do not commit raw secrets.** The existing .env.example pattern (all values REDACTED) is correct; secrets go to SOPS-encrypted files.
- **Do not create compose files from memory or training data.** Services discovered in running-containers.txt must be verified via SSH before their compose definitions are written.
- **Do not document docker-compose.void.yml on nether as current state.** It references an `overseer` and `uplink` that are old VoidNet architecture — this file is likely stale given nether's actual running containers show no void-overseer container.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Secrets in compose files | Inline plaintext values | SOPS-encrypted .sops.yaml + env_file reference | Secrets in git history are permanent |
| Image version discovery | Manual research | `docker inspect --format '{{.Config.Image}}'` on live host | Training data tags are stale |
| LXC config | Manual reconstruction | `pct config <vmid>` on tower | Proxmox is authoritative; manual reconstruction will miss LXC-specific settings |
| Tailscale install | Custom installer logic | Official `curl -fsSL https://tailscale.com/install.sh` | Handles OS detection, repo setup, key rotation |

---

## Runtime State Inventory

This is a documentation/capture phase, not a rename/refactor phase. However, several categories of runtime state must be captured (not migrated) as part of the phase deliverables.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | n8n workflow data in SQLite on nether (inside n8n container) | Document volume mount path only — backup scope is Phase 3 |
| Stored data | CouchDB data on nether | Document volume mount path only — Phase 3 scope |
| Stored data | VoidNet SQLite DB at `/opt/voidnet/voidnet.db` on mcow | Document in mcow README; backup is Phase 3 scope |
| Live service config | amnezia-awg2 container config on nether — WireGuard private keys | SSH-extract and SOPS-encrypt before commit |
| Live service config | Tower-sat: services entirely unknown | SSH query required; cannot document until live query |
| OS-registered state | 4 systemd units on mcow (bot, api, overseer, satellite) | SSH `systemctl is-active` to audit liveness; mark stale units for deletion |
| Secrets/env vars | mcow .env at `/opt/voidnet/.env` — 20+ vars | .env.example already exists with REDACTED values; verify completeness against live |
| Secrets/env vars | nether AWG private keys in amnezia-awg2 container | Extract via `docker exec` or volume read; encrypt with SOPS |
| Build artifacts | docker-compose.void.yml on nether references built images (`build: ./overseer`) | These images may not exist or may be stale — verify at execution time; likely replace with pull-based images |

**LXC 204 (cc-vk):** No `.conf` file exists in the repo. `pct config 204` on tower will produce it. This is a pure gap, not drift.

---

## Common Pitfalls

### Pitfall 1: Services in running-containers.txt Not Covered by Any Compose File

**What goes wrong:** Planner assumes the 3 existing compose files cover all docker-tower services and skips investigation.
**Why it happens:** running-containers.txt has 27 containers; the existing compose files cover roughly 12-14 of them. The rest (slskd, navidrome, personal-page, portainer_agent, docker-tower-api, multiple workspace/opencode containers) have no compose file in the repo.
**How to avoid:** Use running-containers.txt as the authoritative list; cross-reference each container against repo compose files; create or update files for any gap.
**Warning signs:** A compose file that doesn't include navidrome or slskd is incomplete for docker-tower.

### Pitfall 2: nether's docker-compose.void.yml Is Stale Architecture

**What goes wrong:** The planner treats docker-compose.void.yml as a live service definition that just needs tag-pinning.
**Why it happens:** The file is in the repo and looks like a service definition.
**How to avoid:** Compare against nether/running-containers.txt — no `void-overseer` or `void-uplink` container appears in the live state. The file documents old VoidNet architecture (overseer/uplink pattern). It should be flagged as stale and either deleted or moved to an `archive/` directory.
**Warning signs:** The file uses `build:` directives, not `image:` — these custom images are not in any registry.

### Pitfall 3: mcow Runs Systemd Units, Not Docker

**What goes wrong:** SVC-02 says "Docker Compose files for mcow services" but mcow runs Rust binaries via systemd, not containers.
**Why it happens:** Requirements use "Docker Compose" loosely; mcow's actual architecture is systemd + pre-compiled Rust binaries.
**How to avoid:** SVC-02 is met by the systemd .service files plus a README — not by a docker-compose.yml. The .service files already exist; the gap is (a) confirming which are live, (b) adding a README, and (c) verifying .env.example is complete.
**Warning signs:** Attempting to create a docker-compose.yml for mcow when no Docker containers run there.

### Pitfall 4: Missing nether Services Not in Any Compose File

**What goes wrong:** nether/running-containers.txt shows spacetimedb, caddy, couchdb, n8n, amnezia-awg2, portainer — none of these appear in either existing nether compose file.
**Why it happens:** The two existing compose files only cover monitoring and old void infrastructure.
**How to avoid:** Create a new `docker-compose.services.yml` on nether covering all non-monitoring live services; verify Caddyfile matches live Caddyfile.
**Warning signs:** A nether compose file that doesn't include caddy is missing the reverse proxy for all public-facing services.

### Pitfall 5: Grafana Admin Password in Compose File

**What goes wrong:** The existing docker-compose.monitoring.yml on both docker-tower and nether has `GF_SECURITY_ADMIN_PASSWORD=REDACTED` — the actual value must be replaced with a SOPS-encrypted reference before the correct compose file can be reproduced.
**Why it happens:** Passwords embedded in compose environment blocks are common but incompatible with git safety.
**How to avoid:** Move the password to a SOPS-encrypted .env file; reference it via `env_file:` in the compose definition.
**Warning signs:** Any compose file with hardcoded passwords will fail SEC-02 (gitignore/secrets pattern).

### Pitfall 6: LXC 204 Has No .conf File in Repo

**What goes wrong:** Phase plans assume only LXC 100 and 101 need refresh; LXC 204 (cc-vk) is silently skipped.
**Why it happens:** The existing repo only has 100 and 101 conf files.
**How to avoid:** SVC-03 explicitly requires 204. Run `pct config 204` on tower and add `lxc-204-cc-vk.conf` as a new file.

---

## Code Examples

### Get All Running Container Image Tags (docker-tower)

```bash
# Source: [VERIFIED: established docker inspect pattern]
ssh root@docker-tower "docker ps --format '{{.Names}} {{.Image}}'"
# Then for exact pinned tag including digest:
ssh root@docker-tower "docker inspect --format '{{.Name}} {{.Config.Image}} {{.Image}}' \$(docker ps -q)"
```

### Extract LXC Configs from Proxmox

```bash
# Source: [VERIFIED: Proxmox pct CLI — standard homelab pattern]
ssh root@tower "pct config 100"
ssh root@tower "pct config 101"
ssh root@tower "pct config 204"
```

### Audit mcow Systemd Units

```bash
# Source: [VERIFIED: systemctl standard usage]
ssh root@mcow "systemctl is-active voidnet-bot voidnet-api voidnet-overseer voidnet-satellite"
# Expected: bot=active, api=active, overseer=inactive/failed, satellite=inactive/failed
# Also check enabled state:
ssh root@mcow "systemctl is-enabled voidnet-bot voidnet-api voidnet-overseer voidnet-satellite"
```

### Extract AmneziaWG Config from nether

```bash
# Source: [ASSUMED — AWG config typically in /etc/amnezia or in container volume]
ssh root@nether "docker inspect amnezia-awg2 --format '{{json .Mounts}}'"
# Then read the config volume:
ssh root@nether "docker exec amnezia-awg2 cat /etc/amnezia/amneziawg/*.conf 2>/dev/null || \
                 find /opt /etc -name '*.conf' -path '*amnezia*' 2>/dev/null | head -5"
```

### Verify Complete Service List on tower-sat

```bash
# Source: [VERIFIED: standard Docker + systemd audit commands]
ssh root@tower-sat "docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}' && echo '---' && \
                    systemctl list-units --type=service --state=running --no-pager"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `version: '3.8'` in compose files | Top-level `version` key is deprecated in Compose Spec | Docker Compose v2+ | Harmless warning but new files should omit `version:` key entirely |
| `docker-compose` CLI (v1) | `docker compose` (v2, built-in plugin) | 2023 | V1 EOL; existing files work with V2 but new files should use V2 syntax |

**Deprecated/outdated:**
- `docker-compose.void.yml` on nether: references overseer/uplink architecture no longer deployed.
- `voidnet-overseer.service` and `voidnet-satellite.service` on mcow: references `/usr/local/bin/voidnet-overseer` binary from old architecture — almost certainly stale.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | AmneziaWG config files are accessible inside the `amnezia-awg2` container at `/etc/amnezia/` or similar | Code Examples | Config may be in host bind-mount or named volume; SSH inspection will reveal actual path |
| A2 | mcow's VoidNet bot and API services are still active (systemctl is-active = active) | Common Pitfalls | If they've been migrated to Docker, .service files are stale and a compose file is needed instead |
| A3 | tower-sat has Docker installed and running containers (based on LXC tag `docker` in lxc-101 config) | Architecture Patterns | If tower-sat runs no containers, the deliverable is a README + systemd units instead |
| A4 | cc-vk (LXC 204) runs no Docker services itself — only the operator toolchain (Claude Code, SOPS, age) | Architecture Patterns | If cc-vk has running containers, they need a compose file too |
| A5 | nether's Caddyfile in repo matches live `/etc/caddy/Caddyfile` | Common Pitfalls | If Caddyfile has drifted, the committed version is incomplete — SSH verify required |

---

## Open Questions

1. **What is running on tower-sat?**
   - What we know: LXC 101, 2 vCPU, 2 GB RAM, Docker tag, `/dev/net/tun` bind mount
   - What's unclear: Any running containers or systemd services
   - Recommendation: First task of the phase — SSH and audit before any planning for SVC-06

2. **How is AmneziaWG config structured inside amnezia-awg2?**
   - What we know: Container runs on nether, port 46476/udp, image `amnezia-awg2` (custom build)
   - What's unclear: Whether config is in container filesystem, volume, or host bind mount; whether it includes per-peer configs that need SOPS
   - Recommendation: SSH inspect before writing the capture task

3. **Does mcow have a VoidNet portal service?**
   - What we know: SVC-02 mentions "VoidNet bot, API, portal" — only bot and api .service files exist
   - What's unclear: Whether portal is a separate process or the API serves the portal
   - Recommendation: Check mcow process list during SSH audit (`ps aux | grep voidnet`)

4. **What happened to the nether void infrastructure (overseer/uplink)?**
   - What we know: `docker-compose.void.yml` exists in repo; no void containers in running-containers.txt
   - What's unclear: Was this intentionally decommissioned or just not started?
   - Recommendation: Flag file as stale/archive during the nether audit; do not attempt to revive it

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| SSH to docker-tower (100.101.0.8) | SVC-01 audit | Assumed ✓ | — | None — blocks execution |
| SSH to mcow (100.101.0.9) | SVC-02 audit | Assumed ✓ | — | None — blocks execution |
| SSH to tower (100.101.0.7) | SVC-03 LXC configs | Assumed ✓ | — | None — blocks SVC-03 |
| SSH to nether (100.101.0.3) | SVC-04 AWG config | Assumed ✓ | — | None — blocks SVC-04 |
| SSH to tower-sat (100.101.0.10) | SVC-06 audit | Assumed ✓ | — | None — blocks SVC-06 |
| SOPS + age on cc-vk | Secret encryption (SVC-04) | Confirmed ✓ | SOPS 3.9+, age 1.2+ | None needed — already installed |
| `pct` CLI on tower | SVC-03 LXC config pull | Assumed ✓ | Proxmox 8.x | Manual conf file inspection if CLI unavailable |

**Note:** All SSH connectivity is via Tailscale mesh. If any server is unreachable, that server's tasks block until connectivity is restored. No tasks should be authored assuming offline access.

---

## Validation Architecture

Nyquist validation is enabled. However, this phase is documentation-only — there is no application code to unit test. Validation is structural (files exist, secrets are encrypted, tags are pinned) and will be verified by the gsd-verifier against a checklist.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Manual checklist + bash assertions (no unit test framework needed) |
| Config file | None |
| Quick run command | `bash scripts/verify-phase02.sh` (to be created in Wave 0) |
| Full suite command | Same — this phase has no unit tests |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SVC-01 | docker-tower compose files exist with pinned tags | structural | `grep -rE 'image: .+:[0-9]+' servers/docker-tower/*.yml` | ❌ Wave 0 |
| SVC-02 | mcow systemd units exist and stale ones flagged | structural | `ls servers/mcow/*.service && cat servers/mcow/README.md` | partial ✅ |
| SVC-03 | LXC conf files exist for 100, 101, 204 | structural | `ls servers/tower/lxc-{100,101,204}-*.conf` | partial ✅ |
| SVC-04 | AmneziaWG config captured and encrypted | structural | `ls secrets/nether-awg*.sops.yaml` | ❌ Wave 0 |
| SVC-05 | Tailscale provisioning script exists | structural | `bash -n scripts/tailscale-provision.sh` | ❌ Wave 0 |
| SVC-06 | Tower-sat services documented | structural | `ls servers/tower-sat/docker-compose*.yml \|\| ls servers/tower-sat/*.service` | ❌ Wave 0 |

### Wave 0 Gaps

- [ ] `scripts/verify-phase02.sh` — structural validation script covering all 6 SVC requirements
- [ ] `servers/nether/docker-compose.services.yml` — new file for live nether services
- [ ] `servers/tower/lxc-204-cc-vk.conf` — new LXC conf
- [ ] `scripts/tailscale-provision.sh` — new provisioning script
- [ ] `servers/*/README.md` — new README files per server

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No new auth implemented |
| V3 Session Management | No | No sessions |
| V4 Access Control | No | No access control changes |
| V5 Input Validation | No | No user input |
| V6 Cryptography | Yes | SOPS + age for secrets at rest — never hand-roll |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secrets in git history | Information Disclosure | SOPS encryption; .gitignore for .env files |
| Stale image tags pulling unknown versions | Tampering | Pin to exact tags — D-05 locked decision |
| AWG private keys in compose env vars | Information Disclosure | SOPS-encrypted secrets file; env_file reference |
| Grafana admin password in compose file | Information Disclosure | Move to SOPS env file; existing compose has REDACTED placeholder |

**SEC-02 enforcement:** Before any commit, verify no plaintext secrets are staged. The `.gitignore` patterns from Phase 1 cover `.env` files; encrypted `.sops.yaml` files are safe to commit.

---

## Sources

### Primary (HIGH confidence)
- `servers/docker-tower/running-containers.txt` — authoritative list of 27 running containers on docker-tower as of 2026-04-10
- `servers/nether/running-containers.txt` — authoritative list of 11 running containers on nether as of 2026-04-10
- `servers/docker-tower/docker-compose.services.yml` — existing compose baseline (verified against running list)
- `servers/mcow/.env.example` — existing env template with 20+ vars
- `servers/tower/lxc-100-docker-tower.conf` and `lxc-101-tower-sat.conf` — existing LXC configs
- `.planning/phases/02-service-documentation/02-CONTEXT.md` — locked user decisions

### Secondary (MEDIUM confidence)
- Tailscale install script pattern: `curl -fsSL https://tailscale.com/install.sh` — standard documented method
- `docker inspect --format '{{.Config.Image}}'` — standard Docker CLI usage for tag extraction
- `pct config <vmid>` — standard Proxmox VE CLI for LXC config export

### Tertiary (LOW confidence — flag A1-A5 in Assumptions Log)
- AmneziaWG config file location inside container — [ASSUMED], verify at execution time
- tower-sat running services — [ASSUMED to have Docker], verify at execution time

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; existing toolchain is sufficient
- Architecture: HIGH — repo structure is established from Phase 1; patterns are extensions of existing conventions
- Pitfalls: HIGH — derived from direct comparison of running-containers.txt vs existing compose files
- SSH connectivity: ASSUMED — Tailscale mesh is documented as operational but not verified in this session

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 (stable infrastructure; main risk is service drift on live servers between now and execution)
