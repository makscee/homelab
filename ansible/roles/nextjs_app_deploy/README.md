# nextjs_app_deploy

Reusable Ansible role for build-and-ship deploys of Next.js (standalone-output)
applications. Build runs on the **controller**, the resulting bundle is rsync'd
to the target, an atomic symlink swap promotes the new release, and a
healthcheck guards a rescue-style rollback to the previous release.

Designed to be shared across hub workspaces (homelab admin, voidnet portal,
animaya dashboard) so each app gets the same release-id discipline, the same
toolchain pin, and the same rollback envelope.

## Layout produced on the target

```
{{ nextjs_app_target_install_dir }}/
├── current -> releases/<release-id>          (atomic-swapped symlink)
└── releases/
    ├── <release-id>/                         (rsync'd from controller stage)
    │   └── <standalone-subpath>/server.js    (entrypoint — point systemd here)
    ├── <prev-release-id>/                    (kept for rollback)
    └── ...                                    (oldest pruned by retention)
```

The `<standalone-subpath>` part exists when the app's `outputFileTracingRoot`
in `next.config.mjs` is set to a yarn workspace root above the app dir. In
that case Next.js nests `server.js` under the workspace-relative path of the
app (e.g. `homelab/apps/admin/server.js`). Pass the subpath via
`nextjs_app_standalone_subpath`.

## Required vars (caller must supply)

| Var | Example | Notes |
|---|---|---|
| `nextjs_app_yarn_root` | `/Users/.../hub/workspace` | Where `bun install` runs (controller) |
| `nextjs_app_admin_dir` | `{{ nextjs_app_yarn_root }}/homelab/apps/admin` | Where `bun run build` runs (controller) |
| `nextjs_app_target_install_dir` | `/opt/homelab-admin` | Holds `current` + `releases/` on target |
| `nextjs_app_target_user` | `homelab-admin` | Owns release dirs |
| `nextjs_app_target_group` | `homelab-admin` | Owns release dirs |
| `nextjs_app_systemd_unit` | `homelab-admin.service` | Restarted on swap, used in rollback |
| `nextjs_app_healthcheck_url` | `http://172.17.0.1:3847/api/health` | Hit after restart |

## Optional vars (with defaults)

| Var | Default | Purpose |
|---|---|---|
| `nextjs_app_release_retention` | `3` | Old releases beyond this count get pruned |
| `nextjs_app_healthcheck_retries` | `6` | uri-retries before triggering rollback |
| `nextjs_app_healthcheck_delay` | `5` | Seconds between healthcheck retries |
| `nextjs_app_build_toolchain_vars` | `"{{ playbook_dir }}/../vars/build-toolchain.yml"` | Pinned bun/node versions |
| `nextjs_app_standalone_subpath` | `""` | e.g. `homelab/apps/admin` if standalone is nested |

## Example invocation

```yaml
- name: Deploy homelab-admin
  hosts: mcow
  become: true
  tasks:
    - import_role:
        name: nextjs_app_deploy
      vars:
        nextjs_app_yarn_root: "{{ playbook_dir }}/../../../../workspace"
        nextjs_app_admin_dir: "{{ nextjs_app_yarn_root }}/homelab/apps/admin"
        nextjs_app_target_install_dir: /opt/homelab-admin
        nextjs_app_target_user: homelab-admin
        nextjs_app_target_group: homelab-admin
        nextjs_app_systemd_unit: homelab-admin.service
        nextjs_app_healthcheck_url: "http://172.17.0.1:3847/api/health"
        nextjs_app_standalone_subpath: homelab/apps/admin
```

## Phases

1. **preflight** — assert controller `bun --version` + `node --version` match
   pinned values. Fails loudly on drift; bumps must edit
   `ansible/vars/build-toolchain.yml` deliberately.
2. **build** — `bun install` (yarn root) + `bun run build` (app dir) on the
   controller. Asserts `.next/standalone/<subpath>/server.js` exists and is
   non-empty before continuing.
3. **stage** — compute `release_id` (`<short-sha>` or
   `<short-sha>-dirty-<utc-ts>`); assemble release tree under
   `<yarn-root>/../build/<release-id>/server/` from `.next/standalone/` +
   `.next/static/` + `public/`.
4. **ship** — rsync stage tree to
   `<install-dir>/releases/<release-id>/` on target, chown'd to the service
   user.
5. **swap** — atomic `current -> releases/<id>` symlink; prune old releases
   beyond retention; reload systemd; restart unit.
6. **healthcheck** — curl the configured internal URL with retries. On
   failure, find the previous release, repoint `current`, restart, and fail
   the playbook loudly.

## Caveats

- **First deploy** has no previous release to roll back to. If the
  healthcheck fails on first deploy, the role fails with a clear message and
  leaves the (broken) release in place. Fix the build and re-run.
- The role assumes the systemd unit (and `EnvironmentFile`) are pre-installed
  by a separate task. The role only restarts the unit; it does not deploy or
  template it.
- `@hub/ui-kit` and similar workspace packages consumed only via CSS
  `@import` are NOT present in `.next/standalone/node_modules/` because Next
  traces them at build-time and inlines the resulting CSS. The build-success
  gate asserts only the standalone `server.js` exists.
- The role uses `delegate_to: localhost` + `run_once: true` on all build /
  stage steps so a multi-host inventory still builds once on the controller.
