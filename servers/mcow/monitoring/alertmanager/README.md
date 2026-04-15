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
