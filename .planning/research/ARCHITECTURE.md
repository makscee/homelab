# Architecture — Claude Code Usage Monitor

**Milestone:** v2.0
**Researched:** 2026-04-16
**Confidence:** HIGH (integration paths verified against live v1.0 files); MEDIUM on Anthropic quota endpoint (feasibility-gated — see PITFALLS.md and FEATURES.md)

---

## Integration Points (existing stack touchpoints)

Every touchpoint is an **existing v1.0 file**. v2.0 must extend, not replace.

| # | Integration point | File | Change type |
|---|---|---|---|
| 1 | Prometheus scrape config | `servers/docker-tower/monitoring/prometheus/prometheus.yml` | **Modify** — append one `scrape_configs` job using `file_sd_configs` (matches `node` / `cadvisor` pattern at lines 27–39) |
| 2 | Prometheus target file | `servers/docker-tower/monitoring/prometheus/targets/claude-usage.yml` | **New** — one-entry target list, mirrors `targets/cadvisor.yml` (2-line style) |
| 3 | Alert rules | `servers/docker-tower/monitoring/prometheus/alerts/claude-usage.yml` | **New** — rule_files glob is `/etc/prometheus/alerts/*.yml`, so a new file is auto-picked up. Keeps `alerts/homelab.yml` focused on infra (nodes/containers/prometheus groups) |
| 4 | Alertmanager routes | `servers/mcow/monitoring/alertmanager/alertmanager.yml` | **Modify** — add one `route` matching `alertname =~ "ClaudeQuota.*"` into the existing `telegram-homelab` receiver (chat_id 193835258 reused — no new secret). Could optionally add a second receiver with a distinct emoji/group_wait; v2.0 keeps it simple with one receiver |
| 5 | Grafana dashboard | `servers/mcow/monitoring/grafana/provisioning/dashboards/json/claude-usage.json` | **New** — `dashboards.yml` provisioner already globs `json/*.json` (path: `/etc/grafana/provisioning/dashboards/json`). No provisioner edits needed. Dashboard UID: `claude-usage-homelab`. Siblings: `homelab-overview.json`, `homelab-summary.json`, `homelab-mobile.json` |
| 6 | Compose stack on mcow | `servers/mcow/docker-compose.usage-monitor.yml` | **New** — separate file (see §New Components for rationale) |
| 7 | SOPS secret | `secrets/claude-tokens.sops.yaml` | **New** — sibling of `mcow.sops.yaml`. Structure: see §Token Registry Schema |
| 8 | Ansible playbook | `ansible/playbooks/deploy-mcow-usage-monitor.yml` | **New** — clone of `deploy-docker-tower.yml` structure (sops decrypt → push env → git pull → compose up → hot-reload Prometheus on docker-tower) |
| 9 | Ansible (docker-tower) — config hot-reload | `ansible/playbooks/deploy-docker-tower.yml` | **Unmodified** — existing `POST /-/reload` task already picks up scrape/rule changes on `git_result.changed`. v2.0 deploy order: commit → run mcow playbook → run docker-tower playbook. No code change, just ordering |

## New Components

### Decision: separate compose file, same directory

**Chosen:** `servers/mcow/docker-compose.usage-monitor.yml` (sibling to `docker-compose.monitoring.yml` and `docker-compose.cadvisor.yml`).

**Rationale:** mcow already runs multiple compose files in the same directory (`docker-compose.monitoring.yml` for grafana+alertmanager, `docker-compose.cadvisor.yml`, plus voidnet stacks). The precedent is **one compose file per concern**, deployed independently. Extending `docker-compose.monitoring.yml` would mix a stateful observability collector with an outbound-API-calling exporter whose failure modes (rate limits, 401s, geo-block) are orthogonal to Grafana/Alertmanager health. A subdirectory (`servers/mcow/usage-monitor/`) would break the established flat layout and confuse Ansible playbook path computation.

### Container shape

