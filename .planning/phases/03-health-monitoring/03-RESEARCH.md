# Phase 03: Health Monitoring - Research

**Researched:** 2026-04-14
**Domain:** Prometheus + Grafana + node-exporter + cAdvisor + Alertmanager on a 6-host Tailscale mesh
**Confidence:** HIGH (core stack), MEDIUM (Ansible role choice, cAdvisor LXC behaviour), LOW (cert expiry alert applicability)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Topology**
- Consolidate to single stack on docker-tower. One Prometheus, one Grafana, one Alertmanager.
- Decommission nether monitoring stack. nether becomes scrape target only.
- docker-tower SPOF for monitoring — acceptable for v1.

**Coverage**
- node-exporter on all 6 Tailnet hosts (tower, docker-tower, cc-worker, mcow, nether, animaya-dev) as native systemd binary (not container).
- Install method: Ansible role. Pin version.
- Scrape targets: static file `monitoring/prometheus/targets/nodes.yml` (file_sd). No DNS/dynamic discovery.

**Retention + storage**
- 30 days — `--storage.tsdb.retention.time=720h`.
- No remote_write, no long-term tier.

**cAdvisor**
- Deploy on docker-tower and mcow only.
- Replace mislabeled `docker-exporter` service (currently runs `prom/blackbox-exporter`, not a Docker metrics exporter). Add true `gcr.io/cadvisor/cadvisor` service.

**Alerting**
- Alertmanager container co-located with Prometheus on docker-tower.
- Notification: Telegram. bot_token + chat_id in `secrets/docker-tower.sops.yaml`.
- Required alerts: host down (up==0 >5m), disk >90% >5m, container restart loop (cAdvisor), cert expiry <30d, Prometheus self-scrape failure.
- No email, PagerDuty, or webhook fan-out.

**Grafana**
- Tailnet-bound: listens on `100.101.0.8:3000`. No Caddy proxy.
- Admin credentials from SOPS — existing pattern (`/run/secrets/grafana.env`) preserved.
- Sign-up disabled. Single admin user.
- Dashboards-as-code via provisioning committed under `servers/docker-tower/monitoring/grafana/provisioning/dashboards/`.
- Required dashboards: Node Exporter Full (id 1860), cAdvisor/Docker containers, Homelab Summary (custom).
- Datasource provisioning via YAML, not manual click.

**Health-check script**
- Location: `scripts/healthcheck.sh`
- Invocation: `scripts/healthcheck.sh <host>` or `--all`
- Transport: Prometheus HTTP API `http://100.101.0.8:9090` over Tailnet. No SSH.
- Output: strict JSON on stdout (schema defined below).
- Exit codes: 0=ok, 1=degraded, 2=fail.
- Dependencies: curl, jq. promtool optional.

### Claude's Discretion
- Exact alert thresholds (rates, durations)
- Grafana dashboard UID, folder structure, panel layout
- Prometheus scrape interval per job
- Ansible role choice for node-exporter
- File layout under `servers/docker-tower/monitoring/` subdirectories
- Whether to keep blackbox-exporter as separate optional service

### Deferred Ideas (OUT OF SCOPE)
- Log aggregation (Loki/Promtail)
- Long-term metrics (VictoriaMetrics / Mimir / remote_write)
- Synthetic probing (blackbox-exporter HTTP probing)
- APM / tracing
- OIDC/SSO for Grafana
- Disaster Recovery
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MON-01 | Node-exporter deployed on all hosts providing CPU, memory, disk metrics | Ansible role selection + Prometheus scrape config sections |
| MON-02 | Health-check scripts allow Claude Code to verify deployment success on any server | Health-check script design section + Validation Architecture |
</phase_requirements>

---

## Summary

- The existing docker-tower monitoring compose runs Prometheus + Grafana + two faux node-exporter containers (which actually scrape the host they run on — **not** remote hosts) plus a `docker-exporter` service that is actually `prom/blackbox-exporter` misnamed. All four of these containers must be surgically replaced: the two in-container node-exporters are removed (replaced by native systemd binaries on each host), the mislabeled blackbox-exporter is removed, and cAdvisor + Alertmanager are added.
- The `prometheus.prometheus` Ansible collection (formerly prometheus-community/ansible) is the actively maintained successor to the deprecated `cloudalchemy.node_exporter` role. Install via `ansible-galaxy collection install prometheus.prometheus`. The embedded `node_exporter` role installs a binary under `/usr/local/bin/node_exporter`, creates a `node_exporter` system user, and registers a systemd service. This is the correct install pattern for all 6 hosts including the Proxmox bare-metal host (tower). [VERIFIED: galaxy.ansible.com/ui/repo/published/prometheus/prometheus]
- Prometheus file_sd is the right discovery method: a single `nodes.yml` file lists all 6 node-exporter targets and 2 cAdvisor targets; Prometheus hot-reloads it without restart. This file is committed to the repo and bind-mounted into the container.
- Alertmanager native `telegram_configs` receiver is available since Alertmanager 0.25+. Bot token wiring: Alertmanager does NOT natively expand environment variables in its config file; the correct pattern for Docker Compose is to write the bot_token into the alertmanager.yml at deploy time from a decrypted SOPS env file, or mount it as a file and use `bot_token_file`. The file-mount pattern is cleaner and avoids token in plaintext in the config. [CITED: prometheus.io/docs/alerting/latest/configuration/]
- Grafana provisioning mounts `provisioning/datasources/` and `provisioning/dashboards/` as bind volumes. Dashboard 1860 (Node Exporter Full) JSON is downloaded once, committed to the repo under `provisioning/dashboards/json/`, and Grafana loads it on startup — no internet required at runtime. UID stability is maintained by setting the `uid` field in the JSON before committing. [CITED: grafana.com/docs/grafana/latest/administration/provisioning/]
- Primary recommendation: use `prometheus.prometheus` collection for node-exporter installation on all 6 hosts; consolidate the docker-tower monitoring compose in-place (no data loss on prometheus-data volume); use file_sd for scrape targets; wire Alertmanager bot_token via a file mounted from the SOPS-decrypted secrets flow.

