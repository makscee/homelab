# Feature Research

**Domain:** Homelab admin dashboard (infra ops, 1-3 operators, Tailnet-only)
**Researched:** 2026-04-16
**Confidence:** HIGH (VoidNet source read directly; Proxmox API verified via official docs; xterm.js security from xtermjs.org)

---

## Page 1: Global Overview

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Per-host stat row: CPU %, RAM %, disk % | Every homelab dashboard (Grafana, Beszel, Homarr) shows this at minimum | S | Prometheus node-exporter: `node_cpu_seconds_total`, `node_memory_MemAvailable_bytes`, `node_filesystem_avail_bytes` |
| Host uptime | Instant signal that a box rebooted unexpectedly | S | `node_boot_time_seconds` |
| Container count per host | Sanity check — did a compose stack fall over? | S | cAdvisor `container_running_containers` or docker API |
| Active alert count badge | Alertmanager `/api/v2/alerts` — 0 vs N is the key signal | S | Red badge in nav + on overview card; read-only |
| 30s auto-refresh | Stale data is useless for ops | S | SWR `refreshInterval: 30000` |
| Last-scraped timestamp per host | Know when data is stale before panicking | S | `up` metric timestamp from Prometheus |

### Differentiators (nice-to-have v3.0)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Claude token summary strip | Homelab-specific; at-a-glance 5h/7d utilization across all tokens | M | Consumes `mcow:9101` exporter; Recharts sparklines per token |
| Network in/out graph (last 1h) | Catch bandwidth anomalies without opening Grafana | M | `node_network_receive_bytes_total` — Recharts LineChart |
| VoidNet user count + active-today stat | Single stat; shows platform health at a glance | S | voidnet-api admin endpoint |
| Proxmox node CPU/RAM summary | tower as hypervisor deserves its own row | S | Proxmox REST API `/api2/json/nodes/{node}/status` |

### Anti-Features

| Feature | Why Avoid | Alternative |
|---------|-----------|-------------|
| Full Grafana embed / iframe | Defeats the purpose of replacing Grafana; adds auth complexity | Purpose-built Recharts panels consuming same Prometheus |
| Real-time streaming metrics (sub-5s) | WebSocket complexity for zero ops benefit at this scale | 30s polling via SWR is sufficient |
| Editable dashboard layout (drag-drop) | Homarr-style drag-drop is a project in itself; overkill for 1-3 users | Fixed grid layout; no customization needed |

---

## Page 2: Claude Code Tokens

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Token list with label, masked key (`sk-ant-oat01-...****`), status (active/disabled) | Core CRUD surface | S | SOPS registry read at request time; no plaintext in DB |
| Add token: paste full `sk-ant-oat01-...` key + assign label | Primary input flow | S | POST → SOPS re-encrypt |
| Disable token (toggle) | Pause without deleting — standard rotation flow | S | SOPS field `enabled: false`; exporter skips disabled tokens |
| Delete token with confirmation | Permanent removal | S | SOPS re-encrypt after removal |
| Rename/relabel token | Human-readable labels ("cc-worker", "cc-andrey-dev") | S | SOPS field update |
| Per-token utilization gauges: 5h session % and 7-day weekly % | Core value from v2.0 — replaces Grafana dashboard | M | Recharts RadialBar or progress bars; data from `mcow:9101` Prometheus metrics |
| `resets_at` countdown display | When does the 7-day window reset? | S | Timestamp from exporter metric label |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Per-token 7-day utilization sparkline (last 7 scrapes) | Trend not just snapshot | M | Store last N Prometheus samples in SQLite; Recharts LineChart |
| Soft-limit alert threshold per token | Telegram ping when token hits 80% weekly | M | Alertmanager rule per token label; threshold configurable via UI writes Prometheus rule file |
| Token health indicator (last-poll status: 200 / 401 / 429) | Surface exporter errors without checking logs | S | Prometheus metric label from exporter |

### Anti-Features

| Feature | Why Avoid | Alternative |
|---------|-----------|-------------|
| Store raw token in any DB or non-SOPS location | Single plaintext exposure defeats SOPS model | Always write through SOPS CLI; never cache plaintext server-side |
| Multi-account / team token management | Not needed for 1-3 operators on single Anthropic account | Keep flat list; label is sufficient |
| Automatic token rotation via Anthropic API | No official rotation API exists | Manual paste + rotate flow |

