---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: — Unified Stack Migration
status: verifying
stopped_at: Completed 19-01-PLAN.md
last_updated: "2026-04-19T10:43:41.488Z"
last_activity: 2026-04-19
progress:
  total_phases: 12
  completed_phases: 7
  total_plans: 34
  completed_plans: 32
  percent: 94
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-16)

**Core value:** Any server's full stack can be reliably reproduced from this repo alone — no tribal knowledge, no guessing, no data loss on migration.
**Current focus:** Phase 15 — Tailwind v4 migration (3.4 → 4.2) + tailwind-merge 3

## Current Position

Phase: 17.1 (migrate-jellyfin-to-dedicated-lxc-on-tower) — COMPLETE (ready_for_verification)
Plan: 5 of 5 complete (17.1-01..05 all shipped; operator UAT signoff 2026-04-19 CPU-only; D-17 HW transcode formally deferred until BIOS iGPU enable)
Prior phase: 15 (tailwind-v4-migration) — COMPLETE (15-01 + 15-02 shipped + Playwright-verified on prod)
Status: Phase complete — ready for verification
Last activity: 2026-04-19

Progress: [          ] 0% — v3.0 not started

## Performance Metrics

**v1.0 reference (shipped 2026-04-15):**

- Total plans completed: 33
- Timeline: 2026-04-10 → 2026-04-15 (6 days)

**v3.0 scope:** 8 phases (12-19), 58 requirements across 9 categories

## Accumulated Context

### Roadmap Evolution

- Phase 15 added: Tailwind v4 migration (3.4 to 4.2) + tailwind-merge 3
- Phase 16 added: TypeScript 6.0 upgrade with deprecation fixes
- Phase 17 added: ESLint 10 + Node types 24 upgrade
- Phase 17.1 inserted after Phase 17: Migrate Jellyfin to dedicated LXC on tower (URGENT — docker-tower contention causing buffering)

### Decisions

