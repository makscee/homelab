# claude-usage-exporter

Prometheus exporter for per-token Claude Code quota utilization. Polls
`api.anthropic.com/v1/messages` with a minimal Haiku request, reads the
`anthropic-ratelimit-unified-*` response headers, and exposes them as
gauges/counters on `--bind-address:--port/metrics`.

## Deploy target

- **Host:** `mcow` (`100.101.0.9`)
- **Install dir:** `/opt/claude-usage-exporter` (root-owned, read-only to service)
- **State dir:** `/var/lib/claude-usage-exporter` (nobody-readable, 0750)
- **Registry:** `/var/lib/claude-usage-exporter/claude-tokens.json` (mode 0440, owner nobody:nogroup)
- **Service user:** `nobody` (uid 65534) — see `../systemd/claude-usage-exporter.service`
- **Bind:** `100.101.0.9:9101` (Tailnet-only; unit also enforces `IPAddressAllow=100.101.0.0/16`)

## CLI flags

```
exporter.py --bind-address HOST --port PORT --registry PATH \
            --poll-interval SECONDS --reload-interval SECONDS
```

| Flag                | Default       | Notes                                               |
| ------------------- | ------------- | --------------------------------------------------- |
| `--bind-address`    | `127.0.0.1`   | systemd unit passes `100.101.0.9`                   |
| `--port`            | `9101`        | Prometheus scrape port                              |
| `--registry`        | required      | Path to decrypted `claude-tokens.json`              |
| `--poll-interval`   | `300`         | Seconds between Anthropic API probes per token      |
| `--reload-interval` | `30`          | Seconds between registry mtime checks (see below)   |

## Runtime reload

The exporter watches `--registry` for mtime changes every
`--reload-interval` seconds (default 30s). When the admin dashboard writes a
new token via SOPS and an Ansible handler re-renders the decrypted file on
mcow, the `mtime` advances and the exporter picks up the new token set on the
next check — **no systemd restart is required for registry changes** (D-13-07).

Flow:

1. Admin UI calls `/api/tokens` → server writes encrypted `secrets/claude-tokens.sops.yaml`.
2. Ansible handler (or scheduled playbook run) decrypts the SOPS file and renders
   `/var/lib/claude-usage-exporter/claude-tokens.json` (0440 nobody:nogroup).
3. Within `reload_interval` seconds the exporter re-reads the file, filters out
   `enabled=false` and `deleted_at != null` entries, and updates its in-memory
   token list. Stale gauge label-series are dropped so Prometheus stops
   reporting metrics for removed tokens.

Restart IS still required for:

- Changes to `exporter.py` code
- Changes to CLI flags / the systemd unit itself
- Changes to `/opt/claude-usage-exporter/*` (bytes on the install dir)

## Secret hygiene

- Log formatters NEVER include the `value` / `token` field — only the
  human `label` and counts.
- Any string that accidentally contains an `sk-ant-oat01-...` prefix is
  replaced with `sk-ant-oat01-[REDACTED]` via `_redact()` before logging.
- Metrics carry the `name` label (= registry `label`), never the token value.
- systemd unit sets `ReadOnlyPaths=/opt/claude-usage-exporter` so the service
  cannot mutate its own source.

## Tests

```
cd servers/mcow/claude-usage-exporter
python3 -m venv .venv
.venv/bin/pip install pytest requests prometheus_client
.venv/bin/python -m pytest test_exporter.py -x -v
```

Expected: 5 passed (noop-on-unchanged-mtime, reload-on-mtime-advance,
enabled+deleted_at filtering, missing-file graceful, token-value redaction).

## Deploy

```
ansible-playbook -i ansible/inventory.ini ansible/playbooks/deploy-claude-usage-exporter.yml
```

A second run must report `changed=0` — see Plan 13-02 §Task 4.
