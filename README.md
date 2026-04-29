# Homelab

Infrastructure-as-code for the Tailscale mesh (tower + mcow + nether + LXCs). Ansible playbooks under `ansible/`, per-host docs in `hub/knowledge/infrastructure/`. See `CLAUDE.md` for repo conventions and cross-references.

## Void platform deploy (mcow)

Deploys the Caddy + void-mail stack to mcow under `/srv/void` with SOPS-decrypted secrets. Phase-1 of the void-* platform (auth + keys vhosts ship as 404 placeholders until their services land).

### Prereqs

- Tailscale up on the operator workstation; `ssh root@mcow` works.
- `age` private key available at the operator's standard sops keyring location (default: `~/Library/Application Support/sops/age/keys.txt` on macOS, `~/.config/sops/age/keys.txt` on Linux). Recipient list lives in repo-root `.sops.yaml`.
- GHCR pull credentials exported in the shell:
  ```
  export GHCR_USER=<github-username>
  export GHCR_TOKEN=<ghcr-pat-with-read:packages>
  ```
- Ansible collections installed:
  ```
  ansible-galaxy collection install -r ansible/requirements.yml
  ```
- First-time only: fill real values into `secrets/void-mail.sops.yaml` (ships with `REPLACE_BEFORE_DEPLOY` placeholders), then encrypt in place:
  ```
  sops --encrypt --in-place secrets/void-mail.sops.yaml
  ```

### Invocation

```
cd ansible
ansible-playbook -i inventory/homelab.yml playbooks/void-platform-mcow.yml
```

Override the image tag for a pinned deploy:

```
ansible-playbook -i inventory/homelab.yml playbooks/void-platform-mcow.yml -e ghcr_image_tag=sha-abc123
```

### Dry-run

- `--syntax-check` — parse-only validation.
- `--check --diff` — no-op run with templated-file diff output.

### Reference

- Phase-1 spec: `docs/superpowers/specs/2026-04-28-phase-1-auth-keys-mail.md` (in hub).
