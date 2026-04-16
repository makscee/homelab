# Roadmap: Homelab Infrastructure

## Milestones

- **v1.0 Homelab IaC** — Phases 1-4 (shipped 2026-04-15) — see `.planning/milestones/v1.0-ROADMAP.md`
- **v2.0 Claude Code Usage Monitor** — Phases 05-11 (closed with pivot 2026-04-16) — see below
- **v3.0 Unified Stack Migration** — Phases 12-19 (active) — homelab admin dashboard at `homelab.makscee.ru`

## Phases

<details>
<summary>v1.0 Homelab Infrastructure-as-Code (Phases 1-4) — SHIPPED 2026-04-15</summary>

- [x] Phase 1: Foundations (3/3 plans) — completed 2026-04-13
- [x] Phase 2: Service Documentation (6/6 plans) — completed 2026-04-14
- [x] Phase 3: Health Monitoring (5/5 plans) — completed 2026-04-15
- [x] Phase 4: Operator Dashboard (4/4 plans) — completed 2026-04-15

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### v2.0 — Claude Code Usage Monitor (CLOSED WITH PIVOT 2026-04-16)

**Status:** Closed — pivoted to v3.0 Unified Stack Migration. See `.planning/MILESTONE-CLOSE-v2.0.md`.

- [x] **Phase 05: Feasibility Gate** — COMPLETE formal (2026-04-16). GATE-PASSED on operational evidence, ADR D-07 locked.
- [x] **Phase 06: Exporter Skeleton** — COMPLETE operational (2026-04-16). Python exporter running on mcow:9101 as systemd service. Tech-debt flagged for v3.0. See `06-SUMMARY-OPERATIONAL.md`.
- [x] **Phase 07: Prometheus Wiring** — COMPLETE operational (2026-04-16). docker-tower Prometheus scraping mcow:9101, `up=1`. See `07-SUMMARY-OPERATIONAL.md`.
- [~] **Phase 08: SOPS Token Registry** — SUPERSEDED by v3.0 Claude Tokens page (UI + SOPS backend in monorepo)
- [~] **Phase 09: Alerts** — MOVED to v3.0 Phase 17
- [~] **Phase 10: Grafana Dashboard** — KILLED. Replaced by v3.0 Next.js custom dashboard.
- [~] **Phase 11: Multi-token Scale-out** — ABSORBED into v3.0 (token CRUD UI = scale-out path; 2 tokens already live operationally)

### v3.0 — Unified Stack Migration (Active)

**Milestone Goal:** Build the homelab admin dashboard at `homelab.makscee.ru` — a mutation-capable internal tool that proxies writes to SOPS, VoidNet API, Proxmox REST API, and Alertmanager, while reading from Prometheus + claude-usage-exporter. Kill Grafana-as-dashboard.

**Dependency graph:**
```
Phase 12 (Infra Foundation) → all downstream phases
Phase 13 (Tokens) → depends on Phase 12
Phase 14 (Overview + Audit Log) → depends on Phase 13
Phases 15, 16, 17 (VoidNet, Proxmox, Alerts) → parallel-safe after Phase 14
Phase 18 (Web Terminal) → depends on Phase 16 (needs Proxmox LXC context)
Phase 19 (Security + Launch) → depends on all others
```

- [ ] **Phase 12: Infra Foundation** - Next.js scaffold, Caddy site block, GitHub OAuth, secrets wiring, base layout, security headers
- [ ] **Phase 13: Claude Tokens Page** - SOPS registry CRUD, per-token gauges, history chart, exporter rebind (v2.0 debt)
- [ ] **Phase 14: Global Overview + Audit Log** - First dashboard page with Prometheus data, audit log infrastructure for all writes
- [ ] **Phase 15: VoidNet Management** - Proxy to voidnet-api admin JSON endpoints: users, credits, boxes (parallel-safe after Phase 14)
- [ ] **Phase 16: Proxmox Ops** - LXC lifecycle management via Proxmox REST API (parallel-safe after Phase 14)
- [ ] **Phase 17: Alerts Panel + Rules** - Alertmanager consumer + Prometheus rules + Telegram delivery (parallel-safe after Phase 14)
- [ ] **Phase 18: Web Terminal** - xterm.js + ssh2 PTY relay; node-pty feasibility spike required first
- [ ] **Phase 19: Security Review + Launch** - Hardening, audit, ui-kit extraction finalization, launch checklist

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

