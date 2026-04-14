---
phase: 02-service-documentation
plan: 03
subsystem: infra
tags: [mcow, voidnet, systemd, service-documentation, verify-harness]

requires:
  - phase: 02-service-documentation
    plan: 01
    provides: scripts/verify-phase02.sh harness + scripts/verify-phase02.d/ contribution pattern
provides:
  - servers/mcow/systemd-audit.txt — SSH-captured ground truth for mcow's VoidNet systemd state
  - servers/mcow/README.md — 8-section runbook covering live units, stale flags, binary layout, env deploy, SQLite state, restart, gotchas
  - servers/mcow/.env.example — header pinned to Phase 3 secrets/mcow.sops.yaml; schema confirmed 31/31 keys match live
  - scripts/verify-phase02.d/03-mcow.sh — SVC-02 structural + live-active assertions
affects: [02-06]

tech-stack:
  added: []
  patterns:
    - "SSH-pull-then-commit evidence file (systemd-audit.txt) committed alongside the docs it supports"
    - "scripts/verify-phase02.d/NN-*.sh contribution pattern extended with a new snippet"

key-files:
  created:
    - servers/mcow/systemd-audit.txt
    - servers/mcow/README.md
    - scripts/verify-phase02.d/03-mcow.sh
  modified:
    - servers/mcow/.env.example
  deleted: []

key-decisions:
  - "Did NOT mark voidnet-overseer/satellite repo .service files with a leading '# STALE' comment — plan specified that flag only if the live unit file is NOT FOUND. Live files exist (just disabled/inactive), so STALE flag lives in README §2 Disposition column + §3 cleanup block, not in the .service file headers. This preserves the .service files as reproducibility artifacts until Phase 3 DR-04 removes them from mcow."
  - "Resolved Open Question #3 (portal service): no separate voidnet-portal.service exists live; voidnet-api serves the portal HTTP UI on VOIDNET_API_BIND. Documented in README §2 + noted as T-02-03-04 mitigation."
  - "Left SMTP_FROM=VoidNet <noreply@voidnet.makscee.ru> as a non-REDACTED literal in .env.example (carried over from Phase 1). It is a public email address, not a secret, and the plan's Part B REDACTED rule explicitly applies only to added/missing keys — not to pre-existing non-secret defaults."

patterns-established:
  - "Host README template for non-Docker hosts: 1-Overview / 2-Live Units table / 3-Stale flags / 4-Binary layout / 5-Env / 6-Stateful data / 7-Restart / 8-Gotchas"
  - "Each SVC requirement gets its own verify-phase02.d snippet exiting 0 with 'SVC-NN OK' line"

requirements-completed: [SVC-02]

duration: 10min
completed: 2026-04-14
---

# Phase 02-03: mcow VoidNet Service Documentation Summary

**SVC-02 complete: mcow's VoidNet systemd runtime (bot + api live, overseer + satellite stale) is captured in audit evidence, documented in an 8-section README, and asserted by a verify-harness snippet — without rewriting live state.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-14
- **Completed:** 2026-04-14
- **Tasks:** 3/3
- **Files created:** 3 (audit, README, verify snippet)
- **Files modified:** 1 (.env.example header)

## Accomplishments

