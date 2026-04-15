# Phase 04: Operator Dashboard — Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a single-page Grafana overview on mcow showing all 6 Tailnet hosts + services at a glance, and prove the Alertmanager → Telegram path end-to-end with a real fire.

**In scope:**
- Migrate Grafana from docker-tower → mcow (Tailnet-bound); decommission docker-tower Grafana
- Co-locate Alertmanager on mcow with Grafana (moves with Grafana; Prometheus stays on docker-tower)
- Build new "Operator Overview" dashboard (KPI strip + per-host detail rows)
- Natural-trigger Alertmanager → Telegram smoke test (close deferred 03-03)
- Unblock animaya-dev: push SSH key via `pct exec` on tower, deploy node-exporter, remove `deferred: true`

**Out of scope:**
- Prometheus relocation (stays on docker-tower — roadmap locks this)
- Cert expiry exporter (deferred from 03, not a v1.0 gate)
- Log aggregation / APM / long-term metrics tier
- Public exposure of Grafana/Alertmanager (Tailnet-only, locked in Phase 03)

</domain>

<decisions>
## Implementation Decisions

### Grafana Migration (Plan 04-01)
- **D-01:** Clean install of Grafana on mcow. SQLite starts empty. Dashboards-as-code (provisioning YAML + JSON under `servers/mcow/monitoring/grafana/provisioning/`) is the source of truth — no SQLite copy from docker-tower.
- **D-02:** Pin Prometheus datasource UID in provisioning YAML so dashboard JSON refs stay stable across the migration (avoid auto-generated UID drift that bit us in 03-04).
- **D-03:** Grafana binds Tailnet-only on mcow (`100.101.0.9:3000`), never `0.0.0.0`. Admin creds from SOPS (`secrets/mcow.sops.yaml` → `/run/secrets/grafana.env`). Sign-up disabled. Pattern matches locked Phase 03 decisions.
- **D-04:** Prometheus datasource URL = `http://100.101.0.8:9090` (docker-tower Tailnet IP) — Grafana reaches Prometheus over Tailnet.
- **D-05:** docker-tower Grafana decommissioned after mcow Grafana verified: container removed from `docker-compose.monitoring.yml`, volume preserved for 1 rollback window, README updated.

### Alertmanager Co-location (Plan 04-01)
- **D-06:** Alertmanager moves from docker-tower → mcow alongside Grafana. Prometheus on docker-tower points at `http://100.101.0.9:9093`.
- **D-07:** Telegram secret (`TELEGRAM_BOT_TOKEN`, chat_id `193835258`) re-deployed on mcow via SOPS → `/run/secrets/telegram_token` at mode `0440 root:65534` (identical recipe to 03-05; permission mode is load-bearing — see anti-pattern note below).
- **D-08:** Alertmanager config (`alertmanager.yml`, Telegram receiver, HTML template, routes) lifted as-is from docker-tower; only mcow-local paths change.

### Operator Overview Dashboard (Plan 04-02)
- **D-09:** New dashboard titled "Operator Overview", UID stable (e.g., `homelab-overview`), provisioned as the Grafana **home dashboard** (org default). Existing "Homelab Summary" kept as secondary detail view.
- **D-10:** Layout = **KPI strip + per-host detail**:
  - **Top KPI strip:** 6 host status pills (up/down/no-data), total active alerts count, total running-container count across fleet.
  - **Per-host detail rows** (6 rows): CPU%, RAM%, disk% gauges + time-series; container count (from cAdvisor on hosts that run Docker); uptime; network I/O (rx/tx).
- **D-11:** Active-alerts KPI panel uses Grafana's **Alertmanager datasource** (`/api/v2/alerts`), not Prometheus `ALERTS` metric. Respects silences/inhibits; matches what fires Telegram.
- **D-12:** Container counts derived from `count(container_last_seen{name!=""}) by (instance)` on cAdvisor; hosts without cAdvisor (tower, nether, animaya-dev) show "N/A" rather than 0.
- **D-13:** animaya-dev included in overview. Once 04-04 completes, it shows live data. Until then (during 04-02 dev), panels render "no data" gracefully.

