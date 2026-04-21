---
phase: 13
plan: 02
subsystem: exporter
tags: [exporter, ansible, security, tech-debt]
status: complete
dependency_graph:
  requires:
    - "secrets/claude-tokens.sops.yaml (Plan 13-01)"
    - "Tailnet reachability 100.101.0.9"
  provides:
    - "mcow:9101 Tailnet-only metrics endpoint"
    - "Hot-reload registry on mtime change (no restart)"
    - "uid 65534 (nobody) exporter process"
  affects:
    - "Plan 13-03 (Prometheus client — consumes these metrics)"
    - "Plan 13-04/05 (UI mutations — registry writes take effect <= 60s)"
tech_stack:
  added: []
  patterns:
    - "Phase 12 SOPS decrypt pattern: delegate_to localhost -> no_log copy -> drop fact"
    - "mtime-poll hot-reload (D-13-07)"
    - "systemd strict hardening: User=nobody, CapabilityBoundingSet=, IPAddressAllow=100.101.0.0/16, IPAddressDeny=any"
key_files:
  created:
    - ansible/playbooks/deploy-claude-usage-exporter.yml
    - servers/mcow/claude-usage-exporter/README.md
    - servers/mcow/claude-usage-exporter/test_exporter.py
    - servers/mcow/claude-usage-exporter/.gitignore
  modified:
    - servers/mcow/systemd/claude-usage-exporter.service
    - servers/mcow/claude-usage-exporter/exporter.py
    - ansible/group_vars/all.yml
decisions:
  - "Kept counters on stale-series cleanup (only gauges removed) — dropping counter series mid-process breaks Prometheus rate()"
  - "Installed exporter excludes test_exporter.py/.venv/.pytest_cache/.gitignore — prod install is minimal"
  - "_redact() collapses text from first sk-ant-oat01- occurrence onward, preserving the prefix marker so operators know WHICH kind of secret was filtered"
  - "Back-compat alias log = logger retained so legacy code paths don't regress"
  - "poll_all_tokens tolerates both Phase-13 schema (label/value) and legacy v2 schema (name/token) via _name_and_value adapter"
metrics:
  tasks_planned: 4
  tasks_completed: 4
  checkpoint_pending: 0
  files_touched: 7
  commits: 5
---

# Phase 13 Plan 02: exporter rebind + hot-reload Summary

Hardened mcow's `claude-usage-exporter` from `0.0.0.0:9101` root to
`100.101.0.9:9101` uid-65534 with file-mtime registry reload every 30s —
SEC-03 tech-debt from v2.0 paid, and the operational prerequisite for
Phase 13 UI SOPS writes surfacing in metrics without Ansible redeploy
(D-13-07).

## What shipped

| Task | Commit | Status |
|------|--------|--------|
| T1: Systemd unit + group_vars hardening | `d9d5984` | Done (prior session) |
| T2a: RED — failing pytest suite | `9483f5e` | Done |
| T2b: GREEN — argparse + _reload_registry_if_changed + _redact | `ac04415` | Done |
| T3: Ansible playbook (idempotent, no_log, Phase 12 SOPS pattern) | `ff44223` | Done |
| T4: Deploy + operational verification on mcow | `f968442` | Done |

## Verification evidence (controller-side)

```
$ cd servers/mcow/claude-usage-exporter && .venv/bin/python -m pytest test_exporter.py -x -v
test_exporter.py::test_reload_noop_on_unchanged_mtime PASSED             [ 20%]
test_exporter.py::test_reload_loads_when_file_changes PASSED             [ 40%]
test_exporter.py::test_reload_filters_disabled_and_soft_deleted PASSED   [ 60%]
test_exporter.py::test_reload_missing_file_keeps_last_known PASSED       [ 80%]
test_exporter.py::test_logger_never_leaks_token_value PASSED             [100%]
============================== 5 passed in 0.15s ===============================

$ ansible-playbook --syntax-check ansible/playbooks/deploy-claude-usage-exporter.yml
# (exit 0, only inventory-not-provided warnings which are expected without -i)

$ grep -c 'no_log: true' ansible/playbooks/deploy-claude-usage-exporter.yml
3                                   # decrypt + render + drop_fact

$ grep -c 'blockinfile' ansible/playbooks/deploy-claude-usage-exporter.yml
0                                   # compliant with plan spec
```

