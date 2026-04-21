---
phase: 22
plan: 02
subsystem: security
tags: [security, audit, csp, sops, ci-script]
requires: [apps/admin built bundle, homelab.makscee.ru reachable]
provides: [scripts/security/bun-audit.sh, scripts/security/bundle-secret-scan.sh, scripts/security/header-audit.sh, AUDIT-LOG evidence]
affects: [.planning/REQUIREMENTS.md, .planning/ROADMAP.md, .planning/STATE.md]
tech-stack:
  added: [bash awk-based SOPS key extraction]
  patterns: [WARN-not-FAIL header gating (Phase 17.1 pattern)]
key-files:
  created:
    - scripts/security/bun-audit.sh
    - scripts/security/bundle-secret-scan.sh
    - scripts/security/header-audit.sh
    - .planning/phases/22-security-review-launch/22-02-AUDIT-LOG.md
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
    - .planning/phases/22-security-review-launch/22-02-security-rate-limit-and-audit.md
decisions:
  - SEC-01 (Caddy per-IP rate limit) DEFERRED to v3.1 — stock apt Caddy 2.6.2 lacks rate_limit module; caddyserver.com custom-build API upstream outage; operator chose defer over xcaddy self-build to accelerate launch
  - SEC-11 (strict nonce-based CSP) DEFERRED to v3.1 — internal 2-user panel, GitHub OAuth gated, XSS surface ≈ zero today; defense-in-depth belongs in v3.1 hardening pass
  - header-audit.sh WARN-not-FAIL on CSP unsafe-inline, mirroring Phase 17.1 pattern
  - bundle-secret-scan.sh uses awk on SOPS-YAML top-level keys (unencrypted), no new operator dependency
metrics:
  completed: 2026-04-21
  commits: 5
---

# Phase 22 Plan 02: Security Rate Limit + Audit Summary

One-liner: SEC-08 closed (bun audit + bundle secret scan + deployed-header re-audit all green) with SEC-01 and SEC-11 deferred to v3.1 per operator launch-priority decision.

## What Shipped

Three operator-runnable audit scripts under `scripts/security/`:

- **bun-audit.sh** — wraps `bun audit --audit-level=high` on `apps/admin`; exits non-zero on any HIGH/CRITICAL advisory. First run: clean.
- **bundle-secret-scan.sh** — scans `apps/admin/.next/static` for leakage of SOPS-YAML top-level key names (extracted via awk, zero new deps) and token-material patterns (prefix + ≥20 key-charset chars). First post-fix run: clean.
- **header-audit.sh** — curls `https://homelab.makscee.ru/` and asserts CSP/HSTS/X-Frame-Options/Referrer-Policy. CSP `unsafe-inline` downgraded to WARN per SEC-11 deferral. Re-audit: 4/4 FAIL-gated checks ok; 1 WARN.

Full evidence captured in `22-02-AUDIT-LOG.md` with raw response headers, script outputs, and pass/warn breakdown.

## Deferrals

### SEC-01 — Caddy per-IP rate limit → v3.1

Stock apt Caddy 2.6.2 on mcow lacks the `rate_limit` module. `caddyserver.com/api/download` upstream custom-build API verified broken (0-byte responses) from both mcow and nether over ~35 min of debugging. Operator chose defer over xcaddy self-build to keep launch on schedule. Pickup path: xcaddy self-build or successor module in v3.1. Bookkeeping commit: `b5437fd` (prior run).

### SEC-11 — Strict nonce-based CSP → v3.1

Current CSP includes `'unsafe-inline'` on `script-src` and `style-src`. Operator accepted residual risk on 2026-04-21: internal 2-user admin panel + GitHub OAuth + allowlisted orgs makes today's XSS surface ≈ zero. Full nonce-based CSP requires middleware rewrite + Next.js RSC integration work that belongs in a dedicated v3.1 hardening pass. Bookkeeping commit: `00a8262`. header-audit.sh downgraded to WARN in `cddb739`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `yq` not installed on operator machine**
- **Found during:** SEC-08 bundle-secret-scan first run
- **Issue:** `command -v yq` failed; adding a new CLI dep to bootstrap just to list YAML keys was unjustified
- **Fix:** swapped key extraction to `awk` — top-level SOPS-YAML keys are unencrypted (only values are `ENC[...]`), so a pattern-match pass is both correct and dependency-free
- **Files modified:** `scripts/security/bundle-secret-scan.sh`
- **Commit:** `b0fb70f`

**2. [Rule 1 — Bug] bundle-secret-scan false-positive on UI placeholder + zod regex**
- **Found during:** SEC-08 bundle-secret-scan re-run post yq→awk fix
- **Issue:** bare prefix match `sk-ant-oat01-` flagged the token-form placeholder text (`placeholder: "sk-ant-oat01-..."`) and the bundled zod validator regex `/^sk-ant-oat01-[A-Za-z0-9_-]+$/` as leaks
- **Fix:** tightened patterns to require the prefix plus ≥20 key-charset chars, distinguishing real token material from UI hints and regex source text
- **Files modified:** `scripts/security/bundle-secret-scan.sh`
- **Commit:** `b0fb70f`

## Commits

| Commit    | Type  | Description |
| --------- | ----- | ----------- |
| `b5437fd` | docs  | defer SEC-01 rate-limit to v3.1 (prior run) |
| `cd52f6d` | feat  | add SEC-08 audit scripts (bun-audit, bundle-secret-scan, header-audit) (prior run) |
| `00a8262` | docs  | defer SEC-11 strict-CSP to v3.1 — 2-user panel, launch priority |
| `cddb739` | fix   | header-audit WARN-not-FAIL on CSP unsafe-inline |
| `b0fb70f` | docs  | bundle-scan + bun-audit + header-audit evidence logged |

## Verification

- [x] `scripts/security/bun-audit.sh` → exit 0, clean
- [x] `scripts/security/bundle-secret-scan.sh` → exit 0, clean (post-fix)
- [x] `scripts/security/header-audit.sh` → exit 0, 4/4 FAIL-gated checks ok, CSP WARN acknowledged
- [x] `.planning/REQUIREMENTS.md` reflects SEC-01 + SEC-11 deferrals and SEC-08 complete
- [x] `.planning/ROADMAP.md` Phase 22-02 line marked `[x]` with both deferrals called out
- [x] `.planning/STATE.md` phase-log entries for both SEC-01 and SEC-11 deferrals
- [x] `22-02-AUDIT-LOG.md` populated with raw evidence for all three D-22-07/08/09 gates

## Self-Check: PASSED

Created files:
- FOUND: scripts/security/bun-audit.sh
- FOUND: scripts/security/bundle-secret-scan.sh
- FOUND: scripts/security/header-audit.sh
- FOUND: .planning/phases/22-security-review-launch/22-02-AUDIT-LOG.md

Commits:
- FOUND: b5437fd, cd52f6d, 00a8262, cddb739, b0fb70f
