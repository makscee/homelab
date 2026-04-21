---
phase: 22-security-review-launch
plan: 06
type: execute
wave: 2
depends_on: [22-03]
files_modified:
  - servers/docker-tower/monitoring/prometheus/prometheus.yml
  - servers/docker-tower/monitoring/prometheus/alerts/homelab.yml
  - servers/docker-tower/monitoring/prometheus/tests/homelab_test.yml
  - apps/admin/app/api/health/route.ts
  - scripts/launch/check-dns-tls.sh
  - apps/admin/README.md
  - .planning/milestones/v3.0-RUNBOOK.md
autonomous: true
requirements: [SEC-08]
tags: [launch, monitoring, dns, tls, handoff]
must_haves:
  truths:
    - "Prometheus on docker-tower scrapes homelab-admin (mcow Tailnet IP) and surfaces up/down state"
    - "Alert rule `HomelabAdminDown` fires when up==0 for >2m; rendered on /alerts page (ALERT-01 pipeline)"
    - "`/api/health` endpoint returns 200 JSON health probe on homelab-admin (consumable by scrape)"
    - "`scripts/launch/check-dns-tls.sh` verifies homelab.makscee.ru DNS resolves + cert expiry > 30 days"
    - "`apps/admin/README.md` is an operator handoff doc linking to v3.0-RUNBOOK.md and describing day-1 usage"
  artifacts:
    - path: "servers/docker-tower/monitoring/prometheus/alerts/homelab.yml"
      provides: "HomelabAdminDown alert rule"
      contains: "HomelabAdminDown"
    - path: "apps/admin/app/api/health/route.ts"
      provides: "Scrape-friendly health endpoint"
    - path: "scripts/launch/check-dns-tls.sh"
      provides: "DNS + TLS expiry gate"
    - path: "apps/admin/README.md"
      provides: "Operator handoff"
      contains: "v3.0-RUNBOOK.md"
  key_links:
    - from: "prometheus.yml"
      to: "homelab-admin on mcow"
      via: "scrape job -> /api/health (or /metrics if exposed)"
      pattern: "homelab-admin"
    - from: "alerts/homelab.yml"
      to: "/alerts page"
      via: "Alertmanager -> admin UI (ALERT-01 pipeline)"
      pattern: "HomelabAdminDown"
---

<objective>
Close the final launch checklist items: admin self-monitoring (D-22-17), DNS/TLS validity check (D-22-18), operator handoff README (D-22-19). This plan depends on 22-03 (runbook exists to link from README) and completes v3.0's ship gate.

Purpose: Launch-complete state — operator has a runbook, a monitored service, DNS/TLS automation, and a README that points a fresh operator at day-1 usage.