- **D-07 (Claude quota access):** Endpoint-scrape validated Phase 05 — production exporter mcow:9101 polling 2 tokens, 0% 429 rate. See PROJECT.md §Key Decisions.
- **v3.0 stack locked:** Bun + Next.js 15.2.4 (CVE-2025-66478 pin) + React 19 + Tailwind + shadcn/ui + Caddy + Drizzle + bun:sqlite. See research/STACK.md.
- **Auth switched:** Tailscale identity headers dropped in favor of GitHub OAuth (Auth.js v5) — eliminates header-spoofing risk (P-02). See PITFALLS.md.
- **Parallel phases:** 15 (VoidNet), 16 (Proxmox), 17 (Alerts) are parallel-safe after Phase 14 completes.
- [Phase 12-infra-foundation]: Next.js bumped to 15.5.15 (from 15.2.4) — 15.2.x fails bun audit due to GHSA-q4gf-8mx6-v5v3 DoS CVE affecting <15.5.15
- [Phase 12-infra-foundation]: bun.lock (text format) committed as lockfile — Bun 1.3.5 generates .lock not .lockb binary
- [Phase 12]: bun_version pinned to 1.1.38 in group_vars/all.yml (do not bump to 1.2.x without P-05 re-validation)
- [Phase 12]: mcow confirmed KVM — strict systemd hardening safe for Plan 07 (ProtectSystem=strict, PrivateTmp=yes); P-15 degraded path not needed
- [Phase 12-infra-foundation]: KVM confirmed — full strict systemd hardening block used for homelab-admin.service (ProtectSystem=strict + PrivateTmp=yes)
- [Phase 12-infra-foundation]: Used sops --set for non-interactive key injection into mcow.sops.yaml; OAuth creds are placeholders pending operator GitHub app creation
- [Phase 12-infra-foundation]: Ansible task include pattern established: delegate_to localhost decrypt + no_log + drop facts after render
- [Phase 12-infra-foundation]: blockinfile is ansible.builtin (core), not community.general — FQCN corrected from plan spec
- [Phase 12-infra-foundation]: Next.js 15.5.15 satisfies >=15.2.4 SC; bun audit clean; SC #5 idempotency exceptions documented (env render + rsync ownership + handler restart)
- [Phase 14]: cAdvisor uses community.docker.docker_container directly (not role) for explicit Tailnet-bind control; mcow uses port 18080 (voidnet-api owns 8080)
- [Phase 14]: cadvisor_host_port host_var used for mcow (18080) vs docker-tower (8080) — voidnet-api owns :8080 on mcow
- [Phase 14]: bun:sqlite webpack externals callback interceptor + bun-sqlite-shim.js for Next.js Node build worker
- [Phase 14]: emitAudit() compat shim kept in audit.server.ts until Plan 03 migrates Phase 13 call-sites
- [Phase 14]: logAudit() placed in route handlers (not registry) — only routes have access to req.headers for IP extraction
- [Phase 14]: renameToken() return type changed to { token, oldLabel } so route handler can log from/to rename payload
- [Phase 15-01]: Tailwind v4 CSS-first config in `app/globals.css` (@theme inline + @custom-variant dark); `tailwind.config.ts` deleted; autoprefixer dropped (Lightning CSS in v4 handles prefixing)
- [Phase 15-01]: Preserved v3 default-border via global `* { @apply border-border }` — avoids shadcn Card/Input/Button border regressions under v4
- [Phase 15-01]: `@tailwindcss/upgrade` codemod can false-positive rename string-literal content (e.g. `"outline"` → `"outline-solid"` in JSX props). Always diff-audit codemod output before committing.
- [Phase 15-01]: Verified pixel-identical to prod v3 baseline via Playwright MCP (/, /audit, /alerts, /login, focus ring). /tokens error is NOT Tailwind — it's the sops PATH infra issue tracked in ROADMAP backlog 999.1.
- [Phase 15-02]: tailwind-merge v3 bump was zero-code — single cn() call site in apps/admin/lib/utils.ts with no extendTailwindMerge/custom validators, so all v3 breaking changes were no-ops. Fix-on-break branch (D-3) not exercised. Commit a039d43 deployed to mcow (PLAY RECAP ok=29); Playwright MCP prod UAT confirmed zero visual regressions on /, /audit, /alerts (no doubled focus rings, no state-variant conflicts, no size stacking, no badge mismatch). /tokens UAT skipped — pre-existing sops PATH issue (backlog 999.1).
- [Phase 16]: TS 6.0.3 upgrade clean; typescript-eslint 8.58.2 peer range covers TS 6 (D-2 no-op); TS2882 on CSS side-effect import resolved via ambient declare module *.css
- [Phase 17.1-01]: CT 101 provisioned on tower (unprivileged Debian 12, dev0: renderD128 gid=993, mp0/mp1 ro=1, vmbr1 10.10.20.11/24). Tailscale IP 100.77.246.74 assigned as `jellyfin`; operator approved node. Added to ansible `monitored_hosts` (NOT docker_hosts per D-05); `ansible jellyfin -m ping` SUCCESS. SSH host-key acceptance required one-time `ssh-keyscan` on controller (Rule 3 auto-fix).
- [Phase 17.1-02 PARTIAL]: `deploy-jellyfin.yml` playbook + `jellyfin-transcodes.mount.j2` written and applied idempotently to CT 101. Jellyfin service active, `/health` returns Healthy, tmpfs mount active, apt holds + groups set. Auto-deviations applied (Rule 1/3): (a) added Debian non-free + non-free-firmware apt source — required for `intel-media-va-driver-non-free`; (b) renamed `libva-utils` → `vainfo` (correct Debian 12 package name). **D-17 (HW transcode) BLOCKED**: `/dev/dri/renderD128` on tower resolves to NVIDIA RTX 2060 (nouveau), not Intel UHD 630. `lspci` shows no `00:02.0` Intel VGA device — iGPU is BIOS-disabled (auto-off when dGPU present). i915 module available but no device to bind. See `17.1-02-IGPU-PROBE.md` for full diagnosis + BIOS setting to toggle (`iGPU Multi-Monitor: Enabled`) + post-reboot resume checklist. Wave 3 gated.
- [Phase 17.1-02 CLOSED w/ deferred acceptance]: 2026-04-18 operator chose to proceed CPU-only for perf testing before committing to wave-3 cutover; D-17 deferred. `scripts/verify-jellyfin-lxc.sh` extended with full runtime probe (LXC infra, service, tmpfs opts+size, user groups, bindmounts, apt holds, /health on Tailnet); VA-API/iHD/vmbr1-ingress checks are WARN-not-FAIL while D-17 is deferred and Plan 04 ingress is pending. Final: 17 PASS / 3 WARN / 0 FAIL. Auto-fixes this session: (a) Rule 3 — added jellyfin host key to controller known_hosts; (b) Rule 1 — relaxed `findmnt SIZE` regex for leading whitespace; (c) Rule 1 — downgraded vmbr1 `/health` to WARN (that path is Plan 04 ingress territory; Tailnet 100.77.246.74:8096 is authoritative). Wave-3 gate now: operator perf signoff on CPU-only.
- [Phase 17.1]: Jellyfin 10.10+ schema: BaseItems (not MediaItems) in unified jellyfin.db
- [Phase 17.1]: Rsync in PULL mode (jellyfin->docker-tower) due to Tailscale ACL blocking reverse SSH
- [Phase 19]: Token role hard-coded to VM.Audit+Datastore.Audit only (D-03); no VM.PowerMgmt
- [Phase 19]: pveum shell used instead of community.proxmox (no token module); token_list guard prevents rotation
- [Phase 19]: tower cert SAN includes DNS:tower — no connect.servername override needed in Plan 02

