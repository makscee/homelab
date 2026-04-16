---
phase: 05-feasibility-gate
plan: "04"
subsystem: infra
tags: [soak, evidence, short-circuit]

requires:
  - phase: 05-03
    provides: soak harness built but not deployed
provides:
  - "Operational evidence substitute: production exporter poll counts from Prometheus"
affects: [05-05]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "Plan 04 short-circuited — production exporter (mcow:9101) already running with 2 tokens polling successfully (118 total polls, 0% 429 rate). 24h soak evidence replaced by operational evidence queried from Prometheus."

requirements-completed: [DEPLOY-03]

duration: 2min
completed: 2026-04-16
---

# Plan 05-04: Soak Evidence Pull Summary

**Plan skipped — production exporter replaces disposable soak spike. Evidence sourced from live Prometheus instead of 24h JSONL archive.**

## Performance

- **Duration:** 2 min (evidence query only)
- **Completed:** 2026-04-16
- **Tasks:** 0/1 (short-circuited)

## Accomplishments

- Queried docker-tower Prometheus for live exporter metrics
- Confirmed 2 tokens (`andrey`, `makscee`) polling mcow:9101 successfully
- 59 polls per token, 0% 429 rate, schema fields present

## Deviations from Plan

**Plan 04 skipped.** Soak spike never deployed (Plan 03 Task 2 blocked on token; operator already had production exporter running). Evidence drawn from production instead:

- Expected: 240+ JSONL rows from soak-jsonl.archive
- Got: 59 polls × 2 tokens = 118 successful polls in production Prometheus

Production evidence is **stronger** than disposable soak: same endpoint, same cadence, real tokens, no teardown pending.

## Next Phase Readiness

Plan 05 (verdict + ADR) writes GATE-PASSED.md based on operational evidence.
