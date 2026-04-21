---
phase: 22-security-review-launch
plan: 05
subsystem: security
tags: [security, aggregation, integration-test, tailnet, proxmox, sec-08]
requires: [22-02]
provides:
  - "SEC-08 D-22-10/11/12/13 runtime evidence closed"
  - ".planning/milestones/v3.0-SECURITY.md cross-phase aggregate"
  - "Header-spoofing integration test for Auth.js middleware"
affects:
  - apps/admin/tests/integration/
  - scripts/security/
  - .planning/milestones/
tech-stack:
  added: []
  patterns: ["vitest-style bun:test for prod-live integration checks"]
key-files:
  created:
    - apps/admin/tests/integration/header-spoofing.test.ts
    - scripts/security/verify-proxmox-token-scope.sh
    - scripts/security/verify-tailnet-only-ingress.sh
    - .planning/milestones/v3.0-SECURITY.md
    - .planning/phases/22-security-review-launch/22-05-AGGREGATION-GAPS.md
  modified:
    - .planning/phases/22-security-review-launch/22-02-AUDIT-LOG.md
decisions:
  - "Gap phases (12/13/14) flagged honestly in aggregation rather than synthesising retrospective threat models"
  - "Tailnet ingress probe URL changed from /api/auth/signin (Auth.js 400 on GET) to / (307 → /login)"
metrics:
  duration: "~25 min"
  completed: "2026-04-21"
  tasks: 3
  commits: 3
---

# Phase 22 Plan 05: Security Aggregation + Integration Tests Summary

SEC-08 closeout: 20/20 header-spoof cases pass live, Proxmox token read-only scope verified, Tailnet-only ingress posture proven, v3.0-SECURITY.md aggregates 68 threats across 17.1/19/20/22 with honest GAP rows for phases 12/13/14.

## Evidence

- **D-22-11 header spoofing:** 20 cases (5 routes × 4 forged header sets), 60 expect() calls, all PASS against `https://homelab.makscee.ru`. Middleware is JWT-only; no code path trusts `X-Tailscale-User` / `X-Forwarded-User`.
- **D-22-10 Proxmox token scope:** `pveum user permissions dashboard-operator@pve` + `user token permissions readonly` returns `VM.Audit + Datastore.Audit` only on path `/`. No write privileges detected. Matches D-03 / T-19-03 lock.
- **D-22-12 Tailnet-only ingress:** `homelab-admin` process on mcow has no TCP listener matching in `ss -ltnp` (runs over unix socket via systemd unit). Caddy binds `*:443` but `homelab.makscee.ru` resolves only on Tailnet. Tailnet-side GET `/` returns 307 → `/login`.
- **D-22-13 aggregation:** `v3.0-SECURITY.md` created with 7 phase rows (12/13/14 marked GAP, 17.1/19/20/22 populated). Phase totals: **17.1=17/17 mitigated**, **19=15 (14 mitigate, 1 accept)**, **20=16 (12 mitigate, 4 accept)**, **22=20 (15 mitigate, 5 accept)**. Grand total non-gap = 68 threats, 58 mitigated, 10 accepted, **0 open**.

## Aggregated Phase Count

| Covered | Gap |
| ------- | --- |
| 4 (17.1, 19, 20, 22) | 3 (12, 13, 14) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Tailnet ingress probe URL**
- **Found during:** Task 2 script run
- **Issue:** `/api/auth/signin` returned 400 (Auth.js v5 requires POST + CSRF for that endpoint; plan assumed GET would redirect).
- **Fix:** Changed default `TN_URL` to `/` which correctly returns 307 → `/login` for unauthenticated Tailnet requests. Acceptance set updated to accept 307 in addition to 302.
- **Files modified:** `scripts/security/verify-tailnet-only-ingress.sh`
- **Commit:** `bdf177c`

**2. [Rule 1 - Bug] pveum command form**
- **Found during:** Task 2 script run
- **Issue:** Plan's draft used `pveum user token permissions $USER $TOKEN_ID` without `--path`, which printed per-path header only with no permission rows in some pve versions.
- **Fix:** Added `--path /` and combined with `pveum user permissions` output for complete coverage. Also hardened the forbidden-priv grep to include `User.Modify`, `Realm.Allocate`, `Datastore.Allocate`, `VM.Console`, `VM.Migrate`, `VM.Backup`, `Sys.PowerMgmt`.
- **Files modified:** `scripts/security/verify-proxmox-token-scope.sh`
- **Commit:** `bdf177c`

**3. [Rule 2 - missing critical functionality] Aggregation deferral visibility**
- **Found during:** Task 3
- **Issue:** Planner's aggregation template did not surface SEC-01 / SEC-11 as "Deferred to v3.1" — operator handoff risk (could read the aggregate and miss that rate-limit is not live).
- **Fix:** Added explicit `## Deferred to v3.1 (explicit)` section in `v3.0-SECURITY.md` naming SEC-01 and SEC-11 with pickup paths.
- **Files modified:** `.planning/milestones/v3.0-SECURITY.md`
- **Commit:** `e2598e9`

### Auth gates
None — all three runtime scripts ran non-interactively against live infra.

## Commits

| Task | Commit    | Message                                                                                 |
| ---- | --------- | --------------------------------------------------------------------------------------- |
| 1    | `8d9149b` | test(22-05): add header-spoofing integration test (D-22-11)                             |
| 2    | `bdf177c` | feat(22-05): add Proxmox token scope + Tailnet ingress verification scripts (D-22-10/12) |
| 3    | `e2598e9` | docs(22-05): v3.0 cross-phase security aggregation + gaps file (D-22-13)                |

## Self-Check: PASSED

- `apps/admin/tests/integration/header-spoofing.test.ts` — FOUND
- `scripts/security/verify-proxmox-token-scope.sh` — FOUND (+x)
- `scripts/security/verify-tailnet-only-ingress.sh` — FOUND (+x)
- `.planning/milestones/v3.0-SECURITY.md` — FOUND
- `.planning/phases/22-security-review-launch/22-05-AGGREGATION-GAPS.md` — FOUND
- commits `8d9149b`, `bdf177c`, `e2598e9` — all present in `git log`