### Blockers/Concerns

- Phase 13 first task: SOPS write spike (`spawnSync('sops', ...)`) + Zod 4 + shadcn forms compat check — must resolve before token CRUD ships
- Phase 15 (VoidNet): blocked on voidnet-api adding JSON admin endpoints (parallel milestone in voidnet repo)
- Phase 18 (Terminal): node-pty LXC feasibility spike is mandatory first task — fallback to ssh2 pure-JS pipe if PTY allocation fails in mcow LXC
- docker-tower cleanup: `docker volume rm monitoring_{grafana,alertmanager}-data` scheduled 2026-04-22
- **Phase 17.1 plan 02 complete with deferred acceptance** — operator approved closing plan 02 CPU-only; D-17 (HW transcode) deferred to later BIOS window. Gate before wave 3 (plan 03 cutover): operator performance signoff on CPU-only transcode at `http://100.77.246.74:8096`. BIOS resume path preserved in `17.1-02-IGPU-PROBE.md`; to close D-17 later, promote the two `check_warn` blocks at the bottom of `scripts/verify-jellyfin-lxc.sh` to hard `check` calls.

### Pending Todos

- 2026-04-22: docker-tower volume cleanup (grafana + alertmanager data volumes)
- 2026-04-25: Phase 17.1 cleanup step 1 — remove `jellyfin:` service block from `servers/docker-tower/media/docker-compose.yml` in a dedicated commit; run `ansible-playbook deploy-docker-tower.yml`; confirm old Jellyfin container gone; delete `Jellyfin QSV` banner from `servers/docker-tower/README.md` (D-15).
- 2026-05-02: Phase 17.1 cleanup step 2 — purge `/opt/docker-configs/shared/jellyfin/` on docker-tower LXC 100 (`ssh root@docker-tower 'rm -rf /opt/docker-configs/shared/jellyfin'`) after 1 week of offline retention (D-15).
- Phase 17.1 rollback drill (D-16, optional but recommended before 2026-04-25): exercise the rollback block in `17.1-03-CUTOVER-LOG.md` + `17.1-04-INGRESS-LOG.md` once during the soak window, confirm service restores in <5 min.
- Phase 17.1 D-17 re-open (undated): when BIOS iGPU Multi-Monitor enabled on tower, re-run `bash scripts/verify-jellyfin-lxc.sh` — promote the 2 `check_warn` iHD blocks back to hard `check`; reconfirm VA-API transcode in Jellyfin dashboard.
- Backlog 999.1: /tokens sops PATH fix — extend `homelab-admin.service` unit `Environment=PATH=` to include `/usr/local/bin`, or use `BindReadOnlyPaths=/usr/local/bin/sops`. See ROADMAP.md Backlog.

### Resolved Pre-Phase-12 Todos (closed 2026-04-17 by Plan 12-03)

- ~~Before Phase 12: verify Cloudflare API token exists~~ — OBSOLETE. Phase 12 CONTEXT.md D-12-12 switched from LE DNS-01 to LE HTTP-01 (mirrors `vibe.makscee.ru`); no Cloudflare API integration needed.
- ~~Before Phase 12: confirm tailscale-nginx-auth socket path on mcow~~ — OBSOLETE. Phase 12 CONTEXT.md D-12-06 switched from Tailscale header auth to GitHub OAuth (Auth.js v5); tailscale-nginx-auth not used.
- ~~Before Phase 12: confirm mcow LXC privilege level~~ — RESOLVED. mcow is KVM (not LXC). See `servers/mcow/lxc-probe.md`; strict hardening block wired into Plan 12-07.

## Session Continuity

Last session: 2026-04-19T10:43:36.892Z
Stopped at: Completed 19-01-PLAN.md
Resume file: None
