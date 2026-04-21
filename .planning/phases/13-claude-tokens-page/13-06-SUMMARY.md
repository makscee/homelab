# Plan 13-06 — SOPS age keypair for mcow runtime decrypt

## Outcome

mcow now has its own age keypair wired through the SOPS recipient chain.
The public key joins the operator key on both `.sops.yaml` creation_rules;
the private key is stored only inside `secrets/mcow.sops.yaml` under
`homelab_admin.age_private_key` (encrypted at rest for both recipients).
Round-trip decrypt using *only* the mcow private key succeeds on the
operator workstation — confirming Plan 07 can render `/etc/homelab-admin/age.key`
and the homelab-admin service can decrypt the registry without the operator
key ever reaching mcow.

## Changes

- `.sops.yaml` — added `age12hpz5...q4q5pv` as second recipient on both creation_rules
- `ansible/group_vars/all.yml` — new `homelab_admin_age_recipients` list (operator + mcow pubkeys)
- `secrets/claude-tokens.sops.yaml` — re-keyed via `sops updatekeys` (2 recipients)
- `secrets/mcow.sops.yaml` — re-keyed + new field `homelab_admin.age_private_key`
- `.planning/phases/13-claude-tokens-page/13-06-KEYGEN-LOG.md` — pubkey + gen evidence

## Verification

- `grep -c "recipient: age1"` on both re-keyed files → `2`
- `grep -r "AGE-SECRET-KEY-1[A-Z0-9]{10}" . --exclude-dir=.git` → 0 plaintext hits
- Round-trip: `SOPS_AGE_KEY_FILE=<mcow-only-key> sops -d secrets/claude-tokens.sops.yaml` → `tokens:` printed OK
- `/tmp/mcow-age.key` shredded immediately after injection

## Follow-up

Plan 07 (wave 2) consumes this: render age.key on mcow via
`secrets/mcow.sops.yaml` decrypt in `ansible/playbooks/tasks/homelab-admin-secrets.yml`,
extend `/etc/homelab-admin/env` with `SOPS_AGE_KEY_FILE` + `SOPS_AGE_RECIPIENTS`.
