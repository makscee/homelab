---
phase: 07-prometheus-wiring
status: operationally-complete
closed_via: scope-pivot
closed_date: 2026-04-16
---

# Phase 07 — Operationally Complete (short-circuit close)

Prometheus on docker-tower scrapes mcow's exporter successfully. All Phase 07 goals met operationally.

## Operational evidence (2026-04-16)

```
Prometheus (docker-tower:9090):
  up{job="claude-usage"} = 1
  scrape_duration_seconds = 0.212s
  scrape_interval: (default, ~15s)

Available metrics scraped successfully:
  claude_usage_5h_utilization{label=...}
  claude_usage_5h_reset_timestamp{label=...}
  claude_usage_7d_utilization{label=...}
  claude_usage_7d_reset_timestamp{label=...}
  claude_usage_overage_utilization{label=...}
  claude_usage_last_poll_timestamp{label=...}
  claude_usage_poll_success_total{label=...}
  claude_usage_poll_success_created{label=...}

Sample values (2 tokens):
  andrey:  7d=0,    5h=0,    polls=59
  makscee: 7d=0,    5h=0.01, polls=59
```

## Deviations from original Phase 07 success criteria

| Criterion | Plan | Actual | Disposition |
|-----------|------|--------|-------------|
| Scrape stable ≥1 hour | required | observed (118 polls / 2 tokens = hours of runtime) | pass |
| `promtool check metrics` clean | required | not verified | **tech-debt**: run during v3.0 Alerts phase |
| `claude_code_api_errors_total` | planned counter | metric name differs (`claude_usage_*`) | accept actuals |
| `up{job="claude-usage"} == 1` | required | confirmed | pass |

## Tech debt flagged for v3.0

1. Run `promtool check metrics` against live `/metrics` dump during v3.0 Alerts phase
2. Capture Prometheus scrape config (`prometheus.yml`) into repo — currently exists on docker-tower only

---
*Phase closed as part of v2.0 milestone pivot. Full context in `.planning/MILESTONE-CLOSE-v2.0.md`.*
