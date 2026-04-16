# Requirements — v3.0 Unified Stack Migration (homelab scope)

> **Scope note:** this milestone covers the HOMELAB admin dashboard at `homelab.makscee.ru` built in this repo. VoidNet + Animaya migrations are parallel milestones in their own repos; they consume the shared `hub-shared/ui-kit` produced here.

> **Previous:** v2.0 closed with pivot 2026-04-16 — phases 05-07 operational, 08-11 absorbed into v3.0. See `.planning/MILESTONE-CLOSE-v2.0.md`.

## Active Requirements

### INFRA — Foundation (must land first)

- [x] **INFRA-01**: Next.js 15 + React 19 + TypeScript app scaffolded under `apps/admin/` in this repo, running under Bun, managed by systemd on mcow
- [x] **INFRA-02**: App binds Unix socket (or 127.0.0.1:PORT, port ≠ 3000 since Docker already owns it) — never public-bound directly; existing Caddy on mcow reverse-proxies `homelab.makscee.ru` to the socket
- [ ] **INFRA-03**: LE TLS certificate auto-issued + auto-renewed via existing Caddy HTTP-01 flow on mcow (mirrors `vibe.makscee.ru` pattern in `/etc/caddy/Caddyfile`); new site block added to Caddyfile
- [ ] **INFRA-04**: GitHub OAuth sign-in via Auth.js v5; allowlist of GitHub user logins enforced (initial: `makscee`); unlisted users rejected with 403 before any handler runs
- [ ] **INFRA-05**: Audit log infrastructure — SQLite table `audit_log(id, user, action, target, payload_json, created_at)` + middleware wrapper applied to all mutation routes before any page ships writes
- [ ] **INFRA-06**: Ansible playbook `ansible/playbooks/deploy-homelab-admin.yml` deploys the app to mcow (rsync source, `bun install`, `bun run build`, systemd unit install/reload); idempotent
- [x] **INFRA-07**: Next.js pinned to a release containing the CVE-2025-66478 fix; `bun audit` clean before deploy; dependency bump policy documented
- [ ] **INFRA-08**: Secrets (GitHub OAuth client id/secret, session secret, allowlist) live in SOPS-encrypted `secrets/mcow.sops.yaml`; never committed plaintext; loaded at app start via Ansible-decrypted `.env`

### UI — Shared Design System

- [ ] **UI-01**: `hub-shared/ui-kit` repo created (separate from homelab repo) with Tailwind config, CSS variable theme tokens, base shadcn component set, README with usage instructions
- [ ] **UI-02**: Homelab admin consumes `hub-shared/ui-kit` as a git submodule at `vendor/ui-kit/`; updates flow one-way from ui-kit → consumers
- [ ] **UI-03**: Base layout component with sidebar nav (pages), top bar (GitHub user chip), page content slot; dark mode default
- [ ] **UI-04**: Standard error page + 404 + unauthorized (403) page using shared components; consistent empty-state + loading + error patterns

### DASH — Global Overview Page

- [ ] **DASH-01**: Page `/` shows per-host stat rows for all 6 monitored Tailnet hosts: CPU %, memory %, disk %, container count (from node_exporter metrics)
- [ ] **DASH-02**: Page shows Claude usage summary (per-token 5h + 7d utilization gauges, small form factor, links to tokens page for detail)
- [ ] **DASH-03**: Page shows current Alertmanager firing alert count with severity breakdown; links to alerts page
- [ ] **DASH-04**: All data auto-refreshes every 30s via SWR; loading/stale states handled gracefully
- [ ] **DASH-05**: Prometheus queries served via Route Handler (server-side fetch) — no Prometheus creds or URLs exposed client-side

### TOKEN — Claude Code Tokens Page

- [ ] **TOKEN-01**: Page `/tokens` lists all entries from SOPS-encrypted token registry (`secrets/claude-tokens.sops.yaml`) with: label, owner host, tier, added date, enabled flag
- [ ] **TOKEN-02**: Each row shows live per-token gauges (5h utilization, 7d utilization, next reset countdown) driven by Prometheus queries against `claude_usage_*` metrics
- [ ] **TOKEN-03**: Add-token form: paste `sk-ant-oat01-*`, label, owner host → backend validates format, appends to registry via `sops` subprocess, redeploys exporter via Ansible task trigger; token never logged, never reflected back in HTML
- [ ] **TOKEN-04**: Rotate flow: replace existing token value → SOPS write → redeploy; old token disabled in one atomic commit
- [ ] **TOKEN-05**: Disable / enable / rename / delete operations on existing entries, each as an audit-logged mutation
- [ ] **TOKEN-06**: Per-token historical timeseries chart (7-day window) using Recharts; range query from Prometheus
- [ ] **TOKEN-07**: Tokens page read-path works even if SOPS write path is broken (degraded mode shows existing entries but disables CRUD)

### VOIDNET — VoidNet Management Page (proxy)