Output: Prometheus scrape + alert rule; health endpoint; DNS/TLS check script; README.md; final runbook edit linking the new check script.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/22-security-review-launch/22-CONTEXT.md
@.planning/phases/22-security-review-launch/22-03-SUMMARY.md
@.planning/milestones/v3.0-RUNBOOK.md
@servers/docker-tower/monitoring/prometheus/prometheus.yml
@servers/docker-tower/monitoring/prometheus/alerts/homelab.yml
@servers/docker-tower/monitoring/prometheus/tests/homelab_test.yml
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Self-monitoring — health endpoint + Prometheus scrape + alert rule</name>
  <files>
    apps/admin/app/api/health/route.ts,
    servers/docker-tower/monitoring/prometheus/prometheus.yml,
    servers/docker-tower/monitoring/prometheus/alerts/homelab.yml,
    servers/docker-tower/monitoring/prometheus/tests/homelab_test.yml
  </files>
  <read_first>
    - servers/docker-tower/monitoring/prometheus/prometheus.yml (existing scrape_configs)
    - servers/docker-tower/monitoring/prometheus/alerts/homelab.yml (existing rule groups)
    - servers/docker-tower/monitoring/prometheus/tests/homelab_test.yml (promtool test structure)
  </read_first>
  <action>
    Per D-22-17: Prometheus scrapes `homelab-admin.service` up/down; alert on down > 2m; surface in /alerts (reuses ALERT-01 pipeline — Alertmanager already feeds the admin page).

    ### 1. `apps/admin/app/api/health/route.ts`
    ```ts
    import "server-only";
    import { NextResponse } from "next/server";

    export const runtime = "nodejs";
    export const dynamic = "force-dynamic";

    // Scrape-friendly health. Does NOT require auth (middleware must allowlist this path).
    export async function GET() {
      return NextResponse.json(
        {
          status: "ok",
          service: "homelab-admin",
          ts: new Date().toISOString(),
        },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }
    ```

    IMPORTANT: ensure the Auth.js middleware (or any custom middleware) allowlists `/api/health` so Prometheus can hit it without a session. Update `apps/admin/middleware.ts` matcher if needed:
    ```ts
    // in config.matcher, exclude /api/health
    matcher: ["/((?!api/auth|api/health|_next|favicon).*)"]
    ```
    Re-deploy admin after this edit (via the standard ansible-playbook deploy).

    ### 2. `servers/docker-tower/monitoring/prometheus/prometheus.yml`
    Add a new scrape job. The app does not natively expose `/metrics`; we use `/api/health` probed via blackbox OR the simpler `probe_http` approach. Cleanest path: use the existing blackbox-exporter pattern if one exists; otherwise add a minimal `http` scrape and rely on Prometheus' `up` metric for the target.

    Append to `scrape_configs`:
    ```yaml
    - job_name: 'homelab-admin'
      scrape_interval: 30s
      scrape_timeout: 10s
      metrics_path: '/api/health'
      scheme: 'https'
      static_configs:
        - targets: ['homelab.makscee.ru']
          labels:
            service: 'homelab-admin'
            host: 'mcow'
    ```
    Prometheus will treat any non-2xx response as `up=0`. The /api/health endpoint returning 200 JSON is sufficient (Prometheus parses 0 metrics but updates `up`).

    Note: if scraping over https from docker-tower to homelab.makscee.ru routes through WAN (it shouldn't — both on Tailnet; Caddy on mcow answers for homelab.makscee.ru via Tailnet too), prefer Tailnet IP to avoid WAN loop. If `homelab.makscee.ru` doesn't resolve Tailnet-private, use `mcow` hostname (100.101.0.9) with a Host header override:
    ```yaml
    - targets: ['100.101.0.9']
      relabel_configs:
        - target_label: __param_target
          replacement: 'https://100.101.0.9/api/health'
        - source_labels: [__address__]
          target_label: __address__
          replacement: '100.101.0.9:443'
    ```
    Pick whichever works after `promtool check config` and a live curl probe from docker-tower to the target.

    Reload prometheus: `ssh root@docker-tower 'docker compose -f /opt/homelab/servers/docker-tower/monitoring/docker-compose.yml exec prometheus kill -HUP 1'` OR redeploy via `ansible-playbook ansible/playbooks/deploy-docker-tower.yml`.

    ### 3. `servers/docker-tower/monitoring/prometheus/alerts/homelab.yml`
    Append rule group (or add to existing `homelab` group):
    ```yaml
      - alert: HomelabAdminDown
        expr: up{service="homelab-admin"} == 0
        for: 2m
        labels:
          severity: critical
          service: homelab-admin
          phase: "22"
        annotations:
          summary: "Homelab admin dashboard is down"
          description: "homelab-admin.service on mcow has been unreachable for >2m. Check systemctl status homelab-admin and journalctl -u homelab-admin on mcow. Runbook §9 (Common Failure Modes)."
          runbook_url: "file:///Users/admin/hub/workspace/homelab/.planning/milestones/v3.0-RUNBOOK.md#9-common-failure-modes"
    ```

    ### 4. `servers/docker-tower/monitoring/prometheus/tests/homelab_test.yml`
    Add a promtool test case covering the new alert:
    ```yaml
    rule_files:
      - ../alerts/homelab.yml

    evaluation_interval: 1m

    tests:
      - interval: 30s
        input_series:
          - series: 'up{service="homelab-admin",host="mcow"}'
            values: '0 0 0 0 0 0'
        alert_rule_test:
          - eval_time: 3m
            alertname: HomelabAdminDown
            exp_alerts:
              - exp_labels:
                  severity: critical
                  service: homelab-admin
                  phase: "22"
                  host: mcow
                exp_annotations:
                  summary: "Homelab admin dashboard is down"
                  description: "homelab-admin.service on mcow has been unreachable for >2m. Check systemctl status homelab-admin and journalctl -u homelab-admin on mcow. Runbook §9 (Common Failure Modes)."
                  runbook_url: "file:///Users/admin/hub/workspace/homelab/.planning/milestones/v3.0-RUNBOOK.md#9-common-failure-modes"
    ```
    (Adjust to match existing file's structure — this file already has test cases for claude-usage rules; merge accordingly rather than overwriting.)

    Run: `promtool test rules servers/docker-tower/monitoring/prometheus/tests/homelab_test.yml` — must pass.

    ### 5. Verify end-to-end
    - `curl -sf https://homelab.makscee.ru/api/health` returns `{"status":"ok", ...}`.
    - Prometheus target `homelab-admin` shows `up=1` at `http://docker-tower:9090/targets`.
    - Manually stop the service: `ssh root@mcow 'systemctl stop homelab-admin'` → wait 2.5 min → confirm `HomelabAdminDown` firing in Alertmanager → visible on `/alerts` page (ALERT-01 consumer). Restart service immediately after evidence capture: `ssh root@mcow 'systemctl start homelab-admin'`.
  </action>
  <verify>
    <automated>test -f apps/admin/app/api/health/route.ts && grep -q 'HomelabAdminDown' servers/docker-tower/monitoring/prometheus/alerts/homelab.yml && promtool test rules servers/docker-tower/monitoring/prometheus/tests/homelab_test.yml 2>&1 | grep -qi 'SUCCESS'</automated>
  </verify>
  <acceptance_criteria>
    - /api/health returns 200 JSON without auth.
    - Prometheus scrape job homelab-admin live; up=1.
    - Alert rule HomelabAdminDown promtool-tested.
    - Induced-downtime test produced firing alert visible on /alerts page.
  </acceptance_criteria>
  <done>Self-monitoring live and proven.</done>
</task>

<task type="auto">
  <name>Task 2: DNS/TLS validity check + operator README handoff</name>
  <files>
    scripts/launch/check-dns-tls.sh,
    apps/admin/README.md,
    .planning/milestones/v3.0-RUNBOOK.md
  </files>
  <read_first>
    - .planning/milestones/v3.0-RUNBOOK.md (plan 22-03 output; add a DNS/TLS entry)
    - CLAUDE.md (infrastructure map — domain, Tailscale)
    - .planning/phases/22-security-review-launch/22-CONTEXT.md (D-22-18, D-22-19)
  </read_first>
  <action>
    ### 1. `scripts/launch/check-dns-tls.sh` (D-22-18)
    ```bash
    #!/usr/bin/env bash
    set -euo pipefail
    HOST="${HOST:-homelab.makscee.ru}"
    MIN_DAYS="${MIN_DAYS:-30}"

    # DNS resolves?
    IP=$(dig +short "$HOST" | tail -1 || true)
    if [ -z "$IP" ]; then
      echo "[FAIL] DNS: $HOST does not resolve"
      exit 1
    fi
    echo "[ok] DNS: $HOST -> $IP"

    # TLS handshake + cert expiry
    END=$(echo | openssl s_client -servername "$HOST" -connect "$HOST:443" 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)
    if [ -z "$END" ]; then
      echo "[FAIL] TLS: could not fetch cert for $HOST"
      exit 1
    fi
    echo "[cert] notAfter=$END"

    END_EPOCH=$(date -j -f "%b %e %H:%M:%S %Y %Z" "$END" +%s 2>/dev/null || date -d "$END" +%s)
    NOW_EPOCH=$(date +%s)
    DAYS_LEFT=$(( (END_EPOCH - NOW_EPOCH) / 86400 ))
    echo "[cert] days_left=$DAYS_LEFT"
    if [ "$DAYS_LEFT" -lt "$MIN_DAYS" ]; then
      echo "[FAIL] TLS: cert expires in $DAYS_LEFT days (< $MIN_DAYS)"
      exit 1
    fi
    echo "[ok] TLS: cert valid > $MIN_DAYS days"
    ```
    Run. Append output to `.planning/milestones/v3.0-RUNBOOK.md` §10 (DNS/TLS Check) — replace the placeholder line with the live evidence.

    ### 2. `apps/admin/README.md` (D-22-19)
    Write a focused operator handoff (not developer deep-dive — keep <100 lines). Structure:

    ```markdown
    # homelab-admin

    Private infrastructure dashboard for the homelab at <https://homelab.makscee.ru>. Tailnet-only ingress; GitHub OAuth sign-in; allowlist (initially: makscee). Runs on mcow as `homelab-admin.service`.

    ## Day-1 Usage

    1. Sign in with GitHub at <https://homelab.makscee.ru>. You must be on the Tailnet.
    2. Dashboard `/` shows per-host CPU/memory/disk/container stats for 6 Tailnet hosts.
    3. `/audit` lists every mutation action across the system (append-only).
    4. `/alerts` lists Alertmanager firing alerts (read-only; link-out for ack/silence).
    5. `/tokens`, `/voidnet`, `/proxmox` — see runbook §1 for status of each.

    ## Operator Procedures

    All day-2 operations — deploy, rollback, secret rotation, Caddy reload, Auth.js session reset, exporter restart, backup/restore, DNS/TLS check, failure modes — are in the runbook:

    **→ [v3.0 Runbook](../../.planning/milestones/v3.0-RUNBOOK.md)**

    ## Architecture at a Glance

    - Next.js 15 + React 19 + TypeScript under Bun 1.1.38, systemd unit on mcow.
    - Caddy on mcow reverse-proxies `homelab.makscee.ru` to the app socket (SEC-01 rate limit on `/api/auth/*` = 60 req/min per IP).
    - SQLite audit log at `/var/lib/homelab-admin/audit.db`, nightly backup at 03:17 UTC.
    - Prometheus on docker-tower scrapes `/api/health` every 30s; `HomelabAdminDown` alerts after 2m.
    - Shared UI primitives live at `/Users/admin/hub/knowledge/standards/ui-kit/` — not a published package; imported relatively.

    ## Links

    - Runbook: [.planning/milestones/v3.0-RUNBOOK.md](../../.planning/milestones/v3.0-RUNBOOK.md)
    - Security aggregation: [.planning/milestones/v3.0-SECURITY.md](../../.planning/milestones/v3.0-SECURITY.md)
    - Requirements: [.planning/REQUIREMENTS.md](../../.planning/REQUIREMENTS.md)
    - Infrastructure map: [CLAUDE.md](../../CLAUDE.md)

    ## Emergency Stop

    ```bash
    ssh root@mcow 'systemctl stop homelab-admin'
    ```
    Site returns 502 via Caddy. Restart with `systemctl start homelab-admin`. Rollback to a previous git sha: runbook §3.
    ```

    ### 3. Runbook §10 update
    Replace the §10 "DNS / TLS Check" placeholder from plan 22-03 with:
    ```markdown
    ## 10. DNS / TLS Check

    Run: `bash scripts/launch/check-dns-tls.sh`

    Asserts:
    - `homelab.makscee.ru` resolves (A/AAAA).
    - TLS cert is valid for > 30 days.

    Last run: <paste the passing output here>.

    Failure action: check Caddy's LE renewal state on mcow with `ssh root@mcow 'journalctl -u caddy --since "24 hours ago" | grep -i "certificate\|acme"'`.
    ```
  </action>
  <verify>
    <automated>test -x scripts/launch/check-dns-tls.sh && bash scripts/launch/check-dns-tls.sh && test -f apps/admin/README.md && grep -q 'v3.0-RUNBOOK' apps/admin/README.md && grep -q 'check-dns-tls.sh' .planning/milestones/v3.0-RUNBOOK.md</automated>
  </verify>
  <acceptance_criteria>
    - check-dns-tls.sh exists, +x, and passes against production.
    - apps/admin/README.md links to the runbook and describes day-1 usage.
    - Runbook §10 updated with live check-dns-tls.sh output.
  </acceptance_criteria>
  <done>Launch checklist complete — DNS/TLS guarded, README hands off to operator.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Prometheus (docker-tower) → homelab-admin /api/health | Internal Tailnet scrape; no auth on /api/health by design |
| scripts/launch/check-dns-tls.sh → public DNS + TLS | Read-only probe; no secrets involved |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-22-06-01 | Information disclosure | /api/health endpoint | accept | Returns only {status, service, ts}; no user/session data. Middleware allowlists; still reachable only via Caddy (Tailnet-fronted) per D-22-12 |
| T-22-06-02 | Denial of service | /api/health probe storm | accept | SEC-01 only rate-limits /api/auth/*. /api/health is cheap (no DB); scrape is 30s interval; not a DoS vector |
| T-22-06-03 | Tampering | prometheus rule file | accept | Git-tracked; promtool test guards syntax; change visible in PR diff |
| T-22-06-04 | Repudiation | DNS/TLS cert expiry going unnoticed | mitigate | check-dns-tls.sh gates launch and is re-runnable in a future cron if operator wants |
</threat_model>

<verification>
- `/api/health` returns 200 JSON and is allowlisted through middleware.
- Prometheus target up=1; `HomelabAdminDown` alert fires under induced-downtime test.
- `promtool test rules` passes.
- `check-dns-tls.sh` passes; runbook §10 carries live evidence.
- `apps/admin/README.md` links to runbook + security aggregation + requirements + CLAUDE.md.
</verification>

<success_criteria>
- v3.0 launch checklist COMPLETE: self-monitoring, DNS/TLS, operator handoff all live + documented.
- Runbook §10 filled with live evidence.
- Operator can take the keys using only README.md + v3.0-RUNBOOK.md.
</success_criteria>

<output>
After completion, create `.planning/phases/22-security-review-launch/22-06-SUMMARY.md`:
- Health endpoint response
- Prometheus target state
- promtool test result
- Induced-downtime alert fire evidence (Alertmanager + /alerts screenshot path)
- check-dns-tls.sh last output
- README.md section list
</output>
