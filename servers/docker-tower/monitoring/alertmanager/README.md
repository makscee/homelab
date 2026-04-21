# Alertmanager — Deploy Notes

> **DECOMMISSIONED 2026-04-15** — Alertmanager moved to mcow.
> See `servers/mcow/monitoring/alertmanager/README.md` for the live deploy flow.
> Volume `monitoring_alertmanager-data` on docker-tower preserved until 2026-04-22 for rollback.
> Phase 20 `ClaudeUsageSmokeTest` ritual lives in the mcow README (§Smoke-Test Ritual).

Alertmanager is part of the monitoring stack on docker-tower (`docker-compose.monitoring.yml`).
It routes alerts from Prometheus to Telegram via a Telegram Bot.

## Bot Token Deploy Flow

The Telegram bot token is a secret and is **never committed** to the repo.
It lives in `secrets/docker-tower.sops.yaml` (encrypted with age/SOPS).

On every `docker compose up` (or after a token rotation), run:

```bash
mkdir -p /run/secrets

# 1. Decrypt the SOPS file to a temp env file
sops --decrypt --output-type dotenv ../../secrets/docker-tower.sops.yaml > /run/secrets/docker-tower.env
chmod 600 /run/secrets/docker-tower.env

# 2. Source it and write the bot token to a file readable by the alertmanager
#    container user. The prom/alertmanager image runs as `nobody` (uid/gid 65534),
#    so the file must be owned by (or group-readable to) gid 65534 — otherwise
#    the container hits "permission denied" opening telegram_token.
source /run/secrets/docker-tower.env
install -m 0440 -o root -g 65534 /dev/stdin /run/secrets/telegram_token <<<"$TELEGRAM_BOT_TOKEN"

# 3. Bring up the stack (telegram_token is bind-mounted into the alertmanager container)
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
sops secrets/docker-tower.sops.yaml

# Then re-run the deploy flow above to install the new token file.
docker compose -f docker-compose.monitoring.yml restart alertmanager
```

## Manual Alert Test

After deployment, test Telegram delivery with amtool:

```bash
docker exec alertmanager amtool alert add \
  alertname=TestAlert severity=critical instance=docker-tower \
  --annotation=summary="Test alert from amtool" \
  --annotation=description="Verify Telegram delivery" \
  --alertmanager.url=http://localhost:9093
```

Wait ~30s for group_wait to fire. The alert should appear in the Telegram chat.
This manual test is documented in Plan 03-05.
