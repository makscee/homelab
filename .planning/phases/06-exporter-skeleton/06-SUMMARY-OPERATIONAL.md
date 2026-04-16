---
phase: 06-exporter-skeleton
status: operationally-complete
closed_via: scope-pivot
closed_date: 2026-04-16
---

# Phase 06 — Operationally Complete (short-circuit close)

Phase 06 was never formally executed through GSD. The exporter was built ad-hoc during Phase 05 planning and is running in production on mcow when this phase was closed.

## Operational evidence (2026-04-16)

```
systemctl show claude-usage-exporter.service:
  User=root
  ExecStart=/opt/claude-usage-exporter/venv/bin/python3 /opt/claude-usage-exporter/exporter.py
  MainPID=1458962
  start_time=[Thu 2026-04-16 23:04:46 WITA]

ss -tlnp | grep 9101:
  LISTEN 0.0.0.0:9101  python3/1458962

Prometheus scrape (docker-tower):
  up{job="claude-usage", instance="100.101.0.9:9101"} = 1
  scrape_duration_seconds = 0.212s
  claude_usage_poll_success_total{label="andrey"} = 59
  claude_usage_poll_success_total{label="makscee"} = 59
```

## Deviations from original Phase 06 success criteria

| Criterion | Plan | Actual | Disposition |
|-----------|------|--------|-------------|
| Port | 9201 | 9101 | rename never needed; accept |
| User uid | 65534 (nobody) | root | **tech-debt**: fix during v3.0 Claude Tokens page migration |
| Bind address | Tailnet IP only (100.101.0.9:9201) | 0.0.0.0:9101 | **tech-debt**: rebind during v3.0 |
| Exporter = Python venv | container | systemd + venv | acceptable homelab pattern |
| Metric names | `claude_code_weekly_used_ratio` | `claude_usage_7d_utilization` | accept actual names; v3.0 dashboard consumes actuals |

## Tech debt flagged for v3.0

1. Rebind exporter to `100.101.0.9:9101` (Tailnet-only)
2. Run as `nobody(65534)` with read-only token mount
3. Consider containerizing for consistency
4. Verify exponential backoff on 429 (not observed since 0% 429 rate in prod)

## Files (not committed to repo — operator-side)

- `/opt/claude-usage-exporter/exporter.py`
- `/opt/claude-usage-exporter/venv/`
- `/etc/systemd/system/claude-usage-exporter.service`

These live on mcow only. During v3.0 Phase 5 (Claude Tokens page), the exporter will be moved into the monorepo and re-deployed via Ansible.

---
*Phase closed as part of v2.0 milestone pivot. Original PLAN.md never written. Full context in `.planning/MILESTONE-CLOSE-v2.0.md`.*
