# Roadmap: Homelab Infrastructure

## Milestones

- **v1.0 Homelab IaC** — Phases 1-4 (shipped 2026-04-15) — see `.planning/milestones/v1.0-ROADMAP.md`
- **v2.0 Claude Code Usage Monitor** — Phases 05-11 (active) — see below

## Phases

<details>
<summary>v1.0 Homelab Infrastructure-as-Code (Phases 1-4) — SHIPPED 2026-04-15</summary>

- [x] Phase 1: Foundations (3/3 plans) — completed 2026-04-13
- [x] Phase 2: Service Documentation (6/6 plans) — completed 2026-04-14
- [x] Phase 3: Health Monitoring (5/5 plans) — completed 2026-04-15
- [x] Phase 4: Operator Dashboard (4/4 plans) — completed 2026-04-15

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### v2.0 — Claude Code Usage Monitor

- [x] **Phase 05: Feasibility Gate** — Go/no-go spike validating `api.anthropic.com/api/oauth/usage` is reachable, stable, and ToS-defensible before committing to implementation (completed 2026-04-16)
- [ ] **Phase 06: Exporter Skeleton** — Single-token Python exporter runs on mcow emitting hardcoded gauge shape, proves container + network + secret-mount shape
- [ ] **Phase 07: Prometheus Wiring** — docker-tower Prometheus scrapes the real exporter; per-token metrics flow end-to-end into TSDB
- [ ] **Phase 08: SOPS Token Registry** — SOPS-encrypted multi-token registry replaces plaintext; Ansible playbook deploys the full path
- [ ] **Phase 09: Alerts** — Telegram alerts fire on weekly/session thresholds + exporter health; E2E delivery proven against real rule fire
- [ ] **Phase 10: Grafana Dashboard** — Operator-facing dashboard with token selector, gauges, historical timeseries, reset countdowns, exporter health
- [ ] **Phase 11: Multi-token Scale-out** — 2-5 real tokens from personal + worker LXCs flow into the full stack; per-token failure isolation validated under load

## Phase Details

### Phase 05: Feasibility Gate
**Goal**: Validate that a Prometheus exporter CAN reliably read Claude Code OAuth quotas from `api.anthropic.com/api/oauth/usage` before any implementation work — if it can't, the milestone halts
**Depends on**: Nothing (first phase of v2.0)
**Requirements**: MON-02, MON-03, DEPLOY-03
**Success Criteria** (what must be TRUE):
  1. Operator can `curl api.anthropic.com` from mcow successfully — the nether Tailscale App Connector advertises `api.anthropic.com` and mcow resolves + routes through it
  2. A throwaway spike exporter running one real `claude setup-token` at 300s jittered intervals for 24h returns <5% HTTP 429 responses (soak test pass)
  3. The JSON response schema matches STACK.md expectations — `five_hour.utilization`, `seven_day.utilization`, `seven_day_sonnet.utilization` all present with valid `resets_at` ISO 8601 timestamps
  4. ADR D-07 is written in PROJECT.md Key Decisions table documenting the ToS interpretation, endpoint-scrape choice, fallback posture, and user sign-off
**Plans**: TBD
**UI hint**: no

### Phase 06: Exporter Skeleton
**Goal**: A production-shaped Python exporter container runs on mcow with one plaintext token, emits per-token gauges on port 9201, and does all the operationally-critical things except SOPS
**Depends on**: Phase 05
**Requirements**: EXP-05, EXP-07, EXP-08, EXP-09
**Success Criteria** (what must be TRUE):
  1. Operator can `curl 100.101.0.9:9201/metrics` from docker-tower and see at least one `claude_code_weekly_used_ratio{label="..."}` gauge line populated from a real live poll
  2. Exporter container runs as uid 65534 (nobody), never as root, and the token file mounts read-only
  3. `docker logs claude-usage-exporter` across a forced 429 event shows exponential backoff (5m → 10m → 20m → 60m cap) and never prints a raw `sk-ant-oat01-*` token value
  4. Exporter binds only to Tailnet IP `100.101.0.9:9201` — `curl 0.0.0.0:9201/metrics` from outside Tailnet fails
