---
phase: 22-security-review-launch
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - ansible/playbooks/templates/caddy-homelab-admin.conf.j2
  - scripts/security/bun-audit.sh
  - scripts/security/bundle-secret-scan.sh
  - scripts/security/header-audit.sh
  - .planning/phases/22-security-review-launch/22-02-AUDIT-LOG.md
autonomous: true
requirements: [SEC-01, SEC-08]
tags: [security, caddy, audit, rate-limit]
must_haves:
  truths:
    - "Caddy site block for homelab.makscee.ru enforces 60 req/min per IP on auth endpoints (/api/auth/*)"
    - "bun audit runs clean against apps/admin (zero HIGH/CRITICAL) — evidence logged to 22-02-AUDIT-LOG.md"
    - "Production bundle scan finds zero secret leakage (every SOPS var name absent from .next/ output)"
    - "Deployed header audit on https://homelab.makscee.ru shows CSP with no unsafe-inline, HSTS max-age >= 31536000, X-Frame-Options: DENY, Referrer-Policy: strict-origin-when-cross-origin"
  artifacts:
    - path: "ansible/playbooks/templates/caddy-homelab-admin.conf.j2"
      provides: "Caddy site block with rate_limit directive on auth paths"
      contains: "rate_limit"
    - path: "scripts/security/bun-audit.sh"
      provides: "Runnable bun audit wrapper with fail-on-high"
    - path: "scripts/security/bundle-secret-scan.sh"
      provides: "Scans apps/admin/.next/ for secret name leakage"
    - path: "scripts/security/header-audit.sh"
      provides: "curl-driven assertion of production response headers"
    - path: ".planning/phases/22-security-review-launch/22-02-AUDIT-LOG.md"
      provides: "Recorded evidence from all four security checks"
      contains: "bun audit"
  key_links:
    - from: "Caddy site block"
      to: "/api/auth/* route on homelab-admin"
      via: "rate_limit directive matcher"
      pattern: "rate_limit.*auth"
---

<objective>
Land SEC-01 (Caddy per-IP rate limit on auth routes) and execute SEC-08 security review surface items that are NOT threat-model aggregation (those go to plan 22-05). This plan covers D-22-06 (rate limit), D-22-07 (bun audit), D-22-08 (bundle scan), D-22-09 (header re-audit).

Purpose: Close SEC-01 + the code/config portion of SEC-08 before launch. Plan 22-05 handles header-spoofing integration test, Proxmox token scope re-verify, Tailnet-only ingress, and cross-phase SECURITY aggregation.

Output: Rate-limited Caddy config applied; four reusable audit scripts; AUDIT-LOG.md capturing evidence for all four checks.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/22-security-review-launch/22-CONTEXT.md
@.planning/REQUIREMENTS.md
@ansible/playbooks/templates/caddy-homelab-admin.conf.j2
@ansible/playbooks/deploy-homelab-admin.yml
@secrets/mcow.sops.yaml
</context>

<tasks>

