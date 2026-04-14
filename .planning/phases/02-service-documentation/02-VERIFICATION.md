---
phase: 02-service-documentation
verified: 2026-04-14T18:00:00Z
status: human_needed
score: 8/8 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Start services from committed docker-tower compose files on a fresh LXC"
    expected: "docker compose up -d brings all containers healthy; media stack reachable"
    why_human: "Requires live Docker engine + data volumes; Level-4 reproducibility cannot be validated by grep alone"
  - test: "Connect an AmneziaVPN client using the committed template + decrypted SOPS keys"
    expected: "Client authenticates, traffic routes through nether"
    why_human: "Requires VPN client device; template+SOPS split cannot be validated without end-to-end connection"
  - test: "Run scripts/tailscale-provision.sh on a fresh VM with a valid auth key"
    expected: "tailscale status shows the host joined the Tailnet"
    why_human: "Requires a fresh host + valid auth key not present in repo"
  - test: "Verify VMID 201 remains stopped with disk retained on tower"
    expected: "ssh root@tower 'pct status 201' prints 'status: stopped'; pct config 201 still returns a config"
    why_human: "Live Proxmox state; can only be validated on tower hypervisor"
  - test: "Apply stale-unit cleanup on mcow per README.md (disable overseer/satellite)"
    expected: "systemctl is-enabled voidnet-overseer voidnet-satellite returns disabled/masked"
    why_human: "README documents the command but execution against live mcow is out-of-scope for this phase"
---

# Phase 02: Service Documentation — Verification Report

**Phase Goal:** Every containerized and LXC service has a reproducible config file committed to the repo. Also reconcile Phase 1 inventory drift (tower-sat decommissioned, cc-vk→cc-worker, four new dev-worker LXCs).
**Verified:** 2026-04-14
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria + merged PLAN must_haves)

