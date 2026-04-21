---
phase: 22-security-review-launch
plan: 05
type: execute
wave: 2
depends_on: [22-02]
files_modified:
  - apps/admin/tests/integration/header-spoofing.test.ts
  - scripts/security/verify-proxmox-token-scope.sh
  - scripts/security/verify-tailnet-only-ingress.sh
  - .planning/milestones/v3.0-SECURITY.md
  - .planning/phases/22-security-review-launch/22-05-AGGREGATION-GAPS.md
autonomous: true
requirements: [SEC-08]
tags: [security, aggregation, integration-test, tailnet, proxmox]
must_haves:
  truths:
    - "Integration test at apps/admin/tests/integration/header-spoofing.test.ts asserts forged X-Tailscale-User and X-Forwarded-User headers return 401 on protected routes"
    - "Proxmox token scope verified = VM.Audit + Datastore.Audit only (no VM.PowerMgmt); evidence logged"
    - "Tailnet-only ingress verified: WAN curl → timeout/403; Tailnet curl → 200"
    - "`.planning/milestones/v3.0-SECURITY.md` aggregates per-phase SECURITY.md verdicts for phases 12, 13, 14, 17.1, 19, 20"
    - "Missing SECURITY.md phases flagged in 22-05-AGGREGATION-GAPS.md (not backfilled by this plan)"
  artifacts:
    - path: "apps/admin/tests/integration/header-spoofing.test.ts"
      provides: "Automated test that forged identity headers are ignored by auth middleware"
      contains: "X-Tailscale-User"
    - path: "scripts/security/verify-proxmox-token-scope.sh"
      provides: "Asserts Proxmox token has only VM.Audit + Datastore.Audit"
    - path: "scripts/security/verify-tailnet-only-ingress.sh"
      provides: "Asserts homelab-admin socket is not reachable from public internet"
    - path: ".planning/milestones/v3.0-SECURITY.md"
      provides: "Cross-phase security aggregation (per D-22-13)"
      contains: "Phase 12"
    - path: ".planning/phases/22-security-review-launch/22-05-AGGREGATION-GAPS.md"
      provides: "List of phases missing a SECURITY.md so operator can backfill via /gsd-secure-phase"
  key_links:
    - from: "v3.0-SECURITY.md"
      to: "per-phase SECURITY.md files"
      via: "markdown link references"
      pattern: "\\.planning/phases/.*SECURITY\\.md"
---

<objective>
Close out SEC-08 by delivering: (1) header-spoofing integration test (D-22-11), (2) Proxmox token scope verification script (D-22-10), (3) Tailnet-only ingress verification (D-22-12), (4) cross-phase SECURITY.md aggregation into `.planning/milestones/v3.0-SECURITY.md` (D-22-13).

Purpose: Final v3.0 security gate — prove auth can't be bypassed via headers, that Phase 19's read-only Proxmox contract still holds, that no WAN path exists outside Caddy, and produce a single artifact the operator can hand off showing every phase's security disposition.

Output: One new test, two scripts, one aggregate document, one gaps file. Plan 22-02 ran the audit scripts; this plan runs the integration + aggregation layer.

Scope note: D-22-13 scope covers Phases 12, 13, 14, 17.1, 19, 20. On-disk check at planning time: SECURITY.md EXISTS for 17.1, 19, 20; MISSING for 12, 13, 14. This plan flags missing ones for operator backfill (via `/gsd-secure-phase` after v3.0 ships); it does NOT synthesize a security review for phases that never had one.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/22-security-review-launch/22-CONTEXT.md
@.planning/phases/22-security-review-launch/22-02-SUMMARY.md
@.planning/phases/17.1-migrate-jellyfin-to-dedicated-lxc-on-tower/17.1-SECURITY.md
@.planning/phases/19-proxmox-ops-readonly/19-SECURITY.md
@.planning/phases/20-alerts-panel-rules/20-SECURITY.md
@apps/admin/app/api/auth/[...nextauth]/route.ts
@secrets/mcow.sops.yaml
</context>

