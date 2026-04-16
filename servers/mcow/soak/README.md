# Claude Code /api/oauth/usage Feasibility Soak

**Phase:** 05 (feasibility gate, v2.0 milestone)
**Host:** mcow (100.101.0.9)
**Disposability:** Everything in this directory is REMOVED after the gate verdict (see `teardown.sh`). Do not build on top of it.

## What this is

A 24h bash + systemd-timer spike that polls `https://api.anthropic.com/api/oauth/usage` at 300s +/-60s jittered intervals using a reused operator OAuth token, logs each response to JSONL, and produces evidence for Phase 05's go/no-go verdict.

Pass/fail is decided by four criteria (see `.planning/ROADMAP.md` Phase 05):

1. Operator can `curl api.anthropic.com` from mcow (MON-02 -- wired in Plan 01).
2. >=24h soak at 300s +/-60s with <5% HTTP 429.
3. >=3 distinct response samples all contain `five_hour.utilization`, `seven_day.utilization`, a Sonnet/Opus-specific `utilization`, and `resets_at`.
4. ADR D-07 written in `.planning/PROJECT.md` Key Decisions.

## Files in this directory

| File | Purpose | Added by |
|------|---------|----------|
| `README.md` | This runbook | Plan 05-02 |
| `smoke.sh` | One-shot egress + schema smoke test; run BEFORE arming the timer | Plan 05-02 |
| `soak.sh` | Per-tick poller invoked by systemd (writes JSONL) | Plan 05-03 |
| `claude-usage-soak.service` | systemd oneshot unit (wraps soak.sh) | Plan 05-03 |
| `claude-usage-soak.timer` | systemd timer (300s + RandomizedDelaySec=60s) | Plan 05-03 |
| `analyze.sh` | Post-soak analyzer (latency percentiles, 429 rate, distinct schema hashes) | Plan 05-03 |
| `install.sh` | One-shot installer run from operator workstation | Plan 05-03 |
| `teardown.sh` | Removes systemd units, deletes token file, archives JSONL | Plan 05-05 |

## Quickstart (for operator)

1. Pre-flight: confirm egress (Plan 01 checkpoint already signed off).
   `cat .planning/phases/05-feasibility-gate/evidence/post-connector-smoke.txt`
2. Smoke-test once on mcow:
   ```
   scp servers/mcow/soak/smoke.sh root@mcow:/root/smoke.sh
   ssh root@mcow "install -m 0600 /dev/stdin /root/.claude-usage-token <<< 'sk-ant-oat01-...'"
   ssh root@mcow "CLAUDE_USAGE_TOKEN_FILE=/root/.claude-usage-token bash /root/smoke.sh"
   ```
   Expect: exit 0, `http_status=200`, `OK: .five_hour.utilization = <float>`, `schema_hash=<64 hex>`.
3. Arm the 24h soak: `bash servers/mcow/soak/install.sh` (from operator workstation).
4. Observe: `ssh root@mcow "systemctl list-timers claude-usage-soak.timer; tail -5 /var/log/claude-usage-soak.jsonl"`.
5. At T+24h, analyze + write verdict (Plans 05-04 and 05-05).

## Security properties

- Token lives ONLY in `/root/.claude-usage-token` on mcow at mode 0600, loaded via systemd `EnvironmentFile=` (not `Environment=` -- CONTEXT.md Code Patterns, v1.0 S-03 lesson).
- JSONL log at `/var/log/claude-usage-soak.jsonl` mode 0600; records response body (no token in body), sha256 hash, latency, http_status. NEVER records the Authorization header.
- curl invocation never embeds the token in the URL, only the `Authorization: Bearer` header.

## Halt conditions (D-05-06)

- **egress blocked** (persistent curl failures): timer auto-halts after 3 consecutive network-error ticks; operator triages + writes GATE-FAILED.md.
- **persistent 401/403**: auth rejected -> timer auto-halts after 3 consecutive auth failures; operator regenerates token OR writes GATE-FAILED.md with ToS-block hypothesis.

## Disposability

Post-verdict, `teardown.sh` removes `claude-usage-soak.service` and `.timer`, deletes `/root/.claude-usage-token`, archives `/var/log/claude-usage-soak.jsonl` into `.planning/phases/05-feasibility-gate/evidence/`, and disables the unit. After teardown, nothing in this directory is live on mcow.
