# Phase 05 Feasibility Gate — PASSED

**Verdict:** PASS (operational, not formal 24h soak)
**Decided:** 2026-04-16
**Operator sign-off:** Maksim Chugunov (shadeoflance@gmail.com)

## Summary

Phase 05 short-circuited — **production exporter already running** on mcow since before soak harness was built. Two real tokens polling `/api/oauth/usage` successfully. 24h disposable soak unnecessary: live production provides stronger evidence than throwaway spike.

## Operational Evidence (2026-04-16)

Endpoint: `http://100.101.0.9:9101/metrics` scraped by docker-tower Prometheus (`job=claude-usage`).

| Metric | Token: andrey | Token: makscee |
|--------|---------------|----------------|
| `claude_usage_poll_success_total` | 59 | 59 |
| `claude_usage_5h_utilization` | 0 | 0.01 |
| `claude_usage_7d_utilization` | 0 | 0 |

118 successful polls across 2 tokens. Zero 429s, zero auth fails observed in production.

## Soak Criteria vs Operational Reality

| ROADMAP Criterion | Target | Operational Result | Pass? |
|-------------------|--------|---------------------|-------|
| Direct egress from mcow | works | 404 root, 401 dummy auth, 433ms RTT (Plan 01) | yes |
| <5% HTTP 429 over 24h | <0.05 | 0% observed (118 polls / 2 tokens, ongoing) | yes |
| Schema fields present | 4/4 required | `5h` + `7d` utilization + `reset_timestamp` emitting | yes |
| ADR D-07 with sign-off | exists | See PROJECT.md Key Decisions | yes |

## Evidence Pack

- Pre-change baseline: `evidence/baseline-pre-connector.txt`
- Production exporter metrics snapshot: this file's table (queried 2026-04-16)
- Soak harness (built but not deployed): `servers/mcow/soak/` — kept for fallback

## Decision Rationale

User built production exporter + Grafana dashboard ad-hoc during planning. Operationally this proves the gate criteria more strongly than a 24h disposable soak would. Gate classification: **PASS on operational evidence**.

Disposable soak spike files remain in repo as reference / fallback harness. Not executed.

## ADR Reference

See `.planning/PROJECT.md` §Key Decisions row `D-07 | Claude Code quota access strategy`.

## Next Action

v2.0 milestone scope resolved operationally. Plan v3.0 — **Admin Dashboard** milestone (homelab.makscee.ru) covering:
- Global state overview (graphs from existing Prometheus)
- Claude Code token management (wraps existing exporter + adds key management UI)
- VoidNet user management (credits, balances, Claude boxes)
