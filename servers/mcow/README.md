# mcow — VoidNet Host

## 1. Overview

`mcow` is a Tailnet host at **100.101.0.9** (Moscow). Unlike `docker-tower` and
`nether`, **mcow runs VoidNet services as native Rust binaries under systemd —
there is no Docker on this host**.

Rationale for this documentation shape (per Phase 2 CONTEXT.md decisions):

- **D-07** — SSH audit mcow to determine which VoidNet systemd units are live
  vs stale leftovers.
- **D-08** — Document only what is actually live; flag stale units for cleanup.
- **D-09** — Claude's discretion on documentation format once SSH inspection
  reveals the live shape. This README is the chosen format.

Pitfall 3 from the phase research is explicitly handled: SVC-02 is satisfied
by `.service` files + README + `.env.example` + audit evidence, **not** by a
`docker-compose.yml`.

## 2. Live Units

Source of truth: [`systemd-audit.txt`](./systemd-audit.txt) (SSH-captured
2026-04-14). The full `systemctl is-active`, `is-enabled`, `list-unit-files`,
and per-unit `cat` output is committed there.

| Unit                        | is-active | is-enabled | ExecStart                         | EnvironmentFile       | Disposition                           |
|-----------------------------|-----------|------------|-----------------------------------|-----------------------|---------------------------------------|
| `voidnet-bot.service`       | active    | enabled    | `/opt/voidnet/voidnet-bot`        | `/opt/voidnet/.env`   | KEEP                                  |
| `voidnet-api.service`       | active    | enabled    | `/opt/voidnet/voidnet-api`        | `/opt/voidnet/.env`   | KEEP                                  |
| `voidnet-overseer.service`  | inactive  | disabled   | `/usr/local/bin/voidnet-overseer` | (none)                | STALE — schedule for cleanup          |
| `voidnet-satellite.service` | inactive  | disabled   | `/usr/local/bin/voidnet-satellite`| (none — inline env)   | STALE — schedule for cleanup          |

Notes:

- No separate `voidnet-portal.service` exists on mcow. Per Open Question #3 in
  `02-RESEARCH.md`: the portal is served by `voidnet-api` (a Rust binary that
  exposes both the config API and the portal HTTP UI on `VOIDNET_API_BIND`,
  default `0.0.0.0:8080`). This resolves T-02-03-04 from the plan threat model.
- An ad-hoc `voidnet-mcp` process is occasionally spawned via SSH by the
  operator (visible in `systemd-audit.txt` `## ps` section) — it is **not** a
  systemd unit and is not managed by this repo.
- The stale units' `ExecStart` binaries (`/usr/local/bin/voidnet-overseer` and
  `/usr/local/bin/voidnet-satellite`) are the OLD VoidNet architecture
  (overseer/uplink pattern, also flagged as stale on `nether` in
  Pitfall 2). They were superseded when VoidNet consolidated into
  bot + api + SQLite on a single host.

## 3. Stale Units (Flagged for Cleanup — Do NOT execute during Phase 2)

Per D-08 the following units are flagged for removal. **Execution is Phase 3
runbook scope (DR-04); this plan only documents.**

Run these on the Claude Code operator machine when Phase 3 DR-04 opens:

```bash
# voidnet-overseer: disable, stop, remove unit file, reload systemd
ssh root@mcow 'systemctl disable --now voidnet-overseer.service'
ssh root@mcow 'rm /etc/systemd/system/voidnet-overseer.service && systemctl daemon-reload'

# voidnet-satellite: disable, stop, remove unit file, reload systemd
ssh root@mcow 'systemctl disable --now voidnet-satellite.service'
ssh root@mcow 'rm /etc/systemd/system/voidnet-satellite.service && systemctl daemon-reload'
```

Why these are STALE:

- `voidnet-overseer` — inactive, disabled, last active never in current uptime
  window; binary path `/usr/local/bin/voidnet-overseer` not present in
  `/opt/voidnet/` (per `## ls-opt-voidnet` section of audit).
- `voidnet-satellite` — same; unit was hardcoded with `OVERSEER_URL` pointing
  at a service that was itself decommissioned.

Do NOT delete `servers/mcow/voidnet-overseer.service` or
`servers/mcow/voidnet-satellite.service` from this repo until the live units
are disabled — keeping them as reproducibility artifacts until Phase 3
finishes the cleanup is intentional (T-02-03-03 mitigation).

## 4. Binary Layout

From `## ls-opt-voidnet` in `systemd-audit.txt` (live):

| Path                          | Kind                      | Built By                       |
|-------------------------------|---------------------------|--------------------------------|
| `/opt/voidnet/voidnet-bot`    | ELF x86_64 Rust binary    | VoidNet application repo       |
| `/opt/voidnet/voidnet-api`    | ELF x86_64 Rust binary    | VoidNet application repo       |
| `/opt/voidnet/voidnet-mcp`    | ELF x86_64 Rust binary    | VoidNet application repo      |
| `/opt/voidnet/xtask`          | ELF x86_64 Rust helper    | VoidNet application repo       |
| `/opt/voidnet/voidnet.db`     | SQLite 3.x DB             | Runtime state (Phase 3 backup) |
| `/opt/voidnet/voidnet.db-wal` | SQLite WAL sidecar        | Runtime state                  |
| `/opt/voidnet/voidnet.db-shm` | SQLite shared-memory file | Runtime state                  |
| `/opt/voidnet/.env`           | Env file (0600 target)    | Operator deploy                |
| `/opt/voidnet/backup/`        | Local SQLite backups      | `backup.sh` cron               |

