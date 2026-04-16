---
phase: 05-feasibility-gate
plan: 01
subsystem: infra
tags: [tailscale, app-connector, egress, networking]

requires:
  - phase: none
    provides: first phase of v2.0
provides:
  - "Proof that mcow can reach api.anthropic.com directly — App Connector NOT needed"
  - "Baseline evidence archived in evidence/baseline-pre-connector.txt"
affects: [05-02, 05-03, 06-exporter-skeleton]

tech-stack:
  added: []
  patterns: ["Direct Moscow ISP egress to Anthropic works — no App Connector needed"]

key-files:
  created:
    - .planning/phases/05-feasibility-gate/evidence/baseline-pre-connector.txt
  modified: []

key-decisions:
  - "App Connector extension SKIPPED — direct egress from mcow to api.anthropic.com works (404 on root, 401 on /api/oauth/usage with dummy token, 433ms RTT)"
  - "MON-02 requirement satisfied via direct path instead of planned App Connector route"

patterns-established:
  - "Moscow ISP blocks Telegram IPv4 but does NOT block api.anthropic.com — different blocking behavior per service"

requirements-completed: [MON-02]

duration: 5min
completed: 2026-04-16
---

# Plan 05-01: App Connector Extension Summary

**Direct Moscow ISP egress to api.anthropic.com confirmed working — App Connector extension unnecessary, plan short-circuited**

## Performance

- **Duration:** 5 min (baseline capture + verification only)
- **Started:** 2026-04-16
- **Completed:** 2026-04-16
- **Tasks:** 1/4 (short-circuited after baseline proved direct access)
- **Files modified:** 1

## Accomplishments
- Proved mcow (100.101.0.9) can reach api.anthropic.com directly from Moscow ISP
- Root URL: HTTP 404 (TLS handshake + HTTP response confirmed)
- `/api/oauth/usage` with dummy token: HTTP 401 in 433ms (endpoint reachable, auth works)
- Telegram IPv4 (149.154.167.99): HTTP 302 (existing path still healthy)
- Archived baseline evidence for audit trail

## Task Commits

Plan short-circuited — no code changes needed. Evidence committed by orchestrator:

1. **Baseline capture** - evidence/baseline-pre-connector.txt (orchestrator commit)

## Files Created/Modified
- `.planning/phases/05-feasibility-gate/evidence/baseline-pre-connector.txt` - Baseline SSH captures from nether + mcow proving direct egress works

## Decisions Made
- **App Connector extension skipped**: The plan assumed Moscow ISP would block api.anthropic.com (based on Telegram IPv4 blocking precedent). Baseline test proved this assumption wrong — direct egress works with good latency (433ms). No point adding App Connector complexity when direct path works.
- **MON-02 satisfied differently**: Requirement was "operator can curl api.anthropic.com from mcow successfully". Achieved via direct path, not via App Connector as originally planned.

## Deviations from Plan

### Major deviation: Plan short-circuited

- **Found during:** Pre-flight baseline (Task 1)
- **Issue:** Plan assumed Moscow ISP blocks api.anthropic.com. Baseline curl returned HTTP 404 (root) and HTTP 401 (/api/oauth/usage), proving direct access works.
- **Decision:** Skip remaining 3 tasks (admin console change, verification, documentation) — they're all about routing through App Connector which isn't needed.
- **Impact:** Positive — simpler architecture, no App Connector dependency for the exporter.

## Issues Encountered
None — the "issue" was a positive surprise (direct access works).

## Next Phase Readiness
- Egress path confirmed — smoke test (05-02) and soak (05-03) can proceed using direct mcow egress
- No App Connector dependency means exporter (Phase 06) is simpler — binds to mcow, curls Anthropic directly
- Future consideration: if Moscow ISP starts blocking, App Connector is the fallback (plan is documented)

---
*Phase: 05-feasibility-gate*
*Completed: 2026-04-16*