---

### Phase 12: Infra Foundation

**Goal**: The admin dashboard skeleton is deployed on mcow, reachable at `homelab.makscee.ru` over Tailnet only, secured by GitHub OAuth, with hardened HTTP headers and all secrets in SOPS — every subsequent phase can ship a page into this shell without touching infrastructure.

**Depends on**: Phase 11 (v2.0 closed)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-06, INFRA-07, INFRA-08, UI-03, UI-04, SEC-02, SEC-04, SEC-05, SEC-06, SEC-07

**Success Criteria** (what must be TRUE):
  1. Operator can open `https://homelab.makscee.ru` in a Tailnet browser, sign in with GitHub (`makscee`), and land on an authenticated shell with sidebar nav and top bar — a non-allowlisted GitHub account receives a 403 page
  2. TLS certificate is auto-issued via Caddy LE HTTP-01 (standard Caddy package — mirrors `vibe.makscee.ru`); `curl -v https://homelab.makscee.ru` shows a valid LE cert with ≥30 days remaining
  3. `bun audit` reports zero HIGH/CRITICAL vulnerabilities; Next.js version is pinned to ≥15.2.4 (CVE-2025-66478 patched) and documented in `apps/admin/package.json`
  4. Response headers include `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: DENY` — verifiable with `curl -I`
  5. `ansible-playbook ansible/playbooks/deploy-homelab-admin.yml` completes idempotently from a clean controller; second run shows all tasks `ok`

**Plans**: 10 plans
Plans:
- [x] 12-01-PLAN.md — Bun workspaces root + Next.js 15.2.4 scaffold + pinned versions + audit gate
- [ ] 12-02-PLAN.md — Ansible group_vars additions (port 3847, bun_version) + collection requirements
- [ ] 12-03-PLAN.md — mcow LXC privilege probe + STATE.md cleanup (obsolete todos closed)
- [ ] 12-04-PLAN.md — Auth.js v5 GitHub OAuth + allowlist middleware + CSP/HSTS/XFO nonce headers
- [ ] 12-05-PLAN.md — Base layout (sidebar + topbar) + 8 route stubs + UI-04 primitives + /api/health + server-only lint
- [ ] 12-06-PLAN.md — docs/setup-github-oauth.md runbook + apps/admin/README.md policy gates
- [ ] 12-07-PLAN.md — servers/mcow/homelab-admin.service systemd unit (probe-matched hardening) + inventory update
- [ ] 12-08-PLAN.md — SOPS mcow.sops.yaml extension + Ansible decrypt/render tasks (env file mode 0600)
- [ ] 12-09-PLAN.md — deploy-homelab-admin.yml end-to-end playbook + Caddy blockinfile template
- [ ] 12-10-PLAN.md — Deploy execution + evidence capture + VERIFICATION.md + SEC-05 policy doc
**UI hint**: yes

---

### Phase 13: Claude Tokens Page

**Goal**: Operator can manage all Claude Code tokens from the web UI — view live utilization gauges, add/rotate/disable/delete tokens via SOPS backend writes — and the v2.0 exporter tech-debt is paid (Tailnet-only bind, uid 65534).

**Rationale for early placement:** Tokens page delivers the highest operator value (replaces manual SOPS edits), absorbs v2.0 Phases 08 + 11, and closes the SEC-03 tech-debt before it drifts further. SOPS write spike + Zod 4 compatibility check are first tasks of this phase (see PITFALLS.md P-03).