```yaml
# servers/mcow/docker-compose.usage-monitor.yml (sketch)
services:
  claude-usage-exporter:
    image: ghcr.io/<repo>/claude-usage-exporter:<pinned-digest>
    container_name: claude-usage-exporter
    restart: unless-stopped
    ports:
      - "100.101.0.9:9201:9201"          # Tailnet-only; see §Port
    volumes:
      - /run/secrets/claude-tokens.yaml:/etc/exporter/tokens.yaml:ro  # SOPS-decrypted at deploy
    environment:
      # If Tailscale App Connector advertises api.anthropic.com via MagicDNS,
      # no proxy env vars are needed. Otherwise:
      # - HTTPS_PROXY=http://100.101.0.3:<proxy-port>
      # - NO_PROXY=localhost,127.0.0.1,100.101.0.0/16
    command:
      - '--config=/etc/exporter/tokens.yaml'
      - '--listen=:9201'
    networks: [monitoring]
networks:
  monitoring:
    external: true    # shared mcow monitoring net (already created by docker-compose.monitoring.yml)
```

### Port: **9201**

Scanned all current bindings across `servers/**/*.yml`:

| Port | In use by |
|------|-----------|
| 3000 | grafana (mcow) |
| 5030 / 50300 | slskd |
| 7878 / 8989 / 8686 | radarr / sonarr / lidarr |
| 8080 | cadvisor (docker-tower) |
| 8096 | jellyfin |
| 9001 | portainer agent (docker-tower) |
| 9090 | prometheus |
| 9093 | alertmanager |
| 9100 | node-exporter (all hosts) |
| 9443 | portainer (nether) |
| 18080 | cadvisor on mcow (non-host net — :8080 taken by voidnet-api) |

**9201 is free** across all hosts. Rationale: 9200 is a near-standard Elasticsearch port (future-proof against ES-style regret); **91xx/92xx is the Prometheus-exporter convention** (9100 node, 9104 mysqld, 9115 blackbox, 9187 postgres, 9252 gitlab). 9201 falls cleanly in that band. If a second exporter emerges later (e.g. `voidnet-exporter`), suggest 9202.

Bind is `100.101.0.9:9201` (Tailnet-only, not 0.0.0.0), matching the mcow pattern for grafana/alertmanager/cadvisor.

## Data Flow Diagram

```
                         ┌──────────────────────────────────────┐
                         │        api.anthropic.com             │
                         │   (NOT reachable from Moscow IPs)    │
                         └──────────────┬───────────────────────┘
                                        │ HTTPS (OAuth bearer)
                                        │
                   ┌────────────────────┴───────────────────────┐
                   │  nether (100.101.0.3, Netherlands)         │
                   │  Tailscale App Connector (existing v1.0)   │
                   │  — already proxies Telegram IPv4 egress    │
                   └────────────────────┬───────────────────────┘
                                        │ Tailnet (100.101.0.0/16)
                                        │ advertised route via MagicDNS
                                        │
    ┌───────────────────────────────────┴────────────────────────┐
    │ mcow (100.101.0.9, Moscow)                                 │
    │                                                            │
    │  ┌──────────────────────────────────────┐                  │
    │  │ claude-usage-exporter  :9201         │                  │
    │  │  ├── reads /etc/exporter/tokens.yaml │                  │
    │  │  │    (SOPS-decrypted at deploy)     │                  │
    │  │  └── emits /metrics per label        │                  │
    │  │       claude_code_weekly_used_ratio  │                  │
    │  │       claude_code_session_used_ratio │                  │
    │  └──────────────────┬───────────────────┘                  │
    └─────────────────────┼──────────────────────────────────────┘
                          │ Tailnet pull :9201/metrics (every 15s)
                          │
   ┌──────────────────────┴──────────────────────┐
   │ docker-tower (100.101.0.8)                  │
   │  ┌──────────────────────────────────┐       │
   │  │ prometheus :9090                 │       │
   │  │  scrape_configs:                 │       │
   │  │    - job_name: claude-usage      │       │
   │  │      file_sd: targets/claude...  │       │
   │  │  rule_files: alerts/*.yml        │       │
   │  │  alerting → 100.101.0.9:9093     │       │
   │  └────────┬─────────────────────────┘       │
   └───────────┼─────────────────────────────────┘
               │ Tailnet (alertmanager push)
               │
   ┌───────────┴─────────────────────────────────┐
   │ mcow :9093 alertmanager                     │
   │   routes: alertname =~ "ClaudeQuota.*"      │
   │   → telegram-homelab receiver               │
   │   → Telegram (via existing nether           │
   │      App Connector path, already E2E-proven)│
   └──────────────────┬──────────────────────────┘
                      │
                      ▼
              Telegram chat 193835258
                (operator group)

   ┌──────────────────────────────────────┐
   │ mcow :3000 grafana                   │
   │   datasource: docker-tower:9090      │
   │   dashboard: claude-usage.json       │
   │   uid: claude-usage-homelab          │
   └──────────────────────────────────────┘
```