**Binaries are built in the VoidNet application repo — not this repo.** This
repo only tracks: systemd unit files, env schema (`.env.example`), README,
audit evidence. Binary deployment/upgrades live in VoidNet's own deploy flow.

## 5. Env File

**Live path:** `/opt/voidnet/.env` (per `EnvironmentFile=` in
`voidnet-bot.service` and `voidnet-api.service`).

**Schema:** [`servers/mcow/.env.example`](./.env.example) — regenerated
2026-04-14 against live keys (`grep -oE '^[A-Z_][A-Z0-9_]*=' /opt/voidnet/.env`).
31 keys verified identical between repo and live.

**Values:** Never committed in plaintext. Real values will live at
`secrets/mcow.sops.yaml` (SOPS + age, per SEC-02). That file does **not**
yet exist — creating it is Phase 3 scope.

**Deploy procedure (Phase 3):**

```bash
# From the operator machine (cc-worker or local with age key loaded)
sops --decrypt secrets/mcow.sops.yaml > /tmp/mcow.env
scp /tmp/mcow.env root@mcow:/opt/voidnet/.env
ssh root@mcow 'chmod 600 /opt/voidnet/.env'
rm /tmp/mcow.env
ssh root@mcow 'systemctl restart voidnet-bot voidnet-api'
```

Until `secrets/mcow.sops.yaml` exists, treat `.env.example` as the authoritative
schema. Any drift between the live `.env` schema and `.env.example` must be
reflected here by re-running the audit snippet in §2.

## 6. Stateful Data

**SQLite database:** `/opt/voidnet/voidnet.db` (plus `-wal` / `-shm` sidecars).

- Contains: VoidNet user state, admin config, subscription/boosty state, etc.
- Backup/restore is **Phase 3 scope (DR-02 / DR-03)**. Expected pattern:
  `scripts/backup-mcow.sh` running the same `backup.sh`/`replicate-db.sh`
  pattern already present in `/opt/voidnet/`, but committed to this repo.
- Do **not** truncate or copy the DB from within Phase 2 — it is live runtime
  state.

Existing helper scripts on mcow (not managed here yet — Phase 3 target):

- `/opt/voidnet/backup.sh` — local SQLite dump to `/opt/voidnet/backup/`
- `/opt/voidnet/replicate-db.sh` — DB replication helper
- `/opt/voidnet/health-alert.sh` — runs continuously via cron (visible in `ps`)
- `/opt/voidnet/sync-boosty.sh`, `sample-bandwidth.sh`, `check-downloads.sh`

## 7. Restart Procedure

From operator machine over Tailnet:

```bash
# Restart both live units
ssh root@mcow 'systemctl restart voidnet-bot voidnet-api'

# Verify post-restart
ssh root@mcow 'systemctl is-active voidnet-bot voidnet-api'

# Tail logs if something looks wrong
ssh root@mcow 'journalctl -u voidnet-bot -n 100 --no-pager'
ssh root@mcow 'journalctl -u voidnet-api -n 100 --no-pager'
```

Restart is safe to run at any time — both services are idempotent on startup
and the SQLite WAL will recover cleanly.

## 8. Gotchas

- **mcow is NOT a Proxmox LXC.** It is a standalone Tailnet host (confirmed in
  `CLAUDE.md` server table). Do not apply `community.proxmox` Ansible modules
  or `pct` commands against it.
- **No Docker.** Do not attempt to write a `docker-compose.yml` for VoidNet on
  mcow — the services run as native Rust binaries under systemd (Pitfall 3).
- **Binary updates do not come from this repo.** The VoidNet application repo
  ships binaries to `/opt/voidnet/` via its own deploy workflow. This repo
  only owns: the systemd unit files, env schema, README, and verify harness
  assertions. Rebuilding mcow from scratch requires both repos: this one for
  host config, VoidNet's for binaries.
- **`/opt/voidnet/` contents look Python-ish** (`pyproject.toml`, `.venv`,
  `__pycache__`) because it was once the Python prototype's working directory.
  Those artifacts are vestigial — the **live binaries are Rust ELF**
  (confirmed by `file` output in `systemd-audit.txt`). Do not act on the
  Python scaffolding.
- **`ansible` assumptions from `docker-tower` do not transfer.** mcow has no
  Proxmox guest-agent channel, no `pct` metadata, and no Docker socket —
  playbooks that target `docker-tower` will not work as-is against mcow.
- **Stale unit files remain on disk** (overseer, satellite) until Phase 3
  DR-04. Anyone running `ls /etc/systemd/system/voidnet-*.service` on mcow
  today will see 4 files; only 2 are active. This is intentional.