**Key dependency:** Tokens page write operations (add/rotate/delete) require SOPS CLI available on mcow and age key accessible to the Next.js server process. Read-only gauge display works without SOPS if tokens are pre-configured.

---

## Page 3: VoidNet Management

This page proxies voidnet-api admin endpoints over Tailnet. It does NOT replicate VoidNet's own full admin UI — it surfaces only the operations a homelab operator needs without opening a separate browser tab.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| User list: username, display_name, status (active/banned), subscription tier, credits balance, last-seen | Core ops view | S | HTTP proxy to voidnet-api `GET /admin/users`; last-seen derived from WireGuard handshake (existing users.rs logic) |
| Adjust credits (±N with memo) | Most common admin action per credits.rs | S | POST `/admin/users/{id}/credits`; ledger row written by voidnet-api |
| Ban / unban user | Exists in users.rs — expose same endpoint | S | POST `/admin/users/{id}/ban` and `/unban`; activity_log written by voidnet-api |
| View per-user ledger (last 20 entries, paginated) | Audit trail for credit adjustments | S | GET `/admin/users/{id}/ledger`; kinds: grant/deduct/spend/refund |
| Set subscription tier (free/paid) | Exists in users.rs `set_paid`/`set_free` | S | POST `/admin/users/{id}/set_paid` or `set_free` |
| Add invites (+3) to user | Exists in users.rs `add_invites` | S | POST `/admin/users/{id}/add_invites` |
| Total user count stat | Glanceable platform size | S | Response metadata from user list |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Rename username (admin override) | users.rs has `rename_username` — expose it; triggers LXC hostname rename queue | S | POST `/admin/users/{id}/username` with `handle` field |
| Retry provisioning job | users.rs has `retry_provisioning_job` for failed LXC provisioning | S | POST `/admin/users/{id}/provisioning/{job_id}/retry` |
| Boxes view per user: LXC status, host, VMID | See which CC worker belongs to which user | M | GET `/admin/services` filtered by user; status badge (running/failed/pending) |
| Invite tree visualization | Understand referral chains; users.rs has `render_invite_tree` logic | M | Collapsible tree in React; API returns parent/child structure |
| Global credits ledger (all users) | Cross-user audit trail; credits.rs `page` handler exists | S | GET `/admin/credits` with filter/pagination |

### Anti-Features

| Feature | Why Avoid | Alternative |
|---------|-----------|-------------|
| Replicate VoidNet's full admin UI | VoidNet owns its own admin pages; duplication creates drift | Proxy to voidnet-api endpoints; deep-link to VoidNet admin for edge cases |
| User message history / chat logs | Out of scope; VoidNet domain | Access VoidNet admin directly |
| VoidNet portal pages (activate, invites, topup, etc.) | Explicitly out of scope per milestone context | Stay in VoidNet repo |

---

## Page 4: Proxmox Operations

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| LXC list: VMID, name, status (running/stopped), CPU %, RAM used/total | Core ops surface | S | Proxmox REST API GET `/api2/json/nodes/{node}/lxc` |
| Start / stop / restart LXC | Primary lifecycle ops | S | POST `/api2/json/nodes/{node}/lxc/{vmid}/status/start`, `stop`, `reboot` |
| LXC info panel: IP, hostname, config summary | `pct config {vmid}` equivalent | S | GET `/api2/json/nodes/{node}/lxc/{vmid}/config` |
| Node resource summary: total CPU cores, RAM allocated vs available | Capacity planning at a glance | S | GET `/api2/json/nodes/{node}/status` |
| SSH credential reveal (root password, click-to-reveal masked by default) | Operators need SSH access; passwords in SOPS | M | SOPS read on-demand server-side; never stored in DB; cleared from memory after response |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Web terminal (xterm.js) per LXC | No SSH client needed for quick ops | XL | See Terminal section below |
| Trigger Proxmox backup for VMID | `vzdump {vmid}` — protect before destructive ops | M | POST `/api2/json/nodes/{node}/vzdump`; poll job status |
| Resource adjust: CPU cores + RAM MB | Resize without opening Proxmox web UI | M | PUT `/api2/json/nodes/{node}/lxc/{vmid}/config` with `cores`, `memory` fields |
| Clone LXC from template | Spawn new worker from base template | L | POST `/api2/json/nodes/{node}/lxc/{vmid}/clone`; poll task status |
| Token rotation for CC worker | Replace CLAUDE_CODE_OAUTH_TOKEN on a specific box | M | SSH exec + SOPS lookup; integrates with tokens page |

