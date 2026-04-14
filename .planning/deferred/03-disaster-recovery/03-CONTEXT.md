# Phase 3: Disaster Recovery - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Claude Code can rebuild any server's services from scratch using only this repo, and can restore stateful data from a backup into a fresh deployment. Delivers: per-host rebuild scripts + runbooks, a backup manifest covering every stateful data path, restore procedures for those paths, and AI-readable runbooks with exact commands, expected outputs, and stop conditions.

Requirements in scope: DR-01, DR-02, DR-03, DR-04.

Host coverage: docker-tower, mcow, nether, tower (Proxmox host) + dev-worker LXCs (cc-worker, cc-andrey, cc-dan, cc-yuri, animaya-dev).

Explicitly out of scope for this phase: media content files (per PROJECT.md out-of-scope), backup automation/daemons, NAS infrastructure, monitoring (Phase 4), VoidNet/Animaya app code.

</domain>

<decisions>
## Implementation Decisions

### Rebuild-script form
- **D-01:** Hybrid — executable bash `scripts/rebuild-<host>.sh` + markdown runbook per host. Script does the work; runbook wraps it with pre-flight checks, numbered steps, expected outputs, and explicit stop conditions. This satisfies DR-01 (scripts exist) and DR-04 (AI-readable runbooks) without duplicating logic.
- **D-02:** Scripts follow the Phase 2 pattern — plain bash, `set -euo pipefail`, `${VAR:?}` guards for required env (auth keys, SOPS passphrase, etc.), no embedded secrets. Idempotent where practical (safe to re-run).
- **D-03:** No Ansible in this phase. CLAUDE.md lists Ansible in the recommended stack, but Phase 2 shipped bash + docs; staying consistent avoids introducing a new toolchain mid-milestone. Revisit post-DR if automation grows.

### Backup scope
- **D-04:** Manifest lists **configs + DBs/metadata only** per service. Covered: Jellyfin library DB + metadata, *arr SQLite DBs (Radarr/Sonarr/Lidarr/Prowlarr), qBittorrent state, VoidNet SQLite, compose files + `.env`, SOPS-encrypted secrets, Caddy config, AmneziaWG keys (already SOPS), LXC `pct` configs.
- **D-05:** Media files excluded (per PROJECT.md Out of Scope: "Managing the media content itself"). No media inventory or checksums either — operator re-acquires media out-of-band.
- **D-06:** Manifest format: one table per host listing service → source paths → size class (S/M/L) → backup method (see D-07) → restore target. Machine-parseable where reasonable.

### Hot/cold backup strategy
- **D-07:** SQLite-based services use the online **`sqlite3 <db> ".backup <out>"`** method — no downtime, consistent snapshot. Applies to *arr DBs and VoidNet SQLite.
- **D-08:** Flat-file configs (compose, .env, Caddyfile, systemd units, pct configs) → plain `rsync`/`cp` while live. No consistency concern.
- **D-09:** Jellyfin metadata cache — document `jellyfin` systemd stop → rsync → start if metadata rebuild from scratch is unacceptable; otherwise treat as regenerable and skip. Decide per-service in the manifest.

### Backup automation level
- **D-10:** Document-only for this phase. Manifest + runbook ships example commands the operator runs ad-hoc (or via Claude Code). **No cron, no daemon, no scheduled job.** Matches the project's "incremental, document first, automate second" constraint.
- **D-11:** Leave an explicit hook in each host runbook noting where a future cron-line would go, so Phase 4 (Monitoring) or a later phase can wire automation without rewriting manifests.

### Backup storage target
- **D-12:** **Pull model over Tailnet** — operator machine runs `rsync -a --rsh='ssh' root@<host-tailnet-ip>:<source> <local-target>` from a host-local `backups/<host>/<service>/` staging dir. No new infra, uses existing Tailscale mesh, survives any single homelab host failing.
- **D-13:** `backups/` path is operator-side and **not committed** (add to `.gitignore` if not already). Repo ships only the commands, not the data.
- **D-14:** SQLite `.backup` output is produced server-side into a temp path, then rsync'd, then removed server-side. Documented as a two-step in the runbook.

