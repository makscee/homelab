# scripts/

Operator-run scripts for homelab tasks. Each script is standalone and documents its own usage in a header comment.

## Inventory

| Script | Purpose | Invocation target | Secret inputs |
|--------|---------|-------------------|---------------|
| `tailscale-provision.sh` | Install Tailscale + join Tailnet | Fresh Debian/Ubuntu host | `TAILSCALE_AUTH_KEY` env var |
| `enable-jellyfin-qsv.sh` | Enable Intel Quick Sync Video for Jellyfin | docker-tower (LXC 100) | None |
| `verify-phase02.sh` | Run every Phase 2 verification snippet in `verify-phase02.d/` | Operator machine | None |
| `healthcheck.sh` | Query Prometheus API for host health; JSON on stdout | Operator machine w/ Tailnet access | None (reads public Prometheus API over Tailnet) |

## verify-phase02.d/

Per-plan verification snippets. Each file is sourced by `verify-phase02.sh` in lexical order. Add a new `NN-<name>.sh` from a new plan — no changes to the wrapper needed.

Current snippets:
- `01-reconcile.sh` — SVC-07 (Plan 01)
- `02-docker-tower.sh` — SVC-01 (Plan 02)
- `03-mcow.sh` — SVC-02 (Plan 03)
- `04-nether.sh` — SVC-04 (Plan 04)
- `05-lxc.sh` — SVC-03 + SVC-08 (Plan 05)
- `06-tailscale.sh` — SVC-05 (Plan 06, this plan)
- `99-final.sh` — Phase-wide sweep: secret scan + all-requirements coverage (Plan 06)

## healthcheck.sh

Operator CLI that queries Prometheus over Tailnet and emits strict JSON
describing host health. Used by Claude Code after any deployment to verify
success without SSH.

Usage:
```
scripts/healthcheck.sh <hostname>    # e.g. scripts/healthcheck.sh mcow
scripts/healthcheck.sh --all         # NDJSON of all 6 hosts
scripts/healthcheck.sh --help
```

Exit: `0`=ok, `1`=degraded (warnings), `2`=fail (critical).
Deps: `curl`, `jq`. Override Prometheus URL with `PROM_URL` env var.

Output schema (per host):
```json
{"host":"mcow","status":"ok|degraded|fail","issues":[{"metric":"disk","value":"92%","threshold":"10%"}],"checked_at":"2026-04-15T00:00:00Z"}
```

Checks performed: `up` (fail), min disk avail (fail if <10%), memory
(degraded if <10% available), recent reboot (info, not a failure).

## tests/phase-03/

Phase 3 monitoring validation harness. Scripts are standalone; `smoke.sh` auto-discovers all `NN-*.sh` snippets in lexical order (excluding `00-env-check.sh`).

| Script | Purpose | Runtime |
|--------|---------|---------|
| `smoke.sh` | Config-only probes (`promtool`/`yamllint`/file checks) | <30s, offline |
| `suite.sh` | Config + live Tailnet probes against deployed stack | <90s |
| `lib.sh` | Shared helpers (`ok`, `fail`, `info`, `assert_file`, `assert_cmd`, `prom_query_must_succeed`) | sourced only |
| `00-env-check.sh` | Wave 0 gate: verify operator tooling + PVE firewall + animaya-dev Python3 | run before Phase 03 |

Add new `NN-<name>.sh` snippets as later plans land — `smoke.sh` picks them up automatically.

## Conventions

- Use `set -euo pipefail` at top of every script.
- Never embed secrets. Read from env vars or SOPS-decrypted files.
- Default-deny: destructive operations require explicit flag (`--force` etc.), never implicit.
- Log the resolved action to stdout before executing it (auditability for Claude Code as operator).