### New Tailscale / firewall holes

| Hop | Path | New ACL? | Notes |
|-----|------|----------|-------|
| prometheus → exporter | `100.101.0.8:ephemeral → 100.101.0.9:9201` | **Effectively no** — v1.0 already permits docker-tower→mcow on `:9100`, `:9093`, `:18080`. Same source/dest pair, new port. If Tailscale ACL is port-scoped, add `9201` to mcow's allowed ingress. If it is `accept` any-port between homelab hosts (likely, per SEC-03 deferral), no change |
| exporter → nether proxy | `100.101.0.9 → 100.101.0.3:<proxy-port>` | **No** (reused) — nether App Connector already accepts Tailnet clients for Telegram egress. Same mechanism advertises `api.anthropic.com` routes |
| nether → api.anthropic.com | egress | **No** — nether has direct public IPv4 outbound; Anthropic does not block NL IPs |

## Token Registry Schema

**Chosen:** structured YAML list (not flat env style).

```yaml
# secrets/claude-tokens.sops.yaml  (plaintext form — committed encrypted)
tokens:
  - label: laptop-maks
    token: sk-ant-oat01-...
    owner_host: laptop-maks       # free-form string; becomes `host` label in exporter metrics
    tier: max20x                  # enum: pro | max5x | max20x | team | enterprise
    added: 2026-04-16             # ISO date, informational only
    notes: ""                     # optional, free-form

  - label: cc-worker
    token: sk-ant-oat01-...
    owner_host: cc-worker
    tier: max20x
    added: 2026-04-16
    notes: "Shared dev worker; rotate if cc-worker LXC is reprovisioned"
```

### Why structured over flat env

| Dimension | Structured YAML (chosen) | Flat env (`CLAUDE_TOKEN_LAPTOP=sk-…`) |
|-----------|--------------------------|----------------------------------------|
| SOPS behavior | Per-value encryption; keys `label`, `tier`, `added` remain readable in git | Per-value encryption; key names readable, but structure lost in flat namespace |
| Metric labels | Exporter reads `label`, `owner_host`, `tier` directly → emits as Prometheus labels | Must parse env key names (fragile) or duplicate metadata elsewhere |
| Adding a token | One YAML block | Must add 3–5 env vars with parallel naming convention |
| Rotation (Shape A) | Edit one block, `sops --encrypt` | Easier to mis-paste across 5 parallel env vars |
| Validation | Schema-validatable at exporter startup | Ad-hoc parsing |

### SOPS rules

Repo already has `.sops.yaml` matching `secrets/*.sops.yaml` to the homelab age recipient. New file inherits — no config change.

**Encrypted values:** `token` (and by current repo default, everything else too — which is acceptable; `sops --decrypt` is one command for review).

### Exporter config interface

**Follow v1.0 precedent** (from `docker-compose.monitoring.yml` deploy-flow comments and `deploy-docker-tower.yml` SOPS pattern):

1. **Ansible controller** runs `sops --decrypt secrets/claude-tokens.sops.yaml > /tmp/claude-tokens.yaml`.
2. **Ansible `copy`** pushes the plaintext YAML to `/run/secrets/claude-tokens.yaml` on mcow, mode `0440 root:root` (match container user — likely root for an in-repo image; flip to `root:65534` only if image declares `USER nobody`).
3. **docker-compose** bind-mounts `/run/secrets/claude-tokens.yaml:/etc/exporter/tokens.yaml:ro`.
4. **Exporter** takes `--config=/etc/exporter/tokens.yaml`, loads on startup. SIGHUP reload is nice-to-have; Ansible can `docker restart claude-usage-exporter` on config change instead (simpler).

