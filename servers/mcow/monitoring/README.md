# mcow — Monitoring Stack

**Migrated from docker-tower on 2026-04-15** (Plan 04-01 of Phase 04 — Operator Dashboard).

## What Lives Here

| Service      | Port (Tailnet)         | Source of Truth                                    |
| ------------ | ---------------------- | -------------------------------------------------- |
| Grafana      | `100.101.0.9:3000`     | `../docker-compose.monitoring.yml`                 |
| Alertmanager | `100.101.0.9:9093`     | `../docker-compose.monitoring.yml`                 |
| cAdvisor     | `100.101.0.9:18080`    | `../docker-compose.cadvisor.yml` (pre-existing)    |

Grafana and Alertmanager were migrated off docker-tower in Plan 04-01.
**Prometheus stays on docker-tower** (`100.101.0.8:9090`) and scrapes targets
over Tailnet. Grafana's Prometheus datasource points at docker-tower.

## Layout

```
monitoring/
├── README.md                               # this file
├── alertmanager/
│   ├── alertmanager.yml                    # Telegram receiver (chat_id 193835258)
│   └── README.md                           # deploy flow + perms recipe
└── grafana/
    └── provisioning/
        ├── datasources/
        │   ├── prometheus.yml              # uid: prometheus-homelab → docker-tower
        │   └── alertmanager.yml            # uid: alertmanager-homelab → local AM
        └── dashboards/
            ├── dashboards.yml              # provider config
            └── json/                       # dashboards-as-code JSON (04-02 populates)
```

## Secrets Flow (Summary)

All secrets are SOPS-encrypted in `secrets/mcow.sops.yaml` at repo root.

1. On deploy, decrypt to `/run/secrets/mcow.env` (mode 0600).
2. `TELEGRAM_BOT_TOKEN` → `/run/secrets/telegram_token` (**mode 0440 root:65534** — load-bearing, see `alertmanager/README.md`).
3. `GF_SECURITY_ADMIN_USER` + `GF_SECURITY_ADMIN_PASSWORD` → `/run/secrets/grafana.env` (mode 0600 root:root).
4. Both files are bind-mounted into the respective containers.

Never commit `/run/secrets/*` — gitignored at repo root.

## Rollback (1-week window: 2026-04-15 → 2026-04-22)

On docker-tower, the `grafana-data` and `alertmanager-data` volumes are
preserved (containers commented out in its compose). To roll back:

1. Uncomment the `grafana:` + `alertmanager:` stanzas in
   `servers/docker-tower/docker-compose.monitoring.yml`.
2. Rewire Prometheus `alertmanagers:` target back to `localhost:9093`.
3. `docker compose -f docker-compose.monitoring.yml up -d` on docker-tower.
4. Stop mcow stack: `docker compose -f docker-compose.monitoring.yml down` on mcow.

After 2026-04-22, delete docker-tower volumes:
```bash
ssh root@docker-tower 'docker volume rm homestack_grafana-data homestack_alertmanager-data'
```