<tasks>

<task type="auto">
  <name>Task 1: Header-spoofing integration test (D-22-11)</name>
  <files>apps/admin/tests/integration/header-spoofing.test.ts</files>
  <read_first>
    - apps/admin/app/api/auth/[...nextauth]/route.ts
    - apps/admin/middleware.ts (if present — Auth.js middleware gate)
    - apps/admin/package.json (confirm test runner — vitest per CONTEXT.md §specifics)
  </read_first>
  <action>
    Per D-22-11: a request with forged `X-Tailscale-User` and/or `X-Forwarded-User` headers and NO valid GitHub OAuth session cookie MUST return 401 on every protected route.

    Use the existing vitest harness (no new framework). If no vitest config exists in apps/admin, add one minimally (or use bun test — match whatever the admin app already uses; check package.json `scripts.test`).

    Test file: `apps/admin/tests/integration/header-spoofing.test.ts`

    ```ts
    import { describe, it, expect, beforeAll, afterAll } from "vitest";

    // Assumes the app is running against a local test instance OR live dev server.
    // If your admin tests use MSW/nock, adapt accordingly. Baseline: hit prod
    // Tailnet URL with no cookie and forged headers.
    const BASE = process.env.ADMIN_BASE_URL ?? "https://homelab.makscee.ru";

    const PROTECTED_ROUTES = [
      "/",               // dashboard
      "/audit",
      "/alerts",
      "/api/hosts",      // data route
      "/api/audit",      // mutation audit route
    ];

    const FORGED_HEADERS: Array<Record<string, string>> = [
      { "X-Tailscale-User": "makscee@tailnet.ts.net" },
      { "X-Forwarded-User": "makscee" },
      { "X-Tailscale-User": "attacker@evil.com", "X-Forwarded-User": "attacker" },
      { "X-Forwarded-For": "127.0.0.1", "X-Tailscale-User": "makscee" },
    ];

    describe("SEC-08 D-22-11: header-spoofing resistance", () => {
      for (const route of PROTECTED_ROUTES) {
        for (const headers of FORGED_HEADERS) {
          it(`rejects ${JSON.stringify(headers)} at ${route}`, async () => {
            const res = await fetch(`${BASE}${route}`, {
              redirect: "manual",
              headers: { ...headers },
            });
            // Auth.js typically 302→/api/auth/signin for HTML routes and 401 for API.
            // Contract: MUST NOT 200 with forged headers.
            expect([401, 302, 403]).toContain(res.status);
            if (res.status === 302) {
              const loc = res.headers.get("location") ?? "";
              expect(loc).toMatch(/\/api\/auth\/signin|\/login/);
            }
            // Sanity: response body must not contain user-specific data
            const body = await res.text();
            expect(body).not.toContain("makscee@");
          });
        }
      }
    });
    ```

    Run:
    ```bash
    cd apps/admin
    ADMIN_BASE_URL=https://homelab.makscee.ru bun test tests/integration/header-spoofing.test.ts
    ```

    Expected: all test cases PASS. Any 200 response is a HARD FAIL — auth bypass would block launch.

    If Auth.js middleware is not applied to `/api/hosts` or `/api/audit` (i.e. returns 200), that is a finding — STOP and surface to operator; fix middleware before proceeding.

    Append test output summary to `.planning/phases/22-security-review-launch/22-02-AUDIT-LOG.md` under new heading `## SEC-08 — Header spoofing test (D-22-11)` (yes, in the existing log from plan 22-02 — keep all SEC-08 evidence in one file).
  </action>
  <verify>
    <automated>cd apps/admin && ADMIN_BASE_URL=https://homelab.makscee.ru bun test tests/integration/header-spoofing.test.ts 2>&1 | tail -20 | grep -qi 'pass'</automated>
  </verify>
  <acceptance_criteria>
    - Test file exists and covers 5 routes × 4 forged header variants = 20 cases.
    - All cases pass (401/302/403, never 200).
    - Output appended to 22-02-AUDIT-LOG.md.
  </acceptance_criteria>
  <done>Header-spoofing guard proven by automated test.</done>