**Plans**: TBD
**UI hint**: no

### Phase 07: Prometheus Wiring
**Goal**: docker-tower Prometheus scrapes the exporter and the full metric schema lands in TSDB with correct labels, types, and HELP strings
**Depends on**: Phase 06
**Requirements**: EXP-01, EXP-02, EXP-03, EXP-04, MON-01
**Success Criteria** (what must be TRUE):
  1. Operator can query `claude_code_weekly_used_ratio`, `claude_code_session_used_ratio`, `claude_code_weekly_sonnet_used_ratio`, and `claude_code_reset_seconds{window=~"five_hour|seven_day"}` in Prometheus UI and see non-NaN values refreshing every 300s
  2. `up{job="claude-usage"} == 1` in `http://100.101.0.8:9090/targets` — scrape stable for ≥1 hour
  3. `claude_code_api_errors_total{label,status}` counter increments on induced 401/429; `claude_code_poll_last_success_timestamp{label}` advances monotonically on successful polls
  4. `promtool check metrics` on a sample `/metrics` dump is clean (HELP/TYPE present, no cardinality complaints)
**Plans**: TBD
**UI hint**: no

### Phase 08: SOPS Token Registry
**Goal**: Tokens live only in SOPS-encrypted git — plaintext is eliminated from mcow's filesystem except during the 0440-perms-bound decrypt-and-mount window controlled by Ansible
**Depends on**: Phase 07
**Requirements**: TOKEN-01, TOKEN-02, TOKEN-03, TOKEN-04, DEPLOY-01, DEPLOY-02
**Success Criteria** (what must be TRUE):
  1. `secrets/claude-tokens.sops.yaml` exists in git with at least one encrypted token; each entry carries `label`, `token`, `owner_host`, `tier`, `added_on`, optional `notes`, and an `enabled` boolean
  2. Running `ansible-playbook ansible/playbooks/deploy-mcow-usage-monitor.yml` from a clean controller produces a working exporter on mcow — no manual `sops` or `scp` steps
  3. A second `ansible-playbook ... --check` run reports all tasks `ok` (idempotent) with no unexpected `changed` hits
  4. Flipping `enabled: false` on a registry entry and redeploying makes that token's gauges disappear within one poll cycle while other tokens keep emitting
**Plans**: TBD
**UI hint**: no

### Phase 09: Alerts
**Goal**: Weekly/session quota breaches and exporter outages page the operator via Telegram with human-readable context, and rule correctness is enforced by unit tests
**Depends on**: Phase 08
**Requirements**: ALERT-01, ALERT-02, ALERT-03, ALERT-04, ALERT-05, ALERT-06, ALERT-07
**Success Criteria** (what must be TRUE):
  1. Alert rule file `servers/docker-tower/monitoring/prometheus/alerts/claude-usage.yml` contains `WeeklyQuotaHigh` (≥0.80 for 15m), `WeeklyQuotaCritical` (≥0.95 for 15m), `SessionQuotaHigh` (≥0.80 for 15m), and `ClaudeUsageExporterDown` (`up == 0` for 10m) with severity labels wired to the existing `telegram-homelab` receiver
  2. `promtool test rules` passes unit tests covering: threshold fires only after `for:` elapses, under-threshold silence, no instant-fire on exporter startup, reset-flap does not double-fire
  3. A deliberately-lowered threshold induces a real `WeeklyQuotaHigh` fire → Telegram message lands in chat 193835258 → threshold restored → resolved message also lands (FIRING+RESOLVED cycle proven)
  4. `alertmanager_notifications_failed_total{integration="telegram"}` is 0 across the smoke window — delivery success confirmed beyond dispatch-attempt counter (v1.0 AM-04 lesson)
