---
status: partial
phase: 13-claude-tokens-page
source: [13-VERIFICATION.md]
started: 2026-04-17T00:00:00Z
updated: 2026-04-17T00:00:00Z
---

## Current Test

3 items pending operator action (UI rendering + external-network probe).

## Tests

### 1. External (non-Tailnet) probe of exporter must fail
expected: `curl -sS --max-time 5 http://100.101.0.9:9101/metrics` from a non-Tailnet host fails (connection refused / timeout)
result: pending — orchestrator dev host is on Tailnet, cannot disprove from here. Systemd unit bind is `100.101.0.9` (Tailnet IP) with `IPAddressAllow=100.101.0.0/16` + `IPAddressDeny=any`, so the guarantee is structural. Suggest running from any cell-hotspotted laptop.

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
result: pending — requires human browser access + a real API token. `bun test` (58 pass) and `bun run build` (green) cover the code surface; UX + SOPS-write→exporter-reload→Prometheus-scrape chain needs live eyeballs. MEMORY:feedback_verify_ui forbids claiming "works" without a render.

### 6. 7-day history Recharts panel on /tokens/[id] renders a visible timeseries
expected: detail page for an enabled token with ≥1h of data shows a line (not the empty state)
result: pending — blocks on item 5. Needs ≥1h of exporter samples on a real token.

## Summary

total: 6
passed: 3
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

(none — pending items are operator-gated, not defects)
