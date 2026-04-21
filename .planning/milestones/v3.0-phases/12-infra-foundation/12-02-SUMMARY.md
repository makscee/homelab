---
phase: 12-infra-foundation
plan: "02"
subsystem: ansible-controller-config
tags: [ansible, group_vars, requirements, bun, collections]
dependency_graph:
  requires: []
  provides: [homelab_admin_port, bun_version, community.general, ansible.posix]
  affects: [ansible/playbooks/deploy-homelab-admin.yml (Plan 09)]
tech_stack:
  added: []
  patterns: [ansible group_vars, ansible-galaxy requirements]
key_files:
  created: []
  modified:
    - ansible/group_vars/all.yml
    - ansible/requirements.yml
decisions:
  - "bun_version pinned to 1.1.38 (latest 1.1.x stable at plan authoring; do not bump to 1.2.x without P-05 re-validation)"
  - "community.general >=9.0.0 floor (not exact-pin); exact pinning deferred to Phase 19 hardening"
  - "ansible.posix >=1.5.0 added for synchronize module (Plan 09 rsync deploy)"
metrics:
  duration: "4 minutes"
  completed_date: "2026-04-16"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 12 Plan 02: Ansible Controller Config Extension Summary

Extended Ansible group_vars and requirements with Phase-12-specific variables and collection declarations needed by the homelab-admin deploy playbook (Plan 09).

## What Was Done

**Task 1 — group_vars/all.yml extended (commit 90636ac)**

Added 7 new vars under a clearly-labelled `v3.0 Phase 12` block:

- `homelab_admin_port: 3847` — port Caddy reverse-proxies to on mcow
- `homelab_admin_domain: "homelab.makscee.ru"`
- `homelab_admin_install_dir: "/opt/homelab-admin/app"`
- `homelab_admin_env_dir: "/etc/homelab-admin"`
- `homelab_admin_service_user: "homelab-admin"`
- `homelab_admin_service_group: "homelab-admin"`
- `bun_version: "1.1.38"` — pinned 1.1.x stable; P-05 guard comment included

Existing `node_exporter_*` keys untouched (regression check passed).

**Task 2 — requirements.yml extended (commit c05e780)**

Added 2 collections under a `Phase 12 additions` comment block:

- `community.general >=9.0.0` — provides `blockinfile` used in Plan 09 Caddyfile patch
- `ansible.posix >=1.5.0` — provides `synchronize` (rsync) + file ACL helpers

Added install-hint comment at top: `ansible-galaxy collection install -r requirements.yml --upgrade`

Existing `prometheus.prometheus: 0.29.1` retained.

## Bun Version Pin

**Pinned: `1.1.38`** — latest stable 1.1.x at plan authoring time (per plan spec D-12-01). External API fetch was unavailable in execution sandbox; plan-specified value used. Operator should verify with `curl -fsSL https://api.github.com/repos/oven-sh/bun/releases/latest | grep tag_name` and update if a newer `1.1.x` has shipped before Plan 09 deploy runs.

Do NOT bump to `1.2.x` without P-05 native-module regression check on mcow.

## Collections Added

| Collection | Version Constraint | Purpose |
|---|---|---|
| `community.general` | `>=9.0.0` | `blockinfile` module — Plan 09 Caddyfile patch task |
| `ansible.posix` | `>=1.5.0` | `synchronize` module — Plan 09 rsync app deploy |

## Deviations from Plan

None — plan executed exactly as written.

## Threat Flags

None — this plan only adds non-secret configuration vars and collection declarations. No runtime attack surface created.

## Self-Check: PASSED

- `ansible/group_vars/all.yml` exists and contains all required keys
- `ansible/requirements.yml` exists and contains all three collections
- Commits 90636ac and c05e780 present in git log
