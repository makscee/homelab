---
phase: 14-global-overview-audit-log
plan: 07
subsystem: infra
tags: [prometheus, ansible, homelab-admin, tailscale, observability]

requires:
  - phase: 14-global-overview-audit-log
    provides: Overview page + /api/overview + host grid (plans 14-01..14-04)
provides:
  - Overview host tiles populate with live Prometheus metrics
  - PROMETHEUS_URL rendered into /etc/homelab-admin/env by ansible
  - Code default flipped from mcow:9090 to docker-tower:9090 (correct homelab default)
affects: [phase-15+, alerts, monitoring, future prometheus consumers]

tech-stack:
  added: []
  patterns:
    - "Tailnet hostname (docker-tower) over hardcoded Tailscale IP — MagicDNS-resolved, rotation-safe"
    - "Non-secret env vars rendered inline in homelab-admin-secrets.yml (not SOPS)"

key-files:
  created: []
  modified:
    - apps/admin/lib/prometheus.server.ts
    - ansible/playbooks/tasks/homelab-admin-secrets.yml

key-decisions:
  - "Two-sided fix: both code default and ansible-rendered env — dev (bun run dev) and prod (systemd) both work without relying on the other"
  - "Use tailnet hostname docker-tower rather than IP 100.101.0.8 — future-proofs against Tailnet IP rotation"
  - "PROMETHEUS_URL kept out of SOPS — public tailnet hostname is not a secret"

patterns-established:
  - "Tailnet hostname preferred over IP in ansible-rendered env files"
  - "Code defaults in *.server.ts should match the real homelab topology, not a placeholder"

requirements-completed: [GAP-14-02]

duration: ~25min
completed: 2026-04-17
---

# Phase 14 Plan 07: Prometheus URL Fix Summary

**Overview host tiles now populate with live CPU/Mem/Disk/Uptime/Load/Containers from Prometheus via a two-sided fix: code default flipped to docker-tower:9090, and ansible renders PROMETHEUS_URL into /etc/homelab-admin/env on mcow.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-04-17
- **Tasks:** 3 (code fix, ansible render, deploy + UAT)
- **Files modified:** 2

## Accomplishments

- Flipped `PROM_BASE` default in `apps/admin/lib/prometheus.server.ts` from `http://mcow:9090` to `http://docker-tower:9090` — matches actual homelab Prometheus host
- Rendered `PROMETHEUS_URL=http://docker-tower:9090` into `/etc/homelab-admin/env` via ansible task (non-secret, inline)
- Closed UAT Gap 2 / test 5 BLOCKER — all 6 host tiles on /overview now show live numeric metrics

## Task Commits

1. **Two-sided fix: code default + ansible env render** — `3255ba3` (fix)
2. **Plan metadata / summary** — (this commit)

## Files Created/Modified

- `apps/admin/lib/prometheus.server.ts` — `PROM_BASE` default flipped to `http://docker-tower:9090`
- `ansible/playbooks/tasks/homelab-admin-secrets.yml` — adds `PROMETHEUS_URL=http://docker-tower:9090` to rendered env

## Deploy Result

- Ansible `deploy-homelab-admin.yml` ran against mcow
- `PLAY RECAP`: **ok=29, changed=6, failed=0**
- Verified on mcow: `/etc/homelab-admin/env` contains `PROMETHEUS_URL=http://docker-tower:9090`
- Public `GET /api/health` → **200**
- systemd `homelab-admin.service` restarted cleanly with new env

## UAT Test 5: PASS — Overview Host Tiles Live

Parent verified via Playwright MCP at `https://homelab.makscee.ru/`. All 6 host tiles rendered live numeric metrics (no empty/dash states):

| Host | CPU | Mem | Disk | Uptime | Load (1/5/15) | Extra | Status |
|------|-----|-----|------|--------|---------------|-------|--------|
| tower | 2% | 33% | 14% | 8d 21h | 0.24 / 0.18 / 0.22 | — | fresh |
| docker-tower | 2% | 33% | 53% | — | — | Containers 13 | fresh |
| cc-worker | 2% | 1% | 31% | — | — | — | fresh |
| mcow | 13% | 14% | 62% | — | 0.60 / 0.45 / 0.31 | — | fresh |
| nether | 22% | 32% | 48% | 105d 2h | — | — | fresh |
| animaya-dev | 3% | 2% | 23% | — | — | — | fresh |

- Sparklines render with traffic curves on all tiles
- Zero console errors in browser DevTools

## No Regressions

- **UAT test 7 (AlertsCard):** still shows "All clear" — unaffected
- **UAT test 8 (NavAlertBadge in top-bar):** no regression — badge state unchanged

## Decisions Made

- **Two-sided fix** (not env-only) so local dev on mcow without `.env.local` still works post-fix
- **Tailnet hostname** `docker-tower` over IP `100.101.0.8` — MagicDNS resolves on mcow, survives Tailnet IP churn
- **No SOPS** for PROMETHEUS_URL — tailnet hostname is not sensitive; inline in non-secret render section

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 14-07 closes the final BLOCKER in phase 14 (Gap 2 / UAT test 5)
- Phase 14 fully executed (22/22 plans complete per roadmap; plan sequence 14-01..14-07 delivered)
- Overview page is production-ready with live data; ready for downstream phases (alerts enrichment, Proxmox integration, etc.)

## Self-Check: PASSED

- `apps/admin/lib/prometheus.server.ts` — FOUND (modified)
- `ansible/playbooks/tasks/homelab-admin-secrets.yml` — FOUND (modified)
- Commit `3255ba3` — FOUND in `git log`

---
*Phase: 14-global-overview-audit-log*
*Completed: 2026-04-17*