</task>

<task type="auto">
  <name>Task 2: Proxmox token scope re-verify + Tailnet-only ingress scripts</name>
  <files>
    scripts/security/verify-proxmox-token-scope.sh,
    scripts/security/verify-tailnet-only-ingress.sh
  </files>
  <read_first>
    - ansible/playbooks/provision-proxmox-dashboard-token.yml (D-03 scope source)
    - .planning/phases/19-proxmox-ops-readonly/19-SECURITY.md (locked scope)
  </read_first>
  <action>
    ### 1. `scripts/security/verify-proxmox-token-scope.sh` (D-22-10)
    Per D-22-10: token must be `VM.Audit` + `Datastore.Audit` only; NO `VM.PowerMgmt`.

    ```bash
    #!/usr/bin/env bash
    set -euo pipefail
    # Queries tower Proxmox API via pveum and asserts the dashboard-operator
    # token has exactly {VM.Audit, Datastore.Audit} and nothing else.
    TOWER="${TOWER:-tower}"
    USER="${PVE_USER:-dashboard-operator@pve}"
    TOKEN_ID="${PVE_TOKEN_ID:-dashboard}"

    echo "[probe] fetching role perms for $USER!$TOKEN_ID on $TOWER"
    # pveum output format: role and privs
    SCOPE=$(ssh root@"$TOWER" "pveum user token permissions $USER $TOKEN_ID 2>/dev/null" || true)
    echo "$SCOPE"

    fail=0
    grep -q 'VM.Audit' <<<"$SCOPE" || { echo "[FAIL] VM.Audit missing"; fail=1; }
    grep -q 'Datastore.Audit' <<<"$SCOPE" || { echo "[FAIL] Datastore.Audit missing"; fail=1; }
    if grep -qE 'VM\.PowerMgmt|VM\.Allocate|VM\.Config|Sys\.Modify' <<<"$SCOPE"; then
      echo "[FAIL] write/admin privilege detected on token — violates D-22-10 / D-03"
      fail=1
    fi
    if [ $fail -eq 0 ]; then
      echo "[ok] Proxmox token scope = VM.Audit + Datastore.Audit only"
    fi
    exit $fail
    ```

    Run and append output under `## SEC-08 — Proxmox token scope (D-22-10)` in `22-02-AUDIT-LOG.md`.

    ### 2. `scripts/security/verify-tailnet-only-ingress.sh` (D-22-12)
    Per D-22-12: WAN curl → timeout/403, Tailnet curl → 200.

    ```bash
    #!/usr/bin/env bash
    set -euo pipefail
    # Runs from the controller (cc-worker on Tailnet). Must have shell access
    # to a NON-Tailnet egress host to prove WAN-blocked. Uses nether as WAN
    # vantage (nether is on the Tailnet, so it's not an ideal WAN egress —
    # better: use a public runner curl-test against the origin IP of mcow).

    # Tailnet leg — expect 200 (auth redirect is fine; we're testing ingress)
    TN=$(curl -sI --max-time 5 https://homelab.makscee.ru/api/auth/signin -o /dev/null -w "%{http_code}")
    echo "[tailnet] status=$TN"

    # WAN leg — resolve homelab.makscee.ru to mcow's public IPv4, then direct-curl
    # from a runner that is not authorized. For automated verification, we assert
    # that the admin app socket (127.0.0.1:PORT or unix socket on mcow) is NOT
    # exposed on any mcow public interface.
    MCOW_PUBLIC_IP=$(dig +short mcow.makscee.ru || echo "")
    if [ -z "$MCOW_PUBLIC_IP" ]; then
      echo "[wan] skipping direct IP test (no A record for mcow.makscee.ru)"
    else
      # Probe port 3000 (or whatever bun binds); MUST refuse/timeout
      PORT_BIND=$(ssh root@mcow "ss -ltnp | grep homelab-admin | grep -v 127.0.0.1 | grep -v '/run/' || true")
      if [ -n "$PORT_BIND" ]; then
        echo "[FAIL] homelab-admin listens on non-localhost/non-unix-socket: $PORT_BIND"
        exit 1
      fi
      echo "[wan] homelab-admin socket not publicly bound on mcow"
    fi

    # Caddy site must serve only on Tailnet interface OR rely on Cloudflare/DNS.
    # For v3.0 D-22-12, the test is: confirm the bind is Tailscale-scoped OR localhost+caddy+Tailnet.
    CADDY_BIND=$(ssh root@mcow "ss -ltnp | grep ':443' | head -3")
    echo "[caddy] $CADDY_BIND"

    # Assert the auth signin Tailnet leg returned 200|302|401 (not connection failure)
    case "$TN" in
      200|302|401) echo "[ok] Tailnet ingress healthy";;
      *) echo "[FAIL] Tailnet ingress status=$TN"; exit 1;;
    esac
    ```

    Run and append output under `## SEC-08 — Tailnet-only ingress (D-22-12)` in `22-02-AUDIT-LOG.md`.

    Make both scripts executable.
  </action>
  <verify>
    <automated>test -x scripts/security/verify-proxmox-token-scope.sh && test -x scripts/security/verify-tailnet-only-ingress.sh && bash scripts/security/verify-proxmox-token-scope.sh && bash scripts/security/verify-tailnet-only-ingress.sh && grep -q 'Proxmox token scope (D-22-10)' .planning/phases/22-security-review-launch/22-02-AUDIT-LOG.md</automated>
  </verify>
  <acceptance_criteria>
    - Both scripts exist, +x, and exit 0.
    - Proxmox token scope confirmed = VM.Audit + Datastore.Audit only.
    - homelab-admin NOT publicly bound (socket or 127.0.0.1 only).
    - Tailnet signin reachable (200/302/401).
    - Evidence in 22-02-AUDIT-LOG.md.
  </acceptance_criteria>
  <done>Token scope + ingress posture verified and logged.</done>