### Anti-Features

| Feature | Why Avoid | Alternative |
|---------|-----------|-------------|
| Full Proxmox VE replacement | Proxmox UI covers storage, networking, snapshots — too broad to replicate | Deep-link to Proxmox web UI for advanced ops |
| KVM/QEMU VM management | Only LXCs are used in this homelab | Out of scope; tower has no VMs |
| Disk image management / storage browsing | Too niche for 1-3 operators | Proxmox UI |

---

## Web Terminal (xterm.js — sub-feature of Proxmox Ops, complexity XL)

**Recommended architecture (Option B — direct SSH relay):**

1. User clicks terminal button on LXC row
2. Next.js API route authenticates via Tailscale identity header
3. Server opens SSH connection to LXC via Tailnet using `ssh2` npm package + credentials from SOPS
4. SSH PTY streamed bidirectionally over WebSocket (wss://) to client
5. xterm.js renders the PTY on client; resize messages forwarded as SSH window-change

**Why Option B over Proxmox termproxy (Option A):**
- Avoids Proxmox ticket-exchange dance (termproxy requires `/api2/json/nodes/{node}/lxc/{vmid}/termproxy` + separate WebSocket to tower)
- Works from mcow over Tailnet SSH — same path used for all other ops
- `ssh2` handles the PTY; no node-pty needed (node-pty is for local PTY spawning, not SSH)
- Simpler auth: one TLS WebSocket to dashboard, then SSH over Tailnet internally

**Security model:**
- WebSocket endpoint TLS-only (wss://) via Caddy
- Tailscale identity header verified server-side before SSH is opened
- SSH credentials fetched from SOPS per-request; not cached in memory
- Each terminal button = one ephemeral SSH session; destroyed on WebSocket disconnect
- No CORS relaxation needed — app is Tailnet-only
- Audit log entry written on terminal open: actor, target VMID, timestamp

**Implementation complexity drivers:**
- PTY resize sync (xterm.js `onResize` → SSH `window-change` signal)
- WebSocket keepalive pings vs SSH keepalive (both needed)
- Clean PTY cleanup on browser tab close / disconnect
- Next.js 15 App Router does not support raw WebSocket upgrade natively — requires custom HTTP server (Bun's `Bun.serve` with WebSocket support is the correct approach given the stack)

---

## Page 5: Alerts Panel

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Active alerts list: name, host label, severity, fired-at timestamp | Core signal | S | Alertmanager `GET /api/v2/alerts`; already running on mcow |
| Alert count badge in navigation | Glanceable — 0 = green, N > 0 = red | S | Fetched on every page via shared layout |
| Empty state ("All clear") | Operators need confidence, not just absence of red | S | Explicit green "no active alerts" message |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Silence alert from UI | Skip opening Alertmanager directly | M | POST `/api/v2/silences` with duration options (1h, 8h, 24h); matchers pre-filled from alert labels |
| Alert history (resolved last 24h) | Know what fired overnight | M | Alertmanager `GET /api/v2/alerts?active=false` — limited retention; may need supplemental SQLite store |

### Anti-Features

| Feature | Why Avoid | Alternative |
|---------|-----------|-------------|
| Create/edit Prometheus alert rules from UI | High complexity; no validation pipeline | Edit rule files via Ansible + promtool lint; reload Prometheus via `/-/reload` API |
| PagerDuty / OpsGenie integration | Overkill for 1-3 operators; Telegram already wired | Telegram is sole notification channel |

---

## Audit Log (cross-cutting, not a page)

Every mutating admin action must be logged from day 1 — before writes land.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Log every mutation: actor (Tailscale-User-Login), action, target, timestamp, result | Forensics for "what changed and when" | S | SQLite on mcow; middleware pattern in Next.js API routes |
| Audit log viewer: paginated, filterable by action type | Read the log | S | GET `/api/audit?page=N&action=X` |
| 90-day retention with auto-purge | Prevent unbounded growth | S | DELETE on startup or cron: `WHERE ts < datetime('now', '-90 days')` |

**Schema:**
```sql
CREATE TABLE audit_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      TEXT NOT NULL DEFAULT (datetime('now')),
  actor   TEXT NOT NULL,   -- Tailscale-User-Login header
  action  TEXT NOT NULL,   -- e.g. "lxc.restart", "token.add", "credits.adjust"
  target  TEXT,            -- e.g. "vmid:204", "user:42", "token:cc-worker"
  payload JSON,            -- action-specific details (sanitized — no secrets)
  result  TEXT NOT NULL    -- "ok" | "error: <message>"
);
```

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Export as JSON/CSV | Post-mortem analysis | S | GET `/api/audit/export` |

---

## Settings Page

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Tailscale identity display (who am I) | Auth transparency — confirm which operator identity is active | S | Read `Tailscale-User-Login` header; display on settings page |
| App version + build SHA | Debugging deployed version | S | `package.json` version + `NEXT_PUBLIC_GIT_SHA` env var set at build time |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Dark/light theme toggle | Standard UI hygiene | S | Tailwind dark mode via `class` strategy; preference in localStorage |
| Per-operator default landing page | Reduces navigation for most-used page | S | Cookie or localStorage; no server state needed |
| Telegram notification test button | Verify alerts pipeline end-to-end | S | POST to Alertmanager webhook or direct Telegram bot API ping |

### Anti-Features

| Feature | Why Avoid | Alternative |
|---------|-----------|-------------|
| Per-operator RBAC / permission scopes | 1-3 operators, all trusted; Tailscale ACL is the auth boundary | Tailscale ACL controls who reaches the app; all who reach it are admins |
| App-level user management | Auth is Tailscale identity — no app-level user DB needed | Add operators by adding to Tailnet |

---

## Feature Dependencies

```
[Tokens Page — read gauges]
    requires: mcow:9101 exporter running (already operational)

[Tokens Page — write (add/rotate/delete)]
    requires: SOPS CLI + age key accessible to Next.js server process

[VoidNet Page]
    requires: voidnet-api running on mcow (already operational)
    requires: admin endpoints reachable over Tailnet HTTP

[Proxmox Ops Page — list/start/stop/info]
    requires: Proxmox REST API token with PVEAdmin role on tower

[Proxmox Ops — SSH credential reveal]
    requires: SOPS registry with per-box root passwords

[Web Terminal]
    requires: Proxmox Ops Page (VMID/hostname lookup)
    requires: SSH credentials from SOPS
    requires: Bun WebSocket server (not Next.js App Router native)
    requires: Audit log (terminal open must be logged)

[Alerts Panel]
    requires: Alertmanager reachable from mcow (already running)

[Audit Log]
    requires: SQLite DB on mcow (can be separate file from VoidNet SQLite)
    no external deps; bootstrap in Phase 1 before any write handlers land

[Global Overview — Claude token strip]
    requires: Tokens Page backend (same Prometheus scrape path)

[Nav alert badge]
    requires: Alerts Panel backend (same Alertmanager fetch)

[Proxmox clone / resource adjust]
    requires: Proxmox REST API token (same as list/stop)
    complexity: L — poll task status asynchronously
```

---

## Complexity Reference

| Feature | Size |
|---------|------|
| Overview: host stat rows (CPU/RAM/disk/uptime) | S |
| Overview: alert badge | S |
| Overview: Claude token strip | M |
| Tokens: list + CRUD (add/disable/delete/rename) | M |
| Tokens: utilization gauges (Recharts) | M |
| Tokens: soft-limit alerting rules UI | M |
| VoidNet: user list + credits adjust + ban/unban | S |
| VoidNet: provisioning retry + rename | S |
| VoidNet: boxes view per user | M |
| VoidNet: invite tree visualization | M |
| Proxmox: LXC list + start/stop/restart | S |
| Proxmox: node status + config panel | S |
| Proxmox: SSH credential reveal | M |
| Proxmox: backup trigger + status poll | M |
| Proxmox: resource adjust (cores/RAM) | M |
| Proxmox: clone LXC | L |
| Web terminal (xterm.js + ssh2 relay + Bun WS) | XL |
| Alerts: read-only panel | S |
| Alerts: silence from UI | M |
| Audit log: write + viewer + retention | S |
| Settings: theme + default page + identity + version | S |

---

## MVP Definition (v3.0 Launch)

### Launch With (P1 — must have)

- [ ] Global overview: host stat rows (CPU/RAM/disk/uptime) + alert badge + container count — first thing an operator checks
- [ ] Tokens page: list + gauges (5h/7d) + add/disable/delete/rename — replaces Grafana token dashboard (v2.0 carried goal)
- [ ] VoidNet page: user list + credits adjust + ban/unban + ledger — covers 90% of VoidNet admin ops
- [ ] Proxmox ops: LXC list + start/stop/restart + config panel — covers 90% of LXC ops
- [ ] Alerts panel: read-only active alerts list — replaces Alertmanager direct access
- [ ] Audit log: all mutations logged from day 1 — safety net; must land before write handlers

### Add After Core Is Stable (P2 — v3.x)

- [ ] Web terminal — trigger: operators report needing shell access without SSH client
- [ ] Alerts silence from UI — trigger: silence workflow too slow via Alertmanager directly
- [ ] Token soft-limit alerting rules UI — trigger: manual rule editing becomes error-prone
- [ ] VoidNet boxes view per user — trigger: need to correlate users with LXC state
- [ ] Proxmox backup trigger — trigger: destructive ops need pre-backup confidence

### Defer to v4+ (P3 — future)

- [ ] Proxmox clone LXC from UI — Ansible playbook is safer for provisioning; lower risk
- [ ] Proxmox resource adjust from UI — risky config change; Ansible preferred
- [ ] Alert history (resolved) — requires additional store; Alertmanager retention is short
- [ ] Token sparkline (7-day history) — requires persistent sample store; scope creep for v3.0

---

## Competitor Feature Analysis

| Feature | Grafana | Homarr | Homepage | Beszel | This Dashboard |
|---------|---------|--------|----------|--------|----------------|
| Host metrics overview | Full (complex) | Widget-based | Service pings only | Lightweight | Purpose-built PromQL panels |
| Per-app CRUD mutations | None | None | None | None | Token/VoidNet/Proxmox writes |
| Web terminal | None | None | None | None | xterm.js + ssh2 relay |
| Tailscale-native auth | External proxy | No | No | No | First-class (identity headers) |
| Editable layout | Yes (drag-drop) | Yes (drag-drop) | No | No | Fixed (intentional for ops) |
| Audit log | None | None | None | None | SQLite-backed |
| Proxmox LXC lifecycle | None | None | None | None | start/stop/restart via REST API |

**Key insight:** Grafana/Homarr/Homepage solve visualization and service discovery. This dashboard solves operations — mutations, credentials, lifecycle management, and VoidNet-specific admin. No existing self-hosted tool covers this combination for the specific VoidNet + Proxmox + Claude token stack.

---

## Sources

- VoidNet admin handlers read directly: `users.rs` (ban/unban/rename/retry-provisioning/add-invites/set-paid/set-free), `credits.rs` (ledger/adjust), `agents.rs` — HIGH confidence for VoidNet op surface
- Proxmox REST API docs: https://pve.proxmox.com/wiki/Proxmox_VE_API — termproxy endpoint, LXC lifecycle
- pve-xtermjs source: https://github.com/proxmox/pve-xtermjs — packet protocol (Normal/Resize/Ping)
- xterm.js security model: https://xtermjs.org/docs/guides/security/
- Homelab monitoring canonical panels: https://dev.to/tsukiyo/end-to-end-monitoring-explained-for-homelabs-prometheus-grafana-alertmanager-2g3k
- Beszel / Deq 2025 comparison: https://www.virtualizationhowto.com/2025/12/why-deq-might-be-the-best-home-lab-dashboard-in-2025/
- Homarr widget model: https://homarr.dev/
- xterm.js + WebSocket terminal pattern: https://ashishpoudel.substack.com/p/web-terminal-with-xtermjs-node-pty

---
*Feature research for: homelab admin dashboard v3.0*
*Supersedes: v1.0 IaC repo feature research (2026-04-13)*
*Researched: 2026-04-16*
