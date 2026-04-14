# Phase 03: Health Monitoring - Context

**Gathered:** 2026-04-14
**Status:** Ready for research
**Source:** /gsd-discuss-phase 03

<domain>
## Phase Boundary

Deploy a consolidated monitoring stack so Claude Code can verify the health and deployment status of every Tailnet-reachable server programmatically. Covers metric collection (node-exporter, cAdvisor), storage + dashboards (Prometheus + Grafana on docker-tower), alerting (Alertmanager → Telegram), and a CLI health-check wrapper for deployment verification.

**In scope:** tower, docker-tower, cc-worker, mcow, nether, animaya-dev (6 Tailnet hosts).
**Out of scope:** dev-worker LXCs without Tailnet IP (cc-andrey, cc-dan, cc-yuri), long-term metrics tier, log aggregation, APM, synthetic probing.

</domain>

<decisions>
## Implementation Decisions

### Topology (locked)
- **Consolidate to single stack on docker-tower.** One Prometheus scrapes all 6 Tailnet hosts over the Tailnet mesh. One Grafana, one Alertmanager.
- **Decommission nether monitoring stack.** `servers/nether/docker-compose.monitoring.yml` removed; nether becomes a scrape target only (node-exporter).
- **docker-tower is the monitoring host.** Failure of docker-tower loses monitoring — acceptable for v1 homelab.

### Coverage (locked)
- **node-exporter on all 6 Tailnet hosts** as native systemd binary (not container). Rationale: works on Proxmox host (tower) without Docker; one install pattern across all hosts.
- **Install method: Ansible role.** Reuse `cloudalchemy.node_exporter` or equivalent community role; pin version.
- **Scrape targets: static file under `monitoring/prometheus/targets/nodes.yml`** committed to repo (file_sd). No DNS or dynamic discovery.

### Retention + storage (locked)
- **30 days** — `--storage.tsdb.retention.time=720h`.
- **No remote_write, no long-term tier.** Homelab trend analysis need does not justify VictoriaMetrics / Thanos / Mimir.

### cAdvisor (locked)
- **Deploy on docker-tower and mcow only** (the two Docker hosts).
- **Replace mislabeled `docker-exporter` entry** in docker-tower compose (currently runs `prom/blackbox-exporter` under that name — that image is NOT a Docker metrics exporter). Add a true `gcr.io/cadvisor/cadvisor` service. Blackbox-exporter is removed or repurposed only if used elsewhere.

