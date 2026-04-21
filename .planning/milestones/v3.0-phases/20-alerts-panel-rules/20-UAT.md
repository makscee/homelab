---
status: complete
phase: 20-alerts-panel-rules
source:
  - 20-01-SUMMARY.md
  - 20-02-SUMMARY.md
  - 20-03-SUMMARY.md
started: 2026-04-21T12:10:00Z
updated: 2026-04-21T12:36:00Z
---

## Current Test

[testing complete]

## Tests

### 1. /alerts page renders (auth + query path)
expected: Auth-gated /alerts page renders without errors; query returns alert list (table if firing, empty state if none). Heading "Alerts" present, nav item "Alerts" highlighted.
result: pass
verified: auto — Playwright MCP 2026-04-21 12:34 UTC. https://homelab.makscee.ru/alerts loaded (authed as makscee). Heading "Alerts" + nav link present; no stale banner, no error alert.

### 2. SWR auto-refresh every 15s
expected: After initial render, table silently refreshes every ~15s without full page reload.
result: pass
verified: auto — hooked window.fetch, observed 2 calls to /api/alerts/list over 17s wait; delta = 15335ms (refreshInterval: 15_000 ± 350ms jitter). No full reload.

### 3. "Open Alertmanager" link-out present
expected: Ghost-variant link "Open Alertmanager" on /alerts heading; href reads ALERTMANAGER_URL.
result: pass
verified: auto — snapshot shows `link "Open Alertmanager" /url: http://mcow:9093`. ALERTMANAGER_URL wired via host_var override (mcow is live AM host per 2026-04-15 migration; default docker-tower:9093 was overridden).

### 4. Empty state copy
expected: "No firing alerts" heading + explainer copy per UI-SPEC.
result: pass
verified: auto — rendered: heading "No firing alerts" + "All configured alert rules are within thresholds. Prometheus is being polled every 15s."

### 5. Severity badge colors + labels chip
expected: SeverityBadge uses UI-SPEC color classes per bucket. LabelsCell collapsible chip.
result: skipped
reason: no firing alerts at test time to exercise the table row path. Logic covered by alerts-list.server.test.ts (5/5 pass) and SeverityBadge/LabelsCell component files. Re-verify opportunistically next time an alert fires, or via a temporary smoke rule.

### 6. /api/alerts/list unauth → 307 /login
expected: curl -sI returns 307 redirect to /login.
result: pass
verified: auto — `curl -sI https://homelab.makscee.ru/api/alerts/list` → status=307, location=https://homelab.makscee.ru/login.

### 7. Prometheus has 3 claude-usage rules live, no legacy 7d
expected: /api/v1/rules contains ClaudeWeeklyQuotaHigh, ClaudeWeeklyQuotaCritical, ClaudeExporterDown in group `claude-usage`. Legacy ClaudeUsage7d* absent. 5h rules intact under `homelab.claude-5h`.
result: pass
verified: auto — docker-tower:9090/api/v1/rules confirmed:
  claude-usage: ClaudeWeeklyQuotaHigh, ClaudeWeeklyQuotaCritical, ClaudeExporterDown (all state=inactive, as expected)
  homelab.claude-5h: ClaudeUsage5hHigh, ClaudeUsage5hCritical (intact)
  ClaudeUsage7d* absent.

### 8. ALERTMANAGER_URL rendered on mcow
expected: /etc/homelab-admin/env contains ALERTMANAGER_URL; homelab-admin active.
result: pass
verified: auto — `ALERTMANAGER_URL=http://mcow:9093` (host_var override for post-migration AM host); `systemctl is-active homelab-admin` → active.

### 9. Telegram E2E smoke path (ALERT-05)
expected: Prometheus → AM → Telegram proven end-to-end.
result: pass
verified: Plan 20-03 proof — telethon harness verified bot message landed in chat 193835258 ~125s post smoke-rule deploy (2026-04-21T08:44Z); AM `notifications_total{integration="telegram"}` incremented 39→40, failed_total=0 across all reason buckets. Smoke rule subsequently removed (commit f49d407).

## Summary

total: 9
passed: 8
issues: 0
pending: 0
skipped: 1

## Gaps

[none]

## Notes

- ALERTMANAGER_URL resolves to http://mcow:9093 (not plan's default docker-tower:9093) because AM migrated off docker-tower to mcow on 2026-04-15 (Plan 04-01). host_var `alertmanager_url` override is correct and matches project memory `project_am_on_mcow`.
- Severity/labels UI path (T5) not exercised in live UAT (no firing alerts at test time). Component behavior covered by unit tests.
- Screenshot: `.playwright-mcp/phase20-alerts-empty.png`.
