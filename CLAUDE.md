# Homelab Infrastructure

Infrastructure-as-code for the Tailscale mesh (tower + mcow + nether + LXCs). Single source of truth: if a server dies, this repo rebuilds it.

> **GSD is frozen** in this repo (`.planning/` kept for history only). Active work tracked in `hub/tasks/` with `HMB-*` prefix (or multi-project `HMB_VDN-*`, `ANI_HMB-*`). Do **not** invoke `/gsd-*` commands.

## Cross-references (hub knowledge)

- **Project index:** `hub/knowledge/projects/homelab/README.md`
- **Machine roster + network topology:** `hub/knowledge/infrastructure/overview.md`
- **Per-LXC deep detail:** `hub/knowledge/infrastructure/tower.md`
- **VPS:** `hub/knowledge/infrastructure/mcow.md`, `hub/knowledge/infrastructure/nether.md`
- **cc-box egress (HMB-1/2):** `hub/knowledge/infrastructure/cc-box-egress-{design,plan}.md`, `hub/knowledge/infrastructure/egress-gw.md`
- **Admin app:** `hub/knowledge/infrastructure/admin-app.md`
- **Secrets bootstrap:** `hub/knowledge/infrastructure/secrets-bootstrap.md`

## Servers (summary — see `infrastructure/overview.md` + `tower.md` for full detail)

| Host | TS IP | Role |
|---|---|---|
| tower | 100.101.0.7 | Proxmox host, Moscow, home LAN 192.168.1.103 |
| docker-tower (LXC 100) | 100.101.0.8 | Navidrome + *arr suite |
| jellyfin (LXC 101) | 100.77.246.74 | Jellyfin (native deb, moved off docker-tower 2026-04-18) |
| egress-gw (LXC 199) | — | amnezia-awg gateway for cc-box egress |
| cc-andrey/dan/yuri (200/202/203) | — | CC boxes for other users, route via 199 |
| cc-worker (LXC 204) | 100.99.133.9 | Dev worker (renamed from cc-vk 2026-04-14), stays on tailscale |
| animaya-dev (LXC 205) | 100.119.15.122 | Animaya bot (see `workspace/animaya/`) |
| cc-invernoa (LXC 211) / cc-maks-test (LXC 212) | — | Extra CC boxes, route via 199 |
| mcow | 100.101.0.9 | Moscow VPS: voidnet portal/API, animaya prod |
| nether | 100.101.0.3 | NL VPS: amnezia-awg, XRay/VLESS, TS exit, reverse proxies |

## cc-box egress pattern (HMB-1/2, done 2026-04-23)

cc-* LXCs that need RU-unblocked egress (Telegram) route default through **egress-gw (LXC 199)** which peers with `amnezia-awg2` on nether.

**Topology:** `cc-box (10.10.20.X) → egress-gw (10.10.20.99) → awg0 → nether:46476 → NL exit (77.239.110.57)`

**Per-box toggle:** `pct exec <id> -- egress on|off|status` (persists across reboots via `/etc/egress.mode` + `egress-apply.service`).

**Not for cc-worker (204)** — intentionally keeps tailscale + nether exit for laptop SSH / mesh access.

Add new cc-box: `scp` + `pct push` the `egress-script.sh` + `egress-apply.service` from `hub/knowledge/infrastructure/`, enable unit, `egress on`. Full runbook in `hub/knowledge/infrastructure/egress-gw.md`.

## Tech stack

| Layer | Tool | Notes |
|---|---|---|
| Config management | **Ansible 2.17+** | `community.docker` (compose v2), `community.proxmox` (LXC lifecycle). Static YAML inventory. |
| Secrets | **SOPS 3.9 + age 1.2** | Encrypted YAML in `secrets/`. Age keys at hub level, NOT in this repo. See `infrastructure/secrets-bootstrap.md`. |
| Containers | Docker Compose v2 (docker-tower). LXC-native on tower. | |
| Monitoring | Prometheus + Grafana + node-exporter + cAdvisor | Partial (cadvisor deployed, full stack pending) |
| Mesh | Tailscale | `artis3n.tailscale` role for new nodes |
| Admin UI | Next.js + Radix UI (`apps/admin/`) | Bun workspace. Deployed to **mcow** via Ansible (`deploy-homelab-admin.yml`), port 3847, Caddy at `homelab.makscee.ru`. See `infrastructure/admin-app.md`. |
| Package manager | **Bun** | `bun.lock`, not `package-lock.json` / `pnpm-lock.yaml` |

### Not used
Terraform (no cloud state), Kubernetes (overkill), Portainer (extra service), Ansible Vault (SOPS wins across hub repos).

## Repo layout

```
workspace/homelab/
├── ansible/         — playbooks, inventory, group_vars, collections
├── apps/admin/      — Next.js admin app
├── docs/            — setup-github-oauth.md, network-topology.md, dependency-map.md
├── monitoring/      — (placeholder for Grafana/Prometheus assets)
├── ops/             — operational artifacts (egress-gw scripts/units, runbooks)
├── packages/        — Bun workspace shared libs
├── scripts/         — ops helpers
├── secrets/         — SOPS+age encrypted YAML per host
├── servers/         — per-server config snapshots
├── shared/          — cross-workspace utilities
├── package.json, bun.lock
└── CLAUDE.md        — this file
```

## Constraints

- **Operator:** Claude Code executes ops. Repo structure and docs must be AI-readable and unambiguous.
- **Networking:** All inter-server comms via Tailscale. No public IPs except nether's VPN + reverse proxy endpoints.
- **Secrets:** Hub-level age key. Homelab references but doesn't store raw secrets.
- **Incremental:** Document what exists first, then automate. Don't block on perfection.
- **Tower must never use tailscale exit node** — breaks port forwards + caps LAN speed. Only docker-tower may. cc-worker uses it via the LXC, not the host.

## Common ops

```bash
# Inside an LXC
ssh root@tower "pct exec <ID> -- <cmd>"

# Animaya restart (LXC 205, user systemd)
ssh root@tower 'pct exec 205 -- sudo -u animaya XDG_RUNTIME_DIR=/run/user/1000 systemctl --user restart animaya.service'

# cc-box egress toggle
ssh root@tower "pct exec <ID> -- egress on|off|status"

# Ansible run (needs age key + SOPS decrypt)
cd workspace/homelab && ansible-playbook -i ansible/inventory ansible/playbooks/<file>.yml

# Bun
bun install
bun run --cwd apps/admin dev
```

## Workflow

- Tasks: `hub/tasks/{active,backlog,completed}/HMB-*.md`
- `/work HMB-<n>` to start, `/done HMB-<n>` to complete
- `/task-new HMB "<title>"` to create
- Cross-project: `ANI_HMB-*` or `HMB_VDN-*` prefix — agent loads all relevant workspace CLAUDE.mds
- Commits route by cwd. Infra docs live in hub; code/playbooks in this workspace.
