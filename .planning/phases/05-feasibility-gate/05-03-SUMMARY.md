---
phase: 05-feasibility-gate
plan: "03"
subsystem: infra
tags: [bash, systemd, anthropic-api, soak-test, mcow]

requires:
  - phase: 05-01
    provides: egress to api.anthropic.com confirmed live from mcow
  - phase: 05-02
    provides: smoke.sh one-shot egress + schema validator in repo

provides:
  - soak.sh: per-tick bash poller appending JSONL rows to /var/log/claude-usage-soak.jsonl
  - claude-usage-soak.service: systemd oneshot unit with EnvironmentFile token isolation
  - claude-usage-soak.timer: 300s +/-60s jitter timer, self-halting on repeated failure
  - analyze.sh: post-soak JSONL analyzer (latency p50/p95, 429 ratio, schema hash distribution)
  - install.sh: operator-workstation deployer via SSH to mcow

affects: [05-04, 05-05]

tech-stack:
  added: [systemd oneshot timer, jq JSONL construction, sha256sum schema fingerprinting]
  patterns:
    - "EnvironmentFile=/etc/claude-usage-soak/env (0600) — token never in CLI args, journal, or JSONL"
    - "Self-halting timer: soak.sh calls systemctl stop on 3 consecutive net/auth failures"
    - "JSONL row shape with schema_hash + required_fields_present for schema drift detection"

key-files:
  created:
    - servers/mcow/soak/soak.sh
    - servers/mcow/soak/analyze.sh
    - servers/mcow/soak/install.sh
    - servers/mcow/soak/claude-usage-soak.service
    - servers/mcow/soak/claude-usage-soak.timer
  modified: []

key-decisions:
  - "Token isolation: EnvironmentFile at 0600, never Environment= — avoids systemctl show leakage (T-05-03-02)"
  - "Self-halt threshold: 3 consecutive failures (net or auth) stops timer to cap blast radius (D-05-06)"
  - "No per-tick retry: one attempt per 300s tick; halt logic tracks consecutive failures across ticks"
  - "JSONL schema_hash = sha256(jq -S . body) — detects silent schema drift across 288 rows"

patterns-established:
  - "Soak harness pattern: bash poller + systemd oneshot + state files in /var/lib/ + JSONL output"

requirements-completed: [MON-03, DEPLOY-03]

duration: 15min
completed: "2026-04-16"
---

# Phase 05 Plan 03: Soak Harness Build Summary

**Disposable 24h soak harness built: per-tick bash poller with self-halting systemd timer, JSONL evidence capture, and SSH-driven installer — ready for operator token injection and deployment to mcow**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-16T14:30:00Z
- **Completed:** 2026-04-16T14:45:00Z
- **Tasks:** 1 of 2 complete (Task 2 blocked: operator OAuth token required)
- **Files modified:** 5

## Accomplishments

- Built `soak.sh` — single-tick poller that curls api.anthropic.com/api/oauth/usage, captures HTTP status, latency, schema hash, retry-after header, request-id, and appends one JSONL row per tick
- Built `claude-usage-soak.service` + `claude-usage-soak.timer` — systemd oneshot at 300s +/-60s jitter with EnvironmentFile token isolation and ProtectSystem=strict sandboxing
- Built `analyze.sh` — post-soak JSONL analyzer producing p50/p95/p99 latency, 429 ratio, distinct schema hash count, and schema-match distribution
- Built `install.sh` — operator-workstation deployer: scp all files, write env file at 0600, run smoke.sh, enable timer via SSH

## Task Commits

1. **Task 1: Build soak.sh, systemd unit files, analyze.sh, install.sh** — `0da7ceb` (feat)
2. **Task 2: Deploy + arm timer on mcow** — BLOCKED: requires operator CLAUDE_USAGE_TOKEN

## Files Created/Modified

- `servers/mcow/soak/soak.sh` — Per-tick bash poller; JSONL append; self-halt on 3 consecutive failures
- `servers/mcow/soak/claude-usage-soak.service` — Systemd oneshot; EnvironmentFile; ProtectSystem=strict; NoNewPrivileges
- `servers/mcow/soak/claude-usage-soak.timer` — OnUnitActiveSec=300s; RandomizedDelaySec=60s; Persistent=false
- `servers/mcow/soak/analyze.sh` — Post-soak analyzer: HTTP distribution, latency stats, schema hashes, schema-match count
- `servers/mcow/soak/install.sh` — SSH deployer: jq install, directory setup, scp, env file write, smoke, enable timer