### Alerting (locked)
- **Alertmanager** container co-located with Prometheus on docker-tower.
- **Notification channel: Telegram.** Bot token + chat ID stored in `secrets/docker-tower.sops.yaml`.
- **Initial alert rules (Claude's discretion to refine thresholds during planning, but these must be covered):**
  - Host down (up == 0 for >5m)
  - Disk usage >90% on any filesystem (>5m)
  - Container restart loop (rate of restarts >3/15m) — cAdvisor-sourced
  - Cert expiry <30d (if Caddy/AmneziaWG certs exposed as metrics)
  - Prometheus self-scrape failure (meta-alert)
- **No email, no PagerDuty, no webhook fan-out.**

### Grafana access + dashboards (locked)
- **Tailnet-bound only.** Grafana listens on `100.101.0.8:3000` (docker-tower Tailnet IP), never `0.0.0.0`. No Caddy proxy, no public exposure.
- **Admin credentials from SOPS** — current pattern (`secrets/docker-tower.sops.yaml` → `/run/secrets/grafana.env`) is preserved.
- **Sign-up disabled** (`GF_USERS_ALLOW_SIGN_UP=false`), single admin user.
- **Dashboards-as-code via provisioning.** JSON dashboards committed under `servers/docker-tower/monitoring/grafana/provisioning/dashboards/`. Required dashboards:
  1. **Node Exporter Full** (community dashboard 1860 or equivalent, pinned version)
  2. **cAdvisor / Docker containers**
  3. **Homelab Summary** — custom, one panel per host showing up/down, CPU, RAM, disk, uptime
- **Datasource provisioning** — Prometheus registered via YAML, not manual UI click.

### Health-check script contract (locked)
- **Location:** `scripts/healthcheck.sh`
- **Invocation:** `scripts/healthcheck.sh <host>` or `scripts/healthcheck.sh --all`
- **Transport:** Queries Prometheus HTTP API (`http://100.101.0.8:9090`) over Tailnet. No SSH.
- **Output:** JSON on stdout: `{"host":"mcow","status":"ok|degraded|fail","issues":[{"metric":"disk","value":"92%","threshold":"90%"}],"checked_at":"..."}`
- **Exit codes:** `0` = ok, `1` = degraded (warnings), `2` = fail (critical).
- **Checks performed (baseline):**
  - `up{instance=~"<host>.*"} == 1`
  - `node_filesystem_avail_bytes / node_filesystem_size_bytes > 0.1`
  - `node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes > 0.1`
  - `time() - node_boot_time_seconds < 180` → flag recent reboot as info, not fail
- **Dependencies:** `curl`, `jq`. `promtool` optional (only for rule validation, not runtime).

### Claude's Discretion
- Exact alert thresholds (rates, durations) — planner tunes based on historical noise
- Grafana dashboard UID, folder structure, panel layout
- Prometheus scrape interval per job (default 15s unless a target needs different)
- Ansible role choice for node-exporter install (community role vs. hand-written task)
- File layout under `servers/docker-tower/monitoring/` subdirectories
- Whether to keep blackbox-exporter (for HTTP probing) as separate optional service

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level
- `.planning/PROJECT.md` — Principles: document-first, Claude Code as operator, SOPS+age for secrets
- `.planning/REQUIREMENTS.md` — MON-01, MON-02 success criteria
- `.planning/ROADMAP.md` — Phase 3 section (revised 2026-04-14)
- `CLAUDE.md` — 6-server Tailnet topology, hostnames, IPs

### Phase-adjacent
- `.planning/phases/01-foundations/01-CONTEXT.md` — inventory and secrets pattern decisions
- `.planning/phases/02-service-documentation/02-CONTEXT.md` — Compose reproducibility, SOPS usage
- `servers/docker-tower/docker-compose.monitoring.yml` — **existing stack, to be revised** (add Alertmanager, cAdvisor, expanded scrape targets)
- `servers/docker-tower/monitoring/prometheus/prometheus.yml` — current scrape config (expand)
- `servers/nether/docker-compose.monitoring.yml` — **to be decommissioned** (nether keeps node-exporter only)
- `secrets/docker-tower.sops.yaml` — Grafana admin creds; add Telegram bot token + chat ID here
- `scripts/README.md` — index where `healthcheck.sh` will be added

### External (pull during research)
- Prometheus: scrape_configs, file_sd, recording/alerting rules
- Grafana provisioning reference (datasources.yml, dashboards.yml)
- cAdvisor compose snippet and required mounts
- cloudalchemy.node_exporter Ansible role (or alternative)
- Alertmanager Telegram receiver config

</canonical_refs>

<specifics>
## Specific Ideas

- Homelab Summary dashboard — one row per host with identical panel set (up, CPU%, RAM%, disk%, uptime). Claude Code uses this for visual health verification alongside `healthcheck.sh`.
- Health-check JSON must be stable enough to parse from a Claude Code tool call without regex gymnastics — strict schema, no free-text status lines.
- Telegram alert messages: include hostname, metric, value, runbook link (or phase filename reference).

</specifics>

<deferred>
## Deferred Ideas

- **Log aggregation (Loki/Promtail)** — next milestone
- **Long-term metrics (VictoriaMetrics / Mimir / remote_write)** — next milestone
- **Synthetic probing (blackbox-exporter for HTTPS endpoints)** — optional, may slot into this phase as a Claude's Discretion add-on if low cost
- **APM / tracing** — not a homelab need
- **OIDC/SSO for Grafana** — single-operator project, Tailnet ACL is auth enough
- **Disaster Recovery** — deferred to v2 per roadmap revision (`.planning/deferred/03-disaster-recovery/`)

</deferred>

---

*Phase: 03-health-monitoring*
*Context gathered: 2026-04-14 via /gsd-discuss-phase*
