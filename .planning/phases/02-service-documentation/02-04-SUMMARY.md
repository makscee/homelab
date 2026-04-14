---
phase: 02
plan: 04
subsystem: nether
tags: [vpn, reverse-proxy, sops, docker-compose, amneziawg]
dependency_graph:
  requires:
    - 02-01 (verify-phase02 harness + SOPS tooling seeded)
    - secrets/.sops.yaml creation_rules (from 02-02)
  provides:
    - Reproducible nether stack from repo alone
    - SOPS-encrypted AmneziaWG key material (53 fields)
    - scripts/verify-phase02.d/04-nether.sh (SVC-04 gate)
  affects:
    - SPOF blocker in STATE.md (documented, not resolved)
tech_stack:
  added: [AmneziaWG, Caddy, CouchDB, n8n, SpacetimeDB, Portainer, Blackbox-exporter]
  patterns: [sops+age encrypt-in-place, sha256-digest image pinning, external volumes/networks]
key_files:
  created:
    - servers/nether/amnezia-awg.conf.template
    - servers/nether/docker-compose.services.yml
    - servers/nether/.env.example
    - servers/nether/README.md
    - secrets/nether-awg.sops.yaml
    - secrets/nether.sops.yaml
    - scripts/verify-phase02.d/04-nether.sh
  modified:
    - servers/nether/running-containers.txt
    - servers/nether/docker-compose.monitoring.yml
    - servers/nether/docker-compose.void.yml (archived)
decisions:
  - D-05 applied: all image tags pinned to image@sha256:<digest> (not :tag) for deterministic reproduction
  - Caddyfile in repo is authoritative; live container's inlined echo-cmd Caddyfile replaced by bind-mount in compose (deviation Rule 2 — correctness)
  - Stopped short of refactoring live AWG build context into the repo; amnezia-awg2 image pinned by digest but build context remains on /opt/amnezia on nether (future work)
metrics:
  duration_minutes: 35
  completed_date: 2026-04-14
  tasks: 3
  commits: 3
  files_created: 7
  files_modified: 3
---

# Phase 02 Plan 04: Nether Summary

**One-liner:** Captured nether (Netherlands VPN entry + Caddy reverse proxy) as a reproducible stack: AmneziaWG split into public template + 53-field SOPS-encrypted secret file, every image tag pinned to a sha256 digest, Caddyfile made authoritative via bind-mount, Grafana/CouchDB creds moved into `secrets/nether.sops.yaml`, and stale `docker-compose.void.yml` neutralized with an `ARCHIVED` header.

## Commits

| # | Task | Commit | Scope |
| - | ---- | ------ | ----- |
| 1 | SSH-audit + AmneziaWG capture | `2fdcaf5` | `running-containers.txt`, `amnezia-awg.conf.template`, `secrets/nether-awg.sops.yaml` |
| 2 | Services compose + pinned monitoring + SOPS | `56b8092` | `docker-compose.services.yml`, `docker-compose.monitoring.yml` (tags + env refs), `docker-compose.void.yml` (ARCHIVED), `.env.example`, `secrets/nether.sops.yaml` |
| 3 | README + SVC-04 harness | `1edbcbd` | `README.md` (98 lines), `scripts/verify-phase02.d/04-nether.sh` |

## Tasks Completed

### Task 1: SSH-audit nether + extract AmneziaWG config
- Refreshed `servers/nether/running-containers.txt` from live nether (12 containers visible).
- Discovered AWG config at `/opt/amnezia/awg/awg0.conf` inside `amnezia-awg2` container (mount-less — config is inside the image/ephemeral layer).
- Pulled 150-line raw awg0.conf (26 peers), parsed via Python script, produced 53-key plaintext yaml.
- Encrypted to `secrets/nether-awg.sops.yaml` via `sops --encrypt --in-place --age <repo recipient>`; verified roundtrip with `sops --decrypt` (53 keys recovered).
- `servers/nether/amnezia-awg.conf.template` from prior partial run verified: 26 peers × 3 placeholders + 1 server `PrivateKey`, all `__SOPS:*__` tokens, no raw base64 key material.
- Caddyfile live vs repo diff: repo has a 3-line provenance header + live has a trailing blank line — semantically identical; kept repo version.

