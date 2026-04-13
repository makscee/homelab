---
phase: 01-foundations
reviewed: 2026-04-13T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - .gitignore
  - docs/dependency-map.md
  - docs/network-topology.md
  - servers/tower/inventory.md
  - servers/docker-tower/inventory.md
  - servers/tower-sat/inventory.md
  - servers/mcow/inventory.md
  - servers/nether/inventory.md
  - servers/cc-vk/inventory.md
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-13T00:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed 9 infrastructure documentation files: one `.gitignore`, two Mermaid diagram docs, and six server inventory files. No raw secrets or credentials are present in any file. The `.gitignore` has a meaningful gap that could allow secrets to leak. Several inaccuracies exist between the diagram files and the inventory files (port conflicts, missing nodes, inconsistent routing). These are documentation correctness issues — in an IaC repo where Claude Code acts as operator, stale or incorrect docs are functionally equivalent to bugs.

---

## Critical Issues

### CR-01: `.gitignore` does not block `.env` files in subdirectories

**File:** `.gitignore:2`
**Issue:** The rule `.env` only blocks a `.env` file at the repository root. Any `.env` file in a subdirectory (e.g., `servers/mcow/.env`, `ansible/.env`) would not be matched and could be committed. The mcow inventory explicitly documents `/opt/voidnet/.env` as the secrets store — if a local copy is ever placed in a subdirectory of this repo and committed, all VoidNet credentials leak.
**Fix:**
```gitignore
# Change:
.env

# To:
.env
**/.env
```

### CR-02: Port collision — PocketBase and Animaya API both documented on mcow:8090

**File:** `servers/mcow/inventory.md:20-21`, `docs/dependency-map.md:37-38`
**Issue:** The mcow inventory lists both `PocketBase / Notes` and `Animaya API` as binding port 8090. Two processes cannot bind the same port. One of these entries is wrong. The dependency map and nether Caddy routes both route `notes.makscee.ru` and `animaya.makscee.ru/api/*` to `100.101.0.9:8090`, which means one route silently fails. This is a documentation accuracy failure that would cause incorrect Ansible playbook generation if used as source of truth.
**Fix:** Determine the actual ports via `ssh root@mcow "ss -tlnp | grep -E '8090|3090'"` and correct the inventory. If Animaya API is on a different port (e.g., 8091), update both `servers/mcow/inventory.md` and the Caddy routes table in `servers/nether/inventory.md`.

---

## Warnings

### WR-01: Mermaid diagram missing cc-vk SSH access to mcow

**File:** `docs/network-topology.md:72-76`
**Issue:** The network topology diagram shows `cc-vk` having SSH access to `tower-proxmox`, `docker-tower`, `tower-sat`, and `nether` — but NOT to `mcow`. The CLAUDE.md and mcow inventory both state `ssh root@mcow` is the access method. The diagram is incomplete, which would mislead any operator reconstructing the network from this doc.
**Fix:** Add line 76a:
```
cc-vk-node -.->|SSH via Tailscale| mcow-node
```

### WR-02: dependency-map.md does not show cc-vk node at all

**File:** `docs/dependency-map.md:62-66`
**Issue:** The `cc-vk` subgraph in the dependency map contains `claude-code`, `sops-age`, and `vibe-kanban` nodes, but there are zero dependency arrows connecting `cc-vk` to any other server. Since cc-vk is the operator machine that deploys to all servers via SSH and reads SOPS secrets, its omission from the dependency graph leaves a silent gap. An operator reading this diagram would not see that cc-vk depends on the age key and has SSH access to all nodes.
**Fix:** Add operator dependency arrows, for example:
```
claude-code -.->|SSH deploy| docker-tower
claude-code -.->|SSH deploy| mcow
claude-code -.->|SSH deploy| nether
sops-age -->|decrypts| secrets
```

### WR-03: nether inventory lists two `node-exporter` rows both on port 9100

**File:** `servers/nether/inventory.md:26-27`
**Issue:** Rows `node-exporter-docker-tower` and `node-exporter-nether` both show port 9100. `node-exporter-docker-tower` is a remote scrape target running on docker-tower — it does not bind port 9100 on nether. Documenting it as a service on nether is misleading and would produce incorrect Ansible inventory.
**Fix:** Remove `node-exporter-docker-tower` from the nether services table (it belongs in docker-tower's inventory, which already has it) or add a "Remote scrape target" clarification note and blank the port column.

### WR-04: docker-tower inventory lists `node-exporter-nether` as a service on docker-tower

**File:** `servers/docker-tower/inventory.md:30`
**Issue:** `node-exporter-nether` is listed as a hosted service on docker-tower with port 9100 and image `quay.io/prometheus/node-exporter:latest`. This is a copy-paste from nether's stack — the nether node-exporter runs on nether, not docker-tower. If this entry is used to generate a Docker Compose playbook for docker-tower, it would deploy a spurious exporter container.
**Fix:** Remove this row from `servers/docker-tower/inventory.md`. The `node-exporter-docker-tower` row directly above it is the correct entry for this host.

---

## Info

### IN-01: `.gitignore` does not block `*.env` variant filenames

**File:** `.gitignore:2`
**Issue:** Tools like `direnv` create `.envrc` files; some projects use `.env.local`, `.env.production`. None of these are blocked. Low risk currently (no such files exist) but worth adding as the repo grows.
**Fix:**
```gitignore
.env*
**/.env*
```

### IN-02: tower-sat inventory is a placeholder — services entirely unknown

**File:** `servers/tower-sat/inventory.md:14-15`
**Issue:** The entire services section is `(services pending SSH query)`. The `/dev/net/tun` bind-mount noted in the notes section suggests a VPN or tunneling service is running. As an IaC source-of-truth repo, an unknown server is a gap that blocks Phase 2 automation.
**Fix:** Run `ssh root@tower-sat "docker ps --format 'table {{.Names}}\t{{.Ports}}' && systemctl list-units --type=service --state=running --no-pager"` and populate the inventory before Phase 2 playbook generation.

### IN-03: Public IP of nether is documented in two diagram files

**File:** `docs/network-topology.md:31`, `servers/nether/inventory.md:7`
**Issue:** The public IP `77.239.110.57` appears in the diagram Mermaid source and in the inventory. This is informational — it is a VPS IP, not a secret. However, if nether is ever migrated to a new VPS with a different IP, there are two places to update, creating drift risk.
**Fix:** Consider making the network topology diagram reference nether by hostname only and keeping the canonical IP solely in `servers/nether/inventory.md`.

---

_Reviewed: 2026-04-13T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