---

## Existing State (What's Running Now — Must Be Preserved or Migrated)

### docker-tower `docker-compose.monitoring.yml` (live, to be revised)

| Service | Image | Purpose | Action |
|---------|-------|---------|--------|
| `prometheus` | `prom/prometheus` (digest-pinned) | Metrics storage | KEEP — add retention flag, add alertmanager config, expand scrape targets |
| `grafana` | `grafana/grafana` (digest-pinned) | Dashboards | KEEP — add provisioning mounts, bind to Tailnet IP |
| `node-exporter-docker-tower` | `quay.io/prometheus/node-exporter` | Scrapes docker-tower host | REMOVE — replaced by native systemd binary |
| `node-exporter-nether` | `quay.io/prometheus/node-exporter` | Scrapes docker-tower host (misleadingly named — it runs ON docker-tower, not on nether) | REMOVE — replaced by native systemd binary on nether |
| `docker-exporter` | `prom/blackbox-exporter` | **Mislabeled** — this is NOT a Docker metrics exporter; it is blackbox-exporter | REMOVE — cAdvisor replaces Docker metrics need |

**Key observations:**
- Prometheus currently uses `network_mode: host`, which is unusual and creates a network model conflict with Grafana on the `monitoring` bridge network. The `extra_hosts` hack (`prometheus: 172.17.0.2`) in Grafana's config works around this.
- Retention is currently `200h` (needs to be raised to `720h`).
- `prometheus-data` named volume holds existing metrics — **do not destroy this volume** during migration. Prometheus can be restarted against the existing volume without data loss.
- Grafana admin credentials via `/run/secrets/grafana.env` — pattern preserved.
- The `monitoring` external network must continue to exist.

### nether `docker-compose.monitoring.yml` (to be decommissioned)

Identical stack to docker-tower (Prometheus + Grafana on :3001 + same faux node-exporters + blackbox-exporter). Entire file is removed. nether gets only a native node-exporter systemd binary instead.

### Prometheus config file

No `prometheus.yml` is committed to the repo — only referenced via `${PROMETHEUS_CONFIG:-prometheus.yml}` bind mount from `./prometheus/`. The actual config lives only on the live server at `/opt/homestack/monitoring/prometheus/prometheus.yml`. **This file must be read via SSH before migration to understand existing scrape targets.** The planner should include a Wave 0 step: `ssh root@docker-tower cat /opt/homestack/monitoring/prometheus/prometheus.yml` and commit the result to the repo.

---

## Ansible Role Selection

### Recommendation: `prometheus.prometheus` collection, `node_exporter` role

**Winner:** `prometheus.prometheus.node_exporter` from the prometheus-community/ansible collection.

| Criterion | `cloudalchemy.node_exporter` | `prometheus.prometheus.node_exporter` | Hand-written tasks |
|-----------|------------------------------|----------------------------------------|--------------------|
| Maintenance | **Deprecated** — cloudalchemy roles were archived and superseded by this collection [CITED: galaxy.ansible.com/cloudalchemy/node_exporter] | **Actively maintained** — prometheus-community org, v0.25+ [VERIFIED: galaxy.ansible.com] | Maintained only by us |
| Install method | Binary download from GitHub releases | Binary download from GitHub releases | Binary download |
| Systemd service | Yes — creates `node_exporter` user + service | Yes — same pattern | Manual |
| OS support | Debian, Ubuntu, RHEL, CentOS | Debian, Ubuntu, RHEL, Alpine, and more | Any |
| Proxmox bare-metal | Works (it is just Debian-based) | Works | Works |
| Version pinning | `node_exporter_version` var | `node_exporter_version` var | Manual |
| Recommendation | Avoid — deprecated | **Use this** | Use only if collection has a hard blocker |

**Install command:**
```bash
ansible-galaxy collection install prometheus.prometheus
```

**Minimal playbook invocation:**
```yaml
- hosts: all_monitored
  roles:
    - role: prometheus.prometheus.node_exporter
      vars:
        node_exporter_version: "1.8.2"   # pin — verify latest before plan execution
        node_exporter_web_listen_address: "0.0.0.0:9100"
```

**Key role behaviours:**
- Creates system user `node_exporter` (no shell, no home)
- Binary lands at `/usr/local/bin/node_exporter`
- Systemd unit: `node_exporter.service`
- Does NOT open firewall — firewall rules must be handled separately (or confirmed open)
- Works identically on Proxmox host (tower) and LXC guests [ASSUMED — Proxmox is Debian-based; role has no PVE-specific code; no Proxmox-specific gotcha documented in official sources]

**Tower (Proxmox host) specific considerations:**
- tower runs PVE on Debian — the role works cleanly.
- PVE has its own firewall (iptables/nftables). Check with `pve-firewall status` — if datacenter or node firewall is enabled and not set to allow port 9100 from the Tailnet subnet, scrapes will fail silently. [ASSUMED — PVE firewall is optional; many homelab setups leave it off]
- node_exporter on the PVE host will expose host-level metrics (CPU/RAM/disk of tower itself, not of LXC guests). This is the correct and desired behaviour.
- LXC 100 (docker-tower) and LXC 204 (cc-worker) are also scrape targets — their node-exporters run inside the LXC, reporting LXC-level metrics.

---

