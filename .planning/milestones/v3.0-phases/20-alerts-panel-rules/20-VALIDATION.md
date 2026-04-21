---
phase: 20
slug: alerts-panel-rules
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (portal frontend) + promtool (rule unit tests) |
| **Config file** | apps/portal/vitest.config.ts + monitoring/prometheus/tests/ |
| **Quick run command** | `bun run --cwd apps/portal test -- --run <file>` |
| **Full suite command** | `bun run --cwd apps/portal test -- --run && promtool test rules monitoring/prometheus/tests/claude-usage_test.yml` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command for changed scope
- **After every plan wave:** Run full suite
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | ALERT-01..06 | — | — | unit/integration | per-task | ❌ W0 | ⬜ pending |

*Populated during planning. Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `monitoring/prometheus/tests/claude-usage_test.yml` — promtool unit tests for ClaudeWeeklyQuotaHigh/Critical + ClaudeExporterDown
- [ ] `apps/portal/app/alerts/__tests__/` — vitest stubs for alerts page server module
- [ ] `apps/portal/app/api/alerts/list/__tests__/` — API route tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Telegram E2E delivery | ALERT-05 | Requires real Telegram chat receipt | Force-fire test alert via amtool, confirm message in operator Telegram |
| `/alerts` visual render | ALERT-02 | UI-SPEC compliance visual | Playwright screenshot + operator eyeball |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
