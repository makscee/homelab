# Milestone v2.0 Requirements — Claude Code Usage Monitor

**Goal:** Centralized SOPS-encrypted registry of 2-5 Claude Code OAuth tokens (personal + worker LXCs), with per-token weekly + 5-hour-session quota dashboard on mcow Grafana and Telegram alerts at configurable thresholds.

**Subscription target:** Max 20x ($100/mo, 5-hour sessions + weekly reset, separate Sonnet weekly cap).

**Approach decision (2026-04-16):**
- **Endpoint-scrape approach** — exporter polls `GET api.anthropic.com/api/oauth/usage` per token at 300s intervals.
- **ToS interpretation:** user considers this within-scope for their own Claude Code monitoring (tokens used for CC, monitoring is operator-side only). ADR D-07 to document reasoning.
- **Egress:** mcow routes `api.anthropic.com` to nether exit via Tailscale (same mechanism as Telegram v1.0 App Connector pattern).
- **Token type:** `claude setup-token` 1-year long-lived tokens only — no interactive `/login` tokens (4-day TTL).

---

## Active Requirements

### Token Registry (TOKEN-*)

- [ ] **TOKEN-01**: Operator can store 2-5 Claude Code OAuth tokens in a single SOPS-encrypted file `secrets/claude-tokens.sops.yaml`
- [ ] **TOKEN-02**: Each token entry records label, token, owner_host, tier, added-date, optional notes
- [ ] **TOKEN-03**: Operator can add or retire a token by editing the SOPS file + running the deploy playbook (no server restart required beyond compose recreate)
- [ ] **TOKEN-04**: Registry supports an `enabled: false` flag to disable a token without removing it

### Exporter Service (EXP-*)

- [ ] **EXP-01**: Prometheus exporter polls `GET /api/oauth/usage` per enabled token at 300s jittered intervals (per-token fan-out)
- [ ] **EXP-02**: Exporter emits `claude_code_weekly_used_ratio{label}`, `claude_code_session_used_ratio{label}`, `claude_code_weekly_sonnet_used_ratio{label}`, `claude_code_reset_seconds{label,window}` gauges
- [ ] **EXP-03**: Exporter emits `claude_code_api_errors_total{label,status}` counter (tracks 429s, 401s, network errors)
- [ ] **EXP-04**: Exporter emits `claude_code_poll_last_success_timestamp{label}` gauge (observability of staleness)
- [ ] **EXP-05**: Exporter never logs or labels with raw tokens — use opaque labels only
- [ ] **EXP-06**: Exporter isolates per-token failures — one invalid/rate-limited token does not block others
- [ ] **EXP-07**: Exporter applies exponential backoff on 429 (5m → 10m → 20m → 60m cap) with last-good-value cache emitted during backoff
- [ ] **EXP-08**: Exporter container runs as non-root uid 65534 (nobody), SOPS-decrypted token file bind-mounted read-only
- [ ] **EXP-09**: Exporter exposes `/metrics` on port 9201, bind to Tailnet IP `100.101.0.9:9201` only

### Monitoring Integration (MON-*)

- [ ] **MON-01**: Prometheus on docker-tower scrapes exporter via new target file `servers/docker-tower/monitoring/prometheus/targets/claude-usage.yml`
- [ ] **MON-02**: mcow routes `api.anthropic.com` egress through nether exit node (Tailscale App Connector or equivalent)
- [ ] **MON-03**: Egress path verified by smoke test before exporter deploy (curl `api.anthropic.com` from mcow must succeed)

### Dashboard (DASH-*)

- [ ] **DASH-01**: Grafana dashboard "Claude Code Usage" provisioned as JSON in `servers/mcow/monitoring/grafana/provisioning/dashboards/json/claude-usage.json` (uid: `claude-usage-homelab`)
- [ ] **DASH-02**: Dashboard has token-selector variable (single + "All")
- [ ] **DASH-03**: Dashboard shows weekly % gauge + 5-hour session % gauge per token
- [ ] **DASH-04**: Dashboard shows Sonnet-specific weekly % when exposed by API
- [ ] **DASH-05**: Dashboard shows historical timeseries of ratios (30d retention, matches v1.0)
- [ ] **DASH-06**: Dashboard shows reset countdown (time until next weekly + next session reset)
- [ ] **DASH-07**: Dashboard shows exporter health (last-success-timestamp, 429 counter rate)

### Alerts (ALERT-*)

- [ ] **ALERT-01**: `WeeklyQuotaHigh` fires at ratio ≥ 0.80 for 15m, severity warning, Telegram
- [ ] **ALERT-02**: `WeeklyQuotaCritical` fires at ratio ≥ 0.95 for 15m, severity critical, Telegram
- [ ] **ALERT-03**: `SessionQuotaHigh` fires at ratio ≥ 0.80 for 15m, severity warning, Telegram
- [ ] **ALERT-04**: `ClaudeUsageExporterDown` fires at `up{job="claude-usage"} == 0` for 10m, severity critical
- [ ] **ALERT-05**: Alert rules live in new file `servers/docker-tower/monitoring/prometheus/alerts/claude-usage.yml`
- [ ] **ALERT-06**: Rules validated via `promtool test rules` in CI-style smoke test
- [ ] **ALERT-07**: Telegram delivery proven E2E (at least one FIRING+RESOLVED cycle)

### Deploy (DEPLOY-*)

- [ ] **DEPLOY-01**: Ansible playbook `ansible/playbooks/deploy-mcow-usage-monitor.yml` (clones pattern from `deploy-docker-tower.yml`): pulls repo, decrypts+pushes token file, runs `docker compose up -d`, hot-reloads Prometheus on docker-tower
- [ ] **DEPLOY-02**: Playbook is idempotent (verified with second run — all tasks report `ok`)
- [ ] **DEPLOY-03**: ADR D-07 written in PROJECT.md Key Decisions table documenting the ToS interpretation + endpoint-scrape choice with rationale

---

## Future Requirements (deferred)

- Token distribution to worker hosts (Shape B — ansible push tokens to workers automatically)
- Per-model breakdown beyond Sonnet (e.g., Opus-specific if API adds the field)
- Cost estimation ($ spent per week at subscription rates)
- Burn-rate prediction ("hit cap in X days at current rate")
- Anomaly detection / spike alerting
- Session recording (which CLI session burned the most)

---

## Out of Scope

- **Content tracking** — never inspect actual Claude Code conversations (privacy)
- **Automated billing integration** — read-only monitoring, no commerce
- **Token sharing or pooling** — one token per owner, static assignment
- **Aggregate fleet quota management** — no global "fleet weekly cap" concept
- **Local log tail / OpenTelemetry** — explicitly dropped in favor of endpoint-scrape (user decision 2026-04-16)
- **Interactive /login OAuth tokens** — 4-day TTL ruled out; setup-token only
- **Refresh token rotation logic** — setup-tokens are 1-year, re-generated manually before expiry

---

## Traceability

Filled by roadmapper after phase decomposition.

| REQ-ID | Phase | Plan(s) | Notes |
|--------|-------|---------|-------|
| _(pending)_ | | | |

---

*Requirements defined: 2026-04-16 (v2.0 kickoff)*