## Compose Migration

### Approach: In-place surgical edit of `servers/docker-tower/docker-compose.monitoring.yml`

No rename needed. Steps:

1. **Remove** three services: `node-exporter-docker-tower`, `node-exporter-nether`, `docker-exporter`.
2. **Add** `cadvisor` service (see cAdvisor section).
3. **Add** `alertmanager` service.
4. **Edit** `prometheus` service:
   - Change `--storage.tsdb.retention.time=200h` → `720h`
   - Add `--alertmanager.url=http://alertmanager:9093` (or via config file)
   - Add alertmanager config volume mount
   - Remove the now-stale `extra_hosts` entries (docker-tower + nether IPs; scraping is now via file_sd with Tailnet IPs)
5. **Edit** `grafana` service:
   - Remove `extra_hosts: prometheus: 172.17.0.2` — Prometheus stays on host network; Grafana must reach it. Since Prometheus uses `network_mode: host`, it is reachable from the bridge network at the docker-tower Tailnet IP `100.101.0.8:9090`. Update Grafana datasource URL to `http://100.101.0.8:9090`.
   - Add provisioning bind mounts for datasources and dashboards directories.
   - Change `GF_SERVER_ROOT_URL` to `http://100.101.0.8:3000` (Tailnet-bound).
   - Change ports binding from `"3000:3000"` to `"100.101.0.8:3000:3000"` to bind only on Tailnet IP.
6. **Add** `alertmanager` service to the `monitoring` network.
7. **Preserve** named volumes `prometheus-data` and `grafana-data` — do not alter the volumes: block.

**Data safety:** The `prometheus-data` volume is unaffected by service changes — Prometheus restarts cleanly against existing TSDB data. Grafana's `grafana-data` volume is preserved; provisioned dashboards layer on top without overwriting volume-stored state.

**Network model clarification:**
- Prometheus: `network_mode: host` (continues)
- Grafana, Alertmanager, cAdvisor: join `monitoring` external bridge network
- Inter-service communication: Grafana → Prometheus via host IP (`100.101.0.8:9090`); Prometheus → Alertmanager via container name on monitoring network (but Prometheus is on host network — use `alertmanager:9093` only if they share a network, otherwise use container IP or host-mode for alertmanager too). **Simplest resolution:** give Alertmanager `network_mode: host` as well (port 9093), then Prometheus reaches it at `localhost:9093`. This avoids cross-network routing complexity.

---

## Prometheus Config

### Full `prometheus.yml` (to commit at `servers/docker-tower/monitoring/prometheus/prometheus.yml`)

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['localhost:9093']   # Alertmanager on host network

