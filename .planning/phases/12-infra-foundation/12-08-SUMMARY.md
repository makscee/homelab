---
phase: 12-infra-foundation
plan: 08
subsystem: infra
tags: [sops, age, ansible, secrets, oauth, github-oauth, ansible-tasks]

# Dependency graph
requires:
  - phase: 12-infra-foundation
    provides: "group_vars/all.yml with homelab_admin_env_dir, homelab_admin_service_user, homelab_admin_service_group"
provides:
  - "secrets/mcow.sops.yaml extended with encrypted homelab_admin: section (4 keys)"
  - "ansible/playbooks/tasks/homelab-admin-secrets.yml — reusable decrypt+render task include"
affects:
  - "12-09 (deploy-homelab-admin.yml consumes homelab-admin-secrets.yml via include_tasks)"
  - "Phase 13+ (auth_secret rotation, OAuth credential rotation)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SOPS sops --set for non-interactive additive key injection (no editor required)"
    - "Ansible task include: delegate_to localhost decrypt → set_fact no_log → copy mode 0600 → drop facts"

key-files:
  created:
    - ansible/playbooks/tasks/homelab-admin-secrets.yml
    - ansible/playbooks/tasks/ (new directory)
  modified:
    - secrets/mcow.sops.yaml

key-decisions:
  - "Used sops --set for programmatic key injection instead of interactive sops editor — avoids plaintext in conversation"
  - "github_oauth_client_id and github_oauth_client_secret are PLACEHOLDER values — operator must replace via sops secrets/mcow.sops.yaml before Plan 09 deploy"
  - "auth_secret generated with openssl rand -base64 32 — real random value, ready for use"
  - "allowed_github_logins set to makscee per D-12-07"
  - "sops --extract '[\"homelab_admin\"]' scopes decryption to only the homelab_admin subtree"
  - "Final set_fact drops _hla_secrets and _hla_sops_out from Ansible memory after env file written"

patterns-established:
  - "Ansible task include pattern: include_tasks: tasks/homelab-admin-secrets.yml from deploy playbook"
  - "Secret lifecycle: decrypt (no_log) → set_fact (no_log) → copy (no_log) → drop facts (no_log)"
  - "Env dir ownership: root:homelab-admin mode 0750; env file homelab-admin:homelab-admin mode 0600"

requirements-completed: [INFRA-08]

# Metrics
duration: 15min
completed: 2026-04-17
---

# Phase 12 Plan 08: Secrets Wiring Summary

**SOPS-encrypted homelab_admin OAuth block added to mcow.sops.yaml + Ansible task include that decrypts on controller and renders /etc/homelab-admin/env with mode 0600**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-17T07:10:00Z
- **Completed:** 2026-04-17T07:23:31Z
- **Tasks:** 2
- **Files modified:** 2 (+ 1 directory created)

## Accomplishments

- Extended `secrets/mcow.sops.yaml` with encrypted `homelab_admin:` section containing all four required keys
- Generated a proper 32-byte `auth_secret` via `openssl rand -base64 32` (real value, ready for use)
- Authored `ansible/playbooks/tasks/homelab-admin-secrets.yml` implementing the full secure decrypt→render pipeline
- 5x `no_log: true` coverage — no secret values can appear in Ansible stdout/logs/facts
- All four existing keys (GF_SECURITY_*, TELEGRAM_BOT_TOKEN) verified intact after SOPS extension

## Task Commits

1. **Task 1: Add homelab_admin SOPS block** — `c9408ea` (feat)
2. **Task 2: Author homelab-admin-secrets.yml task include** — `7abb783` (feat)

## Files Created/Modified

- `secrets/mcow.sops.yaml` — Extended with encrypted `homelab_admin:` section (4 keys)
- `ansible/playbooks/tasks/homelab-admin-secrets.yml` — Reusable Ansible task include: decrypt on controller, render env file on target
- `ansible/playbooks/tasks/` — New directory created

## Decisions Made

- **sops --set for non-interactive injection:** Used `sops --set '["homelab_admin"]["key"] "value"'` to add keys programmatically. This avoids plaintext appearing in the conversation while SOPS handles encryption transparently on each call.
- **Placeholder OAuth credentials:** `github_oauth_client_id` and `github_oauth_client_secret` are set to `PLACEHOLDER_OAUTH_CLIENT_ID` / `PLACEHOLDER_OAUTH_CLIENT_SECRET`. Operator MUST replace these before Plan 09 deployment by running `sops secrets/mcow.sops.yaml` and entering real values from the GitHub OAuth app.
- **auth_secret is real:** The `auth_secret` value was generated with `openssl rand -base64 32` — this is a production-ready value, not a placeholder.
- **--extract scopes decryption:** Using `--extract '["homelab_admin"]'` ensures the Ansible task only ever decrypts the homelab_admin subtree, not the full file containing unrelated service credentials.

## Deviations from Plan

None — plan executed as specified. Task 1 was marked `type="checkpoint:human-action"` but the objective note granted autonomous execution if the age key was available. Age key found at `~/.config/sops/age/keys.txt`; SOPS operated successfully without operator intervention.

## Known Stubs

**github_oauth_client_id and github_oauth_client_secret are PLACEHOLDER values.**

| Stub | File | Value | Resolution |
|------|------|-------|------------|
| github_oauth_client_id | secrets/mcow.sops.yaml | `PLACEHOLDER_OAUTH_CLIENT_ID` | Operator runs `sops secrets/mcow.sops.yaml` and enters real Client ID from GitHub OAuth app |
| github_oauth_client_secret | secrets/mcow.sops.yaml | `PLACEHOLDER_OAUTH_CLIENT_SECRET` | Operator runs `sops secrets/mcow.sops.yaml` and enters real Client Secret from GitHub OAuth app |

Plan 09 deploy will FAIL until these are replaced. See `docs/setup-github-oauth.md` Step 1 for how to create the GitHub OAuth app and obtain these values.

## Issues Encountered

- Git history grep for plaintext markers flagged 2 matches — on inspection, both were base64-encoded AGE ciphertext lines from the SOPS `enc:` block (the regex `[A-Za-z0-9+/]{40,}=` is overly broad). No actual plaintext leaked into git history.

## User Setup Required

Before Plan 09 can be executed, the operator must replace the OAuth credential placeholders:

```bash
cd /path/to/homelab
sops secrets/mcow.sops.yaml
```

In the editor, replace:
- `github_oauth_client_id: "PLACEHOLDER_OAUTH_CLIENT_ID"` → real Client ID (format: `Iv1.xxxxxxxxxxxxxxxx`)
- `github_oauth_client_secret: "PLACEHOLDER_OAUTH_CLIENT_SECRET"` → real Client Secret (format: `ghoxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)

See `docs/setup-github-oauth.md` Step 1 for GitHub OAuth app creation instructions.

After editing, verify:
```bash
sops -d secrets/mcow.sops.yaml | grep -A5 "homelab_admin:"
```

## Next Phase Readiness

- Plan 09 (`deploy-homelab-admin.yml`) can call `include_tasks: tasks/homelab-admin-secrets.yml` to plumb secrets without re-deriving the decrypt pipeline
- `auth_secret`, `allowed_github_logins` are production-ready values
- OAuth credentials require operator replacement before Plan 09 first run
- INFRA-08 is satisfied structurally; the placeholder values make it functionally incomplete until operator action

---
*Phase: 12-infra-foundation*
*Completed: 2026-04-17*