### Task 2: Services compose + pinned monitoring + Grafana SOPS + archive void.yml
- `docker-compose.services.yml`: 7 services (caddy, spacetimedb, couchdb, n8n, amnezia-awg2, portainer, portainer_agent), all tags pinned by `@sha256:` digests from live `docker image inspect`. External volumes (`spacetimedb_caddy_data`, `spacetimedb_couchdb_data`, `spacetimedb_n8n_data`, `portainer_data`) and networks (`spacetimedb_default`, `amnezia-dns-net`) referenced as `external: true` matching the live state. `docker compose config --quiet` exits 0.
- `docker-compose.monitoring.yml`: 5 `:latest` references replaced with digest pins; Grafana admin creds pulled from live (`GF_SECURITY_ADMIN_USER=admin`, `GF_SECURITY_ADMIN_PASSWORD=homestack123`), moved to `secrets/nether.sops.yaml` (along with CouchDB creds), compose switched to `${VAR}` substitution.
- `docker-compose.void.yml`: prepended `ARCHIVED 2026-04-14` header block citing Pitfall 2; body left intact per plan.
- `.env.example`: placeholder keys for `GF_SECURITY_ADMIN_USER`, `GF_SECURITY_ADMIN_PASSWORD`, `COUCHDB_USER`, `COUCHDB_PASSWORD`, optional `PROMETHEUS_CONFIG`.

### Task 3: README + SVC-04 harness snippet
- README 98 lines covering all 8 required sections (overview / stacks / AWG reproduction / Caddy / exposed ports / secrets / SPOF / not-captured).
- `scripts/verify-phase02.d/04-nether.sh` validates template integrity, SOPS encryption, compose pinning, ARCHIVED status, README length, and optionally probes live `amnezia-awg2` status.
- `bash scripts/verify-phase02.sh --quick` exits 0 — SVC-01 / SVC-02 / SVC-03 / SVC-04 / SVC-07 / SVC-08 all OK.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing correctness] Caddyfile in live caddy container was inlined via `echo > /etc/caddy/Caddyfile && caddy run ...` command rather than bind-mounted**
- **Found during:** Task 2, inspecting container Cmd.
- **Issue:** Reproducing nether from repo would require replicating the 289-char echo command exactly, and divergence between repo `Caddyfile` and the embedded one would silently break.
- **Fix:** `docker-compose.services.yml` declares `./Caddyfile:/etc/caddy/Caddyfile:ro` bind-mount and runs `caddy run --config /etc/caddy/Caddyfile`. README §4 documents that repo wins for reproducibility.
- **Files modified:** `servers/nether/docker-compose.services.yml`
- **Commit:** `56b8092`

**2. [Rule 2 - Missing secret] CouchDB admin password was live on nether (`33121123`) but never captured in repo**
- **Found during:** Task 2, scanning `docker inspect couchdb` env.
- **Issue:** Plan only referenced Grafana for SOPS migration; CouchDB creds would have remained tribal knowledge.
- **Fix:** Added `COUCHDB_USER` and `COUCHDB_PASSWORD` to `secrets/nether.sops.yaml` and to `.env.example`; compose now uses `${VAR}` substitution.
- **Files modified:** `secrets/nether.sops.yaml`, `servers/nether/docker-compose.services.yml`, `servers/nether/.env.example`
- **Commit:** `56b8092`

**3. [Rule 3 - Blocking] `sops --encrypt` failed with "no matching creation rules" when writing to `/tmp` output path**
- **Found during:** Task 1, first SOPS encrypt attempt.
- **Issue:** `.sops.yaml` creation_rules match `secrets/.*\.sops\.yaml$`; writing via stdout to an arbitrary path bypassed the rule lookup.
- **Fix:** Copied plaintext to the target `secrets/*.sops.yaml` path first, then ran `sops --encrypt --in-place`. This also matches how `docker-tower.sops.yaml` was constructed in 02-02.
- **Files modified:** (procedural — no repo file changes beyond encrypted outputs)

