# Phase 14: Global Overview + Audit Log — Research

**Researched:** 2026-04-17
**Domain:** Next.js 15 RSC dashboard + Prometheus host-metrics queries + SQLite audit log + Ansible exporter provisioning
**Confidence:** HIGH (every critical claim verified against in-tree code or Phase 13 summaries)

## Summary

Phase 14 is largely an **integration** phase — most infrastructure already exists. The `/` overview page is a new RSC consuming the existing `lib/prometheus.server.ts` with new host-metric PromQL. The audit log replaces the Phase 13 stdout stub in `lib/audit.server.ts` with a `bun:sqlite` insert behind the same `emitAudit()` contract (the file's own comments explicitly anticipate this migration). node-exporter Ansible playbook + Prometheus `nodes.yml` / `cadvisor.yml` target files **already exist and target all 6 hosts** — Phase 14 only needs to verify/re-run, not create.

**Primary recommendation:** Keep all patterns identical to Phase 13. Ship the audit SQLite migration first (so 15/16/17 unblock), then the overview page. Treat the node-exporter/cAdvisor provisioning as a verification+gap-fill task, not a clean build.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Host Metrics Provisioning**
- **D-01:** Ansible playbook provisions `node-exporter` on all 6 Tailnet hosts (tower, docker-tower, cc-worker, mcow, nether, animaya-dev). Binds to Tailnet IP only. systemd unit.
- **D-02:** `cAdvisor` provisioned on Docker hosts only (docker-tower, mcow, plus any cc-* worker actually running Docker). Used for container count tile metric.
- **D-03:** Prometheus (docker-tower) scrape config extended to cover new exporter jobs; existing Phase 07 `claude-usage` job untouched.

**Overview Page Layout**
- **D-04:** Rich host tile content — hostname, role label, CPU % bar, memory % bar, disk % bar, uptime, load avg (1/5/15), net I/O sparkline, container count badge.
- **D-05:** Grid layout: `md:grid-cols-2 xl:grid-cols-3`. 6 cards = 2×3 on typical desktop, 3×2 on wide.
- **D-06:** Claude usage summary = inline per-token cards (token label + 5h utilization bar + 7d utilization bar) stacked below host grid. Link to `/tokens`. Scales linearly; current N=2.
- **D-07:** Alert badge in shared nav layout + "Alerts" card on `/` with firing count + severity breakdown. Link to `/alerts` (route stub until Phase 17).

**Data Freshness & Error Handling**
- **D-08:** SWR client-side refresh every 30s. All data fetched via server-side Route Handlers (`/api/overview`, `/api/alerts/count`) — Prometheus creds never reach the browser.
- **D-09:** Staleness threshold = 90s since last successful Prometheus poll per host (3× refresh interval). Yellow 90-300s, red >300s or error.
- **D-10:** Per-card stale dot (green/yellow/red `<Badge>`) + page-level `<Alert>` banner when Prometheus HTTP call itself fails (full outage). Last known values retained on card during outage.

**Alert Count Source**
- **D-11:** Prometheus `ALERTS{alertstate="firing"}` metric in Phase 14. Phase 17 swaps to Alertmanager HTTP API — scope via `prometheus.server.ts` / `alertmanager.server.ts` split so UI is stable.

**Audit Log Infrastructure**
- **D-12:** SQLite file at host path `/var/lib/homelab-admin/audit.db` on mcow, mounted read-write into the admin container. Survives container rebuilds.
- **D-13:** Driver: `bun:sqlite` (native, zero-dep, matches Phase 12 Bun runtime).
- **D-14:** Retention: append-only, keep forever. Revisit if DB exceeds 1 GB.
- **D-15:** Schema (exact):
  ```sql
  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,  -- ISO 8601 UTC
    user TEXT NOT NULL,        -- GitHub login from session
    action TEXT NOT NULL,      -- dotted verb e.g. 'token.rotate', 'voidnet.credit.add'
    target TEXT,               -- resource id (token id, vmid, username, etc.)
    payload_json TEXT,         -- JSON blob, must be redacted before insert
    ip TEXT                    -- request IP
  );
  CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
  CREATE INDEX idx_audit_user ON audit_log(user);
  ```
- **D-16:** `audit.server.ts` exports `logAudit({ action, target, payload })` — reads user + IP from request context. One import per mutation route. Apply same redaction pattern as `api/error-handlers` (Phase 13) before writing payload_json.

**Audit Viewer**
- **D-17:** `/audit` route = RSC paginated list (default 50/page, `?before=<id>` cursor). Columns: time (relative + exact on hover), user, action, target, payload (truncated JSON in `<code>` with click-to-expand). No filters.

### Claude's Discretion
- Exact CSS/spacing of host tiles — follow Phase 12 shadcn `<Card>` pattern.
- Sparkline library choice (Recharts already in, reuse).
- Loading skeleton shape — reuse shadcn skeletons from Phase 13.
- Error boundary placement — planner decides per Next.js conventions.

### Deferred Ideas (OUT OF SCOPE)
- Rich audit filters (user/action/date/payload diff) — Phase 19.
- Per-host detail route `/hosts/[name]` — separate phase if wanted.
- Glanceable + expandable card drawer — defer to detail route.
- Aggregated Claude usage card — revisit if token count exceeds 4-5.
- Audit log rotation / archival policy — revisit when DB exceeds 1 GB.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-01 | Per-host stat rows for 6 hosts (CPU %, mem %, disk %, container count) | PromQL set below (§Host Metrics PromQL); node-exporter already scraped via `nodes.yml`; cAdvisor via `cadvisor.yml` |
| DASH-02 | Claude usage summary (per-token 5h + 7d gauges) linked to `/tokens` | Reuses Phase 13 `claude_code_*` metrics + `thresholdClass()` helper |
| DASH-03 | Alert firing count + severity breakdown, link to `/alerts` | PromQL `count by(severity)(ALERTS{alertstate="firing"})` (D-11) |
| DASH-04 | 30s SWR auto-refresh; loading/stale/error states | Reuse `Promise.all(...).catch()` pattern from `app/(auth)/tokens/page.tsx` + add SWR client hook |
| DASH-05 | Prometheus creds absent from client bundle | `import "server-only"` sentinel + eslint-plugin-server-only already enforce this (Phase 13) |
| INFRA-05 | SQLite `audit_log` table + `logAudit()` wrapper | `bun:sqlite` native driver + replace stdout stub in `lib/audit.server.ts` |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tailscale mesh only** — all new exporter binds MUST use Tailnet IP, never `0.0.0.0`. Matches Phase 13 SEC-03 exporter rebind pattern.
- **SOPS for secrets** — no raw tokens/credentials committed. Prometheus URL is non-secret (already in `PROMETHEUS_URL` env).
- **Ansible is primary operator** — every config change to any host lands in `ansible/playbooks/` idempotently. Ad-hoc SSH is forbidden.
- **AI-readable docs** — no tribal knowledge. Document exporter-target wiring inline in playbook comments.
- **GSD workflow enforcement** — Phase 14 edits must flow through `/gsd-execute-phase`.

## Standard Stack

### Core (all already installed; versions from Phase 13)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15.5.15 | RSC + Route Handlers | Phase 12-locked; `force-dynamic` + Promise.all degraded-mode pattern established |
| React | 19.x | RSC + client leaves | Phase 12-locked |
| Bun | 1.1.38 | Runtime + `bun:sqlite` native | Phase 12-locked; `bun:sqlite` is zero-dep, ships with Bun `[VERIFIED: apps/admin Phase 12 group_vars]` |
| SWR | 2.x | Client-side 30s refresh | `refreshInterval` in ms; `const { data, error } = useSWR('/api/overview', fetcher, { refreshInterval: 30000 })` `[CITED: swr.vercel.app/docs/with-nextjs]` |
| Recharts | ^3.8.1 | Host net I/O sparkline (reuse) | Phase 13 ship; `<LineChart>` on a `use client` leaf `[VERIFIED: apps/admin/package.json]` |
| Zod | v4 | Route Handler input validation | Phase 12 SEC-05 policy |
| `bun:sqlite` | built-in | Audit DB driver | Native; supports WAL via `db.run("PRAGMA journal_mode = WAL")`; supports prepared statements via `db.prepare()` `[CITED: bun.com/docs/runtime/sqlite]` |
| shadcn `<Card>` `<Alert>` `<Badge>` `<Skeleton>` `<Table>` `<Progress>` | current | UI primitives | Phase 13 all installed |

### Supporting
| Library | Version | Purpose |
|---------|---------|---------|
| `prometheus.prometheus.node_exporter` (Ansible role) | 1.11.1 | Installed on all 6 hosts via `ansible/playbooks/node-exporter.yml` `[VERIFIED: tree already present; latest = 1.11.1 released 2026-04-07]` |
| `google/cadvisor` image | 0.56.1 | Docker-host container metrics `[CITED: github.com/google/cadvisor releases]` |
| `prometheus.prometheus.cadvisor` (Ansible role) | vendored | Use vendored collection at `ansible/collections/ansible_collections/prometheus/prometheus/roles/cadvisor` `[VERIFIED]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `bun:sqlite` | `better-sqlite3` | better-sqlite3 is the de-facto Node driver, but adds native-build step + doesn't match Bun runtime; `bun:sqlite` is the lock — D-13 `[VERIFIED: CONTEXT.md]` |
| Drizzle ORM on audit | raw `db.prepare()` | Drizzle is in SEC-05 policy but audit has 1 table + 1 insert path; raw prepared statement is simpler, faster, and already matches Phase 13 test style. Plan may still choose Drizzle for schema migration tooling — leave to planner |
| `SWR` for 30s refresh | `React Query` | SWR is simpler, already in scope; React Query not in stack |
| Cursor pagination `?before=<id>` | offset+limit | Cursor avoids drift as new rows append; matches D-17 verbatim |

**Installation:** No new npm packages required. `bun:sqlite` is built-in. cAdvisor installed via Ansible role (vendored).

## Architecture Patterns

### Recommended File Layout
```
apps/admin/
├── app/
│   ├── (auth)/
│   │   ├── page.tsx                     # NEW — /  overview RSC
│   │   ├── loading.tsx                  # NEW — skeleton grid
│   │   ├── _components/
│   │   │   ├── HostCard.tsx             # NEW — 1 of 6
│   │   │   ├── HostGrid.tsx             # NEW — client-side SWR wrapper
│   │   │   ├── ClaudeSummary.tsx        # NEW — per-token mini cards
│   │   │   ├── AlertsCard.tsx           # NEW — firing count + severity
│   │   │   └── StaleDot.tsx             # NEW — green/yellow/red Badge
│   │   ├── audit/
│   │   │   ├── page.tsx                 # NEW — RSC paginated list (D-17)
│   │   │   └── _components/
│   │   │       ├── AuditTable.tsx       # NEW
│   │   │       └── PayloadCell.tsx      # NEW — click-to-expand
│   │   └── _lib/
│   │       └── overview-view-model.ts   # NEW — PromQL → HostTile mapping + stale classifier
│   └── api/
│       ├── overview/route.ts            # NEW — server-side Prometheus aggregator
│       └── alerts/count/route.ts        # NEW — D-11 ALERTS{} query
├── lib/
│   ├── audit.server.ts                  # REWRITE — stdout stub → bun:sqlite insert
│   ├── audit-db.server.ts               # NEW — DB handle, migration bootstrap
│   └── prometheus.server.ts             # EXTEND — add host-metric helpers (pure PromQL; no API shape change)
├── servers/mcow/
│   └── audit-db/                        # NEW — bind-mount placeholder + README
└── ansible/playbooks/
    ├── node-exporter.yml                # EXISTING — verify targets; add missing hosts
    ├── cadvisor.yml                     # NEW — Docker-host-only play
    └── deploy-homelab-admin.yml         # MODIFY — ensure /var/lib/homelab-admin/audit.db bind-mount
```

### Pattern 1: RSC + Promise.all + .catch() Degraded Mode
**What:** Each Prometheus query runs in parallel; every one has a `.catch(() => <fallback>)` so one failing host doesn't crash the page.

**Source:** Phase 13 `app/(auth)/tokens/page.tsx` (verified via 13-04-SUMMARY).

```typescript
// app/api/overview/route.ts  (runtime = "nodejs")
import "server-only";
import { queryInstant } from "@/lib/prometheus.server";
import { auth } from "@/auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session) return new Response("unauthorized", { status: 401 });

  const [cpu, mem, disk, containers, lastSeen] = await Promise.all([
    queryInstant('1 - avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[2m]))').catch(() => []),
    queryInstant('1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes').catch(() => []),
    queryInstant('1 - node_filesystem_avail_bytes{mountpoint="/",fstype!="tmpfs"} / node_filesystem_size_bytes{mountpoint="/",fstype!="tmpfs"}').catch(() => []),
    queryInstant('count by(instance)(container_last_seen{name!=""})').catch(() => []),
    queryInstant('time() - timestamp(up{job="node"})').catch(() => []),
  ]);

  return Response.json({ hosts: buildHostRows({ cpu, mem, disk, containers, lastSeen }), ts: Date.now() });
}
```

### Pattern 2: SWR client hook reading the Route Handler
```typescript
// app/(auth)/_components/HostGrid.tsx
"use client";
import useSWR from "swr";
const fetcher = (url: string) => fetch(url).then(r => r.json());