- Live SSH audit of mcow committed verbatim to `servers/mcow/systemd-audit.txt` (171 lines): `is-active`, `is-enabled`, `list-unit-files`, `ps`, per-unit `cat`, portal-probe, `/opt/voidnet/` listing, and `file` output on every binary.
- Live state confirmed:
  - **voidnet-bot** — active, enabled → KEEP
  - **voidnet-api** — active, enabled → KEEP (also serves the portal HTTP UI — Open Question #3 resolved)
  - **voidnet-overseer** — inactive, disabled → STALE
  - **voidnet-satellite** — inactive, disabled → STALE
- Repo `.service` files verified byte-identical to live — no rewrites needed.
- `servers/mcow/README.md` (186 lines, all 8 required sections) published with:
  - Live-unit disposition table
  - Exact `systemctl disable --now` + `rm + daemon-reload` commands for both stale units, explicitly marked Phase 3 DR-04 scope (T-02-03-03 mitigation)
  - Binary layout table (Rust ELF binaries built in VoidNet repo, not this one)
  - SOPS-based env deploy procedure referencing `secrets/mcow.sops.yaml` as a Phase 3 dependency
  - SQLite stateful-data section deferring backup/restore to DR-02/DR-03
  - Restart procedure + 6 mcow-specific gotchas (no Docker, no Proxmox, vestigial Python scaffolding in `/opt/voidnet/`, etc.)
- `servers/mcow/.env.example` header updated to the exact required wording; schema verified 31/31 keys against `grep -oE '^[A-Z_][A-Z0-9_]*=' /opt/voidnet/.env` — no drift.
- `scripts/verify-phase02.d/03-mcow.sh` integrates into `scripts/verify-phase02.sh`; full harness run prints `SVC-07 OK` + `SVC-02 OK`.

## Task Commits

1. **Task 1: SSH-audit mcow systemd + capture evidence** — `422134f` (feat)
2. **Task 2: README + .env.example header + stale flags** — `42b63ee` (feat)
3. **Task 3: SVC-02 verify snippet** — `6677e4a` (feat)

## Files Created/Modified

- **Created** `servers/mcow/systemd-audit.txt` — 171-line SSH evidence snapshot
- **Created** `servers/mcow/README.md` — 186-line runbook with all 8 sections + stale-unit cleanup block
- **Created** `scripts/verify-phase02.d/03-mcow.sh` — structural + live-active assertions, exits `SVC-02 OK`
- **Modified** `servers/mcow/.env.example` — header now points to `secrets/mcow.sops.yaml` (Phase 3), schema unchanged (31 keys, all already complete)

## Decisions Made

- Stale `.service` files (`voidnet-overseer.service`, `voidnet-satellite.service`) kept as-is in repo without a `# STALE` line-1 comment — plan scoped that flag to `NOT FOUND` live units; live files exist on mcow (just disabled). STALE designation is instead explicit in README §2 (Disposition column) and §3 (cleanup commands + Phase 3 DR-04 deferral).
- Portal service question resolved in README §2: `voidnet-api` binary serves both the config API and portal HTTP UI on `VOIDNET_API_BIND=0.0.0.0:8080`. No separate `voidnet-portal.service` exists or is needed; T-02-03-04 mitigated.
- Non-secret `SMTP_FROM` literal retained in `.env.example` — Phase 1 had set it as a default; Part B of the plan required REDACTED only for added/missing keys, and all 31 keys were already present.

## Deviations from Plan

None — plan executed as written. The three decisions above are within the literal scope of the plan:

- Task 1 §2 instruction "if live file is NOT FOUND, add `# STALE` comment" does not trigger when live files exist.
- Task 1 §3 portal-probe inspection was performed and resolved in Task 2's README rather than by creating a `voidnet-portal.service` (because none exists live).
- Task 2 Part B required adding REDACTED placeholders for *missing* keys; no keys were missing.

## Threat Flags

None — this plan touches no new network surface, authentication path, or trust boundary. It documents existing runtime and adds a local bash verifier. The committed `systemd-audit.txt` intentionally contains no env values (keys-only discipline per T-02-03-02); only unit file text, PID listings, and `/opt/voidnet/` filenames are included.

## Issues Encountered

- None. SSH to mcow worked on first attempt; live schema matched repo `.env.example` exactly (zero drift from Phase 1).

## User Setup Required

None for Phase 2. Phase 3 dependencies flagged in README:
- `secrets/mcow.sops.yaml` needs to be created (currently absent) before the documented SOPS-based env deploy procedure can execute.
- DR-04 runbook needs to execute the stale-unit cleanup commands from README §3 on mcow.

## Next Phase / Plan Readiness

- **Phase 2 wave 3 (02-06 final verify):** `SVC-02 OK` is now printed by the harness alongside `SVC-07 OK`; the Phase 2 verify aggregator will include mcow coverage without further wiring.
- **Phase 3 DR-02 / DR-03 (SQLite backup):** README §6 points at `/opt/voidnet/voidnet.db` + existing on-host helper scripts (`backup.sh`, `replicate-db.sh`) as the starting point for the runbook.
- **Phase 3 DR-04 (stale cleanup):** README §3 contains the exact SSH commands ready for runbook adoption.
- **Phase 3 secrets wave:** `.env.example` header and README §5 name `secrets/mcow.sops.yaml` as the target path.

## Self-Check: PASSED

- `servers/mcow/systemd-audit.txt` — FOUND (171 lines; all 5 required `##` sections present)
- `servers/mcow/README.md` — FOUND (186 lines, >= 50 required)
- `servers/mcow/.env.example` — FOUND (header updated, 31 keys)
- `scripts/verify-phase02.d/03-mcow.sh` — FOUND (executable, exits 0 in both quick and full modes)
- Commit `422134f` — FOUND in `git log`
- Commit `42b63ee` — FOUND in `git log`
- Commit `6677e4a` — FOUND in `git log`
- `bash scripts/verify-phase02.sh` → `SVC-07 OK` + `SVC-02 OK` + `verify-phase02: all snippets passed`

---
*Phase: 02-service-documentation*
*Completed: 2026-04-14*