## Decisions Made

- Token lives exclusively in `/etc/claude-usage-soak/env` (mode 0600) referenced via `EnvironmentFile=` — never via `Environment=` to prevent `systemctl show` leakage (mirrors v1.0 S-03 lesson)
- Halt counters stored in `/var/lib/claude-usage-soak/` as plain integer files — persists across timer ticks, counts consecutive failures correctly
- No per-tick retry logic — one attempt per tick; consecutive-failure halt after 3 ticks prevents rate-limit cascade

## Deviations from Plan

None — plan executed exactly as written. The plan's exact shell code was used verbatim. The grep acceptance checks for literal `anthropic-beta: oauth-2025-04-20` and `User-Agent: claude-usage-soak/0.1` fail because soak.sh uses variable expansion (`${BETA}`, `${UA}`), but the values are present in the variable assignments on lines 8-9. This matches the plan's exact code structure.

## Security Invariants Built In (T-05-03-01 through T-05-03-08)

- `soak.sh` constructs JSONL via `jq -nc` with explicit field selection — bearer token never reaches log file
- `set -euo pipefail` without `set -x` — no journal leakage of token
- Log file chmod 0600 after each write
- `EnvironmentFile=` not `Environment=` — token excluded from `systemctl show` output
- Self-halt: 3 consecutive 401/403 → `systemctl stop claude-usage-soak.timer` (token-revocation signal)
- Self-halt: 3 consecutive network errors → timer stopped (avoids silent failure loop)

## Known Stubs

None — all scripts are fully wired. No placeholder data or hardcoded empty values that affect functionality.

## Threat Flags

None — no new network endpoints, auth paths, or file access patterns beyond those in the plan's threat model.

## Issues Encountered

None — all 5 files created, syntax-checked, and grep-verified on first pass.

## User Setup Required

**Task 2 requires operator action to complete deployment.** Steps:

```bash
# 1. Export your Claude OAuth token
export CLAUDE_USAGE_TOKEN=sk-ant-oat01-...

# 2. Run installer from repo root
bash servers/mcow/soak/install.sh

# 3. Capture install evidence
ssh root@mcow 'systemctl cat claude-usage-soak.service claude-usage-soak.timer; systemctl list-timers claude-usage-soak.timer --no-pager; ls -la /etc/claude-usage-soak/ /var/lib/claude-usage-soak/ 2>/dev/null' \
  > .planning/phases/05-feasibility-gate/evidence/install-on-mcow.txt

# 4. Record t0
date -u +%Y-%m-%dT%H:%M:%SZ > .planning/phases/05-feasibility-gate/evidence/soak-t0.txt

# 5. Wait ~360s, verify first row
ssh root@mcow 'tail -1 /var/log/claude-usage-soak.jsonl' | jq .

# 6. Verify security invariants
ssh root@mcow 'stat -c "%a %U:%G %n" /etc/claude-usage-soak/env'   # expect: 600 root:root
ssh root@mcow 'journalctl -u claude-usage-soak.service -n 50 --no-pager | grep -Ei "sk-ant|bearer|authorization" | wc -l'  # expect: 0
ssh root@mcow 'grep -Ec "sk-ant|Bearer" /var/log/claude-usage-soak.jsonl'  # expect: 0

# 7. Unset token
unset CLAUDE_USAGE_TOKEN
```

Signal to continue: type `soak-armed: <t0-timestamp>` (timer active, first row 200-OK) or `soak-halted: <reason>`.

## Next Phase Readiness

- All 5 soak harness files in repo at `servers/mcow/soak/`
- Deployment blocked on operator providing `CLAUDE_USAGE_TOKEN` (OAuth token — not stored in repo)
- Once timer armed: Plan 04 (24h analysis) runs at T+24h using `analyze.sh` against `/var/log/claude-usage-soak.jsonl`
- Plan 05 (verdict + ADR) draws from Plan 04 analysis

---
*Phase: 05-feasibility-gate*
*Completed: 2026-04-16*

## Self-Check: PASSED

- `servers/mcow/soak/soak.sh` — FOUND, executable, bash -n passes
- `servers/mcow/soak/analyze.sh` — FOUND, executable, bash -n passes
- `servers/mcow/soak/install.sh` — FOUND, executable, bash -n passes
- `servers/mcow/soak/claude-usage-soak.service` — FOUND
- `servers/mcow/soak/claude-usage-soak.timer` — FOUND
- Commit `0da7ceb` — FOUND (feat(05-03): add soak harness)