No per-token CLI args, no env-var proliferation. Single file, single mount — same shape as `telegram_token` in v1.0.

## Suggested Build Order

Dependency-ordered. Each phase produces a visible artifact the next depends on.

1. **Phase R — Feasibility research** (BLOCKING, non-negotiable per PROJECT.md).
   - Determine whether Anthropic exposes an OAuth-queryable quota endpoint.
   - Outcome gate: YES → phases 2+ use the real endpoint. NO → fall back to local counter strategy (likely requires per-host agent on each Claude-running LXC, expanding v2.0 scope; flag for milestone reshape).
   - **Until R resolves, do not write exporter code.**

2. **Phase E — Exporter skeleton on mcow, one token, no alerts.**
   - `docker-compose.usage-monitor.yml` with hand-populated plaintext `tokens.yaml` (one entry, operator's personal token).
   - Exporter emits `claude_code_weekly_used_ratio{label="laptop-maks",tier="max20x"}` and `claude_code_session_used_ratio{...}` — even a stub `0.0` is fine initially.
   - Bind `:9201`, verify `curl 100.101.0.9:9201/metrics` from docker-tower.
   - *Dependencies: Phase R. Required by every subsequent phase.*

3. **Phase P — Prometheus integration.**
   - Add `targets/claude-usage.yml`, scrape_configs block in `prometheus.yml`, git pull on docker-tower, `POST /-/reload` (existing playbook covers this).
   - Verify UP state in Prometheus UI (`http://100.101.0.8:9090/targets`).
   - *Dependencies: Phase E producing a real /metrics endpoint.*

4. **Phase S — SOPS token registry.**
   - Create `secrets/claude-tokens.sops.yaml` with one entry (same token Phase E used plaintext).
   - Update Ansible playbook: decrypt → push → restart exporter.
   - Delete plaintext fallback.
   - *Dependencies: Phase E. Must precede multi-token to prove encrypted path works.*

5. **Phase A — Alerts.**
   - Create `alerts/claude-usage.yml` with `ClaudeQuotaWeeklyHigh` (80%), `ClaudeQuotaWeeklyCritical` (95%), same for session.
   - Add Alertmanager route matching `alertname =~ "ClaudeQuota.*"`.
   - Force-fire test: temporarily set threshold to 0.0 → observe Telegram message → revert.
   - *Dependencies: Phase P (needs metric in Prometheus). Independent of dashboard.*

6. **Phase D — Grafana dashboard.**
   - Drop `claude-usage.json` into provisioning. UID `claude-usage-homelab`.
   - Gauge row (current ratios per label) + timeseries row (historical) + token-selector variable (`label` as template var).
   - *Dependencies: Phase P. After alerts — alerts are the safety floor; dashboard is diagnostic polish.*

7. **Phase M — Multi-token rollout.**
   - Expand `claude-tokens.sops.yaml` to 2–5 entries (personal + worker LXCs).
   - Restart exporter, verify per-label metrics in Grafana.
   - *Dependencies: Phase S, D, A. Last so alerts and dashboards are proven against one token before fan-out surfaces new edge cases (per-tier quota differences, API rate limits on parallel polls).*

### Ordering rationale summary

- **Alerts before dashboards** (A before D) — alerts are the safety mechanism and the reason this milestone exists; dashboards are visibility on top.
- **Single token before multi-token** (E → M at end) — debug single path first; multi-token adds fan-out concerns orthogonal to the core integration.
- **SOPS before alerts** (S before A) — once alerts exist, tokens leaving plaintext in git during debugging becomes a real risk. Gate the plaintext window tightly.
- **Research blocks everything** — if R says "no endpoint," phases 2–7 fundamentally reshape.

## Egress Path Decision

**Decision: mcow MUST egress to api.anthropic.com via nether App Connector. Direct egress is infeasible.**

### Evidence

- **Anthropic geo-blocks Russian IPs.** Confirmed 2026-04 via community tracker ([v2fly/domain-list-community #2860](https://github.com/v2fly/domain-list-community/issues/2860)) — `api.anthropic.com` requires proxy from RU IPs. Anthropic's [supported countries page](https://www.anthropic.com/supported-countries) does not list Russia.
- **mcow is in Moscow** with a Russian public IPv4 route.
- **Precedent exists:** PROJECT.md "Key Decisions" explicitly logs `Tailscale App Connector on nether (IPv4 Telegram egress fallback)`. The same mechanism applies here. Memory entry `project_mcow_egress_lesson.md` already warns that Moscow ISP behavior requires App Connector routing.

### Implementation options (ranked)

1. **Preferred — Tailscale App Connector advertises `api.anthropic.com`.**
   Add `api.anthropic.com` to the existing App Connector config on nether. mcow's DNS (via Tailscale MagicDNS) auto-resolves to the connector; exporter makes plain HTTPS calls, no proxy env vars needed. Zero code change in exporter.
   **Confidence: HIGH** — identical mechanism to the Telegram egress path already proven E2E in v1.0.

2. **Fallback — explicit `HTTPS_PROXY` env.**
   Stand up a forward HTTPS proxy (tinyproxy / squid) on nether bound to `100.101.0.3:<port>`. Set `HTTPS_PROXY` in the exporter container. Works if App Connector can't handle the anthropic domain pattern, but adds a service to maintain.

3. **Rejected — direct egress from mcow.** Will fail (401/timeout from Anthropic's edge), possibly silently at certain ISP paths.

### Downstream implication for Phase E

First smoke test MUST be done from **nether** or **docker-tower** (via the connector) first — `curl -H "Authorization: Bearer ..." https://api.anthropic.com/<quota-endpoint>` — to establish that the token + endpoint work before adding mcow's egress hop as a confounder. Only then deploy the exporter on mcow.

## Open Questions for Requirements

1. **App Connector domain allowlist format** — nether's current App Connector config (Tailscale ACL `autoApprovers` + `routes`) is not in the repo (SEC-03 deferred). Confirm the operator can add `api.anthropic.com` without blocking on SEC-03; may require a one-off manual Tailscale admin-console change.

2. **Exporter image sourcing** — no mature upstream exporter for Claude Code OAuth quotas is known. Likely in-repo Python/Go, pinned by digest. Requirements should declare **where** the exporter source lives: this repo under `exporter/claude-usage/` or a sibling hub project? Roadmapper should call this out.

3. **Poll interval vs Anthropic API rate limits** — Prometheus scrapes every 15s (global in `prometheus.yml`). The exporter should **not** hit Anthropic on every scrape (rate-limit risk, connector bandwidth waste). Cache per-token quota for N minutes, serve cached value. Suggest N=5min; resolve in Phase R.

4. **Container user / file perms on `claude-tokens.yaml`** — v1.0 precedent (`telegram_token` mode `0440 root:65534`) applies only if the exporter image runs as `nobody`. If in-repo image runs as `root` (simplest), `0400 root:root` is fine. Confirm in Phase E.

5. **Secondary Telegram receiver?** — single `telegram-homelab` receiver is simpler; a dedicated `telegram-claude` receiver would allow different `group_wait` / chat_id / message format (e.g. dollar cost per quota). Default recommendation: **reuse existing receiver** for v2.0; defer specialized routing.

6. **Historical retention for quota ratios** — Prometheus is already configured `--storage.tsdb.retention.time=720h` (30d). Weekly quota windows are 168h, so retention covers 4+ cycles. No change needed, but confirm this horizon matches user expectation.

---

## Sources

- [Anthropic supported countries](https://www.anthropic.com/supported-countries) — Russia not listed (confidence: HIGH)
- [v2fly/domain-list-community #2860](https://github.com/v2fly/domain-list-community/issues/2860) — community-documented RU block on anthropic domains (confidence: MEDIUM)
- `.planning/PROJECT.md` Key Decisions table — App Connector precedent (confidence: HIGH, own repo)
- `servers/mcow/docker-compose.monitoring.yml` — mcow compose layout and Tailnet bind pattern (confidence: HIGH)
- `servers/docker-tower/monitoring/prometheus/prometheus.yml` — scrape_configs + rule_files glob (confidence: HIGH)
- `ansible/playbooks/deploy-docker-tower.yml` — SOPS→compose→reload playbook template (confidence: HIGH)
- MEMORY entry `project_mcow_egress_lesson.md` — prior lesson on Moscow egress (confidence: HIGH)