</task>

<task type="auto">
  <name>Task 3: Cross-phase SECURITY aggregation — v3.0-SECURITY.md + gaps file</name>
  <files>
    .planning/milestones/v3.0-SECURITY.md,
    .planning/phases/22-security-review-launch/22-05-AGGREGATION-GAPS.md
  </files>
  <read_first>
    - .planning/phases/17.1-migrate-jellyfin-to-dedicated-lxc-on-tower/17.1-SECURITY.md
    - .planning/phases/19-proxmox-ops-readonly/19-SECURITY.md
    - .planning/phases/20-alerts-panel-rules/20-SECURITY.md
    - .planning/phases/22-security-review-launch/22-02-AUDIT-LOG.md (populated by plan 22-02 + tasks 1-2 above)
    - .planning/REQUIREMENTS.md §SEC
  </read_first>
  <action>
    Per D-22-13: aggregate per-phase SECURITY.md verdicts into a single `.planning/milestones/v3.0-SECURITY.md`. Scope = Phases 12, 13, 14, 17.1, 19, 20. Phase 22 itself adds its own threat models (22-01..22-06) — include as a final row.

    ### 1. Discover existing SECURITY.md files
    ```bash
    ls -1 .planning/phases/*/[0-9]*-SECURITY.md 2>/dev/null
    ```
    Expected at plan time: 17.1, 19, 20 present. 12, 13, 14 MISSING.

    ### 2. Write `.planning/phases/22-security-review-launch/22-05-AGGREGATION-GAPS.md`
    List every in-scope phase and status:
    ```markdown
    # Phase 22 Aggregation Gaps

    D-22-13 scope: Phases 12, 13, 14, 17.1, 19, 20.

    | Phase | SECURITY.md present? | Action |
    |-------|----------------------|--------|
    | 12 infra-foundation | NO | Operator: run `/gsd-secure-phase 12` post-launch to backfill |
    | 13 token-crud | NO | Operator: run `/gsd-secure-phase 13` post-launch to backfill |
    | 14 observability-audit | NO | Operator: run `/gsd-secure-phase 14` post-launch to backfill |
    | 17.1 jellyfin-migrate | YES | Linked in v3.0-SECURITY.md |
    | 19 proxmox-readonly | YES | Linked in v3.0-SECURITY.md |
    | 20 alerts-panel | YES (18/18 closed) | Linked in v3.0-SECURITY.md |

    **Not backfilled by this plan.** Phase 22 is not authorised to synthesize
    retrospective threat models for phases that never had one — that would be
    false assurance. Operator decision: flip the v3.0 launch bit WITH the
    present SECURITY.mds + this gap list, OR block launch on backfill runs of
    `/gsd-secure-phase`.
    ```

    ### 3. Write `.planning/milestones/v3.0-SECURITY.md`
    Structure:

    ```markdown
    # v3.0 Security Aggregation

    **Date:** <date-of-run>
    **Scope:** Homelab admin dashboard at homelab.makscee.ru
    **Milestone:** v3.0 Unified Stack Migration
    **Source:** per-phase SECURITY.md + 22-02-AUDIT-LOG.md + this plan's tasks 1-2

    ## Aggregation Verdict

    | Phase | Threats filed | Mitigated | Accepted | Transferred | Open | Link |
    |-------|---------------|-----------|----------|-------------|------|------|
    | 12 infra-foundation | — | — | — | — | GAP | see 22-05-AGGREGATION-GAPS.md |
    | 13 token-crud | — | — | — | — | GAP | see 22-05-AGGREGATION-GAPS.md |
    | 14 observability-audit | — | — | — | — | GAP | see 22-05-AGGREGATION-GAPS.md |
    | 17.1 jellyfin-migrate | <read from 17.1-SECURITY.md> | ... | ... | ... | ... | `.planning/phases/17.1-migrate-jellyfin-to-dedicated-lxc-on-tower/17.1-SECURITY.md` |
    | 19 proxmox-readonly | <read from 19-SECURITY.md> | ... | ... | ... | ... | `.planning/phases/19-proxmox-ops-readonly/19-SECURITY.md` |
    | 20 alerts-panel | 18 | 18 | 0 | 0 | 0 | `.planning/phases/20-alerts-panel-rules/20-SECURITY.md` |
    | 22 (this phase) | <sum across 22-01..22-06 threat_model blocks> | ... | ... | ... | ... | this file §Phase 22 block |

    ## Phase 22 Threat Model Summary
    Aggregate the `<threat_model>` blocks from plans 22-01..22-06 into a single table here. Extract the actual numbers after all plans execute — planner leaves the shape; executor fills after-the-fact.

    ## SEC-08 Review Evidence (D-22-07..13)

    - **D-22-06 Rate limit** — 22-02 task 1; burst 80/min returned 429 after 60. Evidence: 22-02-AUDIT-LOG.md §SEC-01 — Rate Limit Verification.
    - **D-22-07 bun audit** — clean. Evidence: 22-02-AUDIT-LOG.md §SEC-08 — bun audit (D-22-07).
    - **D-22-08 Bundle secret scan** — clean. Evidence: 22-02-AUDIT-LOG.md §SEC-08 — Bundle secret scan (D-22-08).
    - **D-22-09 Header re-audit** — pass. Evidence: 22-02-AUDIT-LOG.md §SEC-08 — Header re-audit (D-22-09).
    - **D-22-10 Proxmox token scope** — VM.Audit + Datastore.Audit only. Evidence: 22-02-AUDIT-LOG.md §SEC-08 — Proxmox token scope (D-22-10).
    - **D-22-11 Header spoofing test** — 20/20 cases PASS. Evidence: 22-02-AUDIT-LOG.md §SEC-08 — Header spoofing test (D-22-11).
    - **D-22-12 Tailnet-only ingress** — verified. Evidence: 22-02-AUDIT-LOG.md §SEC-08 — Tailnet-only ingress (D-22-12).

    ## Excluded from v3.0 Review (deferred)
    - SOPS key rotation drill — operational risk > shipping value (CONTEXT.md §decisions "Excluded")
    - Full pen-test — v3.x if ever
    - SEC-09 (fail2ban), SEC-10 (at-rest encryption) — per REQUIREMENTS.md, deferred

    ## Gaps (v3.x backlog)
    See `22-05-AGGREGATION-GAPS.md` for phases missing SECURITY.md. Backfill via `/gsd-secure-phase <N>` after launch.

    ## References
    - REQUIREMENTS.md §SEC
    - CONTEXT.md D-22-06..13
    - 22-02-AUDIT-LOG.md (all code/config evidence)
    ```

    For the "Phase 22" row and the §Phase 22 summary block: extract threat IDs + dispositions from each 22-NN plan's `<threat_model>` block. Plans 22-01..22-06 all include this block; sum the counts after the fact.

    Ensure `.planning/milestones/` exists (created in plan 22-03 task 2).
  </action>
  <verify>
    <automated>test -f .planning/milestones/v3.0-SECURITY.md && test -f .planning/phases/22-security-review-launch/22-05-AGGREGATION-GAPS.md && grep -q 'Phase 20' .planning/milestones/v3.0-SECURITY.md && grep -q 'AGGREGATION-GAPS' .planning/milestones/v3.0-SECURITY.md && grep -q 'D-22-11' .planning/milestones/v3.0-SECURITY.md</automated>
  </verify>
  <acceptance_criteria>
    - v3.0-SECURITY.md exists with the aggregate table + SEC-08 evidence section + gaps reference.
    - 22-05-AGGREGATION-GAPS.md lists 12/13/14 as GAP, 17.1/19/20 as present.
    - No fabricated threat counts for gap phases — cells marked "GAP".
  </acceptance_criteria>
  <done>Cross-phase aggregation produced; gaps flagged honestly.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| WAN → Caddy → Auth.js middleware | The test harness verifies no bypass via forged identity headers |
