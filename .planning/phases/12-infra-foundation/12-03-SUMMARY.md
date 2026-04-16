---
phase: 12-infra-foundation
plan: "03"
subsystem: ops-docs
tags: [probe, systemd-hardening, state-cleanup]
dependency_graph:
  requires: []
  provides: [mcow-virtualization-type, plan-07-hardening-block]
  affects: [12-07-PLAN.md, .planning/STATE.md]
tech_stack:
  added: []
  patterns: []
key_files:
  created:
    - servers/mcow/lxc-probe.md
  modified:
    - .planning/STATE.md
decisions:
  - "mcow is KVM (not LXC) — strict systemd hardening block is safe, P-15 degraded path does not apply"
  - "Plan 07 should use ProtectSystem=strict + PrivateTmp=yes + ProtectKernelTunables=yes unconditionally"
metrics:
  duration_minutes: 10
  completed_date: "2026-04-17"
  tasks_completed: 2
  files_changed: 2
---

# Phase 12 Plan 03: mcow Virtualization Probe Summary

**One-liner:** mcow confirmed KVM (not LXC) — full strict systemd hardening safe for Plan 07, three obsolete STATE.md todos cleared.

## What Was Done

- **Task 1 (checkpoint:human-action):** Skipped per orchestrator pre-probe. Finding baked directly into artifact.
- **Task 2:** Authored `servers/mcow/lxc-probe.md` with raw probe commands/output, parsed facts table, and a single active hardening recommendation block for Plan 07.
- **Task 3:** Cleaned `.planning/STATE.md` — moved three pre-phase-12 todos into a "Resolved" subsection with closure reasons.

## Key Finding

mcow is a **KVM virtual machine** (not a Proxmox LXC container). `systemd-detect-virt` returns `kvm`, kernel is `6.8.0-107-generic` (full Ubuntu 24.04 kernel). This makes the P-15 pitfall (PrivateTmp/ProtectSystem=strict breaking in unprivileged LXC) entirely inapplicable.

**Plan 07 hardening block (copy-paste ready):**
```ini
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ProtectKernelTunables=yes
ProtectControlGroups=yes
ReadWritePaths=/opt/homelab-admin/app/.next /tmp
```

## Deviations from Plan

### Auto-handled Deviation

**[Task 1 — Objective deviation] mcow is KVM, not LXC**
- **Found during:** Orchestrator pre-probe before agent spawn
- **Issue:** Plan 12-03 assumed mcow was a Proxmox LXC (`pct config` probe path). It is actually a KVM VM — `pct list` returns no match, `systemd-detect-virt` returns `kvm`.
- **Fix:** Artifact title changed to "mcow Virtualization Probe" (filename stays `lxc-probe.md` for plan compatibility). Content documents KVM finding and explicitly states the full hardening block is the active recommendation. No degraded variant needed.
- **Files modified:** `servers/mcow/lxc-probe.md`
- **Commit:** c682c07

**Side note — Phase 18 blocker language in STATE.md:** The Blockers/Concerns section still reads "node-pty LXC feasibility spike is mandatory first task — fallback to ssh2 pure-JS pipe if PTY allocation fails in mcow LXC." This language is now stale (mcow is KVM, not LXC) but is out of scope for Plan 12-03 to edit — logged to deferred items.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 2 | c682c07 | docs(12-03): write mcow virtualization probe artifact |
| 3 | 3f4d8df | docs(12-03): close obsolete STATE.md pre-phase-12 todos |

## Known Stubs

None — this plan produces only documentation artifacts, no UI or data-flow stubs.

## Threat Flags

None — probe is read-only; no new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- `servers/mcow/lxc-probe.md` exists and contains `privilege_level` and `User=homelab-admin` ✓
- `STATE.md` contains "Resolved Pre-Phase-12 Todos" section ✓
- `STATE.md` still contains `2026-04-22` docker-tower todo ✓
- Commits c682c07 and 3f4d8df exist in git log ✓
