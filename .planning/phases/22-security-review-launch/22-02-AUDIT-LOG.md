# Phase 22 Plan 02 — Security Audit Log

Evidence log for SEC-08 (D-22-07, D-22-08, D-22-09). SEC-01 (D-22-06) deferred
to v3.1 — see plan file DEFERRED section. SEC-11 (strict CSP) deferred to v3.1
2026-04-21 — see `.planning/REQUIREMENTS.md` and commit `00a8262`.

## SEC-01 — Rate Limit Verification

**DEFERRED to v3.1** (decision 2026-04-21). Stock apt Caddy 2.6.2 on mcow lacks
`rate_limit` module; `caddyserver.com/api/download` upstream API verified broken
from mcow + nether (0-byte responses, ~35 min debug). Operator chose defer over
xcaddy self-build to accelerate launch. Pickup path documented in plan file
DEFERRED section.

## SEC-08 — bun audit (D-22-07)

Runner: `scripts/security/bun-audit.sh` — exit 0, clean.

```
[bun-audit] bun version: 1.3.5
[bun-audit] repo: /Users/admin/hub/workspace/homelab/apps/admin
[bun-audit] running: bun audit --audit-level=high
bun audit v1.3.5 (1e86cebd)
[bun-audit] clean — no HIGH/CRITICAL advisories
```

Date: 2026-04-21. Acceptance: zero HIGH/CRITICAL advisories. **PASS.**

## SEC-08 — Bundle secret scan (D-22-08)

Runner: `scripts/security/bundle-secret-scan.sh` — exit 0, clean.

Deviation (Rule 3 — blocking): initial scaffold used `yq`, not installed on
operator machine and not in repo bootstrap. Swapped to `awk` to extract
top-level SOPS keys from `secrets/mcow.sops.yaml` — SOPS-YAML leaves top-level
keys unencrypted (only values are `ENC[...]`), so no cryptographic work needed.
Zero new dependencies.

Deviation (Rule 1 — bug): initial token-prefix check flagged UI placeholder
text `"sk-ant-oat01-..."` and the bundled zod regex validator as leaks.
Tightened patterns to require the prefix **plus ≥20 key-charset chars** so
genuine token material is caught while UI hints and regex sources pass through.

Post-fix run:

```
[scan] checking /Users/admin/hub/workspace/homelab/apps/admin/.next/static for leakage of 5 SOPS key names
  - GF_SECURITY_ADMIN_USER
  - GF_SECURITY_ADMIN_PASSWORD
  - TELEGRAM_BOT_TOKEN
  - homelab_admin
  - proxmox_dashboard
[scan] clean — no SOPS key names or token prefixes in .next/static
```

Date: 2026-04-21. Acceptance: no SOPS key names + no live token strings in
`apps/admin/.next/static`. **PASS.**

## SEC-08 — Header re-audit (D-22-09)

Runner: `scripts/security/header-audit.sh` against `https://homelab.makscee.ru/`
— exit 0.

Raw response headers (both 307 → login and 200 on login page, identical policy
headers on both):

```
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://avatars.githubusercontent.com; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://github.com
permissions-policy: camera=(), microphone=(), geolocation=()
referrer-policy: strict-origin-when-cross-origin
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-content-type-options: nosniff
x-frame-options: DENY
```

Check breakdown:

| Check                                               | Gate  | Result |
| --------------------------------------------------- | ----- | ------ |
| CSP header present                                  | FAIL  | ok     |
| HSTS max-age ≥ 31536000 (actual: 63072000)          | FAIL  | ok     |
| X-Frame-Options: DENY                               | FAIL  | ok     |
| Referrer-Policy: strict-origin-when-cross-origin    | FAIL  | ok     |
| CSP contains no `unsafe-inline`                     | WARN  | WARN — SEC-11 deferred to v3.1 |

Deviation (operator decision 2026-04-21): CSP `unsafe-inline` downgraded from
FAIL to WARN. Internal 2-user admin panel, GitHub OAuth gated, XSS surface ≈
zero today. Strict CSP (nonce-based) tracked as SEC-11 in v3.1 hardening pass.
Mirrors Phase 17.1 WARN-not-FAIL pattern.

Date: 2026-04-21. Acceptance: all FAIL-gated headers present + correct;
CSP WARN acknowledged. **PASS.**