- [ ] **VOIDNET-01**: Dashboard consumes voidnet-api admin JSON endpoints on `100.101.0.9:8081` (not HTML); voidnet-api side of this work (adding `/admin/api/*` JSON variants) is a parallel milestone in the voidnet repo
- [ ] **VOIDNET-02**: Page `/voidnet/users` lists users with balance, status, activity; paginated; searchable by telegram handle
- [ ] **VOIDNET-03**: User detail view shows credits history, active boxes, service list, last seen
- [ ] **VOIDNET-04**: Adjust credits (+/- with reason) → proxy POST → audit-logged
- [ ] **VOIDNET-05**: Ban/unban user, rename user handle, resend invite — all as audit-logged mutations
- [ ] **VOIDNET-06**: Per-user Claude box list: shows ssh command + masked password with click-to-reveal (mirror VoidNet's existing UX pattern), port, status, host
- [ ] **VOIDNET-07**: Trigger re-provision on a box → proxy POST → polls status until complete → updates UI
- [ ] **VOIDNET-08**: Shared-secret auth header (`X-Admin-Token`) on all voidnet-api calls; secret lives in SOPS

### PROXMOX — LXC Operations Page

- [ ] **PROXMOX-01**: Page `/proxmox` lists all LXCs on tower with: vmid, hostname, status, resource config (cpu/mem/disk), uptime
- [ ] **PROXMOX-02**: Start / Shutdown (graceful, DEFAULT) / Restart / Hard-stop (with confirmation guard) operations on each LXC; audit-logged
- [ ] **PROXMOX-03**: Spawn new LXC from template — form for vmid, hostname, template, resources — calls Proxmox API, polls task-id until complete, shows progress
- [ ] **PROXMOX-04**: Destroy LXC (with confirmation guard + typed-hostname check to prevent slip); audit-logged
- [ ] **PROXMOX-05**: LXC detail panel: config dump, recent log tail, network info
- [ ] **PROXMOX-06**: Proxmox API token with role `dashboard-operator` (scoped to `VM.PowerMgmt`, `VM.Audit`, `Datastore.Audit`); token + CA cert in SOPS; CA cert pinned (never `NODE_TLS_REJECT_UNAUTHORIZED=0`)

### TERM — Web Terminal

- [ ] **TERM-01**: Page `/box/:vmid/terminal` launches xterm.js session connected via WebSocket to a dashboard-managed SSH relay to the target box
- [ ] **TERM-02**: Feasibility spike task (Phase 8 first task): confirm node-pty allocates PTY in mcow's privileged LXC; fallback to ssh2 pure-JS pipe if node-pty fails
- [ ] **TERM-03**: SSH credentials retrieved from VoidNet user_services table via admin API; dashboard never displays raw password to the terminal page (session-only injection)
- [ ] **TERM-04**: Terminal session cleanup on browser disconnect; PTY killed, ssh connection closed; no zombie processes
- [ ] **TERM-05**: Per-operator terminal session limit (max 3 concurrent) to prevent resource exhaustion
- [ ] **TERM-06**: Every terminal-open event audit-logged with target vmid, user, start/end timestamps

### ALERT — Alerts Panel + Rules

- [ ] **ALERT-01**: Page `/alerts` shows current Alertmanager firing alerts with severity, summary, duration, labels
- [ ] **ALERT-02**: Read-only for v3.0 (no ack/silence from UI) — link-out to Alertmanager web UI for those ops
- [ ] **ALERT-03**: Prometheus alert rules for Claude Code quota (replaces v2.0 Phase 09 scope): `ClaudeWeeklyQuotaHigh` (≥0.80 for 15m), `ClaudeWeeklyQuotaCritical` (≥0.95 for 15m), `ClaudeExporterDown` (up==0 for 10m)
- [ ] **ALERT-04**: Alert rules unit-tested via `promtool test rules` — file checked into `servers/docker-tower/monitoring/prometheus/alerts/claude-usage.yml`
- [ ] **ALERT-05**: Telegram delivery proven E2E — induced rule fire results in message landing in chat 193835258; `alertmanager_notifications_failed_total{integration="telegram"}` == 0 over smoke window
- [ ] **ALERT-06**: Alert badge in shared nav layout (shows firing count on every page)

### SEC — Security + Deploy Hardening

- [ ] **SEC-01**: Rate limit at Caddy layer on `homelab.makscee.ru` (per-IP, e.g. 60 req/min for auth endpoints)
- [ ] **SEC-02**: CSP, HSTS, X-Frame-Options headers set via Next.js middleware; strict CSP (no inline scripts); OWASP baseline
- [ ] **SEC-03**: Exporter rebinding (v2.0 tech-debt): claude-usage-exporter listens on `100.101.0.9:9101` only (not `0.0.0.0`); runs as `nobody(65534)` with read-only token mount
- [ ] **SEC-04**: Server-only lint rule enforces `"use server"` directive usage; prevents RSC → client secret leakage
- [ ] **SEC-05**: Zod schema validation on every Route Handler input; Drizzle prepared statements for every query (no raw SQL)
- [ ] **SEC-06**: GitHub OAuth state param + PKCE enforced (Auth.js default — verify)
- [ ] **SEC-07**: Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, short TTL (8h) with rolling refresh
- [ ] **SEC-08**: Security review phase before launch: `bun audit`, bundle analysis for secret leakage, header-spoofing integration test, Proxmox token scope audit

## Future Requirements (Deferred to v3.x / later)

- **UI-05**: Light/dark theme toggle
- **DASH-06**: Custom dashboard builder (save PromQL queries → Recharts panels)
- **TOKEN-08**: Per-token soft-limit alerting (email/Telegram at 50%, 75%)
- **VOIDNET-09**: VoidNet impersonation mode
- **PROXMOX-07**: Backup trigger UI (vzdump start/status)
- **PROXMOX-08**: LXC clone from existing
- **PROXMOX-09**: Resource adjust UI (cpu/mem live change)
- **TERM-07**: Terminal recording / session replay
- **ALERT-07**: In-UI silence + acknowledge
- **SEC-09**: Fail2ban integration at Caddy
- **SEC-10**: Age-based encrypt-at-rest for in-app secret storage

## Out of Scope

- **Multi-tenant user roles** — allowlisted admins only, no viewer/admin split v3
- **Backup management** — separate DR milestone
- **Grafana-equivalent ad-hoc query builder** — use existing Grafana for that
- **VoidNet portal features** — stay in VoidNet repo
- **Animaya features** — separate milestone in animaya repo
- **Mobile native app** — web-responsive is enough
- **Rust → TS migration of voidnet-api core** — parallel milestone in voidnet repo; this milestone only depends on VoidNet adding JSON endpoints
- **Python → TS migration of animaya core** — same reasoning for animaya repo

## Traceability — Requirements → Phases

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 12 | Complete |
| INFRA-02 | Phase 12 | Complete |
| INFRA-03 | Phase 12 | Pending |
| INFRA-04 | Phase 12 | Pending |
| INFRA-05 | Phase 14 | Pending |
| INFRA-06 | Phase 12 | Pending |
| INFRA-07 | Phase 12 | Complete |
| INFRA-08 | Phase 12 | Pending |
| UI-01 | Phase 19 | Pending |
| UI-02 | Phase 19 | Pending |
| UI-03 | Phase 12 | Pending |
| UI-04 | Phase 12 | Pending |
| DASH-01 | Phase 14 | Pending |
| DASH-02 | Phase 14 | Pending |
| DASH-03 | Phase 14 | Pending |
| DASH-04 | Phase 14 | Pending |
| DASH-05 | Phase 14 | Pending |
| TOKEN-01 | Phase 13 | Pending |
| TOKEN-02 | Phase 13 | Pending |
| TOKEN-03 | Phase 13 | Pending |
| TOKEN-04 | Phase 13 | Pending |
| TOKEN-05 | Phase 13 | Pending |
| TOKEN-06 | Phase 13 | Pending |
| TOKEN-07 | Phase 13 | Pending |
| VOIDNET-01 | Phase 15 | Pending |
| VOIDNET-02 | Phase 15 | Pending |
| VOIDNET-03 | Phase 15 | Pending |
| VOIDNET-04 | Phase 15 | Pending |
| VOIDNET-05 | Phase 15 | Pending |
| VOIDNET-06 | Phase 15 | Pending |
| VOIDNET-07 | Phase 15 | Pending |
| VOIDNET-08 | Phase 15 | Pending |
| PROXMOX-01 | Phase 16 | Pending |
| PROXMOX-02 | Phase 16 | Pending |
| PROXMOX-03 | Phase 16 | Pending |
| PROXMOX-04 | Phase 16 | Pending |
| PROXMOX-05 | Phase 16 | Pending |
| PROXMOX-06 | Phase 16 | Pending |
| TERM-01 | Phase 18 | Pending |
| TERM-02 | Phase 18 | Pending |
| TERM-03 | Phase 18 | Pending |
| TERM-04 | Phase 18 | Pending |
| TERM-05 | Phase 18 | Pending |
| TERM-06 | Phase 18 | Pending |
| ALERT-01 | Phase 17 | Pending |
| ALERT-02 | Phase 17 | Pending |
| ALERT-03 | Phase 17 | Pending |
| ALERT-04 | Phase 17 | Pending |
| ALERT-05 | Phase 17 | Pending |
| ALERT-06 | Phase 17 | Pending |
| SEC-01 | Phase 19 | Pending |
| SEC-02 | Phase 12 | Pending |
| SEC-03 | Phase 13 | Pending |
| SEC-04 | Phase 12 | Pending |
| SEC-05 | Phase 12 | Pending |
| SEC-06 | Phase 12 | Pending |
| SEC-07 | Phase 12 | Pending |
| SEC-08 | Phase 19 | Pending |

---
*Total active: 58 requirements across 9 categories (INFRA, UI, DASH, TOKEN, VOIDNET, PROXMOX, TERM, ALERT, SEC)*
*Roadmap created 2026-04-16 — v3.0 Phases 12-19*