### Alert Smoke Test (Plan 04-03)
- **D-14:** Method = **natural trigger**. SSH a chosen host (e.g., cc-worker), `systemctl stop node_exporter`, wait for `HostDown` rule to fire (scrape gap → rule eval → AM → Telegram), capture Telegram message, `systemctl start node_exporter`, confirm resolve message delivered.
- **D-15:** Proof artifacts: timestamps of stop/start, Telegram screenshot in SUMMARY, `alertmanager_notifications_total{integration="telegram"}` counter deltas (FIRING then RESOLVED), Prometheus alert state transitions from `/api/v1/alerts`.

### animaya-dev Unblock (Plan 04-04 — new, folded in)
- **D-16:** Phase scope expanded with a 4th plan. Closes a real v1.0 gap flagged in the milestone audit (node-exporter 5/6 → 6/6).
- **D-17:** Access path: `pct exec 205 -- …` from tower (Proxmox host) — bypasses broken SSH. Push operator's ed25519 pubkey into `/root/.ssh/authorized_keys` with correct perms (`700`/`600`).
- **D-18:** After SSH works, re-run `ansible-playbook playbooks/node-exporter.yml --limit animaya-dev` (playbook + inventory already ready). Flip `deferred: true` → remove, drop the `--limit 'monitored_hosts:!animaya-dev'` guard from ansible invocations.
- **D-19:** Verify `:9100/metrics` reachable from operator over Tailscale; Prometheus target transitions to `up`; animaya-dev HostDown alert auto-resolves.

### Claude's Discretion
- Exact Grafana version pin (use same digest currently running on docker-tower unless a known CVE warrants bump).
- Dashboard panel visuals: gauge thresholds (CPU>80% amber, >95% red etc.), exact query tweaks — planner may copy from existing Homelab Summary and extend.
- Panel ordering within detail rows (CPU / RAM / disk / containers / uptime / net I/O).
- File layout under `servers/mcow/monitoring/` — mirror `servers/docker-tower/monitoring/` subdirectory structure.
- SOPS secret filename on mcow (prefer `secrets/mcow.sops.yaml` to group mcow secrets).
- cAdvisor label-matching regex for per-host container counts.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 03 Locked Decisions (carry forward)
- `.planning/phases/03-health-monitoring/03-CONTEXT.md` §"Grafana access + dashboards (locked)" — Tailnet-only bind, SOPS admin creds, sign-up disabled, dashboards-as-code via provisioning.
- `.planning/phases/03-health-monitoring/03-RESEARCH.md` — Prometheus/Grafana/Alertmanager versions, file_sd patterns, community dashboard IDs.

### Existing Monitoring Stack (docker-tower — source of the migration)
- `servers/docker-tower/docker-compose.monitoring.yml` — current Grafana + Alertmanager + Prometheus + cAdvisor compose; Grafana/Alertmanager stanzas are the lift-and-shift source.
- `servers/docker-tower/monitoring/grafana/provisioning/datasources/prometheus.yml` — datasource template (UID pinning model to copy).
- `servers/docker-tower/monitoring/grafana/provisioning/dashboards/dashboards.yml` — provisioning config.
- `servers/docker-tower/monitoring/grafana/provisioning/dashboards/json/homelab-summary.json` — secondary dashboard (kept, not home).
- `servers/docker-tower/monitoring/alertmanager/alertmanager.yml` — Telegram receiver + routes.
- `servers/docker-tower/monitoring/alertmanager/README.md` §"SOPS secret deploy flow" — **critical perms recipe** (`install -m 0440 -o root -g 65534`) — reproduce exactly on mcow.

### mcow Target
- `servers/mcow/README.md` §7 — current cAdvisor deployment on mcow (pattern for new Grafana/AM compose).
- `servers/mcow/docker-compose.cadvisor.yml` — existing mcow compose, co-locate new services here or split.

### Alertmanager Wiring Anti-Patterns
- `.planning/phases/03-health-monitoring/03-05-SUMMARY.md` §"Auto-fixed Issues → telegram_token container read failure" — **do not repeat**: `/run/secrets/telegram_token` must be `0440 root:65534`, not `600 root:root`. Enforce in mcow deploy.

### animaya-dev SSH Blocker
- `.planning/phases/03-health-monitoring/03-02-SUMMARY.md` §"animaya-dev — SSH blocked (deferred)" — cause + `pct exec` fix path.
- `ansible/inventory/homelab.yml` — inventory has `deferred: true` + TODO marker; remove after SSH works.
- `ansible/playbooks/node-exporter.yml` — playbook already written, just needs `--limit animaya-dev` run.

