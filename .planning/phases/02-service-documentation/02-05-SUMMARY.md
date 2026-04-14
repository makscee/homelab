---
phase: 02-service-documentation
plan: 05
subsystem: infra
tags: [proxmox, lxc, inventory, dev-workers, verify-harness]

requires:
  - phase: 02-service-documentation
    plan: 01
    provides: drift-reconciled repo + verify-phase02.sh harness seed
provides:
  - fresh Proxmox pct config snapshots for all 6 live LXCs (VMIDs 100/200/202/203/204/205)
  - minimal dev-worker inventory.md files for cc-andrey, cc-dan, cc-yuri, animaya-dev
  - VMID 201 orphan state documented in cc-andrey inventory
  - cc-worker inventory cross-links lxc-204 conf
  - servers/tower/README.md documenting host + LXC layout + refresh/orphan policies
  - scripts/verify-phase02.d/05-lxc.sh asserting SVC-03 and SVC-08 structurally and live
affects: [02-06, 03-*]

tech-stack:
  added: []
  patterns:
    - "pct config <vmid> → servers/tower/lxc-<vmid>-<hostname>.conf (authoritative snapshot; D-03)"
    - "servers/<dev-worker>/inventory.md minimal schema (Network / Resources / Purpose / Services / History; D-14)"

key-files:
  created:
    - servers/tower/lxc-200-cc-andrey.conf
    - servers/tower/lxc-202-cc-dan.conf
    - servers/tower/lxc-203-cc-yuri.conf
    - servers/tower/lxc-204-cc-worker.conf
    - servers/tower/lxc-205-animaya-dev.conf
    - servers/cc-andrey/inventory.md
    - servers/cc-dan/inventory.md
    - servers/cc-yuri/inventory.md
    - servers/animaya-dev/inventory.md
    - servers/tower/README.md
    - scripts/verify-phase02.d/05-lxc.sh
  modified:
    - servers/tower/lxc-100-docker-tower.conf
    - servers/cc-worker/inventory.md

key-decisions:
  - "Filename convention `lxc-<vmid>-<hostname>.conf` uses the Proxmox-side hostname exactly (docker-tower for VMID 100 even though the pct hostname is just `docker`), matching D-17 canonical names and existing Plan 01 references."
  - "Dev-worker inventories kept minimal (5 short sections) per D-14 rather than adopting the richer docker-tower/mcow schema — these are not homelab service hosts."
  - "Tower README LXC map includes VMID 201 as a dedicated row (with em-dashes for config/TS fields) to make the orphan discoverable from the top-level document, even though its .conf is deliberately not committed."

patterns-established:
  - "Transient evidence lives under /tmp/phase02-ev/ and is never committed (used here for lxc-201-orphan.conf, pct-list.txt)"
  - "Verify snippets guard live SSH checks behind `MODE != --quick` so CI/quick runs stay hermetic"

requirements-completed: [SVC-03, SVC-08]

duration: 20min
completed: 2026-04-14
---

# Phase 02-05: LXC Configs + Dev-Worker Inventories Summary

**Captured fresh `pct config` for all 6 live LXCs on tower and published minimal inventory.md files for the 4 dev-worker containers (cc-andrey, cc-dan, cc-yuri, animaya-dev); VMID 201 orphan documented, tower README and SVC-03/SVC-08 harness snippet landed.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-14
- **Completed:** 2026-04-14
- **Tasks:** 3/3
- **Commits:** 3 (task-granular)
- **Files created:** 11
- **Files modified:** 2

## Accomplishments

- `pct list` on tower reconfirmed the expected VMID set {100, 200, 201, 202, 203, 204, 205}
- Pulled fresh `pct config` for 100, 200, 202, 203, 204, 205 → committed as `servers/tower/lxc-<vmid>-<hostname>.conf`
- VMID 201 (orphan) saved only to `/tmp/phase02-ev/lxc-201-orphan.conf` per D-15 — never committed
- Four new `servers/<dev-worker>/inventory.md` files created with the minimal D-14 schema, populated from the fresh pct data
- `servers/cc-andrey/inventory.md` carries the `ssh andrey@95.31.38.176 -p 2201` port-forward and an "Orphaned backup LXC (VMID 201)" section
- `servers/animaya-dev/inventory.md` records Tailscale IP `100.119.15.122`
- `servers/cc-worker/inventory.md` now cross-references `../tower/lxc-204-cc-worker.conf`
- `servers/tower/README.md` (84 lines) documents the full 7-VMID map, refresh/create/orphan procedures, and the tower-sat Phase 1 drift note
- `scripts/verify-phase02.d/05-lxc.sh` prints `SVC-03 OK` + `SVC-08 OK`; full harness exit 0 with all three snippets passing (SVC-07 OK, SVC-03 OK, SVC-08 OK)