| # | Truth (Success Criterion) | Status | Evidence |
|---|---------------------------|--------|----------|
| 1 | Docker Compose files with pinned image tags exist for all docker-tower services | ✓ VERIFIED | `grep :latest servers/docker-tower/*.yml` → 0 matches; 4 compose files present (homestack, services, monitoring, extras) |
| 2 | Docker Compose files or audited systemd units for mcow (overseer/satellite flagged stale per D-07/D-08) | ✓ VERIFIED | 4 .service files + systemd-audit.txt + README.md (186 lines) flagging overseer+satellite for cleanup |
| 3 | Fresh `pct config` LXC configs exist for 100, 204, 200, 202, 203, 205 | ✓ VERIFIED | All 6 lxc-*.conf files present under servers/tower/; no lxc-101 |
| 4 | AmneziaVPN config documented; reproducible via template + SOPS-encrypted keys | ✓ VERIFIED | `amnezia-awg.conf.template` uses 54 `__SOPS:__` placeholders, zero raw keys; `sops -d secrets/nether-awg.sops.yaml` roundtrips OK |
| 5 | Tailscale provisioning script exists for any server | ✓ VERIFIED | `scripts/tailscale-provision.sh` executable, `bash -n` OK, reads TAILSCALE_AUTH_KEY via `${VAR:?}` guard, no embedded secrets |
| 6 | ~~Tower-sat services documented~~ INVALIDATED | ✓ VERIFIED | `servers/tower-sat/` absent; `servers/tower/lxc-101-tower-sat.conf` absent; CLAUDE.md has no tower-sat row |
| 7 | Phase 1 drift reconciled (CLAUDE.md accurate, cc-vk→cc-worker, tower-sat deleted) | ✓ VERIFIED | CLAUDE.md row: `cc-worker \| Moscow (LXC 204) \| 100.99.133.9`; `servers/cc-vk/` absent; `servers/cc-worker/inventory.md` exists with 100.99.133.9 |
| 8 | Dev-worker LXCs inventoried + VMID 201 stopped | ✓ VERIFIED | Four `servers/{cc-andrey,cc-dan,cc-yuri,animaya-dev}/inventory.md` exist; cc-andrey/inventory.md §"Orphaned backup LXC (VMID 201)" documents `pct stop 201` |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `CLAUDE.md` | Accurate server table | ✓ VERIFIED | cc-worker row with 100.99.133.9; no tower-sat row |
| `servers/cc-worker/inventory.md` | Renamed inventory with new IP | ✓ VERIFIED | 40 lines; contains 100.99.133.9 |
| `scripts/verify-phase02.sh` + `verify-phase02.d/*.sh` | Harness with 7 snippets | ✓ VERIFIED | Sources 01..06 + 99-final.sh; `--quick` run passes all SVC gates |
| `servers/docker-tower/docker-compose.{homestack,services,monitoring,extras}.yml` | Pinned tags, no `:latest` | ✓ VERIFIED | All 4 files present; 0 :latest matches |
| `servers/docker-tower/.env.example` | Env placeholder template | ✓ VERIFIED | Present |
| `servers/docker-tower/README.md` | Post-deploy + gotchas (≥40 lines) | ✓ VERIFIED | 117 lines |
| `secrets/docker-tower.sops.yaml` | SOPS-encrypted secrets | ✓ VERIFIED | `sops -d` roundtrip OK |
| `servers/mcow/systemd-audit.txt` | Audit snapshot | ✓ VERIFIED | Present |
| `servers/mcow/README.md` (≥50 lines) | Live layout + cleanup commands | ✓ VERIFIED | 186 lines |
| `servers/mcow/.env.example` | Complete placeholder env | ✓ VERIFIED | Present |
| `servers/nether/amnezia-awg.conf.template` | Template with `__SOPS:*__` placeholders | ✓ VERIFIED | 54 placeholders; 0 raw keys |
| `secrets/nether-awg.sops.yaml` | Encrypted AWG keys | ✓ VERIFIED | `sops -d` roundtrip OK |
| `servers/nether/docker-compose.services.yml` | Pinned tags for live nether services | ✓ VERIFIED | All images use `@sha256:...` digests |
| `servers/nether/README.md` (≥50 lines) | VPN + reverse-proxy notes | ✓ VERIFIED | 98 lines |
| `secrets/nether.sops.yaml` | Encrypted nether secrets | ✓ VERIFIED | `sops -d` roundtrip OK |
| `servers/tower/lxc-{100,200,202,203,204,205}-*.conf` | 6 fresh pct config pulls | ✓ VERIFIED | All 6 present; no lxc-101 |
| `servers/tower/README.md` (≥40 lines) | Proxmox notes | ✓ VERIFIED | 84 lines |
| `servers/cc-andrey/inventory.md` | Dev-worker inventory incl. VMID 201 note | ✓ VERIFIED | 41 lines; §"Orphaned backup LXC (VMID 201)" + tower:2201 port-forward |
| `servers/{cc-dan,cc-yuri,animaya-dev}/inventory.md` | Minimal dev-worker inventories | ✓ VERIFIED | 35 lines each |
| `scripts/tailscale-provision.sh` (≥25 lines) | Install + join script | ✓ VERIFIED | Executable; `bash -n` OK; uses `${TAILSCALE_AUTH_KEY:?...}` guard |
| `scripts/README.md` (≥15 lines) | Scripts index | ✓ VERIFIED | Present |
| `scripts/verify-phase02.d/99-final.sh` | Phase-wide secret scan (`tskey` sweep) | ✓ VERIFIED | Present; "PHASE 02 FINAL SWEEP OK" output |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `CLAUDE.md` | `servers/cc-worker/inventory.md` | Shared Tailscale IP 100.99.133.9 | ✓ WIRED | Pattern `100\.99\.133\.9` matched in both |
| `scripts/verify-phase02.sh` | `scripts/verify-phase02.d/` | source loop | ✓ WIRED | Runtime output confirms all 7 snippets sourced |
| `servers/docker-tower/docker-compose.monitoring.yml` | `secrets/docker-tower.sops.yaml` | env_file after SOPS decrypt | ✓ WIRED | env_file pattern present; decrypt OK |
| `servers/nether/amnezia-awg.conf.template` | `secrets/nether-awg.sops.yaml` | `__SOPS:*__` placeholders | ✓ WIRED | 54 placeholders; 0 raw keys; SOPS decrypts |
| `servers/nether/docker-compose.services.yml` | `servers/nether/Caddyfile` | caddy volume mount | ✓ WIRED | Caddyfile referenced in compose |
| `servers/cc-worker/inventory.md` | `servers/tower/lxc-204-cc-worker.conf` | documented LXC path | ✓ WIRED | Both files present; names align |
| `servers/cc-andrey/inventory.md` | tower:2201 port-forward | External SSH path | ✓ WIRED | Documented at line 14: `ssh andrey@95.31.38.176 -p 2201` |
| `scripts/tailscale-provision.sh` | `TAILSCALE_AUTH_KEY` env | `${VAR:?}` guard | ✓ WIRED | Line 17: `"${TAILSCALE_AUTH_KEY:?Must set ...}"` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SVC-01 | 02-02 | docker-tower compose with pinned tags | ✓ SATISFIED | 0 :latest in docker-tower/*.yml; SOPS secret in place |
| SVC-02 | 02-03 | mcow services audited & documented | ✓ SATISFIED | systemd-audit.txt + README flagging overseer/satellite |
| SVC-03 | 02-05 | LXC configs 100, 204, 200, 202, 203, 205 | ✓ SATISFIED | All 6 lxc-*.conf committed; no 101 |
| SVC-04 | 02-04 | AmneziaWG config + SOPS keys | ✓ SATISFIED | Template + SOPS roundtrip OK |
| SVC-05 | 02-06 | Tailscale provisioning script | ✓ SATISFIED | tailscale-provision.sh executable, no embedded secret |
| ~~SVC-06~~ | — | Tower-sat services | ✓ INVALIDATED | tower-sat absent; CLAUDE.md clean |
| SVC-07 | 02-01 | Phase 1 inventory drift reconciled | ✓ SATISFIED | CLAUDE.md accurate; rename + delete verified |
| SVC-08 | 02-05 | Dev-worker LXC inventories + VMID 201 stopped | ✓ SATISFIED | 4 inventories + VMID 201 note |

No orphaned requirements; all phase-2 IDs from REQUIREMENTS.md are claimed by at least one plan.

### Anti-Patterns Scan

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `CLAUDE.md` | Historical references to "cc-vk" (3 lines) | ℹ️ Info | Explicit rename annotations ("renamed from cc-vk 2026-04-14") — intentional history, not drift |
| `servers/nether/docker-compose.*.yml` | "# …:latest" annotation comments next to pinned digests | ℹ️ Info | Comments only — `grep -E 'image:\s+\S+:latest\s*$'` returns 0 actual unpinned tags |
| `scripts/tailscale-provision.sh` | Literal `tskey-auth-xxxx` in usage comment | ℹ️ Info | Placeholder example, not a real key; final sweep 99-final.sh still passes |
| `servers/nether/docker-compose.void.yml` | Legacy stale file present | ⚠️ Warning | Phase 02-04 plan required deletion OR "clearly labeled archive" — file still present; not a blocker if marked archival in-file, but worth a look |

No 🛑 blockers found.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Verify harness passes | `bash scripts/verify-phase02.sh --quick` | All 7 snippets pass; "PHASE 02 FINAL SWEEP OK" | ✓ PASS |
| SOPS roundtrip on all encrypted files | `sops -d secrets/{docker-tower,nether,nether-awg}.sops.yaml` | All decrypt cleanly | ✓ PASS |
| Provision script syntax | `bash -n scripts/tailscale-provision.sh` | no errors | ✓ PASS |
| No `:latest` tags active | `grep -E 'image:\s+\S+:latest\s*$' servers/**/*.yml` | 0 matches | ✓ PASS |
| No raw private keys in AWG template | `grep -cE '(PrivateKey|PresharedKey)\s*=\s*[A-Za-z0-9+/=]{20,}' …` | 0 | ✓ PASS |

### Human Verification Required

See frontmatter `human_verification`. Five items flagged — all inherent to a documentation phase that captures live infrastructure (live VPN, live Docker engine, live Proxmox, fresh host provisioning, live systemctl mutation).

### Gaps Summary

No goal-blocking gaps. All 8 ROADMAP Success Criteria verified structurally and via the quick harness. Deviations found (historical cc-vk mentions in CLAUDE.md, :latest in annotation comments, legacy `docker-compose.void.yml` retained) are either intentional per PLAN decisions (D-12..D-17) or low-severity info-only items.

Status is `human_needed` (not `passed`) solely because reproducibility of live-service artifacts (Docker up, VPN connect, Tailscale join, VMID 201 state, mcow disable commands) cannot be asserted without touching running infrastructure. The repo-level contract is satisfied.

---

_Verified: 2026-04-14_
_Verifier: Claude (gsd-verifier)_