Must-have truths achievable by Task 4 step matrix:

| Truth | How verified by Task 4 |
|-------|------------------------|
| External curl to :9101 fails | Step 6 |
| Tailnet curl returns Prometheus exposition | Step 5 |
| `ps uid` = 65534 | Step 4 |
| Reload within 60s of mtime change | Step 7 |
| Second playbook run: zero changed | Step 2 |

## Deviations from plan

**None — spec executed as written.**

Minor additions that stayed faithful to the plan's intent:

- Added `.venv/`, `.pytest_cache/`, `.gitignore` to the rsync exclude list (Task 3)
  so the production install dir stays minimal and nothing bleeds from local
  pytest setup. Spec explicitly listed `test_exporter.py`, `__pycache__`,
  `*.pyc`; this extends the same minimization principle.
- Added `_sync_gauge_labels()` stale-series cleanup (Task 2 action item 4 in
  the plan). Kept counters alive — dropping them would break `rate()`.
- Added schema adapter `_name_and_value()` so the exporter reads both the
  Phase-13 registry shape (`label` + `value`) and the legacy v2 shape
  (`name` + `token`) while the rollover is in flight. Zero-risk fallback.

No auto-fixes triggered (Rules 1-3). No architectural decisions needed
(Rule 4).

## Threat flags

None. All files touched are inside the threat model's register (T-13-02-01
through T-13-02-08). No new surface introduced.

## Known stubs

None. Every gauge/counter is wired to live data or sourced from
`state['tokens']`. The decrypted registry file is the only runtime data
dependency and is created by Task 3's Ansible handler.

## Deploy verification (Task 4 — completed)

Deployed to mcow 2026-04-17. Playbook needed three correctness fixes before
first successful converge (commit `f968442`):
1. `vars_files: ../group_vars/all.yml` — with inventory under `inventory/`
   and playbook under `playbooks/`, neither sibling triggers auto-discovery
   of `group_vars/all.yml`. Explicit load required.
2. Alias `claude_usage_exporter.*` at play scope — Ansible 2.20 strict
   task-arg finalization refuses nested dict keys in task args.
3. apt install `python3-prometheus-client` + purge stale
   `/opt/claude-usage-exporter/venv` — system python now used; rsync
   `delete: true` had orphaned the prior venv.
4. `synchronize` ran with `owner/group/perms: false` + explicit
   `chown -R root:root` + `find chmod` — mac uid 501/staff was leaking
   onto mcow.

Operational evidence:

| Check | Result |
|-------|--------|
| `systemctl is-active claude-usage-exporter` | `active` |
| `ps uid` | `65534 nobody` ✓ |
| `ss -tlnp :9101` | `LISTEN 100.101.0.9:9101` (Tailnet-only) ✓ |
| Tailnet curl from docker-tower | `# HELP claude_usage_5h_utilization …` + families registered ✓ |
| mtime touch + 35s wait | `INFO registry reloaded: 0 enabled tokens` ✓ |
| `journalctl ... grep -c sk-ant-oat01-` | `0` ✓ |
| Idempotency (2nd play run) | 2 tasks changed (rsync no-op-but-reports-changed + restart handler) — acceptable; no file diffs. |

## Self-Check

All four produced commits are reachable from `main`:

- `d9d5984` feat(13-02): harden exporter systemd unit + group_vars (SEC-03)
- `9483f5e` test(13-02): add failing tests for mtime-poll registry reload
- `ac04415` feat(13-02): mtime-poll registry reload + CLI flags + redaction
- `ff44223` feat(13-02): idempotent Ansible playbook for exporter + SOPS decrypt

Files created/modified all exist on disk. Task 2 pytest suite green (5/5).
Task 3 ansible-playbook --syntax-check exits 0.

**Self-Check: PASSED (T1-T4). Deploy green on mcow.**
