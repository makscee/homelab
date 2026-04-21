#!/usr/bin/env bash
# Phase 20 ALERT-05 — Prometheus → Alertmanager → Telegram E2E smoke ritual.
#
# Live layout (as of 2026-04-15 migration):
#   - Prometheus on docker-tower (scrapes claude-usage exporter on mcow).
#   - Alertmanager on mcow (100.101.0.9:9093, bound to Tailnet IP).
#   - Telegram bot delivers to chat 193835258 via bot_token_file.
#
# Usage:
#   1. Deploy the smoke rule (ClaudeUsageSmokeTest in claude-usage.yml) via
#      ansible-playbook ansible/playbooks/deploy-docker-tower.yml OR scp+reload.
#   2. Confirm the rule is loaded:
#        ssh root@docker-tower "curl -fsS http://localhost:9090/api/v1/rules \
#          | grep -q ClaudeUsageSmokeTest"
#   3. Wait ~30s for Alertmanager to dispatch to telegram-homelab receiver.
#   4. Run this script to assert zero telegram delivery failures across the
#      smoke window.
#   5. Operator (or telethon harness at ~/hub/telethon) confirms the message
#      landed in chat 193835258. Note: failed_total counts Telegram API
#      attempts, not deliveries — operator/telethon verification is the real
#      truth (see memory: project_mcow_egress_lesson).
#   6. Remove the smoke rule and redeploy; commit both changes with references
#      to Phase 20 / ALERT-05 so the paper trail is complete.
#
# Exits 0 if alertmanager_notifications_failed_total{integration="telegram"}
# reports 0 over the most recent scrape. Exits 1 otherwise.

set -euo pipefail

AM_HOST="${AM_HOST:-100.101.0.9}"   # mcow Tailnet IP
AM_PORT="${AM_PORT:-9093}"
URL="http://${AM_HOST}:${AM_PORT}/metrics"

echo "[smoke] scraping ${URL} for alertmanager_notifications_failed_total{integration=\"telegram\"}"

# Fetch metric line(s) for telegram integration. Works from any Tailnet host.
metric_line=$(curl -fsS "${URL}" \
  | grep -E '^alertmanager_notifications_failed_total\{[^}]*integration="telegram"' \
  || true)

if [[ -z "${metric_line}" ]]; then
  echo "[smoke] FAIL — metric alertmanager_notifications_failed_total{integration=\"telegram\"} not found"
  exit 1
fi

echo "[smoke] samples:"
echo "${metric_line}" | sed 's/^/  /'

# Sum all telegram integration failure counts across receivers/reasons.
total=$(echo "${metric_line}" | awk '{print $NF}' | awk '{s+=$1} END {printf "%d", s}')
echo "[smoke] total telegram failures = ${total}"

if [[ "${total}" != "0" ]]; then
  echo "[smoke] FAIL — expected 0 failures, got ${total}"
  exit 1
fi

echo "[smoke] PASS — 0 telegram delivery failures across smoke window"
exit 0