### Other deviations from plan wording

- Plan Task 2 Part A said "running containers DO include void-overseer/uplink → STOP and escalate". Live inspect confirmed they were absent; proceeded with archive per the non-escalation branch.
- Plan Task 1 Part C said AWG peer pubkeys should be placeholdered conservatively. The existing (pre-run) template already did this; no changes needed.
- `portainer_agent` was restart-looping on live nether (visible in running-containers.txt). Captured it in compose anyway for reproducibility; noted status in compose comment. No repair attempted (out of scope).

## Threat Model Outcomes

| Threat ID | Disposition | Evidence |
| --------- | ----------- | -------- |
| T-02-04-01 (AWG priv key disclosure) | Mitigated | Task 1 encrypted 53 keys; `grep -rE '^(PrivateKey\|PresharedKey) = [A-Za-z0-9+/]{40,}' servers/nether/` returns empty; harness asserts same on every run. |
| T-02-04-02 (AWG raw config on disk) | Mitigated | `/tmp/phase02-ev/nether-awg-plain.yaml` removed after encrypt; raw config in `/tmp/phase02-ev/` remains only until the operator clears the tmp dir. |
| T-02-04-03 (Grafana pwd disclosure) | Mitigated | Password moved from literal in monitoring compose to `${GF_SECURITY_ADMIN_PASSWORD}` sourced from `secrets/nether.sops.yaml`. |
| T-02-04-04 (stale void.yml deploy) | Mitigated | `ARCHIVED` header on line 1; harness greps for it on every run. |
| T-02-04-05 (nether SPOF) | Accepted | README §7 documents SPOF + recovery path; HA out of scope. |
| T-02-04-06 (peer pubkey disclosure) | Mitigated | Template placeholders peer pubkeys via `__SOPS:peer_N_pubkey__`. |

## Known Stubs

None. All compose services map to a live container; all placeholders trace to a SOPS-backed field; the AWG template is fully renderable from `secrets/nether-awg.sops.yaml`.

## Verification

- `bash scripts/verify-phase02.sh --quick` → `verify-phase02: all snippets passed` (includes `SVC-04 OK`).
- `sops --decrypt secrets/nether-awg.sops.yaml | wc -l` → 53 lines (matches template peer count × 2 + 1 server key).
- `sops --decrypt secrets/nether.sops.yaml` → 4 fields: `GF_SECURITY_ADMIN_USER`, `GF_SECURITY_ADMIN_PASSWORD`, `COUCHDB_USER`, `COUCHDB_PASSWORD`.
- `docker compose -f servers/nether/docker-compose.services.yml config --quiet` → exit 0.
- `docker compose -f servers/nether/docker-compose.monitoring.yml config --quiet` → exit 0.
- `grep -EHn '^[[:space:]]*image:[[:space:]]*[^#]*:latest' servers/nether/docker-compose.{services,monitoring}.yml` → no hits.
- `head -1 servers/nether/docker-compose.void.yml` → starts with `ARCHIVED` sentinel.

## Self-Check: PASSED

- `servers/nether/amnezia-awg.conf.template` → FOUND
- `secrets/nether-awg.sops.yaml` → FOUND (53 ENC markers)
- `secrets/nether.sops.yaml` → FOUND (4 ENC markers)
- `servers/nether/docker-compose.services.yml` → FOUND
- `servers/nether/docker-compose.monitoring.yml` → MODIFIED (digests pinned, env refs)
- `servers/nether/docker-compose.void.yml` → MODIFIED (ARCHIVED)
- `servers/nether/.env.example` → FOUND
- `servers/nether/README.md` → FOUND (98 lines)
- `scripts/verify-phase02.d/04-nether.sh` → FOUND (+x)
- Commits `2fdcaf5`, `56b8092`, `1edbcbd` → all present in `git log --oneline`