<task type="auto">
  <name>Task 1: SEC-01 — Caddy 60/min per-IP rate limit on auth routes</name>
  <files>
    ansible/playbooks/templates/caddy-homelab-admin.conf.j2,
    ansible/playbooks/deploy-homelab-admin.yml
  </files>
  <read_first>
    - ansible/playbooks/templates/caddy-homelab-admin.conf.j2 (current site block)
    - ansible/playbooks/deploy-homelab-admin.yml (Caddy reload handler)
    - servers/nether/Caddyfile (reference pattern for Caddy directives on other sites — do not modify)
  </read_first>
  <action>
    Per D-22-06: implement SEC-01 = 60 req/min per-IP rate limit on auth routes.

    Caddy's stock build does NOT include rate_limit. Use the caddyserver/rate-limit plugin (xcaddy) OR the official mholt/caddy-ratelimit module. Precondition check at top of task:
    1. On mcow, `ssh root@mcow 'caddy list-modules 2>/dev/null | grep -i rate_limit'`. 
       - If present → skip install, proceed.
       - If absent → add an Ansible task in `deploy-homelab-admin.yml` to install caddy with the ratelimit module (`apt install caddy` replaced by xcaddy build OR use the `caddy` Debian package + `caddy-ratelimit` from github.com/mholt/caddy-ratelimit via xcaddy). Document the exact approach chosen at the top of the Caddy template.

    Template additions in `caddy-homelab-admin.conf.j2` — insert INSIDE the `homelab.makscee.ru {` site block, BEFORE the `reverse_proxy` directive:

    ```caddy
    # SEC-01: per-IP rate limit on auth routes (60 req/min)
    # D-22-06 — Phase 22 v3.0 launch gate
    @auth_routes path /api/auth/*
    rate_limit @auth_routes {
        zone auth_per_ip {
            key    {remote_host}
            events 60
            window 1m
        }
    }
    ```

    If the site block already has a `@api path /api/*` matcher, place the more specific `@auth_routes` first so it wins.

    Deploy: run `ansible-playbook -i ansible/inventory/hosts.yml ansible/playbooks/deploy-homelab-admin.yml --tags caddy` (or without tags if no tag exists — then full playbook). Expect handler `reload caddy` to fire.

    Validate live:
    ```bash
    # From Tailnet (e.g. cc-worker)
    for i in $(seq 1 80); do
      curl -s -o /dev/null -w "%{http_code}\n" https://homelab.makscee.ru/api/auth/signin
    done | sort | uniq -c
    ```
    Expect: first ~60 requests return 200/302/401, remainder return 429. Append the count breakdown to `.planning/phases/22-security-review-launch/22-02-AUDIT-LOG.md` under heading `## SEC-01 — Rate Limit Verification`.

    Do NOT add rate_limit to non-auth paths — CONTEXT.md locks scope to auth routes only.
  </action>
  <verify>
    <automated>grep -q 'rate_limit' ansible/playbooks/templates/caddy-homelab-admin.conf.j2 && grep -q '/api/auth/\*' ansible/playbooks/templates/caddy-homelab-admin.conf.j2 && grep -q 'events 60' ansible/playbooks/templates/caddy-homelab-admin.conf.j2</automated>
  </verify>
  <acceptance_criteria>
    - Caddy template contains rate_limit directive scoped to @auth_routes matcher = /api/auth/*, events 60, window 1m.
    - Ansible playbook deploys successfully (PLAY RECAP ok, no failed).
    - Live test from Tailnet: burst of 80 req/min shows 429 responses after ~60 successful.
    - 22-02-AUDIT-LOG.md has `## SEC-01 — Rate Limit Verification` section with raw counts.
  </acceptance_criteria>
  <done>Rate limit deployed on homelab.makscee.ru; live verification logged.</done>
</task>

<task type="auto">
  <name>Task 2: SEC-08 — bun audit + bundle secret scan + header re-audit</name>
  <files>
    scripts/security/bun-audit.sh,
    scripts/security/bundle-secret-scan.sh,
    scripts/security/header-audit.sh,
    .planning/phases/22-security-review-launch/22-02-AUDIT-LOG.md
  </files>
  <read_first>
    - secrets/mcow.sops.yaml (key names for leak scan — DO NOT dump decrypted values)
    - apps/admin/package.json (deps tree)
  </read_first>
  <action>
    Implement three audit scripts + record evidence. Scripts live under `scripts/security/` so they can be re-run as part of launch gate and in v3.x regression.

    ### 1. `scripts/security/bun-audit.sh` (D-22-07)
    ```bash
    #!/usr/bin/env bash
    set -euo pipefail
    cd "$(dirname "$0")/../../apps/admin"
    echo "[bun-audit] running bun audit"
    bun audit --audit-level=high
    # If transitive npm deps exist (check-ins), also run npm audit defensively
    if [ -f package-lock.json ]; then
      npm audit --audit-level=high
    fi
    echo "[bun-audit] clean"
    ```
    Make executable (`chmod +x`). Run it. Paste output into AUDIT-LOG under `## SEC-08 — bun audit (D-22-07)`.

    ### 2. `scripts/security/bundle-secret-scan.sh` (D-22-08)
    ```bash
    #!/usr/bin/env bash
    # Scans the production .next/ build for leakage of env var NAMES defined in
    # secrets/mcow.sops.yaml. Failing keys => fail build.
    set -euo pipefail
    REPO="$(cd "$(dirname "$0")/../.." && pwd)"
    BUNDLE="$REPO/apps/admin/.next"
    SOPS_FILE="$REPO/secrets/mcow.sops.yaml"

    if [ ! -d "$BUNDLE" ]; then
      echo "[scan] .next not present — building first"
      (cd "$REPO/apps/admin" && bun install --frozen-lockfile && bun run build)
    fi

    # Extract top-level SOPS keys via yq (no value decryption).
    KEYS=$(yq -r 'keys[] | select(. != "sops")' "$SOPS_FILE")
    echo "[scan] checking $BUNDLE for leak of these keys:"
    echo "$KEYS"

    LEAKED=0
    while IFS= read -r k; do
      # Grep literal key name. Any hit inside client JS bundle is a leak.
      if grep -rIn --include='*.js' --include='*.json' -- "$k" "$BUNDLE/static" 2>/dev/null; then
        echo "[scan] LEAK: $k present in client static bundle"
        LEAKED=1
      fi
    done <<< "$KEYS"

    # Also scan for well-known token prefixes
    for PREFIX in 'sk-ant-oat01-' 'ghp_' 'github_pat_' 'ghs_'; do
      if grep -rIn --include='*.js' --include='*.json' -- "$PREFIX" "$BUNDLE/static" 2>/dev/null; then
        echo "[scan] LEAK: token prefix $PREFIX present in client static bundle"
        LEAKED=1
      fi
    done

    if [ $LEAKED -ne 0 ]; then
      echo "[scan] FAIL — secret leakage detected"
      exit 1
    fi
    echo "[scan] clean — no SOPS key names or token prefixes in client bundle"
    ```
    Note: we scan `.next/static` (client-ship) specifically — server-only chunks may legitimately reference env var names. If apps/admin uses standalone output, adjust to scan `.next/static` + skip `.next/server`. Document the chosen scope in the script header.

    Run it. Log result under `## SEC-08 — Bundle secret scan (D-22-08)`.

    ### 3. `scripts/security/header-audit.sh` (D-22-09)
    ```bash
    #!/usr/bin/env bash
    set -euo pipefail
    URL="https://homelab.makscee.ru/"
    HEADERS=$(curl -sI "$URL")
    echo "$HEADERS"

    fail=0
    check() {
      local name="$1" pattern="$2"
      if echo "$HEADERS" | grep -iE "$pattern" >/dev/null; then
        echo "[ok] $name"
      else
        echo "[FAIL] $name — no match for: $pattern"
        fail=1
      fi
    }

    check "CSP present, no unsafe-inline"         '^content-security-policy:.*(?!unsafe-inline)'
    check "HSTS max-age >= 31536000"              '^strict-transport-security:.*max-age=(3153[6-9][0-9]{3}|[3-9][0-9]{7,})'
    check "X-Frame-Options: DENY"                 '^x-frame-options:[[:space:]]*DENY'
    check "Referrer-Policy: strict-origin-when-cross-origin" '^referrer-policy:[[:space:]]*strict-origin-when-cross-origin'

    # Separately FAIL if unsafe-inline appears
    if echo "$HEADERS" | grep -i 'content-security-policy' | grep -q 'unsafe-inline'; then
      echo "[FAIL] CSP contains unsafe-inline"
      fail=1
    fi

    exit $fail
    ```
    Run it from a Tailnet host (e.g. cc-worker). If any FAIL, patch `apps/admin/middleware.ts` (SEC-02 origin) or the Caddy header block to comply BEFORE recording pass. Log final passing result under `## SEC-08 — Header re-audit (D-22-09)`.

    ### AUDIT-LOG.md structure
    Create `.planning/phases/22-security-review-launch/22-02-AUDIT-LOG.md` with sections:
    - `## SEC-01 — Rate Limit Verification` (from task 1)
    - `## SEC-08 — bun audit (D-22-07)` with exit 0 + version + output tail
    - `## SEC-08 — Bundle secret scan (D-22-08)` with "clean" result + list of keys checked
    - `## SEC-08 — Header re-audit (D-22-09)` with full `curl -sI` output + each check's PASS line

    Do NOT include any decrypted secret values in the log. Key NAMES only.
  </action>
  <verify>
    <automated>test -x scripts/security/bun-audit.sh && test -x scripts/security/bundle-secret-scan.sh && test -x scripts/security/header-audit.sh && bash scripts/security/bun-audit.sh && bash scripts/security/header-audit.sh && grep -q 'SEC-08 — bun audit' .planning/phases/22-security-review-launch/22-02-AUDIT-LOG.md</automated>
  </verify>
  <acceptance_criteria>
    - Three scripts exist under scripts/security/ and are +x.
    - bun-audit.sh exits 0 (clean).
    - bundle-secret-scan.sh exits 0 against a fresh `bun run build` output.
    - header-audit.sh exits 0 against https://homelab.makscee.ru.
    - 22-02-AUDIT-LOG.md contains all four evidence sections; no decrypted secrets appear.
  </acceptance_criteria>
  <done>SEC-08 code/config gate passed; audit log shows evidence; scripts committed for re-run.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| WAN → Caddy | Public-facing TLS on homelab.makscee.ru; Caddy is the first line |
| Caddy → homelab-admin (socket) | Tailnet-only reverse proxy to unix socket / 127.0.0.1 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-22-02-01 | Denial of service | /api/auth/* endpoints | mitigate | SEC-01 Caddy rate_limit 60 req/min per IP (D-22-06); verified by 80-req burst test returning 429 after 60 |
| T-22-02-02 | Information disclosure | client JS bundle | mitigate | bundle-secret-scan.sh fails build if SOPS key names or known token prefixes present in .next/static (D-22-08) |
| T-22-02-03 | Spoofing / clickjacking | homelab.makscee.ru response | mitigate | header-audit.sh asserts X-Frame-Options DENY + CSP (no unsafe-inline) + HSTS + Referrer-Policy (D-22-09) |
| T-22-02-04 | Elevation of privilege via known-CVE dep | bun/npm deps | mitigate | bun-audit.sh + npm audit gate on --audit-level=high (D-22-07) |
| T-22-02-05 | Tampering with rate limiter config | Caddyfile template | accept | Template committed to git; change visible in PR diff; no runtime mutation |
</threat_model>

<verification>
- `grep -n 'rate_limit' ansible/playbooks/templates/caddy-homelab-admin.conf.j2` — present.
- `bash scripts/security/bun-audit.sh` exits 0.
- `bash scripts/security/bundle-secret-scan.sh` exits 0 on fresh build.
- `bash scripts/security/header-audit.sh` exits 0 against live prod.
- 22-02-AUDIT-LOG.md has 4 sections, each with evidence.
</verification>

<success_criteria>
- SEC-01 live in prod (verified 429 after burst).
- Four audit artefacts: three scripts + one evidence log.
- Zero HIGH/CRITICAL CVEs; zero bundle secret leakage; all four headers pass.
</success_criteria>

<output>
After completion, create `.planning/phases/22-security-review-launch/22-02-SUMMARY.md`:
- Live rate limit burst counts
- bun audit version + deps scanned
- Keys counted + scanned in bundle scan
- Full passing curl -sI header dump
- Any Caddy-module install steps taken on mcow
</output>
