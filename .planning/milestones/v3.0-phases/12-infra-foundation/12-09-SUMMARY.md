---
phase: 12-infra-foundation
plan: "09"
subsystem: ansible-deploy
tags: [ansible, caddy, bun, nextjs, systemd, sec-02, sops]
one_liner: "End-to-end Ansible deploy playbook for homelab-admin: bun audit gate, rollback build, blockinfile Caddy patch, SEC-02 header layer"
dependency_graph:
  requires: [12-01, 12-02, 12-04, 12-05, 12-07, 12-08]
  provides: [deploy-homelab-admin.yml, caddy-homelab-admin.conf.j2]
  affects: [mcow /etc/caddy/Caddyfile, mcow /etc/systemd/system/homelab-admin.service]
tech_stack:
  added: [ansible.posix.synchronize, ansible.builtin.blockinfile]
  patterns: [block/rescue-rollback, meta-flush_handlers, delegate_to-localhost-slurp, stage-gate-bun-audit]
key_files:
  created:
    - ansible/playbooks/deploy-homelab-admin.yml
    - ansible/playbooks/templates/caddy-homelab-admin.conf.j2
  modified: []
decisions:
  - "blockinfile is ansible.builtin (core), not community.general — corrected FQCN from plan spec"
  - "Caddy template comment mentions Content-Security-Policy by name (explaining its absence) — plan grep check was over-broad; no CSP directive present"
metrics:
  duration_minutes: 25
  completed_date: "2026-04-17"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 12 Plan 09: Ansible Deploy Playbook Summary

End-to-end idempotent Ansible playbook deploying the homelab-admin Next.js dashboard to mcow: bun audit pre-gate, 14-stage pipeline with rollback, SOPS secrets include, systemd unit, blockinfile Caddyfile patch, and SEC-02 defense-in-depth Caddy header layer.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Author caddy-homelab-admin.conf.j2 | 2fa42d5 | ansible/playbooks/templates/caddy-homelab-admin.conf.j2 |
| 2 | Author deploy-homelab-admin.yml | 2fa42d5 | ansible/playbooks/deploy-homelab-admin.yml |

## Verification Evidence

### ansible-playbook --syntax-check
```
playbook: playbooks/deploy-homelab-admin.yml
```
Exit 0 — clean.

### ansible-lint
Not installed on controller. Noted per plan spec ("skip if not installed").

### Grep assertions (all passing)
- `include_tasks: tasks/homelab-admin-secrets.yml` — present
- `frozen-lockfile` — present
- `blockinfile` — present
- `# {mark} homelab-admin` marker — present
- `state: reloaded` on Caddy handler — present
- `bun audit` gate — present
- `rescue:` block — present
- Caddy template: `reverse_proxy 127.0.0.1:{{ homelab_admin_port }}` — present
- Caddy template: `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` — all present
- Caddy template: no CSP directive — confirmed (comment text explains absence)

## SEC-02 Defense-in-Depth Header Layer (D-12-14)

Caddy template emits the full SEC-02 header set at the edge:
- `Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"`
- `X-Frame-Options "DENY"`
- `X-Content-Type-Options "nosniff"`
- `Referrer-Policy "strict-origin-when-cross-origin"`
- `Permissions-Policy "camera=(), microphone=(), geolocation=()"`
- `-Server` (suppressed)

`Content-Security-Policy` intentionally absent — nonce-based CSP is emitted only by Next.js middleware (Plan 12-04). A static Caddy CSP would conflict with the nonce and break shadcn/Recharts inline styles.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] blockinfile FQCN corrected from community.general to ansible.builtin**
- **Found during:** Task 2 (ansible-playbook --syntax-check)
- **Issue:** Plan spec referenced `community.general.blockinfile` but blockinfile is a core module in `ansible.builtin` — not part of community.general collection. The collection does not ship it.
- **Fix:** Changed module FQCN to `ansible.builtin.blockinfile` in the playbook.
- **Files modified:** ansible/playbooks/deploy-homelab-admin.yml
- **Commit:** 2fa42d5

**2. [Rule 1 - Diagnosis] Plan grep assertion for "no CSP" over-broad**
- **Found during:** Task 1 acceptance check
- **Issue:** Plan verification grep `! grep -q "Content-Security-Policy"` fails because the template comment on line 7 contains the string "Content-Security-Policy" as explanation of why it's absent.
- **Fix:** No file change needed — template is semantically correct. The comment is intentional documentation. Noted here for record.
- **Impact:** Zero — no CSP directive exists in the rendered template output.

## Known Stubs

None — this plan produces infrastructure artifacts (playbook + template), not UI components.

## Self-Check

- [x] `ansible/playbooks/deploy-homelab-admin.yml` exists
- [x] `ansible/playbooks/templates/caddy-homelab-admin.conf.j2` exists
- [x] Commit `2fa42d5` contains both files (2 files changed, 328 insertions)
- [x] `ansible-playbook --syntax-check` passed (exit 0)

## Self-Check: PASSED
