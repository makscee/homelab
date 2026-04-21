# Plan 13-07 — Ansible runtime decrypt path for /tokens

## Outcome

Ansible deploy now provisions the full runtime-SOPS-decrypt chain on mcow:
sops 3.9.4 + age 1.1.1 binaries, `/etc/homelab-admin/age.key` (rendered from
`secrets/mcow.sops.yaml` via controller), two new env vars
(`SOPS_AGE_KEY_FILE`, `SOPS_AGE_RECIPIENTS`), the encrypted token registry
synced into app cwd, and systemd `Environment=PATH=/usr/local/bin:/usr/bin:/bin`.
A clean mcow rebuild from repo + operator age key alone restores a working
/tokens page with zero hand-steps.

## Changes

- `ansible/playbooks/deploy-homelab-admin.yml`:
  - New play-vars `_sops_version=3.9.4`, `_sops_linux_amd64_sha256=5488e32b…4e85`
    (+ `_homelab_admin_age_recipients` alias, superseded by include_vars in task file)
  - Stage 1b: download sops (checksum-pinned), apt-install age, verify sops version
  - Rsync `--exclude=secrets` (preserves app-local encrypted registry across syncs)
- `ansible/playbooks/tasks/homelab-admin-secrets.yml`:
  - `include_vars: group_vars/all.yml → _hla_group_vars` (workaround for
    Ansible 2.20 strict finalization dropping list-typed group_vars inside
    `include_tasks` scope — ad-hoc/top-level resolve OK, nested include failed)
  - Render `/etc/homelab-admin/age.key` (0600, homelab-admin:homelab-admin)
  - Extend `/etc/homelab-admin/env` with `SOPS_AGE_KEY_FILE` + `SOPS_AGE_RECIPIENTS`
  - Ship encrypted `claude-tokens.sops.yaml` into `/opt/homelab-admin/app/secrets/`
    (0640, service-user readable) — `apps/admin/lib/sops.server.ts` reads
    `secrets/claude-tokens.sops.yaml` relative to WorkingDirectory
- `servers/mcow/homelab-admin.service`:
  - `Environment=PATH=/usr/local/bin:/usr/bin:/bin` (closes Backlog 999.1 —
    `sops` binary resolvable under `ProtectSystem=strict`)
- `.planning/STATE.md`: removed Backlog 999.1 pending-todo line
- `.planning/ROADMAP.md`: Backlog 999.1 struck through, marked CLOSED
- `.planning/phases/13-claude-tokens-page/13-HUMAN-UAT.md`: Test 5 → passed,
  Test 6 → pending (unblocked)

## Verification

Post-deploy on mcow (2026-04-21, commit a55f4e1):

```
sops --version                          → 3.9.4
age --version                           → v1.1.1
stat /etc/homelab-admin/age.key         → homelab-admin:homelab-admin 600
grep SOPS_AGE_ /etc/homelab-admin/env   → both vars present, 2 recipients
sudo -u homelab-admin sops -d …/claude-tokens.sops.yaml  → tokens: … (exit 0)
systemctl show homelab-admin -p Environment | grep PATH  → /usr/local/bin:/usr/bin:/bin
curl http://127.0.0.1:3847/tokens       → 307 (auth redirect, not 500)
```

Idempotency: second playbook run yielded `changed=4` — same baseline as
pre-plan-07 (env render / chown / handler flap), no new flapping items.

## Unknowns / follow-up

- Test 6 (7-day history sparkline) requires operator browser login (GitHub OAuth).
  Infra is restored; rendering verdict is pending human UAT.
- Ansible 2.20 include_vars workaround is mildly odd. When Ansible ships
  a cleaner group_vars propagation inside include_tasks, the workaround
  can be deleted.
