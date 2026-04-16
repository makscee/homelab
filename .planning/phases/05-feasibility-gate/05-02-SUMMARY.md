---
phase: 05-feasibility-gate
plan: 02
subsystem: infra
tags: [bash, curl, anthropic-api, oauth, smoke-test, mcow, feasibility]

requires:
  - phase: 05-feasibility-gate/05-01
    provides: egress verified from mcow to api.anthropic.com

provides:
  - smoke.sh one-shot schema validator (exit 0/2/3/4/5)
  - soak/README.md operator runbook for full Phase 05 gate workflow

affects:
  - 05-03-PLAN (Plan 03 arms the soak timer; Task 1 is smoke.sh execution on mcow)
  - 05-05-PLAN (teardown.sh referenced in README)

tech-stack:
  added: []
  patterns:
    - "Token sourced from env var or 0600/0400 file; perms-checked before use"
    - "curl -4 with Authorization: Bearer header only (never URL-embedded)"
    - "sha256(jq -S) schema hash for drift detection"
    - "Exit code taxonomy: 0=pass 2=HTTP-err 3=schema 4=token 5=network"

key-files:
  created:
    - servers/mcow/soak/smoke.sh
    - servers/mcow/soak/README.md
  modified: []

key-decisions:
  - "User-Agent fixed as claude-usage-soak/0.1 (not impersonating Claude Code per CONTEXT.md A-03)"
  - "Accept either seven_day_sonnet.utilization OR seven_day_opus.utilization (field name uncertain)"
  - "Token perms enforced in script (0600 or 0400); script exits 4 if wrong"
  - "Script NOT executed on mcow in this plan — Plan 03 Task 1 is the first live run"

patterns-established:
  - "Smoke-before-soak pattern: one manual gate invocation before arming periodic timer"
  - "EnvironmentFile= over Environment= for systemd secret loading (v1.0 S-03 lesson)"

requirements-completed: [MON-03]

duration: 8min
completed: 2026-04-16
---

# Phase 05 Plan 02: Smoke Test Script Summary

**One-shot bash smoke test for api.anthropic.com/api/oauth/usage with schema field validation, exit-code taxonomy, and operator runbook — not yet executed on mcow (Plan 03 does first live run)**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-16T15:44:18Z
- **Completed:** 2026-04-16T15:52:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `smoke.sh` (75 lines, mode 0755) — curls the OAuth usage endpoint, validates five required schema paths, emits a sha256 schema hash, exits with distinct codes for each failure mode
- Created `README.md` — full operator runbook documenting 5-step workflow, 8-file directory table, security properties, halt conditions D-05-06, and disposability contract
- All acceptance criteria verified locally (bash -n syntax, grep for all required patterns, no hardcoded tokens)

## Task Commits

1. **Task 1: Create smoke.sh** - `49836b2` (feat)
2. **Task 2: Create README.md** - `c93514e` (feat)

## Files Created/Modified

- `servers/mcow/soak/smoke.sh` - One-shot OAuth usage endpoint validator; exit 0=pass, 2=HTTP-err, 3=schema-miss, 4=no-token, 5=network
- `servers/mcow/soak/README.md` - Operator runbook for the complete Phase 05 soak gate workflow

## Decisions Made

- Accepted either `seven_day_sonnet.utilization` or `seven_day_opus.utilization` because STACK.md and ROADMAP.md use different field names; script reports whichever is present
- Token perms enforced inside the script (exits 4 if file is not 0600 or 0400) — defense-in-depth per T-05-02-01
- `curl -4` forces IPv4 to avoid IPv6 path surprises on mcow (Moscow ISP context from v1.0 egress lessons)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Plan's verification grep `'anthropic-beta: oauth-2025-04-20'` does not match the script which correctly uses `BETA="oauth-2025-04-20"` then `${BETA}` — verified the value is present via `grep 'oauth-2025-04-20'` instead. Script is correct; plan's grep pattern was overly literal.

## User Setup Required

None — no external service configuration required. Token provisioning happens in Plan 03 when the operator runs smoke.sh on mcow.

## Next Phase Readiness

- Plan 03 (soak installer) can proceed: `smoke.sh` is ready to `scp` to mcow as Plan 03 Task 1
- Plan 03 will add `soak.sh`, systemd units, `install.sh`, and `analyze.sh` alongside these two files
- MON-03 go-signal artifact exists in repo

## Self-Check

- `servers/mcow/soak/smoke.sh` — FOUND (49836b2)
- `servers/mcow/soak/README.md` — FOUND (c93514e)
- `bash -n smoke.sh` — PASSED (no output)
- grep: api/oauth/usage, oauth-2025-04-20, seven_day_sonnet, seven_day_opus, schema_hash=, EnvironmentFile=, RandomizedDelaySec=60s, GATE-FAILED.md — ALL PRESENT
- No hardcoded sk-ant- token — CONFIRMED

## Self-Check: PASSED

---
*Phase: 05-feasibility-gate*
*Completed: 2026-04-16*