**Plans**: TBD
**UI hint**: no

### Phase 10: Grafana Dashboard
**Goal**: Operator opens Grafana and sees, at a glance, which tokens are close to burn limits, when they reset, how they've trended, and whether the exporter itself is healthy
**Depends on**: Phase 09
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07
**Success Criteria** (what must be TRUE):
  1. Grafana dashboard "Claude Code Usage" is provisioned from `servers/mcow/monitoring/grafana/provisioning/dashboards/json/claude-usage.json` with UID `claude-usage-homelab` — visible after `docker restart grafana` with no manual UI steps
  2. Dashboard has a `$token` template variable populated via `label_values(claude_code_weekly_used_ratio, label)` supporting single-select and "All"; changing the selector repaints gauges without page reload
  3. For the selected token(s): weekly %, 5-hour session %, and Sonnet-specific weekly % gauges render with color thresholds (yellow ≥0.80, red ≥0.95); a 7-day-default-range timeseries shows historical burn; reset countdown panels show human-readable time until next weekly and next session reset
  4. Dashboard has an "Exporter Health" row showing `claude_code_poll_last_success_timestamp` as a freshness stat + `rate(claude_code_api_errors_total[15m])` timeseries — operator can eyeball-verify the data is current and the endpoint is behaving
  5. All panels render with real data (not "No data") when inspected in a browser — v1.0 G-04 lesson: API-200 ≠ dashboard-working
**Plans**: TBD
**UI hint**: yes

### Phase 11: Multi-token Scale-out
**Goal**: The full pipeline (exporter → Prometheus → alerts → dashboard) stays healthy once 2-5 real tokens from personal + worker LXCs are added, and per-token failures stay isolated
**Depends on**: Phase 10
**Requirements**: EXP-06
**Success Criteria** (what must be TRUE):
  1. SOPS registry contains 2-5 real tokens spanning operator personal + at least one worker LXC (cc-worker / cc-andrey / cc-dan / cc-yuri); all enabled entries appear as distinct label series in Prometheus
  2. Grafana dashboard `$token=All` view shows distinct timeseries per token, each with its own reset countdowns — no cross-token bleed
  3. Deliberately disabling one token (either 401 induction or `enabled: false`) leaves the other tokens' gauges emitting fresh values within one poll cycle — `claude_code_api_errors_total{label=<broken>}` increments while peers' `claude_code_poll_last_success_timestamp{label=<healthy>}` keeps advancing
  4. 48h soak across all enabled tokens records <5% aggregate 429 rate and zero exporter crashes in `docker logs`
**Plans**: TBD
**UI hint**: no

## Progress

| Phase                      | Milestone | Plans Complete | Status       | Completed   |
| -------------------------- | --------- | -------------- | ------------ | ----------- |
| 1. Foundations             | v1.0      | 3/3            | Complete     | 2026-04-13  |
| 2. Service Documentation   | v1.0      | 6/6            | Complete     | 2026-04-14  |
| 3. Health Monitoring       | v1.0      | 5/5            | Complete     | 2026-04-15  |
| 4. Operator Dashboard      | v1.0      | 4/4            | Complete     | 2026-04-15  |
| 05. Feasibility Gate       | v2.0      | 5/5 | Complete    | 2026-04-16 |
| 06. Exporter Skeleton      | v2.0      | 0/0            | Not started  | -           |
| 07. Prometheus Wiring      | v2.0      | 0/0            | Not started  | -           |
| 08. SOPS Token Registry    | v2.0      | 0/0            | Not started  | -           |
| 09. Alerts                 | v2.0      | 0/0            | Not started  | -           |
| 10. Grafana Dashboard      | v2.0      | 0/0            | Not started  | -           |
| 11. Multi-token Scale-out  | v2.0      | 0/0            | Not started  | -           |