## Task Commits

1. **Task 1: Pull fresh pct configs for all 6 live LXCs** — `91aa32e` (feat)
2. **Task 2: Dev-worker inventories + cc-worker LXC ref** — `20d7d29` (feat)
3. **Task 3: tower README + verify snippet** — `f035cb6` (feat)

## Files Created/Modified

### Created
- `servers/tower/lxc-200-cc-andrey.conf`
- `servers/tower/lxc-202-cc-dan.conf`
- `servers/tower/lxc-203-cc-yuri.conf`
- `servers/tower/lxc-204-cc-worker.conf`
- `servers/tower/lxc-205-animaya-dev.conf`
- `servers/cc-andrey/inventory.md`
- `servers/cc-dan/inventory.md`
- `servers/cc-yuri/inventory.md`
- `servers/animaya-dev/inventory.md`
- `servers/tower/README.md`
- `scripts/verify-phase02.d/05-lxc.sh`

### Modified
- `servers/tower/lxc-100-docker-tower.conf` — refreshed from `pct config 100`
- `servers/cc-worker/inventory.md` — added `## LXC config` section pointing at `lxc-204-cc-worker.conf`

## Decisions Made

- Used `docker-tower` as the filename hostname token for VMID 100 even though the pct-side hostname is `docker`, because Plan 01 already named the existing file `lxc-100-docker-tower.conf` and D-17 canonicalises the homelab-facing name as `docker-tower`.
- Dev-worker inventories are intentionally thin (no Services / Storage Layout / Notes sections) per D-14 — these are not homelab hosts, they are LXCs owned by individual developers.
- tower README's LXC map includes VMID 201 explicitly (not just as a footnote) so the orphan is discoverable from the top-level servers/tower/ entry point.

## Deviations from Plan

None — plan executed as written.

## Issues Encountered

None. SSH to tower was responsive; `pct config` produced clean output for all 6 live VMIDs. The verify harness runs a live `pct status 201` check that passed (container still stopped per Plan 01 Task 4).

## User Setup Required

None.

## Next Phase Readiness

- SVC-03 and SVC-08 are complete; phase 02 wave 2 makes forward progress toward phase completion.
- `servers/tower/README.md` is now the top-level entry point for any future LXC provisioning work (Phase 3 Ansible role for LXC lifecycle).
- Verify harness has 2 of N snippets landed (01-reconcile + 05-lxc); subsequent plans in this phase can drop their own `verify-phase02.d/NN-*.sh` without touching the wrapper.
- The dev-worker inventories are intentionally minimal; if dev-workers later host shared homelab services they can be upgraded to the richer schema used by docker-tower.

## Self-Check: PASSED

Verified:
- `servers/tower/lxc-100-docker-tower.conf` exists (modified)
- `servers/tower/lxc-200-cc-andrey.conf` exists
- `servers/tower/lxc-202-cc-dan.conf` exists
- `servers/tower/lxc-203-cc-yuri.conf` exists
- `servers/tower/lxc-204-cc-worker.conf` exists
- `servers/tower/lxc-205-animaya-dev.conf` exists
- `servers/cc-andrey/inventory.md`, `servers/cc-dan/inventory.md`, `servers/cc-yuri/inventory.md`, `servers/animaya-dev/inventory.md` exist
- `servers/cc-worker/inventory.md` modified (contains `lxc-204-cc-worker`)
- `servers/tower/README.md` exists (84 lines ≥ 40)
- `scripts/verify-phase02.d/05-lxc.sh` exists and executable
- Commits `91aa32e`, `20d7d29`, `f035cb6` present in `git log`
- `bash scripts/verify-phase02.sh` exits 0 and prints `SVC-03 OK`, `SVC-07 OK`, `SVC-08 OK`

---
*Phase: 02-service-documentation*
*Completed: 2026-04-14*
