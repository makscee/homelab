# Phase 14: Global Overview + Audit Log - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the `/` dashboard page (read-only live snapshot of all 6 Tailnet hosts + Claude usage summary + alert count) **and** the audit-log infrastructure that every subsequent mutation route (Phases 15-17) will import with a single call.

In scope:
- `/` overview page with 6 per-host tiles + Claude usage cards + alert badge
- `/audit` minimal viewer (paginated list, no filters)
- `audit_log` SQLite table + `audit.server.ts` helper
- Ansible provisioning of `node-exporter` on all 6 hosts + `cAdvisor` on Docker hosts
- Prometheus scrape config updates for the new exporters

Out of scope (deferred to later phases):
- Any mutation UI — audit helper lands here but gets exercised in 15-17
- Rich audit filters / payload diff view (Phase 19)
- Per-host detail route `/hosts/[name]` — not needed for overview
</domain>

<decisions>
## Implementation Decisions

### Host Metrics Provisioning
- **D-01:** Ansible playbook provisions `node-exporter` on all 6 Tailnet hosts (tower, docker-tower, cc-worker, mcow, nether, animaya-dev). Binds to Tailnet IP only. systemd unit.
- **D-02:** `cAdvisor` provisioned on Docker hosts only (docker-tower, mcow, plus any cc-* worker actually running Docker). Used for container count tile metric.
- **D-03:** Prometheus (docker-tower) scrape config extended to cover new exporter jobs; existing Phase 07 `claude-usage` job untouched.

### Overview Page Layout
- **D-04:** Rich host tile content — hostname, role label, CPU % bar, memory % bar, disk % bar, uptime, load avg (1/5/15), net I/O sparkline, container count badge.
- **D-05:** Grid layout: `md:grid-cols-2 xl:grid-cols-3`. 6 cards = 2×3 on typical desktop, 3×2 on wide.
- **D-06:** Claude usage summary = inline per-token cards (token label + 5h utilization bar + 7d utilization bar) stacked below host grid. Link to `/tokens`. Scales linearly; current N=2.
- **D-07:** Alert badge in shared nav layout + "Alerts" card on `/` with firing count + severity breakdown. Link to `/alerts` (route stub until Phase 17).

### Data Freshness & Error Handling
- **D-08:** SWR client-side refresh every 30s. All data fetched via server-side Route Handlers (`/api/overview`, `/api/alerts/count`) — Prometheus creds never reach the browser.
- **D-09:** Staleness threshold = 90s since last successful Prometheus poll per host (3× refresh interval). Yellow 90-300s, red >300s or error.
- **D-10:** Presentation = per-card stale dot (green/yellow/red `<Badge>`) **and** page-level `<Alert>` banner when Prometheus HTTP call itself fails (full outage). Last known values retained on card during outage.

### Alert Count Source
- **D-11:** Source alert count from Prometheus `ALERTS{alertstate="firing"}` metric in Phase 14. Phase 17 will swap implementation to Alertmanager HTTP API — scope the change to `prometheus.server.ts` / `alertmanager.server.ts` split so the UI does not change.

### Audit Log Infrastructure
- **D-12:** SQLite file at host path `/var/lib/homelab-admin/audit.db` on mcow, mounted read-write into the admin container. Survives container rebuilds.
- **D-13:** Driver: `bun:sqlite` (native, zero-dep, matches Phase 12 Bun runtime).
- **D-14:** Retention: append-only, keep forever. Revisit if DB exceeds 1 GB.
- **D-15:** Schema:
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
- **D-16:** `audit.server.ts` exports `logAudit({ action, target, payload })` — reads user + IP from request context. One import per mutation route. Must apply the same secret-redaction pattern used by `api/error-handlers` in Phase 13 before writing payload_json.

### Audit Viewer
- **D-17:** `/audit` route in Phase 14 = RSC paginated list (default 50/page, `?before=<id>` cursor). Columns: time (relative + exact on hover), user, action, target, payload (truncated JSON in `<code>` with click-to-expand). No filters — deferred to Phase 19.