### Host scope (all four in)
- **D-15:** Phase 3 covers: **docker-tower** (media stack), **mcow** (VoidNet systemd + SQLite), **nether** (AmneziaWG + XRay + Caddy), **tower** (Proxmox host + all 6 live LXCs: 100/200/202/203/204/205). Dev-worker LXCs covered via Proxmox-level `vzdump` + the shared rebuild runbook; per-dev-worker service rebuild is minimal (SSH + Tailscale bootstrap + developer toolchain per inventory.md).

### Claude's Discretion
- **Runbook layout** — prefer a new top-level `docs/runbooks/<host>.md` per host + a `docs/runbooks/README.md` index linking from each `servers/<host>/README.md`. Planner may choose alternate placement if it flows better, but must not bury runbooks inside existing READMEs to the point that they lose numbered-step structure.
- **Verify harness approach** — mirror Phase 2 pattern: new `scripts/verify-phase03.sh` + `scripts/verify-phase03.d/NN-<host>.sh` snippets. Each snippet asserts manifest coverage, runbook structure (numbered steps, expected-output blocks, stop-conditions), and sops-roundtrip for any new encrypted blobs. Dry-run rebuild on a live LXC is acceptable but not required for this phase.
- **Secrets restore path** — document the age-key recovery step once in a shared `docs/runbooks/README.md#secrets` section (operator copies `~/.config/sops/age/keys.txt` from a known-safe location; assume the operator machine survives or the key has been exported to a password manager). Not a DR blocker for this phase.
- **Manifest format specifics** — columns, file name (e.g., `docs/BACKUP-MANIFEST.md` vs per-host manifests inside runbooks), and whether to emit a JSON/YAML sidecar. Planner picks.
- **Numbering/IDs** — rebuild script interface (`--dry-run`, `--yes`, etc.), runbook step-numbering scheme, and per-service method labels in the manifest.

</decisions>

<specifics>
## Specific Ideas

- Operator wants the Phase 2 experience continued: "a script I can point Claude at, plus a runbook that says exactly what to type and what the output should look like, with a clear STOP line if something doesn't match."
- No downtime for backups when technically avoidable. SQLite `.backup` over `systemctl stop` wherever possible.
- Backups live on the operator's machine (pulled over Tailnet). Homelab hosts don't need to know where backups end up — they only produce the snapshot.
- No new tooling. Bash + existing SOPS + rsync + sqlite3. Ansible is deliberately deferred.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level
- `CLAUDE.md` — Server inventory, Tailscale IPs, current service layout, tech stack constraints
- `.planning/PROJECT.md` — Core value, Out of Scope, Constraints (esp. "document first, automate second" and media-content exclusion)
- `.planning/REQUIREMENTS.md` §"Disaster Recovery" — DR-01..DR-04 exact wording
- `.planning/ROADMAP.md` §"Phase 3: Disaster Recovery" — Success Criteria 1–4

### Phase 2 outputs (reusable assets)
- `scripts/verify-phase02.sh` + `scripts/verify-phase02.d/*.sh` — Harness pattern to mirror for phase-03 verify
- `scripts/tailscale-provision.sh` — Bootstrap-script shape (shebang, env guards, idempotency)
- `scripts/README.md` — Scripts index format to extend
- `servers/docker-tower/docker-compose.{homestack,services,monitoring,extras}.yml` + `.env.example` + `README.md` — Source of truth for docker-tower rebuild
- `servers/mcow/*.service` + `systemd-audit.txt` + `.env.example` + `README.md` — Source of truth for mcow rebuild (incl. stale overseer/satellite flag)
- `servers/nether/amnezia-awg.conf.template` + `docker-compose.services.yml` + `Caddyfile` + `README.md` — Source of truth for nether rebuild
- `servers/tower/lxc-{100,200,202,203,204,205}-*.conf` + `README.md` — pct configs for LXC recreate
- `servers/{cc-worker,cc-andrey,cc-dan,cc-yuri,animaya-dev}/inventory.md` — dev-worker per-LXC inventories
- `secrets/{docker-tower,nether,nether-awg}.sops.yaml` — SOPS-encrypted secrets (restore path for DR-03)
- `.planning/phases/02-service-documentation/02-VERIFICATION.md` — Verified-artifact table; authoritative list of what Phase 2 shipped
- `docs/network-topology.md`, `docs/dependency-map.md` — Service dependency order for rebuild sequencing

