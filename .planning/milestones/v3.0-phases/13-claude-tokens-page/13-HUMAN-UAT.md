---
status: partial
updated: 2026-04-21T20:30:00Z
phase: 13-claude-tokens-page
source: [13-VERIFICATION.md]
started: 2026-04-17T00:00:00Z
updated: 2026-04-21T20:30:00Z
---

## Current Test

Test 6 pending operator browser action (7-day history Recharts render).

## Tests

### 1. External (non-Tailnet) probe of exporter must fail
expected: `curl -sS --max-time 5 http://100.101.0.9:9101/metrics` from a non-Tailnet host fails (connection refused / timeout)
result: pass
evidence: Operator tested off-Tailnet 2026-04-21 — reachable only on Tailnet, external probe fails.

### 2. Tailnet probe of exporter returns Prometheus exposition
expected: metrics endpoint returns `# HELP claude_usage_*` lines
result: passed
evidence: `ssh root@docker-tower 'curl -sS --max-time 5 http://100.101.0.9:9101/metrics | head'` → `# HELP claude_usage_5h_utilization …` + `# HELP python_gc_objects_collected_total …`. Verified 2026-04-17 during Plan 13-02 deploy.

### 3. Exporter process uid is 65534 (nobody)
expected: `ps -o uid,user` prints `uid=65534 user=nobody`
result: passed
evidence: `ssh root@mcow 'ps -o uid,user,args -p $(systemctl show -p MainPID --value claude-usage-exporter)'` → `65534 nobody /usr/bin/python3 /opt/claude-usage-exporter/exporter.py --bind-address 100.101.0.9 …`. Verified 2026-04-17 during Plan 13-02 deploy.

### 4. mtime-poll reload works end-to-end on live exporter
expected: touching the registry file produces a `registry reloaded` log line within 60s
result: passed
evidence: `ssh root@mcow 'touch /var/lib/claude-usage-exporter/claude-tokens.json && sleep 35 && journalctl -u claude-usage-exporter --since="1 minute ago" | grep reloaded'` → `INFO registry reloaded: 0 enabled tokens (path=/var/lib/claude-usage-exporter/claude-tokens.json)`. Log-leak guard: 0 `sk-ant-oat01-` occurrences in the last hour of journal. Verified 2026-04-17.

### 5. UI /tokens page renders live gauges + sparkline + mutation flows
expected: operator opens https://homelab.makscee.ru/tokens, adds a real `sk-ant-oat01-*` token, gauges appear within one poll cycle; rotate/disable/delete each complete without page reload
result: passed
evidence: |
  Phase 13 gap plans 13-06 + 13-07 closed the runtime SOPS decrypt path
  (2026-04-21). Post-deploy infra smoke on mcow:
    - `sops 3.9.4` + `age 1.1.1` installed via playbook
    - `/etc/homelab-admin/age.key` (0600 homelab-admin:homelab-admin)
    - `SOPS_AGE_KEY_FILE` + `SOPS_AGE_RECIPIENTS` in /etc/homelab-admin/env
    - `sudo -u homelab-admin sops -d /opt/homelab-admin/app/secrets/claude-tokens.sops.yaml`
      prints `tokens:` + decrypted entries (exit 0)
    - `curl -sS http://127.0.0.1:3847/tokens` → 307 (auth redirect, NOT 500 digest)
    - systemd unit exposes `PATH=/usr/local/bin:/usr/bin:/bin` to service process
  The earlier digest 1241901017 + "Executable not found in $PATH: sops" error
  path is structurally closed (Backlog 999.1 also closed).

### 6. 7-day history Recharts panel on /tokens/[id] renders a visible timeseries
expected: detail page for an enabled token with ≥1h of data shows a line (not the empty state)
result: pending
unblocked_by: Plan 13-07 (test 5 infra path restored 2026-04-21)
reason: "Unblocked now that /tokens index loads. Operator: log in via GitHub OAuth at https://homelab.makscee.ru/tokens, open a token detail page, verify sparkline renders."

## Summary

total: 6
passed: 5
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps

(All prior gaps closed by Plan 13-06 + 13-07. Operator browser UAT for test 6 remains.)