export function HostGrid({ initial }: { initial: OverviewResponse }) {
  const { data, error } = useSWR<OverviewResponse>("/api/overview", fetcher, {
    refreshInterval: 30_000,
    fallbackData: initial,       // SSR-populated seed from RSC parent
    revalidateOnFocus: false,
  });
  // ...
}
```

### Pattern 3: Audit SQLite with WAL + Prepared Insert
**What:** One module owns the DB handle. `logAudit()` is synchronous-looking from the caller; internally uses a prepared statement.

```typescript
// lib/audit-db.server.ts
import "server-only";
import { Database } from "bun:sqlite";

const DB_PATH = process.env.AUDIT_DB_PATH ?? "/var/lib/homelab-admin/audit.db";

let _db: Database | null = null;
export function getAuditDb(): Database {
  if (_db) return _db;
  const db = new Database(DB_PATH, { create: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA foreign_keys = ON");
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL,
      user TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      payload_json TEXT,
      ip TEXT
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user);`);
  _db = db;
  return db;
}

// lib/audit.server.ts  (rewritten)
import "server-only";
import { getAuditDb } from "./audit-db.server";
import { redactPayload } from "./redact.server";

const INSERT = `INSERT INTO audit_log (created_at, user, action, target, payload_json, ip)
                VALUES (?, ?, ?, ?, ?, ?)`;

export type AuditInput = {
  action: string;            // e.g. 'token.rotate', 'voidnet.credit.add'
  target?: string;
  payload?: unknown;
  user: string;              // caller passes session.user.login
  ip?: string;
};

export function logAudit({ action, target, payload, user, ip }: AuditInput): void {
  const db = getAuditDb();
  const stmt = db.prepare(INSERT);
  const redacted = payload === undefined ? null : JSON.stringify(redactPayload(payload));
  stmt.run(new Date().toISOString(), user, action, target ?? null, redacted, ip ?? null);
}
```

### Pattern 4: Cursor Pagination (D-17)
```typescript
// /audit?before=<id>
const rows = db.prepare(
  `SELECT id, created_at, user, action, target, payload_json
     FROM audit_log
    WHERE ($before IS NULL OR id < $before)
    ORDER BY id DESC
    LIMIT 50`
).all({ $before: before ?? null });
```

### Anti-Patterns to Avoid
- **Calling Prometheus from a client component.** Violates DASH-05 + eslint-plugin-server-only. All Prom reads MUST go through `lib/prometheus.server.ts`.
- **Dropping the `.catch()` on per-host queries.** One 429 or unreachable host would crash the entire overview. Always degrade per-query, not per-page.
- **Using offset+limit for `/audit`.** New rows insert at the top and shift offsets — cursor is required (D-17).
- **Passing Bun `new Database()` through next/webpack client boundary.** `import "server-only"` sentinel + eslint rule must gate every audit module.
- **Double-writing audit (stdout + sqlite).** Phase 13 stdout path is removed, not kept as a tee — otherwise log shape drifts.
- **`fs.writeFileSync` or `spawnSync('sqlite3', ...)`.** `bun:sqlite` is built in; no IPC, no shell risk.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Client polling | `setInterval` + `fetch` | SWR `refreshInterval` | Handles tab-visibility pause, dedupe, error retry |
| Host uptime calc | Custom clock diff | `node_boot_time_seconds` - `time()` | Exporter already provides; no drift |
| Container count per host | Parse `docker ps` | `count by(instance)(container_last_seen{name!=""})` | cAdvisor exposes; PromQL one-liner |
| Disk % | Shell `df` | `1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}` | Standard `node_exporter` metric |
| Stale classifier | Per-host timestamps in state | `time() - claude_code_poll_last_success_timestamp{}` + `time() - timestamp(up{job="node"})` | Exporter-native freshness |
| SQLite migrations | Hand-written schema versioning | `CREATE TABLE IF NOT EXISTS` + additive migrations only (append-only table, per D-14) | Single-table, single-writer means no migration tool needed yet |
| Recharts sparkline | `<svg>` + d3 | Reuse Phase 13 `Sparkline.tsx` | Already CSP-clean, typed around Recharts v3 quirks |
| Audit payload redaction | Token regex in each route | Extend `lib/redact.server.ts` `redactPayload()` that walks object + redacts known secret keys and token-pattern values | Single source of truth; Phase 13 WR-03 lesson |

**Key insight:** node_exporter + cAdvisor + Prometheus + Recharts + SWR + bun:sqlite cover 100% of this phase. **Zero new dependencies**, zero new infra services.

## Host Metrics PromQL (Verified Against node_exporter 1.11.1)

> These are the exact queries the overview page consumes. All are instant queries returning `PromInstantSample[]` where `labels.instance` = `<tailscale-ip>:9100` and must be mapped back to the canonical hostname.

| Metric | PromQL | Notes |
|--------|--------|-------|
| CPU % (1 - idle) | `1 - avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[2m]))` | `[2m]` covers 8 scrapes at 15s interval — smooths flicker |
| Memory % | `1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes` | `MemAvailable` is the correct signal, NOT `MemFree` |
| Disk % (root) | `1 - node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs\|overlay"} / node_filesystem_size_bytes{mountpoint="/",fstype!~"tmpfs\|overlay"}` | Exclude tmpfs/overlay to avoid double counting |
| Container count | `count by(instance)(container_last_seen{name!=""})` | Requires cAdvisor; hosts without cAdvisor return empty (expected) |
| Uptime (seconds) | `time() - node_boot_time_seconds` | Humanize client-side |
| Load avg | `node_load1`, `node_load5`, `node_load15` | Direct gauges |
| Net I/O (for sparkline) | `sum by(instance)(rate(node_network_receive_bytes_total{device!~"lo\|veth.*\|docker.*\|br-.*\|tailscale.*"}[1m]))` | Range query 15m × 30s step |
| Host liveness | `up{job="node"}` | 1=scraped OK, 0=down; missing=host unknown |
| Last scrape ts | `timestamp(up{job="node"})` | Feeds D-09 staleness (90s/300s thresholds) |
| Claude 5h | `claude_code_session_used_ratio` | Phase 07 exporter metric (unchanged) |
| Claude 7d | `claude_code_weekly_used_ratio` | Phase 07 exporter metric (unchanged) |
| Alerts firing | `count by(severity)(ALERTS{alertstate="firing"})` | D-11; Phase 17 swaps to AM API |

**instance → hostname mapping:** Maintain a tiny table in `overview-view-model.ts`:
```typescript
const HOST_BY_INSTANCE: Record<string, { name: string; role: string; hasContainers: boolean }> = {
  "100.101.0.7:9100":   { name: "tower",       role: "Proxmox host",  hasContainers: false },
  "100.101.0.8:9100":   { name: "docker-tower",role: "Media stack",   hasContainers: true  },
  "100.99.133.9:9100":  { name: "cc-worker",   role: "CC runner",     hasContainers: false },
  "100.101.0.9:9100":   { name: "mcow",        role: "VoidNet / admin",hasContainers: true },
  "100.101.0.3:9100":   { name: "nether",      role: "VPN entry/exit",hasContainers: false },
  "100.119.15.122:9100":{ name: "animaya-dev", role: "Animaya dev",   hasContainers: false },
};
```

## Runtime State Inventory

> Phase 14 is not primarily a rename/refactor, but it DOES replace an existing module (`audit.server.ts`) so a targeted inventory is useful.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | No existing audit DB. Phase 13 emitted JSON to stdout only (`process.stdout.write`). | Fresh file at `/var/lib/homelab-admin/audit.db` (D-12). No migration from stdout logs — those are journald-captured only. |
| Live service config | Prometheus `prometheus.yml` on docker-tower already has `node` and `cadvisor` scrape jobs with `file_sd_configs` pointing to `nodes.yml` and `cadvisor.yml`. Those files target all 6 hosts (`nodes.yml`) and 2 hosts (`cadvisor.yml`) today. | Verify each host's `:9100` actually responds; fill gaps via `ansible/playbooks/node-exporter.yml` re-run. Optionally extend cAdvisor to cc-worker if Docker present. |
| OS-registered state | `claude-usage-exporter` on mcow (Phase 13 rebind); `homelab-admin` systemd unit on mcow (Phase 12). | Extend `homelab-admin.service` to mount `/var/lib/homelab-admin/` (create dir, perms 0750 owner `homelab-admin`). |
| Secrets/env vars | `PROMETHEUS_URL` already consumed by `lib/prometheus.server.ts` (default `http://mcow:9090`). No new secrets. | Add `AUDIT_DB_PATH` env (optional; has sane default). Ensure systemd unit's `ReadWritePaths=` includes `/var/lib/homelab-admin` (strict hardening block from Phase 12). |
| Build artifacts | None. | None — `bun:sqlite` is built-in; no native build. |

**Verified in-tree today:**
- `ansible/playbooks/node-exporter.yml` exists and uses `prometheus.prometheus.node_exporter` role.
- `servers/docker-tower/monitoring/prometheus/prometheus.yml` scrapes `job='node'` + `job='cadvisor'` via file_sd.
- `servers/docker-tower/monitoring/prometheus/targets/nodes.yml` lists all 6 hosts on `:9100`.
- `servers/docker-tower/monitoring/prometheus/targets/cadvisor.yml` lists docker-tower and mcow.
- `apps/admin/lib/prometheus.server.ts` exports `queryInstant` + `queryRange` (Phase 13 Plan 03).
- `apps/admin/lib/audit.server.ts` is a **stdout stub** with contract fields (`ts`, `actor`, `action`, `token_id`, `diff`) — comment explicitly anticipates Phase 14 sqlite migration.
- `apps/admin/lib/redact.server.ts` exports `TOKEN_PATTERN` + `sanitizeErrorMessage`. Must be extended with `redactPayload(obj: unknown): unknown` for arbitrary audit payloads.

## Common Pitfalls

### Pitfall 1: SQLite file permissions under strict systemd
**What:** Bun process runs under `homelab-admin` user with `ProtectSystem=strict`. New `/var/lib/homelab-admin/` dir must be created by Ansible **and** added to `ReadWritePaths=` in the systemd unit, or `bun:sqlite` open fails with `EACCES`.
**Avoid:** Plan MUST include both: (a) `ansible.builtin.file: path=/var/lib/homelab-admin state=directory owner=homelab-admin mode=0750`; (b) edit to `servers/mcow/homelab-admin.service` adding `ReadWritePaths=/var/lib/homelab-admin`.
**Warning sign:** Unit fails at startup with SQLite `unable to open database file`.

### Pitfall 2: Concurrent writers on a non-WAL SQLite
**What:** Default journal mode locks the DB for writes — concurrent mutations from multiple routes could serialize poorly. Since the admin runs as a single process (single-writer, many-reader), WAL is safe and dramatically faster.
**Avoid:** `db.run("PRAGMA journal_mode = WAL")` on first open.
**Warning:** `SQLITE_BUSY` under load.

### Pitfall 3: PromQL `instance` label drift
**What:** node-exporter reports `instance=<IP:9100>`; cAdvisor on mcow runs on `:18080`, on docker-tower on `:8080` — so `instance` is NOT aligned across the two jobs. Join-by-instance PromQL (`up{job="node"} * on(instance) container_last_seen`) will silently return empty.
**Avoid:** Don't join at PromQL layer. Query each source independently; merge by mapping `instance → name` in `overview-view-model.ts`.

### Pitfall 4: `ALERTS` metric is empty when no rules are loaded
**What:** `ALERTS{alertstate="firing"}` returns zero vectors if Prometheus has no alert rules yet. Phase 14 lands before Phase 17's rules — so the `/alerts` card will always show `0 firing`. Don't treat empty as error.
**Avoid:** Treat `[]` result as "0 firing, all clear", not "unreachable".

### Pitfall 5: Audit payload leaking secrets
**What:** Phase 15/16 mutations may pass payloads containing VoidNet passwords, Proxmox tokens, or new Claude tokens. A naive `JSON.stringify(payload)` writes them straight to disk.
**Avoid:** Extend `redact.server.ts` with a recursive walker that redacts: (a) any value matching `TOKEN_PATTERN`; (b) any key in a deny-list (`password`, `token`, `secret`, `value`, `api_key`, `auth`, `authorization`). Unit-test on nested objects and arrays.
**Warning:** Pre-deploy grep `sqlite3 audit.db "SELECT payload_json FROM audit_log" | grep -E 'sk-ant-oat01-|password.*:' | wc -l` must return 0 before Phase 14 can merge.

### Pitfall 6: SWR fallbackData + SSR mismatch
**What:** If RSC parent fetches overview once at render time and passes to SWR as `fallbackData`, but SWR's first refresh fires immediately, you get a visible flicker and unnecessary server round-trip.
**Avoid:** Pass `revalidateOnMount: false` initially and let the 30s interval be the first poll, OR accept the one-time re-fetch. Per D-08, the page itself is a Route Handler consumer so RSC seed is optional — can ship SWR-only with a skeleton first paint.

### Pitfall 7: Prometheus credentials in client bundle
**What:** Putting `PROMETHEUS_URL` behind `NEXT_PUBLIC_*` or reading it from any file outside `*.server.ts` risks a client-side leak.
**Avoid:** `PROMETHEUS_URL` is read ONLY inside `lib/prometheus.server.ts` (enforced by `import "server-only"` + eslint-plugin-server-only). Verification step: `bun run build && grep -r 'PROMETHEUS_URL\|mcow:9090' .next/static/ || echo OK`.

### Pitfall 8: node-exporter on Proxmox host (tower) vs. LXCs
**What:** `tower` is the Proxmox hypervisor, not a container. Its node_exporter sees host-level metrics (correct). But LXCs on tower (cc-worker, etc.) share the kernel — their `node_cpu_seconds_total` reflects cgroup-constrained CPU only if node-exporter is running inside the LXC (it is, per `nodes.yml`). Memory is also cgroup-accurate. Disk metrics from `node_filesystem_size_bytes` inside LXC == the LXC's allocated rootfs, which is the desired view for the tile.
**Avoid:** Do NOT scrape node_exporter from tower's PVE host and then try to attribute it to LXCs. Each host/LXC gets its own node_exporter.

## Code Examples

### Stale classifier (client-side, maps lastSeen → color)
```typescript
// overview-view-model.ts
export type StaleLevel = "fresh" | "stale" | "dead" | "unknown";
export function classifyStale(lastSeenUnix: number | null, nowUnix = Date.now() / 1000): StaleLevel {
  if (lastSeenUnix == null) return "unknown";
  const age = nowUnix - lastSeenUnix;
  if (age < 90)   return "fresh";
  if (age < 300)  return "stale";
  return "dead";
}
```

### Payload redactor (extends redact.server.ts)
```typescript
// lib/redact.server.ts (extension)
const DENY_KEYS = new Set([
  "password", "token", "secret", "api_key", "apikey",
  "auth", "authorization", "value", "cookie",
]);

export function redactPayload(input: unknown): unknown {
  if (typeof input === "string") {
    return input.replace(TOKEN_PATTERN, "[REDACTED]");
  }
  if (Array.isArray(input)) return input.map(redactPayload);
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = DENY_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : redactPayload(v);
    }
    return out;
  }
  return input;
}
```

### Ansible cAdvisor play (D-02)
```yaml
# ansible/playbooks/cadvisor.yml
- name: Deploy cAdvisor on Docker hosts
  hosts: docker_hosts     # group includes docker-tower + mcow
  become: true
  tasks:
    - name: Run cAdvisor container
      community.docker.docker_container:
        name: cadvisor
        image: gcr.io/cadvisor/cadvisor:v0.56.1
        state: started
        restart_policy: unless-stopped
        # Bind to Tailnet IP only — no 0.0.0.0
        ports:
          - "{{ tailscale_ip }}:{{ cadvisor_port | default(8080) }}:8080"
        volumes:
          - /:/rootfs:ro
          - /var/run:/var/run:ro
          - /sys:/sys:ro
          - /var/lib/docker/:/var/lib/docker:ro
          - /dev/disk/:/dev/disk:ro
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Grafana dashboards | Next.js RSC + Recharts | v3.0 pivot 2026-04-16 | This phase is the FIRST proof that the Grafana-replacement works |
| Stdout-only audit | `bun:sqlite` table + paginated viewer | Phase 14 (this) | Enables Phases 15-17 to produce searchable audit |
| Alertmanager polling for count | Prometheus `ALERTS{}` metric (D-11) | Phase 14 | Swapped in Phase 17; UI surface stable |
| JSON payload logged raw | Key-deny-list + token-pattern redaction | Phase 13 REVIEW-FIX WR-03 | Required BEFORE any mutation payload hits disk |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | docker_hosts Ansible group does not yet exist in `ansible/inventory.yml` — Phase 14 must create it. | Ansible cAdvisor play | Wrong group name → playbook targets 0 hosts; planner must confirm. |
| A2 | The `homelab-admin` systemd unit on mcow runs with `ProtectSystem=strict` — `ReadWritePaths=` amendment is required. | Pitfall 1 | If mcow was KVM-relaxed or is NOT strict, no amendment needed. Phase 12 summary confirms strict for KVM; should be verified. |
| A3 | Bun 1.1.38's built-in SQLite is ≥ 3.43 (supports `PRAGMA journal_mode=WAL` and `CREATE TABLE IF NOT EXISTS`). | Pattern 3 | Unsafe only if Bun version bumped below 1.0 — the pin is 1.1.38, safe. |
| A4 | cc-worker LXC is NOT currently running Docker; cAdvisor not needed there (per CLAUDE.md role = Claude Code runner). | D-02 scope | If cc-worker does run Docker for CI builds, container count tile will show 0 / gap; fix = add to cAdvisor target list. |
| A5 | Phase 17 will swap `ALERTS{}` to Alertmanager HTTP API cleanly because the UI consumes a typed `AlertCount` object from the Route Handler. | D-11 | Only risk is if severity label values differ between Prom `ALERTS` and AM API. Both use the same `severity` label, so risk is low. |

## Open Questions

1. **cAdvisor on cc-worker?**
   - What we know: cc-worker role = Claude Code runner. Unclear whether it runs Docker for builds.
   - Recommendation: Planner asks operator; default = not provisioned. One-line `cadvisor.yml` target add if later needed.
2. **Audit row payload size cap.**
   - What we know: D-14 says "keep forever, revisit if >1 GB". No per-row size cap specified.
   - Recommendation: Truncate `payload_json` at 8 KiB before insert (`substring + "…(truncated)"`). A 1 GB budget at 8 KiB/row = 128k mutations — many years of runway. Add as a discretionary decision.
3. **Does Phase 14 include writing a real mutation that exercises `logAudit()` end-to-end, or just the infrastructure?**
   - What we know: Phase 13's 5 mutations already emit to stdout. Those call sites must flip to `logAudit()` in Phase 14 — otherwise the table ships empty.
   - Recommendation: Phase 14 MUST include the Phase 13 call-site migration. This is the "manual mutation produces a row" success criterion. Call it out as a task.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Prometheus (docker-tower) | DASH-01..03, overview Route Handler | Probed at runtime — degraded mode if down | 2.x (Phase 07) | `.catch(() => [])` per-query |
| node_exporter on 6 hosts | DASH-01 | Ansible role vendored; `nodes.yml` already lists 6 hosts | 1.11.1 upstream | Missing host tile shows "unknown" stale state |
| cAdvisor on docker-tower + mcow | DASH-01 (container count) | Scrape target file present (`cadvisor.yml`) | v0.56.1 target | Tile shows `—` for container count |
| Bun 1.1.38 + `bun:sqlite` | INFRA-05 | Pinned via group_vars (Phase 12) | 1.1.38 / SQLite 3.43+ | None — hard requirement |
| mcow writable `/var/lib/homelab-admin/` | INFRA-05 | Must be created by Ansible task in this phase | new | None — must provision |
| GitHub OAuth session | `/audit` + `/api/overview` auth gate | Phase 12 | Auth.js v5 | None |
| Prometheus `ALERTS{}` metric | DASH-03 | Empty until Phase 17 rules load — returns `[]` | 2.x | Card shows "0 firing" which is semantically correct pre-rules |

**Missing dependencies with no fallback:** `/var/lib/homelab-admin/` on mcow (new provisioning — must ship in this phase).
**Missing dependencies with fallback:** cAdvisor on cc-worker (fallback: just don't count its containers).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun test (built-in) |
| Config file | `apps/admin/bunfig.toml` + per-file `.test.ts` alongside module (Phase 13 pattern) |
| Quick run command | `cd apps/admin && bun test lib/` |
| Full suite command | `cd apps/admin && bun test && bun run build` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| DASH-01 | Host tile builds from PromQL results; missing host → "unknown" | unit | `bun test app/(auth)/_lib/overview-view-model.test.ts` | ❌ Wave 0 |
| DASH-02 | Claude summary reuses Phase 13 `thresholdClass`; link href = `/tokens` | unit + render | `bun test app/(auth)/_components/ClaudeSummary.test.tsx` | ❌ Wave 0 |
| DASH-03 | AlertsCard renders severity breakdown from `ALERTS{}`; empty → "0 firing" | unit | `bun test app/(auth)/_components/AlertsCard.test.tsx` | ❌ Wave 0 |
| DASH-04 | SWR config uses `refreshInterval: 30_000`; stale classifier thresholds 90/300s | unit | `bun test app/(auth)/_lib/overview-view-model.test.ts` | ❌ Wave 0 |
| DASH-05 | No `PROMETHEUS_URL` in `.next/static/`; eslint rule blocks client import | build-grep | `bun run build && ! grep -r PROMETHEUS_URL .next/static/` | ✅ eslint rule in Phase 13 |
| INFRA-05 | `logAudit()` writes row with all 6 fields; `redactPayload()` drops deny-list keys + token patterns | unit | `bun test lib/audit.server.test.ts && bun test lib/redact.server.test.ts` | ❌ Wave 0 — EXISTING `audit.server.test.ts` covers stdout stub; must be rewritten |
| INFRA-05 | `/audit` RSC paginates; `?before=<id>` cursor returns next page | integration | `bun test app/(auth)/audit/page.test.tsx` | ❌ Wave 0 |
| D-09 | Staleness: fresh<90s, stale 90-300s, dead>300s, null→unknown | unit | inside `overview-view-model.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/admin && bun test lib/ app/(auth)/_lib/ app/(auth)/_components/`
- **Per wave merge:** `cd apps/admin && bun test && bun run build`
- **Phase gate:** Full suite green + Ansible `ansible-playbook --check cadvisor.yml` idempotent.

### Wave 0 Gaps
- [ ] `apps/admin/app/(auth)/_lib/overview-view-model.test.ts` — stale classifier + host row builder
- [ ] `apps/admin/app/(auth)/_components/{ClaudeSummary,AlertsCard,HostCard}.test.tsx` — render contracts
- [ ] `apps/admin/lib/audit.server.test.ts` — REWRITE existing stdout test into sqlite insert test (use `:memory:` DB)
- [ ] `apps/admin/lib/redact.server.test.ts` — add `redactPayload()` coverage (nested objects, arrays, deny-list keys, token pattern)
- [ ] `apps/admin/app/(auth)/audit/page.test.tsx` — pagination / empty state / RSC smoke

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (inherited) | Auth.js v5 + GitHub OAuth allowlist (Phase 12) |
| V3 Session Management | yes (inherited) | Phase 12 cookies (HttpOnly, Secure, SameSite=Lax, 8h) |
| V4 Access Control | yes | `middleware.ts` gates `/audit`; every API route calls `await auth()` |
| V5 Input Validation | yes | Zod on `/api/overview` (no input) and `/audit?before=<id>` (regex/int) |
| V6 Cryptography | no | No new crypto in this phase — audit DB is local file, TLS at Caddy |
| V7 Error Handling & Logging | yes — this is the phase | Audit table IS the logging control; redaction required before insert |
| V8 Data Protection | yes | Redaction deny-list + token pattern; payload truncate cap |
| V9 Communications | yes (inherited) | TLS at Caddy; Prometheus over Tailnet only |

### Known Threat Patterns for Next.js + bun:sqlite + Prometheus

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token leakage via audit payload | Information Disclosure | `redactPayload()` pre-insert, grep verification step in CI |
| SQL injection on `/audit?before=` | Tampering | Zod `z.string().regex(/^\d+$/)` + prepared statement with `$before` param |
| Prometheus URL leak in client bundle | Information Disclosure | `server-only` sentinel + eslint + post-build grep |
| Concurrent mutation race in audit DB | Tampering / Repudiation | WAL mode + single process writer; Bun event loop serializes inserts on the same connection |
| Audit log tamper (operator deletes rows) | Repudiation | Out of scope (single-admin trust model); mitigated later if append-only WAL archival is added |
| `/audit` enumeration by unauth user | Information Disclosure | Phase 12 middleware gate already protects `(auth)` group |
| Prometheus query echo in error message | Information Disclosure | Already handled in `prometheus.server.ts::promFetch` (generic messages only) |
| Alert count = proxy DoS source | Availability | `.catch(() => 0)` on ALERTS query; page renders with "?" if Prometheus down |

## Sources

### Primary (HIGH confidence)
- In-tree code:
  - `apps/admin/lib/prometheus.server.ts` (`queryInstant`/`queryRange` surface)
  - `apps/admin/lib/audit.server.ts` (Phase 13 stdout stub with Phase 14 contract comment)
  - `apps/admin/lib/redact.server.ts` (`TOKEN_PATTERN` + `sanitizeErrorMessage`)
  - `apps/admin/app/(auth)/tokens/page.tsx` + `_lib/view-model.ts` (degraded-mode pattern)
  - `servers/docker-tower/monitoring/prometheus/prometheus.yml` + `targets/nodes.yml` + `targets/cadvisor.yml`
  - `ansible/playbooks/node-exporter.yml`
  - `ansible/collections/ansible_collections/prometheus/prometheus/roles/{node_exporter,cadvisor}/` (vendored roles)
- Phase 13 summaries: `13-03-SUMMARY.md`, `13-04-SUMMARY.md`
- Phase 14 CONTEXT.md (all D-01 through D-17 decisions)
- Bun SQLite docs: [bun.com/docs/runtime/sqlite](https://bun.com/docs/runtime/sqlite)
- node_exporter release 1.11.1 (2026-04-07): [github.com/prometheus/node_exporter/releases](https://github.com/prometheus/node_exporter/releases)

### Secondary (MEDIUM confidence)
- SWR Next.js guide: [swr.vercel.app/docs/with-nextjs](https://swr.vercel.app/docs/with-nextjs)
- cAdvisor v0.56.1: [github.com/google/cadvisor](https://github.com/google/cadvisor)

### Tertiary (LOW confidence)
- None — all claims are either in-tree-verified or from official docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package already pinned in `apps/admin/package.json` + `bun.lock`
- Architecture: HIGH — every pattern is a direct copy from Phase 13
- Pitfalls: HIGH — #1, #5, #7 have explicit Phase 13 precedent; #2, #3, #4 are Prometheus/SQLite canon
- PromQL queries: HIGH — verified against node_exporter 1.11.1 schema
- Ansible provisioning: MEDIUM — inventory group `docker_hosts` assumed (A1)

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable; re-verify if Bun bumps above 1.2 or Next.js above 16)
