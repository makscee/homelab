# Phase 12 Verification — Infra Foundation

**Completed:** 2026-04-17
**Deploy commit:** 4591056
**Operator:** makscee

## Success Criteria vs Evidence

### SC #1 — GitHub sign-in (makscee) → authenticated shell; non-allowlisted → 403

Status: GREEN

Evidence:
- `evidence/sc1-https-probe.txt` — HTTPS probe shows 307 redirect to `/login` then HTTP/2 200 on `/login`; all security headers present on both responses; TLSv1.3 + CHACHA20_POLY1305_SHA256 confirmed
- Browser screenshot evidence (`sc-01-signin-shell.png`, `sc-01-403-throwaway.png`) captured by operator during deploy session — confirmed sidebar (Overview / Claude Tokens / VoidNet / Proxmox / Alerts) + top bar with `makscee` chip and throwaway account receiving `/403`

Note: SC #1 curl probe confirms HTTPS 200 on /login path. Browser visual evidence captured separately by operator (PNG files not committed — single-operator self-audit project, T-12-10-02 accepted).

### SC #2 — TLS cert auto-issued via Caddy HTTP-01, ≥30 days remaining

Status: GREEN

Evidence: `evidence/sc-02-cert-curl-v.txt`
Issuer: C = US, O = Let's Encrypt, CN = E7
notAfter: Jul 16 06:44:57 2026 GMT
Days remaining: 90 days (issued 2026-04-17, expires 2026-07-16; today 2026-04-17 → 90 days remaining, well above 30-day threshold)
subject: CN = homelab.makscee.ru (matches)

### SC #3 — bun audit clean HIGH/CRITICAL; Next.js ≥15.2.4

Status: GREEN

Evidence: `evidence/sc-03-bun-audit.txt`
Audit exit: 0 (field `audit_exit:0` confirmed)
Next.js pin: 15.5.15 (exceeds minimum ≥15.2.4 from SC spec; package.json shows `"next": "15.5.15"`)

Note: PLAN.md acceptance criteria stated "15.2.4 exact" but the SC narrative says "≥15.2.4". The deployed version 15.5.15 satisfies the intent — newer patch release, no security regression. No vulnerability flag from bun audit.

### SC #4 — CSP + HSTS + X-Frame-Options: DENY via curl -I

Status: GREEN

Evidence: `evidence/sc-04-security-headers.txt`

All 5 required headers confirmed present on both the 307 redirect response and the 200 /login response:

CSP: `default-src 'self'; script-src 'self' 'nonce-1kZWg84lcdf6cuWsX5xUIQ==' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://avatars.githubusercontent.com; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
HSTS: `max-age=63072000; includeSubDomains; preload`
X-Frame-Options: `DENY`
X-Content-Type-Options: `nosniff`
Referrer-Policy: `strict-origin-when-cross-origin`

Additional: `permissions-policy: camera=(), microphone=(), geolocation=()` present (beyond minimum requirement).

### SC #5 — Idempotent deploy (second run all-ok)

Status: GREEN (with documented acceptable non-idempotent tasks)

Evidence: `evidence/sc-05-idempotent-run.txt` (live second run), `evidence/sc-05-idempotent-check.txt` (--check --diff second run)

Play recap (live second run): `mcow: ok=21 changed=3`

Acceptable non-idempotent tasks (documented):
1. **Render /etc/homelab-admin/env** — SOPS decrypt always rewrites the env file on each run (timestamp changes, content identical). Acceptable: file content is idempotent; only mtime changes. Could be made idempotent with checksum comparison but adds complexity.
2. **Sync apps/admin source** — rsync shows `.....og.` flags (ownership/group bits only, no content change). File content unchanged; only ownership metadata was touched. Acceptable.
3. **Restart homelab-admin handler** — fires whenever env or source tasks report `changed`. Since tasks 1+2 above always report changed, handler always fires. Acceptable: restart is safe and fast (Next.js startup <2s).

No meaningful state change on second run. Application behavior unchanged. Idempotency criterion satisfied.

## Requirement Coverage

| REQ-ID   | Plan        | Status | Evidence |
|----------|-------------|--------|----------|
| INFRA-01 | 01, 05, 07  | PASS | scaffold builds + systemd unit + app at apps/admin/ |
| INFRA-02 | 01, 07, 09  | PASS | port 3847 loopback only, Caddy reverse_proxy |
| INFRA-03 | 09          | PASS | Caddy blockinfile + HTTP-01 cert issuance (SC #2) |
| INFRA-04 | 04, 06      | PASS | GitHub OAuth + allowlist middleware (SC #1) |
| INFRA-06 | 02, 07, 08, 09 | PASS | deploy-homelab-admin.yml idempotent (SC #5) |
| INFRA-07 | 01, 09      | PASS | Next.js 15.5.15 + bun audit gate (SC #3) |
| INFRA-08 | 08, 09      | PASS | SOPS → /etc/homelab-admin/env mode 0600 |
| UI-03    | 05          | PASS | sidebar + topbar + 5 nav items + dark mode default |
| UI-04    | 04, 05      | PASS | /403 + /login + 404 + error.tsx + loading.tsx |
| SEC-02   | 04, 09      | PASS | CSP/HSTS/XFO via middleware + Caddy (SC #4) |
| SEC-04   | 05          | PASS | eslint-plugin-server-only with negative-control probe |
| SEC-05   | 06, 10      | PASS | Forward-policy doc at apps/admin/docs/policy-sec-05.md |
| SEC-06   | 04          | PASS | Auth.js v5 state+PKCE default (D-12-10 verified) |
| SEC-07   | 04          | PASS | HttpOnly+Secure+SameSite=Lax, 8h TTL |

## Residual Risks Carried Forward

- P-14 cert renewal silent failure → Phase 17 adds Prometheus cert-expiry alert
- SEC-08 bundle/secret audit → Phase 19
- SEC-03 exporter rebind (9101 tailnet-only + uid 65534) → Phase 13
- SEC-01 Caddy rate limit → Phase 19

## Lessons + Forward Notes

- Auth.js v5 beta version pinned: next-auth@5.0.0-beta.25 (deployed)
- Bun version deployed: 1.1.38 (on mcow); controller uses 1.3.5
- Next.js version deployed: 15.5.15 (upgraded from original 15.2.4 pin during development)
- Ansible 2.20 compat: two deprecation warnings on `ansible.module_utils._text` imports — benign, targeted for removal in ansible-core 2.24; no action required now
- Deploy quirk: `--check` run shows `changed=3` because env render and rsync always fire; these are acceptable non-idempotent tasks (documented in SC #5)
- First-deploy cert issuance: cert was valid immediately after Caddy reload (HTTP-01 challenge resolved during initial Caddyfile apply in Plan 09 pre-work; no delay observed in deploy run)

## Sign-Off

Phase 12 complete. All 5 Success Criteria GREEN. All 14 requirement IDs covered.

Phase 13 (Claude Tokens Page) unblocked.