### Project-Level
- `.planning/PROJECT.md` — Tailnet-only networking, SOPS secrets at hub level, Claude Code as operator (numbered steps, exact hostnames, expected outputs).
- `.planning/v1.0-MILESTONE-AUDIT.md` §tech_debt — lists the four gaps Phase 04 closes (alert E2E, animaya-dev, nether secrets cleanup not in scope here, cert exporter deferred).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Provisioning pattern** — `servers/docker-tower/monitoring/grafana/provisioning/` is a working template. Copy structure + adapt IPs + pin datasource UID.
- **Homelab Summary dashboard JSON** — contains per-IP regex matchers for 5 hosts; can be extended or used as query reference for new Operator Overview panels.
- **cAdvisor already on mcow** — `100.101.0.9:18080`, scraped by docker-tower Prometheus. No new collector needed for mcow container metrics.
- **node-exporter on 5/6 hosts** — all queries for CPU/RAM/disk/uptime/net I/O just work.
- **Alertmanager Telegram config** — fully wired on docker-tower, battle-tested in 03-05. Lift `alertmanager.yml` + template + route verbatim.

### Established Patterns
- **Compose + SOPS secrets** — `secrets/<host>.sops.yaml` decrypted at deploy to `/run/secrets/<name>` mounted into container. Pattern locked across Phase 02–03.
- **Dashboards-as-code** — Grafana UI is read-only for dashboards; all changes go through provisioning JSON in repo (Phase 03 lock).
- **Tailnet-only binds** — `100.x.y.z:port` everywhere, never `0.0.0.0`. Phase 03 lock.
- **`pct exec` from tower** — established pattern for LXC-internal ops when SSH fails; used in earlier phases for bootstrap.

### Integration Points
- **Prometheus on docker-tower** — no changes to scrape config for this phase except updating `alertmanagers:` target URL to mcow (`100.101.0.9:9093`).
- **Telegram bot** — same token + chat_id, just moved to mcow's SOPS file.
- **Grafana Alertmanager datasource** — new provisioning entry on mcow pointing at `http://localhost:9093` (if co-located in same compose network) or `http://100.101.0.9:9093` (if separate).

</code_context>

<specifics>
## Specific Ideas

- **Overview dashboard preview** (user confirmed layout from mockup):
  ```
  ┌── STATUS ─────────────────────────────────────┐
  │ tower●  d-tow●  cc-wk●  mcow●  nether●  ani○  │
  │ Alerts firing: 0       Containers: 23         │
  └───────────────────────────────────────────────┘
  ┌─ tower ──┬─ docker-tower ─┬─ cc-worker ──┐
  │ cpu/ram  │ cpu/ram/disk   │ cpu/ram/disk │
  ```
  KPI strip on top, per-host detail below.
- **Home dashboard naming:** "Operator Overview" (matches phase name, clear intent).
- **Smoke test host choice:** cc-worker is the safe pick — LXC, easy systemctl access, no impact on media stack or VoidNet. Document the exact SSH + commands in plan so UAT is one-shot.
- **Decommission timing:** keep docker-tower Grafana container running but with container stopped for 1 week post-migration, then remove. Gives operator a rollback handle without actively serving two Grafanas.

</specifics>

<deferred>
## Deferred Ideas

- **Grafana annotations / user prefs migration** — not migrating SQLite DB. If operator later misses starred dashboards or history, revisit in a future phase.
- **Alertmanager HA / multi-replica** — single-instance on mcow is fine for v1.0; HA out of scope.
- **Cert expiry exporter** — tech debt from Phase 03 audit. Not a dashboard/alert smoke-test concern. Next milestone.
- **nether secrets cleanup** (`GF_SECURITY_ADMIN_*` unreferenced after Grafana decommission there) — tidy-up, not a Phase 04 blocker.
- **Blackbox HTTP probing** — flagged as discretion in 03; still discretion. Skip unless operator requests.

</deferred>

---

*Phase: 04-operator-dashboard*
*Context gathered: 2026-04-15*
*Plans expand: 3 → 4 (animaya-dev unblock folded as 04-04). ROADMAP.md to be updated during /gsd-plan-phase.*