### Claude's Discretion
- Exact CSS/spacing of host tiles — follow Phase 12 shadcn `<Card>` pattern.
- Sparkline library choice (Recharts already in, reuse).
- Loading skeleton shape — reuse shadcn skeletons established in Phase 13.
- Error boundary placement — planner decides per Next.js conventions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope
- `.planning/ROADMAP.md` §Phase 14 — goal, rationale, 5 success criteria, requirements DASH-01..05 + INFRA-05
- `.planning/REQUIREMENTS.md` — DASH-01..05, INFRA-05 acceptance text

### Prior Phase Context (locked decisions)
- `.planning/phases/12-infra-foundation/12-CONTEXT.md` — Next.js App Router, Bun, shadcn, GitHub OAuth, CSP/headers
- `.planning/phases/13-claude-tokens-page/13-CONTEXT.md` — SOPS mutex, server-side Prometheus client, Zod, SWR, Recharts patterns
- `.planning/phases/13-claude-tokens-page/13-UI-SPEC.md` — component conventions, card grid, stale-state patterns, gauges

### Prior Phase Summaries (reusable code locations)
- `.planning/phases/13-claude-tokens-page/13-03-SUMMARY.md` — `prometheus.server.ts`, `audit.server.ts` (CSRF helper, API error handlers, redaction)
- `.planning/phases/13-claude-tokens-page/13-04-SUMMARY.md` — tokens list RSC + empty/degraded/loading state patterns
- `.planning/phases/07-prometheus-wiring/` — Prometheus URL/scrape conventions on docker-tower

### Project-Level
- `CLAUDE.md` — Tailscale mesh, host roles, planned monitoring stack (Prometheus/Grafana/node-exporter)
- `.planning/PROJECT.md` — IaC principle: any server reproducible from repo; Ansible as primary operator

### Infra Targets
- `ansible/inventory.yml` — host list used by provisioning playbook (to be extended)
- `ansible/playbooks/deploy-docker-tower.yml` — pattern reference for new `provision-node-exporter.yml`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (`apps/admin/`)
- `lib/prometheus.server.ts` — server-side Prometheus query client (Phase 13). Extend with `queryRange` + new metric helpers.
- `lib/audit.server.ts` — Phase 13 stub (CSRF + error redaction). Replace/extend with SQLite-backed `logAudit()` per D-16.
- `lib/sops.server.ts` — for sourcing Prometheus URL + creds.
- `components/ui/*` — shadcn primitives (Card, Alert, Badge, Skeleton, Table). All in use from Phase 13.
- Recharts — already wired via Phase 13 detail page.

### Established Patterns
- **Server Route Handlers** for Prometheus — never call Prometheus from client. `/api/overview` returns pre-shaped JSON.
- **SWR** with 30s `refreshInterval` — client hook `useOverview()`.
- **CSRF** via Origin/Referer header check (Phase 13) — apply to `/audit` if it ever gets mutation endpoints.
- **Error redaction** — global token-pattern redact (Phase 13 REVIEW-FIX WR-03). Reuse for audit payload.

### Integration Points
- Nav layout (`app/(dashboard)/layout.tsx` from Phase 12) — add alert badge here.
- `/` route from Phase 12 is placeholder; replace RSC content.
- `middleware.ts` — existing auth gate covers `/audit`.
- Ansible `inventory.yml` + new `playbooks/provision-node-exporter.yml` — targets all 6 hosts.
- Prometheus config on docker-tower — extend scrape jobs.

</code_context>

<specifics>
## Specific Ideas

- Rich tiles but not cluttered — reuse Phase 13 card vertical rhythm.
- 6 cards in 2×3 grid on typical laptop viewport is the target layout.
- Audit viewer deliberately boring — rows in, no knobs. Pay real viewer cost later when there's real volume.
- Swap path Prometheus→Alertmanager in Phase 17 must be isolated to a single module so the UI doesn't re-render churn.

</specifics>

<deferred>
## Deferred Ideas

- **Rich audit filters (user/action/date/payload diff)** — Phase 19 Security Review + Launch hardening.
- **Per-host detail route `/hosts/[name]`** — not required for overview; separate phase if wanted.
- **Glanceable + expandable card drawer** — out of scope; defer to detail route if/when it lands.
- **Aggregated Claude usage card** — revisit if token count exceeds 4-5.
- **Audit log rotation / archival policy** — revisit when DB exceeds 1 GB.

</deferred>

---

*Phase: 14-global-overview-audit-log*
*Context gathered: 2026-04-17*