**Depends on**: Phase 12
**Requirements**: TOKEN-01, TOKEN-02, TOKEN-03, TOKEN-04, TOKEN-05, TOKEN-06, TOKEN-07, SEC-03

**Success Criteria** (what must be TRUE):
  1. Page `/tokens` loads the encrypted token registry and displays each entry's label, owner host, tier, added date, and enabled state — works even when SOPS write path is unavailable (degraded mode disables CRUD, shows existing entries)
  2. Operator can add a new `sk-ant-oat01-*` token via the form; token is never reflected in HTML responses, never written to logs, and appears in the SOPS registry on the next page load with live gauges populated from Prometheus
  3. Rotate, disable/enable, rename, and delete operations each complete without page reload and each produce an audit log row (readable in the audit log once Phase 14 ships)
  4. Per-token 7-day history chart (Recharts) renders from Prometheus range query with a visible timeseries — no "No data" empty state when exporter is healthy
  5. `curl http://100.101.0.9:9101/metrics` from outside Tailnet fails; `curl http://100.101.0.9:9101/metrics` from a Tailnet host returns metrics; exporter process runs as uid 65534

**Plans**: TBD
**UI hint**: yes

---

### Phase 14: Global Overview + Audit Log

**Goal**: The `/` dashboard page shows a live snapshot of all 6 Tailnet hosts' health and Claude usage summary, and the audit log infrastructure is in place — every mutation route in any subsequent phase can be wrapped with one import.

**Rationale:** Overview validates the full Prometheus read stack (SWR + server-side Route Handler + Recharts) before any write phases build on it. Audit log infrastructure MUST land in this phase so Phases 15-17 can ship audit-logged writes on day one.

**Depends on**: Phase 13
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, INFRA-05

**Success Criteria** (what must be TRUE):
  1. Page `/` shows a stat row per host (6 total) with CPU %, memory %, disk %, and container count — data is live from Prometheus, not hardcoded
  2. Claude usage summary (per-token 5h + 7d utilization gauges) renders on the overview with a link to `/tokens`; alert firing count with severity breakdown appears with a link to `/alerts`
  3. All data auto-refreshes every 30s via SWR; a simulated Prometheus outage shows a stale/error state rather than a crash or blank page
  4. Prometheus credentials and URLs are absent from any client-side bundle (verify via browser DevTools network tab — no direct Prometheus calls from the browser)
  5. SQLite `audit_log` table exists; a manual test mutation produces a row with `user`, `action`, `target`, `payload_json`, and `created_at` fields correctly populated

**Plans**: TBD
**UI hint**: yes

---

### Phase 15: VoidNet Management

**Goal**: Operator can manage VoidNet users and Claude boxes from the admin dashboard — view user list, adjust credits, ban/unban, and inspect per-user boxes with masked SSH credentials — all writes audit-logged.

**Depends on**: Phase 14
**Note:** This phase is **parallel-safe with Phases 16 and 17** — all three can execute concurrently after Phase 14 completes. VoidNet JSON admin endpoints must exist on `voidnet-api` before this phase ships (parallel milestone in voidnet repo).
**Requirements**: VOIDNET-01, VOIDNET-02, VOIDNET-03, VOIDNET-04, VOIDNET-05, VOIDNET-06, VOIDNET-07, VOIDNET-08

**Success Criteria** (what must be TRUE):
  1. Page `/voidnet/users` loads a paginated, searchable list of users from `voidnet-api` admin JSON endpoints — search by Telegram handle returns filtered results in <500ms
  2. Operator can open a user detail view showing credits history, active boxes, service list, and last seen — each Claude box row shows ssh command + masked password with click-to-reveal
  3. Credit adjustment (+/- with reason) and ban/unban operations each produce an audit log row; the voidnet-api state reflects the change on the next page load
  4. Re-provision trigger on a box polls until completion and updates the box status in the UI — no manual refresh required
  5. All voidnet-api calls use the `X-Admin-Token` header sourced from SOPS; a request without the correct header is rejected by voidnet-api (verifiable in network tab)

