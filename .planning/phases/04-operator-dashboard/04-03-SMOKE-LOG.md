# 04-03 Alertmanager → Telegram Smoke Test Log

**Date:** 2026-04-15
**Trigger host:** cc-worker (100.99.133.9)
**Rule:** HostDown (for: 2m)
**Alertmanager:** http://100.101.0.9:9093
**Prometheus:** http://100.101.0.8:9090
**Telegram chat:** 193835258

## Pre-flight — 2026-04-15T14:23:01Z

### Silence (Option B — operator decision)

Silenced DiskUsageCritical alerts for 15 min to get clean counter deltas:

- **Silence ID:** `05ca7661-1a47-48ae-b76e-18ed94fd65ec`
- **Matcher:** `alertname=DiskUsageCritical` (covers both tower + docker-tower)
- **Window:** 2026-04-15T14:22:xx → T14:37:xx UTC
- **Created by:** `04-03-smoke-test`
- Both `DiskUsageCritical{instance=100.101.0.7:9100}` and `{instance=100.101.0.8:9100}` confirmed `state=suppressed`

### Steady state
- `active` alerts with `silenced=false`: **0** (clean)
- cc-worker `up{job="node",instance="100.99.133.9:9100"}` = **1**

### Baseline counters (Alertmanager `/metrics`)

| Metric | Value |
|---|---|
| `alertmanager_notifications_total{integration="telegram"}` | **8** |
| `alertmanager_notifications_failed_total{integration="telegram",reason="other"}` | 6 |
| `alertmanager_notifications_failed_total{integration="telegram",reason="clientError"}` | 0 |
| `alertmanager_notifications_failed_total{integration="telegram",reason="serverError"}` | 0 |
| `alertmanager_notifications_failed_total{integration="telegram",reason="contextCanceled"}` | 0 |
| `alertmanager_notifications_failed_total{integration="telegram",reason="contextDeadlineExceeded"}` | 0 |

Note: This AM build exposes `alertmanager_notifications_total` with only the `integration` label (no `receiver` label). The plan's metric selector was adjusted accordingly.

## Trigger — pending

(Populated after step 4)

## Resolve — pending

(Populated after step 5)

## Post-test counters — pending

(Populated after step 6)