rule_files:
  - /etc/prometheus/alerts/*.yml

scrape_configs:

  # Prometheus self-scrape
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Node exporters on all 6 Tailnet hosts
  - job_name: 'node'
    file_sd_configs:
      - files:
          - /etc/prometheus/targets/nodes.yml
        refresh_interval: 5m

  # cAdvisor — container metrics (docker-tower + mcow)
  - job_name: 'cadvisor'
    file_sd_configs:
      - files:
          - /etc/prometheus/targets/cadvisor.yml
        refresh_interval: 5m
```

### `servers/docker-tower/monitoring/prometheus/targets/nodes.yml`

```yaml
- targets:
    - '100.101.0.7:9100'   # tower (Proxmox host)
    - '100.101.0.8:9100'   # docker-tower (LXC 100)
    - '100.99.133.9:9100'  # cc-worker (LXC 204)
    - '100.101.0.9:9100'   # mcow
    - '100.101.0.3:9100'   # nether
    - '100.119.15.122:9100' # animaya-dev (LXC 205)
  labels:
    job: node
```

### `servers/docker-tower/monitoring/prometheus/targets/cadvisor.yml`

```yaml
- targets:
    - '100.101.0.8:8080'   # docker-tower cAdvisor
    - '100.101.0.9:8080'   # mcow cAdvisor
  labels:
    job: cadvisor
```

**Volume mounts to add to prometheus service:**
```yaml
volumes:
  - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
  - ./prometheus/alerts:/etc/prometheus/alerts:ro
  - ./prometheus/targets:/etc/prometheus/targets:ro
  - prometheus-data:/prometheus
```

**Retention flag:**
```yaml
command:
  - '--config.file=/etc/prometheus/prometheus.yml'
  - '--storage.tsdb.path=/prometheus'
  - '--storage.tsdb.retention.time=720h'
  - '--web.enable-lifecycle'
  - '--web.console.libraries=/etc/prometheus/console_libraries'
  - '--web.console.templates=/etc/prometheus/consoles'
```

**Note on Tailscale reachability:** Prometheus scrapes over Tailnet. The Tailscale daemon must be running on each host and port 9100 must not be blocked by the host's local firewall. On Debian/Ubuntu hosts this is typically not an issue (no firewall by default). On Proxmox (tower) verify `pve-firewall status` as noted above.

---

## cAdvisor Integration

### Compose snippet (add to `docker-compose.monitoring.yml`)

```yaml
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:v0.49.1   # pin digest before deploy
    container_name: cadvisor
    restart: unless-stopped
    privileged: true
    devices:
      - /dev/kmsg:/dev/kmsg
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
      - /dev/disk/:/dev/disk:ro
    ports:
      - "8080:8080"
    networks:
      - monitoring
```

[CITED: github.com/google/cadvisor/blob/master/docs/running.md, prometheus.io/docs/guides/cadvisor/]

**Notes:**
- `privileged: true` is required. Without it cAdvisor cannot access cgroup filesystem metrics. [CITED: prometheus.io/docs/guides/cadvisor/]
- `/dev/kmsg` device is needed for kernel log access.
- Port 8080 is cAdvisor's default metrics endpoint. Prometheus scrapes it at `:8080/metrics`.
- On mcow: deploy via a separate `docker-compose.cadvisor.yml` in `servers/mcow/` since mcow is not docker-tower and has its own Docker daemon.
- **LXC consideration:** docker-tower is LXC 100 on Proxmox. LXC must be privileged (or have nesting+keyctl capability) for cAdvisor to work. The README confirms LXC 100 is already privileged enough for rshared mounts (portainer_agent). Verify `lxc.cap.drop` in `servers/tower/lxc-100-docker-tower.conf` — if `sys_admin` is dropped, cAdvisor's cgroup reads will fail. [ASSUMED — needs SSH verification during Wave 0]

**Key metric names from cAdvisor:**
- `container_cpu_usage_seconds_total`
- `container_memory_usage_bytes`
- `container_restart_count` (older) / filter by `container_last_seen` patterns
- `container_start_time_seconds` — use this to detect restarts: `changes(container_start_time_seconds[15m])` counts restart events

---

## Alertmanager + Telegram

### Alertmanager compose service

```yaml
  alertmanager:
    image: prom/alertmanager:v0.27.0   # pin digest before deploy
    container_name: alertmanager
    restart: unless-stopped
    network_mode: host   # same as prometheus — reach each other at localhost
    volumes:
      - ./alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
      - ./alertmanager/telegram_token:/etc/alertmanager/telegram_token:ro
      - alertmanager-data:/alertmanager
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--storage.path=/alertmanager'
```

Add `alertmanager-data` to the `volumes:` block at the bottom of the compose file.

### Secret wiring: bot_token

**Problem:** Alertmanager config YAML does not expand shell environment variables. Two options:

| Option | Mechanism | Tradeoff |
|--------|-----------|----------|
| `bot_token_file` | Mount a file containing only the token string; reference with `bot_token_file: /etc/alertmanager/telegram_token` | Clean — token never in plaintext config |
| Template substitution at deploy time | `envsubst` on alertmanager.yml template before `docker compose up` | Requires extra deploy step; token lands in generated file |

**Recommendation:** `bot_token_file`. [CITED: prometheus.io/docs/alerting/latest/configuration/]

Deploy flow:
```bash
# After SOPS decrypt:
sops --decrypt --output-type dotenv secrets/docker-tower.sops.yaml > /run/secrets/docker-tower.env
source /run/secrets/docker-tower.env
echo -n "$TELEGRAM_BOT_TOKEN" > /opt/homestack/monitoring/alertmanager/telegram_token
chmod 600 /opt/homestack/monitoring/alertmanager/telegram_token
```

Keys to add to `secrets/docker-tower.sops.yaml`:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

### `alertmanager.yml`

```yaml
global:
  resolve_timeout: 5m

route:
  receiver: 'telegram-homelab'
  group_by: ['alertname', 'instance']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: 'telegram-homelab'
      repeat_interval: 1h

receivers:
  - name: 'telegram-homelab'
    telegram_configs:
      - api_url: 'https://api.telegram.org'
        bot_token_file: '/etc/alertmanager/telegram_token'
        chat_id: REPLACE_WITH_CHAT_ID_INTEGER   # planner: substitute from SOPS key TELEGRAM_CHAT_ID
        parse_mode: 'HTML'
        message: |
          <b>{{ .Status | toUpper }}</b> {{ .CommonLabels.alertname }}
          <b>Host:</b> {{ .CommonLabels.instance }}
          <b>Severity:</b> {{ .CommonLabels.severity }}
          {{ range .Annotations.SortedPairs }}<b>{{ .Name }}:</b> {{ .Value }}
          {{ end }}
        send_resolved: true

inhibit_rules: []
```

**Note:** `chat_id` is an integer (may be negative for group chats). It cannot be read from a file in native Alertmanager config — substitute it at deploy time via `sed` or `envsubst` on a template, or hardcode it in the committed config (chat ID is not a secret — only the bot token is). Recommended: commit the chat ID directly as an integer in `alertmanager.yml`; keep only `bot_token` as the secret.

---

## Alert Rules

File: `servers/docker-tower/monitoring/prometheus/alerts/homelab.yml`

```yaml
groups:
  - name: homelab.nodes
    interval: 1m
    rules:

      # --- Host reachability ---
      - alert: HostDown
        expr: up{job="node"} == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Host {{ $labels.instance }} is down"
          description: "node-exporter on {{ $labels.instance }} has been unreachable for 5 minutes."
          runbook: "servers/{{ $labels.instance }}/inventory.md"

      # --- Disk ---
      - alert: DiskUsageCritical
        expr: |
          (
            node_filesystem_size_bytes{fstype!~"tmpfs|overlay|squashfs"}
            - node_filesystem_avail_bytes{fstype!~"tmpfs|overlay|squashfs"}
          ) / node_filesystem_size_bytes{fstype!~"tmpfs|overlay|squashfs"} > 0.90
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Disk >90% on {{ $labels.instance }} ({{ $labels.mountpoint }})"
          description: "Disk {{ $labels.mountpoint }} is {{ $value | humanizePercentage }} full."

      # --- Memory ---
      - alert: MemoryPressure
        expr: |
          node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes < 0.10
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Low memory on {{ $labels.instance }}"
          description: "Available memory below 10% for 10m."

  - name: homelab.containers
    interval: 1m
    rules:

      # --- Container restart loop ---
      - alert: ContainerRestartLoop
        expr: |
          changes(container_start_time_seconds{container!="",container!="cadvisor"}[15m]) > 3
        for: 0m
        labels:
          severity: warning
        annotations:
          summary: "Container {{ $labels.name }} restarting on {{ $labels.instance }}"
          description: "Container {{ $labels.name }} has restarted {{ $value }} times in 15 minutes."

      # --- cAdvisor self-availability ---
      - alert: CAdvisorDown
        expr: up{job="cadvisor"} == 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "cAdvisor down on {{ $labels.instance }}"

  - name: homelab.prometheus
    interval: 1m
    rules:

      # --- Prometheus self-scrape meta-alert ---
      - alert: PrometheusSelfScrapeFailure
        expr: up{job="prometheus"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Prometheus cannot scrape itself"
          description: "Prometheus self-scrape has been failing for 2 minutes — monitoring is broken."

      # --- Alertmanager connectivity ---
      - alert: AlertmanagerDown
        expr: |
          absent(up{job="alertmanager"}) or up{job="alertmanager"} == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Alertmanager is unreachable from Prometheus"
```

**Cert expiry alert:** The CONTEXT.md lists this as a required alert, but no cert-expiry exporter is scoped for this phase. Blackbox-exporter (deferred) or `x509-certificate-exporter` would be needed. The correct approach: add a placeholder rule file that is commented out, and document in the planner that the cert expiry alert requires a follow-up phase. Mark as LOW confidence since no cert metrics will exist in this phase. [ASSUMED — no cert exporter in scope]

**Recording rules:** Not required for this scale (6 hosts). Add only if dashboard queries prove slow after deployment.

---

## Grafana Provisioning

### Directory layout

```
servers/docker-tower/monitoring/grafana/provisioning/
├── datasources/
│   └── prometheus.yml         # Prometheus datasource
├── dashboards/
│   ├── dashboards.yml         # Dashboard loader config
│   └── json/
│       ├── node-exporter-full.json      # Dashboard id 1860 (download + commit)
│       ├── cadvisor-containers.json     # cAdvisor community dashboard
│       └── homelab-summary.json         # Custom dashboard (created in Grafana, exported)
```

### `datasources/prometheus.yml`

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://100.101.0.8:9090    # Tailnet IP — reachable from Grafana container
    isDefault: true
    uid: prometheus-homelab          # stable UID referenced by dashboard JSONs
    jsonData:
      timeInterval: '15s'
```

[CITED: grafana.com/docs/grafana/latest/administration/provisioning/]

### `dashboards/dashboards.yml`

```yaml
apiVersion: 1

providers:
  - name: homelab
    orgId: 1
    folder: 'Homelab'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30   # >10 to force polling with Docker bind mounts
    allowUiUpdates: false        # dashboards are code — UI edits won't persist
    options:
      path: /etc/grafana/provisioning/dashboards/json
```

**Note:** `updateIntervalSeconds: 30` is intentional. Docker bind mounts do not reliably deliver filesystem events to the container, so polling is required. [CITED: grafana.com/docs/grafana/latest/administration/provisioning/]

### Dashboard JSON sourcing

**Node Exporter Full (id 1860):**
- Download: `curl -sL "https://grafana.com/api/dashboards/1860/revisions/latest/download" -o node-exporter-full.json`
- Before committing: set `"uid": "node-exporter-full"` in the JSON so it is stable across Grafana versions.
- Set `"datasource"` references inside the JSON to use `"uid": "prometheus-homelab"` to match the provisioned datasource UID.

**cAdvisor dashboard:** Community dashboard id 14282 (cAdvisor Exporter) or 19908. Same download + commit pattern.

**Homelab Summary dashboard:** Created interactively in Grafana UI, then exported via `Dashboard → Share → Export → Save to file`. Replace any `__inputs` datasource references with the literal UID `prometheus-homelab`. Commit the JSON.

**UID stability workflow:** When exporting from Grafana UI, the JSON includes a `uid` field. Copy this UID into the committed JSON so that Grafana's `allowUiUpdates: false` does not re-import under a different UID on container restart.

### Compose volume addition for Grafana

```yaml
volumes:
  - grafana-data:/var/lib/grafana
  - ./grafana/provisioning:/etc/grafana/provisioning:ro
```

The `./grafana/provisioning` path is relative to the compose file location (`servers/docker-tower/`), which maps to `servers/docker-tower/grafana/provisioning/`. Adjust path if the monitoring subdirectory layout uses `monitoring/grafana/provisioning/` instead — coordinate with planner on final layout decision.

---

## Health-Check Script

### Design decisions

- **Transport:** `curl` against Prometheus HTTP API. No SSH, no promtool.
- **API endpoint:** `GET http://100.101.0.8:9090/api/v1/query?query=<PromQL>`
- **Parsing:** `jq` on the JSON response. The Prometheus API response schema is stable: `{"status":"success","data":{"resultType":"vector","result":[{"metric":{...},"value":[<timestamp>,<value>]}]}}`.
- **Why curl+jq over promtool query:** `promtool query instant` requires the promtool binary on the operator machine. `curl+jq` are standard on all Debian hosts and on the cc-worker Claude Code runner. The Prometheus HTTP API is the canonical integration surface. [ASSUMED — promtool availability on operator machine not verified]

### Output schema (locked in CONTEXT.md)

```json
{
  "host": "mcow",
  "status": "ok|degraded|fail",
  "issues": [
    {"metric": "disk", "value": "92%", "threshold": "90%"}
  ],
  "checked_at": "2026-04-14T20:00:00Z"
}
```

### Proposed skeleton

```bash
#!/usr/bin/env bash
# scripts/healthcheck.sh — Query Prometheus HTTP API to verify host health
# Usage: healthcheck.sh <hostname|tailscale-ip>  OR  healthcheck.sh --all
# Exit: 0=ok, 1=degraded (warning), 2=fail (critical)
# Deps: curl, jq

set -euo pipefail

PROM="http://100.101.0.8:9090"
CHECKED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Map hostnames to Tailscale IPs (used as Prometheus instance labels)
declare -A HOST_IP=(
  [tower]="100.101.0.7"
  [docker-tower]="100.101.0.8"
  [cc-worker]="100.99.133.9"
  [mcow]="100.101.0.9"
  [nether]="100.101.0.3"
  [animaya-dev]="100.119.15.122"
)

ALL_HOSTS=(tower docker-tower cc-worker mcow nether animaya-dev)

prom_query() {
  # Args: <PromQL expression>
  # Returns raw API JSON
  curl -sf --max-time 10 \
    "${PROM}/api/v1/query" \
    --data-urlencode "query=$1"
}

check_host() {
  local host="$1"
  local ip="${HOST_IP[$host]}"
  local issues=()
  local worst_exit=0   # 0=ok, 1=degraded, 2=fail

  # --- Check 1: node-exporter up ---
  local up_result
  up_result=$(prom_query "up{job=\"node\",instance=\"${ip}:9100\"}" | jq -r '.data.result[0].value[1] // "0"')
  if [[ "$up_result" != "1" ]]; then
    issues+=("{\"metric\":\"up\",\"value\":\"0\",\"threshold\":\"1\"}")
    worst_exit=2
  fi

  # --- Check 2: Disk available >10% ---
  # (omit for brevity — same pattern with node_filesystem_avail_bytes / node_filesystem_size_bytes)

  # --- Check 3: Memory available >10% ---
  # (omit for brevity)

  # --- Check 4: Recent reboot detection (info only) ---
  # time() - node_boot_time_seconds < 180  → flag as info

  # Build JSON output
  local status="ok"
  [[ $worst_exit -eq 1 ]] && status="degraded"
  [[ $worst_exit -eq 2 ]] && status="fail"

  local issues_json
  issues_json=$(printf '%s\n' "${issues[@]}" | paste -sd,)
  printf '{"host":"%s","status":"%s","issues":[%s],"checked_at":"%s"}\n' \
    "$host" "$status" "$issues_json" "$CHECKED_AT"

  return $worst_exit
}

# --- Main ---
if [[ "${1:-}" == "--all" ]]; then
  max_exit=0
  for h in "${ALL_HOSTS[@]}"; do
    check_host "$h" || { code=$?; [[ $code -gt $max_exit ]] && max_exit=$code; }
  done
  exit $max_exit
else
  check_host "${1:?Usage: healthcheck.sh <host> or --all}"
fi
```

**Sample PromQL queries used by the script:**

| Check | PromQL |
|-------|--------|
| Host up | `up{job="node",instance="100.101.0.8:9100"}` |
| Disk free % | `node_filesystem_avail_bytes{instance="100.101.0.8:9100",fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{instance="100.101.0.8:9100",fstype!~"tmpfs|overlay"}` |
| Memory free % | `node_memory_MemAvailable_bytes{instance="100.101.0.8:9100"} / node_memory_MemTotal_bytes{instance="100.101.0.8:9100"}` |
| Recent reboot | `time() - node_boot_time_seconds{instance="100.101.0.8:9100"} < 180` |

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` — this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | bash (no additional install) + promtool (ships with Prometheus) |
| Config file | none — shell scripts, invoked directly |
| Quick run command | `bash scripts/healthcheck.sh docker-tower` |
| Full suite command | `bash scripts/verify-phase03.sh` (new, follows phase 02 pattern) |

### Phase Requirements → Test Map

| Req ID | Behaviour | Test Type | Automated Command | File Exists? |
|--------|-----------|-----------|-------------------|--------------|
| MON-01 | node-exporter running on all 6 hosts | smoke | `curl -sf http://<tailscale-ip>:9100/metrics | head -5` per host | No — Wave 0 |
| MON-01 | Prometheus scraping all 6 targets successfully | smoke | `curl -sf http://100.101.0.8:9090/api/v1/targets \| jq '.data.activeTargets[] \| select(.health!="up")'` | No — Wave 0 |
| MON-01 | Prometheus config valid | config check | `promtool check config servers/docker-tower/monitoring/prometheus/prometheus.yml` | No — Wave 0 |
| MON-01 | Alert rules valid | config check | `promtool check rules servers/docker-tower/monitoring/prometheus/alerts/homelab.yml` | No — Wave 0 |
| MON-01 | Alertmanager config valid | config check | `amtool check-config servers/docker-tower/monitoring/alertmanager/alertmanager.yml` | No — Wave 0 |
| MON-01 | cAdvisor reachable | smoke | `curl -sf http://100.101.0.8:8080/metrics | grep container_cpu` | No — Wave 0 |
| MON-02 | healthcheck.sh exits 0 for all up hosts | integration | `bash scripts/healthcheck.sh --all` | No — Wave 0 |
| MON-02 | healthcheck.sh JSON schema valid | unit | `bash scripts/healthcheck.sh docker-tower | jq '.status,.host,.checked_at' | grep -v null` | No — Wave 0 |

### Alert Rule Unit Tests (promtool)

File: `servers/docker-tower/monitoring/prometheus/tests/homelab_test.yml`

```yaml
rule_files:
  - ../alerts/homelab.yml

tests:
  - interval: 1m
    input_series:
      - series: 'up{job="node",instance="100.101.0.8:9100"}'
        values: '1 1 1 1 1 0 0 0 0 0'   # goes down at t=5m
    alert_rule_test:
      - eval_time: 10m
        alertname: HostDown
        exp_alerts:
          - exp_labels:
              severity: critical
              instance: "100.101.0.8:9100"
```

Run: `promtool test rules servers/docker-tower/monitoring/prometheus/tests/homelab_test.yml`

### Sampling Rate

- Per task commit: `promtool check config` + `promtool check rules`
- Per wave merge: full `verify-phase03.sh` including live smoke tests against Prometheus API
- Phase gate: `scripts/healthcheck.sh --all` exits 0 before `/gsd-verify-work`

### Wave 0 Gaps

- `scripts/healthcheck.sh` — does not exist yet
- `scripts/verify-phase03.sh` — does not exist yet
- `servers/docker-tower/monitoring/prometheus/prometheus.yml` — not committed to repo (only on live server)
- `servers/docker-tower/monitoring/prometheus/alerts/homelab.yml` — does not exist
- `servers/docker-tower/monitoring/prometheus/tests/homelab_test.yml` — does not exist
- `servers/docker-tower/monitoring/alertmanager/alertmanager.yml` — does not exist
- `servers/docker-tower/monitoring/grafana/provisioning/` tree — does not exist
- Dashboard JSON files — not yet downloaded

---

## Risks & Open Questions

### Risk 1: Prometheus network_mode: host vs Alertmanager connectivity
**What:** Prometheus on host network needs to reach Alertmanager. If Alertmanager is on the monitoring bridge network, cross-network communication requires using the host's docker bridge IP.
**Mitigation:** Give Alertmanager `network_mode: host` as well (port 9093). Both services reach each other at `localhost`. Verify no port 9093 collision on docker-tower.
**Confidence:** MEDIUM — host-mode for both is the cleanest solution; no verified conflict found.

### Risk 2: cAdvisor on LXC 100 (docker-tower)
**What:** cAdvisor requires privileged access to cgroup filesystem. LXC containers may have capabilities restricted.
**What to check:** `lxc.cap.drop` in `servers/tower/lxc-100-docker-tower.conf`. If `sys_admin` is present in drop list, cgroup access fails.
**Known:** The README confirms LXC 100 already supports rshared mounts (portainer_agent works). This is a good signal that privilege is sufficient.
**Mitigation:** Wave 0 must SSH to tower, run `pct config 100`, confirm no problematic cap.drop entries.
**Confidence:** MEDIUM [ASSUMED on LXC capability details]

### Risk 3: Proxmox (tower) firewall blocking port 9100
**What:** PVE has an optional per-node firewall (iptables/nftables). If enabled, it may block inbound TCP 9100 from the Tailnet subnet.
**Mitigation:** Ansible play for tower must include a task to verify port reachability or add a firewall rule. Alternatively, the Ansible role play must be followed by a smoke test: `curl -sf http://100.101.0.7:9100/metrics | head -3` from docker-tower.
**Confidence:** MEDIUM [ASSUMED — PVE firewall status unknown without SSH]

### Risk 4: Existing prometheus.yml not in repo
**What:** The live Prometheus config on docker-tower is not committed to the repo. We don't know current scrape targets without SSH.
**Mitigation:** Wave 0 of the plan MUST include: SSH to docker-tower, cat the live prometheus.yml, commit it to the repo. Only then can we safely write the new config without losing any existing targets.
**Confidence:** HIGH — this gap is confirmed from the repo state.

### Risk 5: Alertmanager Telegram chat_id is an integer, not a string
**What:** Common misconfiguration — wrapping chat_id in quotes in YAML makes it a string, which Alertmanager rejects.
**Mitigation:** Document explicitly in the plan: `chat_id: -1001234567890` (no quotes, integer). [CITED: github.com/prometheus/alertmanager/issues/2866]

### Risk 6: Dashboard 1860 datasource UID mismatch
**What:** Downloaded dashboard JSON references datasource by name or a specific UID. If the committed JSON does not match the provisioned datasource UID, all panels show "No data".
**Mitigation:** After downloading 1860 JSON, search-replace any `"datasource":` fields to reference `{"type":"prometheus","uid":"prometheus-homelab"}`. This step must be in the plan explicitly.

### Risk 7: Cert expiry alert has no data source
**What:** CONTEXT.md lists cert expiry <30d as a required alert, but no cert-expiry exporter is scoped.
**What to do:** Commit a commented-out placeholder rule. Document for user that this alert cannot fire until a cert exporter is added. This is a plan-time decision to surface to user.
**Confidence:** HIGH — confirmed gap from scope analysis.

### Open Question 1
What is the live Prometheus scrape config currently on docker-tower? Must be read via SSH before writing the new prometheus.yml to avoid dropping any existing undocumented targets.

### Open Question 2
Is the PVE firewall on tower enabled? If so, does it allow TCP 9100 inbound from Tailnet (100.64.0.0/10)?

### Open Question 3
Does animaya-dev (LXC 205, 100.119.15.122) have a running Ansible-compatible SSH server and Python interpreter? Ansible requires Python on the target. For a fresh Debian LXC this is typically present but not guaranteed.

---

## Recommended Plan Breakdown

The planner should produce the following 5 plans in execution order:

| Plan | Name | Key deliverables |
|------|------|-----------------|
| **03-01** | Prometheus Config Capture + Repo Bootstrap | SSH to docker-tower, capture live prometheus.yml, commit to repo; create `monitoring/prometheus/targets/nodes.yml` and `cadvisor.yml`; create `monitoring/prometheus/alerts/homelab.yml`; run `promtool check` |
| **03-02** | Ansible: node-exporter on all 6 hosts | Install `prometheus.prometheus` collection; write `ansible/playbooks/node-exporter.yml` targeting all 6 Tailnet hosts; run playbook; smoke-test each host with `curl :9100/metrics` |
| **03-03** | Compose Migration: Alertmanager + cAdvisor + Stack Cleanup | Edit `docker-compose.monitoring.yml` — remove faux node-exporters + blackbox-exporter, add Alertmanager + cAdvisor; update Prometheus retention + config mounts; add SOPS keys for Telegram; write `alertmanager/alertmanager.yml`; deploy and verify Prometheus /targets page |
| **03-04** | Grafana Provisioning + Dashboards | Write `datasources/prometheus.yml` + `dashboards/dashboards.yml`; download and commit dashboard 1860 JSON + cAdvisor dashboard JSON; add provisioning volume mounts to Grafana service; redeploy Grafana; verify dashboards load |
| **03-05** | Health-check Script + Phase Validation | Implement `scripts/healthcheck.sh` in full; write `scripts/verify-phase03.sh`; write `prometheus/tests/homelab_test.yml` + run `promtool test rules`; run `healthcheck.sh --all`; update `scripts/README.md` |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| SSH to all 6 Tailnet hosts | Wave 0 config capture, Ansible | Assumed ✓ | — | None — blocking |
| Ansible (on cc-worker or operator machine) | Plan 03-02 | Unknown | — | Install via `pip install ansible` |
| `prometheus.prometheus` collection | Plan 03-02 | Unknown | 0.25+ | Install via `ansible-galaxy collection install prometheus.prometheus` |
| `promtool` | Config validation, rule tests | Unknown | ships with Prometheus | Run inside prometheus container: `docker exec prometheus promtool check config /etc/prometheus/prometheus.yml` |
| `amtool` | Alertmanager config check | Unknown | ships with Alertmanager | Run inside alertmanager container: `docker exec alertmanager amtool check-config /etc/alertmanager/alertmanager.yml` |
| `curl` + `jq` on operator/cc-worker | healthcheck.sh | Likely ✓ | — | Standard Debian packages |
| Internet access from docker-tower | Download dashboard 1860 JSON | Assumed ✓ | — | Download from external machine, commit manually |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `prometheus.prometheus` collection node_exporter role works on Proxmox bare-metal (tower is Debian-based PVE) without PVE-specific config | Ansible Role Selection | Role may need adjustment if PVE's init system differs; low risk since PVE uses systemd |
| A2 | PVE firewall on tower is disabled or permits port 9100 from Tailnet | Risks | Scrapes from Prometheus to tower fail silently; requires SSH verification in Wave 0 |
| A3 | LXC 100 (docker-tower) has sufficient capabilities for cAdvisor privileged mode | cAdvisor Integration | cAdvisor fails to read cgroups; mitigation: verify `pct config 100` in Wave 0 |
| A4 | Alertmanager `network_mode: host` avoids the bridge-network routing issue with Prometheus | Compose Migration | Alertmanager port conflict or connectivity failure; mitigation: verify port 9093 free |
| A5 | Cert expiry alert has no data source in this phase (no cert exporter scoped) | Alert Rules | Alert rule exists but never fires; inform user and add placeholder |
| A6 | animaya-dev (LXC 205) has Python available for Ansible | Environment Availability | Ansible play fails on animaya-dev; mitigation: `ansible -m raw -a "apt-get install -y python3"` as pre-task |

---

## Sources

### Primary (HIGH confidence)
- [prometheus-community.github.io/ansible node_exporter role](https://prometheus-community.github.io/ansible/branch/main/node_exporter_role.html) — role variables, install path, systemd behaviour
- [prometheus.io/docs/guides/cadvisor/](https://prometheus.io/docs/guides/cadvisor/) — cAdvisor volumes, privileged requirement, Prometheus integration
- [grafana.com/docs/grafana/latest/administration/provisioning/](https://grafana.com/docs/grafana/latest/administration/provisioning/) — datasources.yml, dashboards.yml, updateIntervalSeconds polling caveat
- [prometheus.io/docs/alerting/latest/configuration/](https://prometheus.io/docs/alerting/latest/configuration/) — telegram_configs fields, bot_token_file option, chat_id as integer
- [galaxy.ansible.com/ui/repo/published/prometheus/prometheus](https://galaxy.ansible.com/ui/repo/published/prometheus/prometheus) — collection active maintenance status
- Existing repo files: `servers/docker-tower/docker-compose.monitoring.yml`, `servers/nether/docker-compose.monitoring.yml`, `servers/docker-tower/README.md`, `CLAUDE.md`

### Secondary (MEDIUM confidence)
- [github.com/google/cadvisor/blob/master/docs/running.md](https://github.com/google/cadvisor/blob/master/docs/running.md) — required volumes, /dev/kmsg device
- [github.com/stefanprodan/dockprom](https://github.com/stefanprodan/dockprom) — reference implementation for alert rules and compose structure
- [github.com/prometheus/alertmanager/issues/2866](https://github.com/prometheus/alertmanager/issues/2866) — chat_id integer requirement
- WebSearch results on cloudalchemy deprecation status

### Tertiary (LOW confidence / ASSUMED)
- Proxmox firewall state on tower — unverified, assumed off or permissive
- animaya-dev Python availability — unverified
- LXC 100 cgroup capability details — inferred from README noting privileged mounts work

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Prometheus/Grafana/cAdvisor/Alertmanager ecosystem is stable; versions verified via official sources
- Ansible role selection: HIGH — prometheus-community/ansible collection is the documented successor to cloudalchemy
- Architecture: HIGH — file_sd pattern, host-network Prometheus, SOPS secret wiring all verified against official sources
- Pitfalls: MEDIUM — network_mode conflicts and LXC capability issues are inferred, not SSH-verified
- Alert PromQL: MEDIUM — expressions are standard but not tested against live data

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (stable ecosystem; image digests must be re-pinned at deploy time)
