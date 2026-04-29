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

First-time mcow cutover (stops + disables host deb caddy so the compose Caddy can claim :80/:443). One-shot — append once on the cutover run:

```
ansible-playbook -i inventory/homelab.yml playbooks/void-platform-mcow.yml -e migrate_host_caddy=true
```

### Dry-run

- `--syntax-check` — parse-only validation.
- `--check --diff` — no-op run with templated-file diff output.

### Reference

- Phase-1 spec: `docs/superpowers/specs/2026-04-28-phase-1-auth-keys-mail.md` (in hub).

## Deploy: homelab-admin (mcow)

Deploys via `ansible/playbooks/deploy-homelab-admin.yml`. Build phase runs on the
ansible **control host** (which has the full hub yarn workspace). The Next.js
standalone bundle is rsynced to mcow. mcow does NOT run `bun install` — it only
runs the bundled server under bun.

The build/ship/swap pipeline is encapsulated in the reusable role
`ansible/roles/nextjs_app_deploy/`. Future Next.js apps (voidnet portal,
animaya dashboard) can adopt the same role.

### Pipeline stages

1. **Preflight (controller).** Asserts `bun --version` and `node --version`
   match `ansible/vars/build-toolchain.yml`. Drift = abort.
2. **Build (controller).** `bun install` at the yarn workspace root, then
   `bun run build` in `apps/admin/`. Output: `.next/standalone/` (Next.js
   nests at `<workspace-relative>/server.js` because `outputFileTracingRoot`
   is the yarn root).
3. **Stage (controller).** Computes `release-id` (`<git-sha>` if clean, else
   `<git-sha>-dirty-<UTC-timestamp>`), assembles a stage dir at
   `<hub-worktree>/build/<release-id>/server/`. Mirrors the nested standalone
   tree.
4. **Ship (target).** rsyncs the stage dir to
   `/opt/homelab-admin/releases/<release-id>/` on mcow.
5. **Swap (target).** Atomic `current` symlink → new release. Reloads systemd,
   restarts `homelab-admin.service`. Prunes old releases (keeps last 3).
6. **Healthcheck (target).** Curls `http://172.17.0.1:3847/api/health`. On
   failure: rolls `current` back to the previous release, restarts, fails
   the play loudly.

### Toolchain pin

Control host must match `bun --version` and `node --version` declared in
`ansible/vars/build-toolchain.yml`. Drift triggers a preflight assert. Bump =
edit + commit.

### Release id

`<git-sha>` if working tree is clean (`git status --porcelain` empty), else
`<git-sha>-dirty-<UTC-timestamp>`. Two consecutive deploys from a dirty tree
never clobber each other.

### Invocation

```bash
cd workspace/homelab
ANSIBLE_CONFIG=ansible/ansible.cfg ANSIBLE_ROLES_PATH=$PWD/ansible/roles \
  ansible-playbook -i ansible/inventory ansible/playbooks/deploy-homelab-admin.yml
```

The `ANSIBLE_CONFIG` + `ANSIBLE_ROLES_PATH` env vars are required because the
config file lives under `ansible/` rather than at the homelab repo root, and
Ansible's config auto-discovery doesn't see it from the homelab cwd.

### Rollback

Two paths:

- **Automatic.** Post-swap healthcheck failure triggers ansible to revert the
  `current` symlink to the previous release and restart the unit, then fails
  the play.
- **Manual.** SSH to mcow, repoint `/opt/homelab-admin/current`:

  ```bash
  ssh root@mcow
  ls /opt/homelab-admin/releases/   # pick a known-good <release-id>
  ln -sfn /opt/homelab-admin/releases/<id> /opt/homelab-admin/current
  systemctl restart homelab-admin
  ```

### Why builds run on the control host

`@hub/ui-kit` (HUB-13) is a yarn-workspace-resolved package. mcow has no hub
clone, so a direct `bun install` on mcow 404s when bun tries the public npm
registry. Building on the control host lets bun resolve the workspace symlink
correctly, and the standalone bundle ships everything mcow needs at runtime.

`@hub/ui-kit` is consumed via CSS `@import` only (design tokens). The token
stylesheet gets inlined at build time, so the package itself doesn't need to
be present in the standalone `node_modules`. (HMB-14)