**Plans**: TBD
**UI hint**: yes

---

### Phase 16: Proxmox Ops

**Goal**: Operator can manage LXC containers on tower from the admin dashboard — view all containers, start/shutdown/restart with graceful default, spawn new containers, and inspect config — all destructive operations guarded and audit-logged.

**Depends on**: Phase 14
**Note:** This phase is **parallel-safe with Phases 15 and 17** — all three can execute concurrently after Phase 14 completes.
**Requirements**: PROXMOX-01, PROXMOX-02, PROXMOX-03, PROXMOX-04, PROXMOX-05, PROXMOX-06

**Success Criteria** (what must be TRUE):
  1. Page `/proxmox` lists all LXCs on tower with vmid, hostname, status, cpu/mem/disk config, and uptime — data sourced from Proxmox REST API, not hardcoded
  2. Start, Shutdown (graceful, default), Restart, and Hard-stop operations each work; Hard-stop requires a confirmation guard and produces an audit log row; Shutdown uses Proxmox `/shutdown` endpoint (not `/stop`)
  3. Spawn-new-LXC form completes end-to-end — operator fills vmid/hostname/template/resources, Proxmox task-id is polled, progress shown, new container appears in the list on completion
  4. Destroy LXC requires typed-hostname confirmation before executing; operation is audit-logged; destroyed container disappears from the list
  5. Proxmox API calls use a token with `dashboard-operator` role (scoped to `VM.PowerMgmt`, `VM.Audit`, `Datastore.Audit`); CA cert is pinned from SOPS — `NODE_TLS_REJECT_UNAUTHORIZED` is never set to `0`

**Plans**: TBD
**UI hint**: yes

---

### Phase 17: Alerts Panel + Rules

**Goal**: Operator can see all current Alertmanager firing alerts on `/alerts`, Claude quota alert rules are deployed and unit-tested, and Telegram delivery is proven end-to-end — absorbing v2.0 Phase 09 scope entirely.

**Depends on**: Phase 14
**Note:** This phase is **parallel-safe with Phases 15 and 16** — all three can execute concurrently after Phase 14 completes.
**Requirements**: ALERT-01, ALERT-02, ALERT-03, ALERT-04, ALERT-05, ALERT-06

**Success Criteria** (what must be TRUE):
  1. Page `/alerts` shows all current Alertmanager firing alerts with severity, summary, duration, and labels — page is read-only with a link-out to Alertmanager web UI for ack/silence
  2. Alert badge in the shared nav layout shows the current firing count on every page — updates on each 30s SWR refresh cycle
  3. Alert rule file contains `ClaudeWeeklyQuotaHigh` (≥0.80 for 15m), `ClaudeWeeklyQuotaCritical` (≥0.95 for 15m), and `ClaudeExporterDown` (up==0 for 10m); `promtool test rules` passes with unit tests covering threshold boundary and `for:` duration behavior
  4. Deliberately-induced rule fire results in a Telegram message landing in chat 193835258; `alertmanager_notifications_failed_total{integration="telegram"}` stays 0 across the smoke window (FIRING + RESOLVED cycle both delivered)

**Plans**: TBD
**UI hint**: yes

---

### Phase 18: Web Terminal

**Goal**: Operator can open an in-browser SSH terminal to any Proxmox LXC via xterm.js — session is auth-gated, resource-limited, audit-logged, and cleans up on disconnect.

**Rationale for last placement:** Web terminal is the highest-risk feature (XL scope, node-pty LXC compatibility unknown). The node-pty feasibility spike is the mandatory first task of this phase — if node-pty fails in mcow's LXC, the fallback is a pure-JS ssh2 pipe. Only attempt after all other features are stable.

**Depends on**: Phase 16 (needs Proxmox LXC context + SSH credential retrieval pattern)
**Requirements**: TERM-01, TERM-02, TERM-03, TERM-04, TERM-05, TERM-06

