# Plan 13-06 — mcow age keypair generation log

- **Date:** 2026-04-21T11:56:52Z
- **Operator host:** macbook-air-3.twin-pogona.ts.net
- **Purpose:** Runtime decrypt of `secrets/claude-tokens.sops.yaml` on mcow.
- **Public key:** `age12hpz529aeuwq0nlqh5ccxe055ghqtzd36t7d548u36er57kx6p0qg4q5pv`
- **Private key location (generation time):** `/tmp/mcow-age.key` (operator workstation, ephemeral).
  Shredded in Task 2 after injection into `secrets/mcow.sops.yaml`.
- **Git exposure check:** private key never staged or committed. Repo scanned via
  `grep -r "AGE-SECRET-KEY" . --exclude-dir=.git` → 0 hits post-Task-2.

Public key added to:
- `.sops.yaml` (both creation_rules)
- `ansible/group_vars/all.yml` under `homelab_admin_age_recipients`
