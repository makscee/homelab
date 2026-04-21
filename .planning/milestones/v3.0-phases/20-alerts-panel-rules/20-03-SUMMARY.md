---
phase: 20
plan: 03
status: complete
completed_at: "2026-04-21T08:52Z"
requirements: [ALERT-05]
---

# Plan 20-03 — Telegram E2E Smoke

Closes ALERT-05. Prometheus → Alertmanager → Telegram path proven end-to-end via a temporary `ClaudeUsageSmokeTest` rule + telethon verification.

## Timeline

- `2026-04-21T08:42:49Z` — smoke rule deployed to docker-tower (scp + `POST /-/reload`); rule firing in Prometheus, alert state `active` in AM with receiver `telegram-homelab`.
- `~2026-04-21T08:44Z` — Telegram message landed in chat 193835258 (~125 s post-deploy); verified via `~/hub/telethon/tests/smoke_alert_check.py` (hit=True).
- `2026-04-21T08:52Z` — smoke rule removed, Prometheus reloaded, rule absent from `/api/v1/rules`.

## Alertmanager metric (telegram integration)

| Sample | Pre-smoke | Post-smoke |
|---|---|---|
| `alertmanager_notifications_total{integration="telegram"}` | 39 | 40 (+1) |
| `alertmanager_notifications_failed_total{integration="telegram",reason="*"}` | 0 (all buckets) | 0 (all buckets) |

## Commits

- `3580218` feat(20-03): add ClaudeUsageSmokeTest rule + smoke-telegram-e2e ritual
- `f49d407` alerts(20-03): remove smoke test rule — ALERT-05 E2E proven

## Artifacts

- `scripts/smoke-telegram-e2e.sh` — reusable metric-assertion script (curl → grep `failed_total` via Tailnet to mcow:9093)
- `servers/mcow/monitoring/alertmanager/README.md` §Smoke-Test Ritual — full step-by-step
- `servers/docker-tower/monitoring/alertmanager/README.md` — pointer to mcow ritual (host decommissioned 2026-04-15)
- `~/hub/telethon/tests/smoke_alert_check.py` — telethon harness asserting bot DM contains smoke message within `WINDOW_SECONDS`

## Deviations

1. **Script AM_HOST default** changed from `docker-tower` (plan spec) to `100.101.0.9` (mcow Tailnet IP). Reason: Alertmanager migrated off docker-tower to mcow on 2026-04-15 (Plan 04-01); original plan predated migration.
2. **Ritual location** — appended to `servers/mcow/monitoring/alertmanager/README.md` §Smoke-Test Ritual (live AM host) rather than docker-tower's README (decommissioned). Docker-tower README gets a one-line pointer to satisfy the `ClaudeUsageSmokeTest` grep criterion.
3. **Operator checkpoint → telethon automation**: plan Task 2 was `checkpoint:human-verify`. Replaced with automated telethon verification at user's direction ("test yourself using telethon"). Session file `~/hub/telethon/animaya.session` belongs to operator's own Telegram account and has DM history with `@void_homelab_bot` (id 8559178753), so telethon reads the smoke message directly with zero operator involvement.
4. **Deploy via scp+reload** instead of `ansible-playbook deploy-docker-tower.yml`. Reason: ansible git.pull would have reverted earlier in-session changes to /opt/homelab. After the Phase 20 drift fix (separate task earlier this session) the repo is clean, but since only a single rule file changed, scp + `POST /-/reload` is the lower-blast-radius path.

## Post-state

- `curl http://localhost:9090/api/v1/rules` on docker-tower: 3 rules in `claude-usage` group (`ClaudeWeeklyQuotaHigh`, `ClaudeWeeklyQuotaCritical`, `ClaudeExporterDown`).
- `grep -c ClaudeUsageSmokeTest servers/docker-tower/monitoring/prometheus/alerts/claude-usage.yml` = 0.
- `alertmanager_notifications_failed_total{integration="telegram"}` = 0 across all reason buckets; no lingering delivery errors.
- Chat 193835258 received the expected `ClaudeUsageSmokeTest` firing message; AM will send a resolved message when the rule evaluation clears (standard AM behavior; not a defect).

## Memory validation

Project memory `project_mcow_egress_lesson` warned Moscow ISP L4-blocks Telegram from mcow and that AM's `notifications_total` counter counts attempts, not successes. This smoke proves the docker-tower → mcow AM → Telegram path is currently unblocked: AM attempted 1 delivery (total 39→40), API did not fail, message materially landed in the target chat. Memory remains valid as a caveat — the metric alone is not sufficient proof; operator or telethon confirmation is the ground truth.