**Success Criteria** (what must be TRUE):
  1. Feasibility spike result is documented: either node-pty allocates a PTY in mcow's LXC (preferred) or the ssh2 pure-JS pipe fallback is selected — decision recorded before any terminal UI ships
  2. Page `/box/:vmid/terminal` opens an xterm.js session connected to the target LXC via WebSocket + SSH relay; operator can run interactive commands (e.g., `top`, `bash`)
  3. Closing the browser tab or navigating away kills the PTY and closes the SSH connection within 5 seconds — `ps aux` on mcow shows no zombie SSH processes after disconnect
  4. Concurrent terminal limit of 3 sessions is enforced — a 4th open attempt is rejected with a clear error message
  5. Every terminal-open event produces an audit log row with target vmid, user, and timestamps; terminal-close timestamp is recorded on disconnect

**Plans**: TBD
**UI hint**: yes

---

### Phase 19: Security Review + Launch

**Goal**: The dashboard passes a security review (bundle analysis, header audit, Proxmox token scope check, bun audit), the shared ui-kit repo is fully extracted and wired as a git submodule, and the app is ready for ongoing operator use.

**Depends on**: Phase 18 (all features complete)
**Requirements**: UI-01, UI-02, SEC-01, SEC-08

**Success Criteria** (what must be TRUE):
  1. `hub-shared/ui-kit` repo exists with Tailwind config, CSS variable theme tokens, base shadcn component set, and a README — homelab admin consumes it as a git submodule at `vendor/ui-kit/`
  2. `bun audit` reports zero HIGH/CRITICAL vulnerabilities; browser DevTools network analysis confirms no secret values (tokens, API keys, session cookies) appear in any client-side bundle or XHR response body
  3. Caddy rate limiting is active on `homelab.makscee.ru` auth endpoints (60 req/min per-IP); header-spoofing integration test confirms a request with a forged `Tailscale-User-Login` header is rejected before any handler runs
  4. Proxmox API token scope is audited to confirm it holds only `VM.PowerMgmt`, `VM.Audit`, `Datastore.Audit` — no broader permissions; audit findings documented in `apps/admin/docs/security-audit.md`

**Plans**: TBD
**UI hint**: yes

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundations | v1.0 | 3/3 | Complete | 2026-04-13 |
| 2. Service Documentation | v1.0 | 6/6 | Complete | 2026-04-14 |
| 3. Health Monitoring | v1.0 | 5/5 | Complete | 2026-04-15 |
| 4. Operator Dashboard | v1.0 | 4/4 | Complete | 2026-04-15 |
| 05. Feasibility Gate | v2.0 | 5/5 | Complete | 2026-04-16 |
| 06. Exporter Skeleton | v2.0 | 0/0 | Superseded | 2026-04-16 |
| 07. Prometheus Wiring | v2.0 | 0/0 | Superseded | 2026-04-16 |
| 08. SOPS Token Registry | v2.0 | 0/0 | Superseded | 2026-04-16 |
| 09. Alerts | v2.0 | 0/0 | Superseded | 2026-04-16 |
| 10. Grafana Dashboard | v2.0 | 0/0 | Superseded | 2026-04-16 |
| 11. Multi-token Scale-out | v2.0 | 0/0 | Superseded | 2026-04-16 |
| 12. Infra Foundation | v3.0 | 1/10 | In Progress|  |
| 13. Claude Tokens Page | v3.0 | 0/? | Not started | - |
| 14. Global Overview + Audit Log | v3.0 | 0/? | Not started | - |
| 15. VoidNet Management | v3.0 | 0/? | Not started | - |
| 16. Proxmox Ops | v3.0 | 0/? | Not started | - |
| 17. Alerts Panel + Rules | v3.0 | 0/? | Not started | - |
| 18. Web Terminal | v3.0 | 0/? | Not started | - |
| 19. Security Review + Launch | v3.0 | 0/? | Not started | - |