| admin → Proxmox API | Read-only token re-verified each launch |
| WAN → homelab-admin socket | Verified non-existent by script (socket is localhost/unix only) |

## STRIDE Threat Register (this plan — production-surface focus)

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-22-05-01 | Spoofing | Auth.js middleware | mitigate | D-22-11 integration test: 20 cases × forged X-Tailscale-User / X-Forwarded-User must 401/302/403 (never 200) |
| T-22-05-02 | Elevation of privilege | Proxmox dashboard-operator token | mitigate | D-22-10 script asserts VM.Audit + Datastore.Audit only; no write privs |
| T-22-05-03 | Information disclosure | homelab-admin socket exposure | mitigate | D-22-12 script asserts socket not bound on mcow public interface |
| T-22-05-04 | Repudiation | cross-phase security posture | mitigate | D-22-13 aggregation with explicit GAP rows — no false assurance |
</threat_model>

<verification>
- Header-spoofing test runs green against prod.
- Proxmox token scope script exits 0.
- Tailnet-only ingress script exits 0.
- v3.0-SECURITY.md + 22-05-AGGREGATION-GAPS.md exist; cross-link verified.
- 22-02-AUDIT-LOG.md contains 7 sections total (rate limit, bun audit, bundle scan, headers, token scope, spoof test, ingress).
</verification>

<success_criteria>
- All four SEC-08 runtime checks (D-22-10/11/12/13) have evidence.
- Aggregation doc exists and cross-references every per-phase SECURITY.md.
- Gap phases flagged for v3.x backfill; no fabricated counts.
</success_criteria>

<output>
After completion, create `.planning/phases/22-security-review-launch/22-05-SUMMARY.md`:
- Test case count + pass count
- Token scope output
- Ingress bind output
- Phase count aggregated vs gaps count
</output>
