# Alertmanager — mcow Deploy Notes

Alertmanager is part of the monitoring stack on **mcow** (`docker-compose.monitoring.yml`).
It routes alerts from Prometheus (on docker-tower) to Telegram via a Telegram Bot.

Migrated from docker-tower on 2026-04-15 (Plan 04-01). Prometheus remains on
docker-tower and sends alerts to `http://100.101.0.9:9093`.

## Bot Token Deploy Flow

The Telegram bot token is a secret and is **never committed** to the repo.
It lives in `secrets/mcow.sops.yaml` (encrypted with age/SOPS).

On every `docker compose up` (or after a token rotation), run on mcow:

```bash
mkdir -p /run/secrets

# 1. Decrypt the SOPS file to a temp env file
sops --decrypt --output-type dotenv /root/homelab/secrets/mcow.sops.yaml > /run/secrets/mcow.env
chmod 600 /run/secrets/mcow.env

# 2. Source it and write the bot token to a file readable by the alertmanager
#    container user. The prom/alertmanager image runs as `nobody` (uid/gid 65534),
#    so the file must be owned by (or group-readable to) gid 65534 — otherwise
#    the container hits "permission denied" opening telegram_token.
source /run/secrets/mcow.env
install -m 0440 -o root -g 65534 /dev/stdin /run/secrets/telegram_token <<<"$TELEGRAM_BOT_TOKEN"

# 3. Also install Grafana admin env (mode 0600 is fine — Grafana runs as root in-container)
install -m 0600 -o root -g root /dev/stdin /run/secrets/grafana.env <<EOF
GF_SECURITY_ADMIN_USER=$GF_SECURITY_ADMIN_USER
GF_SECURITY_ADMIN_PASSWORD=$GF_SECURITY_ADMIN_PASSWORD
EOF

# 4. Bring up the stack (telegram_token + grafana.env are bind-mounted into containers)
cd /root/homelab/servers/mcow
docker compose -f docker-compose.monitoring.yml up -d
```

The compose service mounts `/run/secrets/telegram_token` to
`/etc/alertmanager/telegram_token:ro` inside the container.
`alertmanager.yml` references it via `bot_token_file: /etc/alertmanager/telegram_token`.

## chat_id vs bot_token

- **chat_id** (`193835258`) is NOT a secret — it is committed plain in `alertmanager.yml`.
- **bot_token** IS a secret — it is file-mounted only, never inline in any committed file.

## Token Rotation

```bash
# Edit the SOPS file (opens $EDITOR with decrypted content, re-encrypts on save):
sops secrets/mcow.sops.yaml

# Then re-run the deploy flow above to install the new token file.
docker compose -f docker-compose.monitoring.yml restart alertmanager
```

## Manual Alert Test

After deployment, test Telegram delivery with amtool:

```bash
docker exec alertmanager amtool alert add \
  alertname=TestAlert severity=critical instance=mcow \
  --annotation=summary="Test alert from amtool" \
  --annotation=description="Verify Telegram delivery post-migration" \
  --alertmanager.url=http://localhost:9093
```

Wait ~30s for group_wait to fire. The alert should appear in the Telegram chat.

## Port Binding (Tailnet-only)

Alertmanager publishes `:9093` on `100.101.0.9` (Tailnet IP) — **never** `0.0.0.0`.
Verified by compose YAML port string `100.101.0.9:9093:9093`.

## Smoke-Test Ritual (Phase 20 / ALERT-05)

Prove the Prometheus → Alertmanager → Telegram path end-to-end whenever the
bot token rotates, the AM host moves, or Moscow ISP egress behavior shifts.

1. Add the `ClaudeUsageSmokeTest` rule to
   `servers/docker-tower/monitoring/prometheus/alerts/claude-usage.yml`:

   ```yaml
   - alert: ClaudeUsageSmokeTest
     expr: vector(1)
     for: 0m
     labels:
       severity: warning
       smoke_test: "true"
     annotations:
       summary: "Smoke test — Telegram E2E (ignore, rule will be removed)"
       description: "Phase 20 ALERT-05 smoke. If you see this, E2E works."
   ```

2. Deploy to docker-tower (rule file + Prometheus reload) via
   `ansible-playbook ansible/playbooks/deploy-docker-tower.yml` (or `scp` +
   `POST http://docker-tower:9090/-/reload` if ansible is unavailable).
3. Confirm the rule is loaded:

   ```bash
   ssh root@docker-tower "curl -fsS http://localhost:9090/api/v1/rules | grep -q ClaudeUsageSmokeTest"
   ```

4. Wait ~30s for group_wait to dispatch. Run
   `bash scripts/smoke-telegram-e2e.sh` — the script greps
   `alertmanager_notifications_failed_total{integration="telegram"}` on
   `100.101.0.9:9093/metrics` and fails if any reason bucket is non-zero.
5. Verify the message landed in chat `193835258`. Two options:
   - Operator: open Telegram, look for the "Smoke test — Telegram E2E" message.
   - Automated: run `python ~/hub/telethon/tests/smoke_alert_check.py`
     which resolves the homelab bot DM and asserts the smoke summary exists
     within the last `WINDOW_SECONDS` (default 600).
6. Remove the `ClaudeUsageSmokeTest` rule block from `claude-usage.yml` and
   redeploy. Commit both changes separately (`add smoke rule` + `remove smoke
   rule`) with Phase 20 / ALERT-05 references in the message.

Note: `alertmanager_notifications_failed_total` counts Telegram API attempts,
not deliveries — Moscow ISP can L4-block Telegram with the API still
returning 200. Operator/telethon verification in step 5 is the ground truth.
See memory `project_mcow_egress_lesson`.
