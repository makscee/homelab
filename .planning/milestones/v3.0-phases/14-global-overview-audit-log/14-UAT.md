---
status: complete
phase: 14-global-overview-audit-log
source:
  - 14-01-SUMMARY.md
  - 14-02-SUMMARY.md
  - 14-03-SUMMARY.md
  - 14-04-SUMMARY.md
  - 14-05-SUMMARY.md
started: 2026-04-17T12:50:00Z
updated: 2026-04-17T14:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Restart homelab-admin on mcow. Service boots; homepage returns 200; no errors in journal.
result: pass
evidence: systemctl restart clean, `active`, https://homelab.makscee.ru/ → 307 (auth redirect), no errors in journal since restart.

### 2. Prometheus scrapes all exporters
expected: 6 node + 2 cAdvisor targets healthy.
result: pass
evidence: docker-tower:9090 /api/v1/targets — all 6 node_exporter + 2 cAdvisor + claude-usage + alertmanager + prometheus all `up`.

### 3. /audit page renders entries
expected: Table with 6 columns, rows present.
result: issue
reported: "/audit renders error page — 'Something went wrong', digest 4036124938. Journal: `Error: bun:sqlite shim: should not be called at build time` at lib/bun-sqlite-shim.js:13. Every /audit hit throws."
severity: blocker

### 4. /audit payload expand + pagination
expected: Click expands JSON; Older/Newer links navigate.
result: blocked
blocked_by: prior-test
reason: "Page crashed (Test 3) — cannot test interactions."

### 5. Overview page — host tiles
expected: 6 tiles with live CPU/mem/net.
result: issue
reported: "All 6 host tiles render skeleton with CPU/Mem/Disk/Uptime/Load/Containers = `—`. No data. Prometheus default URL in code = `http://mcow:9090` but Prometheus runs on docker-tower:9090; mcow has no PROMETHEUS_URL env set in /etc/homelab-admin/env — every PromQL query 404/ECONNREFUSED, per-tile catch returns []."
severity: blocker

### 6. Overview — Claude usage summary
expected: Per-token Claude usage cards populated from exporter mcow:9101.
result: issue
reported: "Section shows 'No Claude tokens registered.' despite claude-usage exporter on mcow:9101 polling 2 tokens (STATE.md D-07). Likely same bun:sqlite shim bug: token registry read via bun:sqlite throws, caught, rendered as empty."
severity: major

### 7. Overview — Alerts card
expected: Alerts card with firing count.
result: pass
evidence: Overview card renders 'Alerts — All clear' linking /alerts; /api/alerts/count returns 0 (alertmanager target up, no active alerts).

### 8. Top-bar alert badge
expected: Badge shows firing count; hides at 0.
result: pass
evidence: Firing count=0, badge correctly absent from banner. SWR 30s poll configured in NavAlertBadge per 14-05-SUMMARY.

## Summary

total: 8
passed: 3
issues: 3
blocked: 1
skipped: 0

## Gaps

- truth: "/audit page renders audit_log rows via bun:sqlite at runtime"
  status: failed
  reason: "bun-sqlite-shim.js is emitted into the built bundle as the resolved require() target; under Bun runtime it still loads the shim (not native bun:sqlite), throwing on every Database() construction. Webpack externals callback returns absolute shim path instead of `commonjs bun:sqlite`. Assumption in shim comment ('At Bun runtime the real bun:sqlite is resolved natively; the shim is never executed in production') is wrong."
  severity: blocker
  test: 3
  artifacts:
    - apps/admin/next.config.mjs:30-41
    - apps/admin/lib/bun-sqlite-shim.js
  missing:
    - runtime resolution back to native bun:sqlite (shim must proxy to `require('bun:sqlite')` when available, OR externals must emit `commonjs bun:sqlite` literal with a Node-compat build path)

- truth: "Overview PromQL queries reach Prometheus and populate tiles"
  status: failed
  reason: "PROMETHEUS_URL env unset on mcow; default in lib/prometheus.server.ts is `http://mcow:9090` but Prometheus runs on docker-tower (100.101.0.8:9090). Every instant/range query fails, per-tile .catch() empties all fields."
  severity: blocker
  test: 5
  artifacts:
    - apps/admin/lib/prometheus.server.ts:7
    - /etc/homelab-admin/env (mcow)
    - ansible/playbooks/deploy-homelab-admin.yml
  missing:
    - PROMETHEUS_URL=http://100.101.0.8:9090 (or tailnet alias) rendered into env by ansible + default flipped or documented

- truth: "Claude usage cards read token registry and render one card per active token"
  status: failed
  reason: "Token registry lookup path crosses bun:sqlite; when shim throws, read path catches and renders empty state. Same root cause as Gap 1 — fixing bun:sqlite shim should restore this."
  severity: major
  test: 6
  artifacts:
    - apps/admin/lib/token-registry.ts
  missing:
    - validate after Gap 1 fix; add test for non-empty tokens render path