### External docs
- SOPS + age usage (docs/decrypt flow already exercised in Phase 2 — no new external reading required)
- `sqlite3` `.backup` command reference (standard) — for D-07
- Proxmox `vzdump` + `pct restore` reference — for tower + dev-worker LXC rebuild

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase-2 verify harness** (`scripts/verify-phase02.sh` + `verify-phase02.d/NN-*.sh`): proven pattern with sourced snippets and a final sweep; Phase 3 clones this shape for its verify harness.
- **`scripts/tailscale-provision.sh`**: canonical shape for a bash script that runs on a fresh host — env guard + idempotent install + join. Rebuild scripts adopt the same shell conventions (`set -euo pipefail`, `${VAR:?}` guards).
- **Per-host READMEs** (`servers/<host>/README.md`): already document service layout, post-deploy checks, and gotchas. Runbooks reference these instead of duplicating content.
- **`secrets/*.sops.yaml`**: SOPS roundtrip is already the documented restore path for secrets; rebuild runbook just needs to invoke `sops -d` at the right step.
- **`docs/dependency-map.md`**: drives the order rebuild scripts start services in (e.g., network → storage mounts → qBittorrent → *arr → Jellyfin on docker-tower).

### Established Patterns
- Compose files pin image tags (`@sha256:` digests on nether; version tags on docker-tower) — rebuild scripts must NOT `docker compose pull` without arg, or they'll drift. Use the committed compose verbatim.
- Secrets live encrypted at rest; decryption happens at deploy time via `sops -d` into `.env`. Rebuild scripts follow the same contract (never echo decrypted values, never commit plaintext).
- Verify snippets are self-contained (`bash scripts/verify-phase0X.sh --quick` runs everything). Phase 3 harness preserves the `--quick` flag semantics.

### Integration Points
- Phase 1 delivered `CLAUDE.md` + network-topology — rebuild runbooks reference these as the "truth" for hostnames and Tailscale IPs.
- Phase 2 compose + secrets + configs — the rebuild script's job is to place these on a fresh host and start them. No new service definitions should appear in Phase 3.
- Phase 4 (Monitoring) will consume: (a) rebuild scripts for node-exporter deployment, (b) the automation hook noted in D-11 for scheduled-backup wiring.

</code_context>

<deferred>
## Deferred Ideas

- **Automated scheduled backups (cron/systemd timers + retention/rotation)** — not this phase; D-10 keeps this doc-only. Revisit in Phase 4 or a dedicated backup-automation phase.
- **Offsite / NAS backup storage** — NAS planned but not built (per PROJECT.md); D-12 uses the operator's machine as the interim target. Add to backlog.
- **Encrypted/deduplicated backups (borg, restic)** — depends on storage target decision above; out of this phase.
- **Media library inventory / checksums** — D-05 excludes; explicitly deferred.
- **Dry-run rebuild on ephemeral LXC as part of CI** — nice-to-have verification; out of scope, noted in Claude's Discretion for phase-verify.
- **Ansible migration of rebuild scripts** — CLAUDE.md stack mentions Ansible; deferred per D-03. Reconsider once bash rebuild scripts exist and we feel the pain.
- **Age-key hardware-backup flow** (YubiKey, printed paper key, etc.) — beyond this phase's scope.

</deferred>

---

*Phase: 03-disaster-recovery*
*Context gathered: 2026-04-14*
