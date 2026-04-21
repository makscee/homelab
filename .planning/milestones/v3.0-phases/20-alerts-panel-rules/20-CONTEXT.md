# Phase 20: Alerts Panel + Rules - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a read-only `/alerts` page listing firing alerts, ship Claude-usage Prometheus alert rules (unit-tested with `promtool`), and prove Telegram delivery end-to-end via the existing docker-tower Alertmanager. Absorbs v2.0 Phase 09 entirely. Out of scope: ack/silence from UI, new Alertmanager receivers, new routes beyond Telegram.

</domain>

<decisions>
## Implementation Decisions

### Data Source
- **D-01:** `/alerts` page reads Prometheus `ALERTS{alertstate="firing"}` only — reuse the same upstream and auth pattern already established by `lib/alerts-count.server.ts`. Do **not** add an Alertmanager `/api/v2/alerts` client in this phase. Tradeoff accepted: no silences metadata, no annotations.description from AM — the Prometheus series carries `alertname`, `severity`, `instance`, `summary`, `description` (from rule annotations) which is sufficient for read-only triage.

### UI
- **D-02:** `/alerts` renders a **table** (not cards). Columns: severity badge, alertname, instance, summary, firing duration, labels (collapsible). Sortable by severity + duration. Dense list fits the triage use case and matches operator preference for information density on ops pages.

### Claude Usage Rules (ALERT-03/04)
- **D-04 (Claude discretion):** Ship the **3 required rules only** — `ClaudeWeeklyQuotaHigh` (≥0.80 for 15m, warning), `ClaudeWeeklyQuotaCritical` (≥0.95 for 15m, critical), `ClaudeExporterDown` (up==0 for 10m, critical). File: `servers/docker-tower/monitoring/prometheus/alerts/claude-usage.yml`. Tests: `servers/docker-tower/monitoring/prometheus/tests/claude-usage_test.yml` run via `promtool test rules`. No "recovered" info-level rule — Alertmanager emits resolved messages natively.

### Smoke Test (ALERT-05)
- **D-05:** Induce fire via **temporarily lowered threshold** on a dedicated smoke rule (e.g. `ClaudeUsageSmokeTest` with `expr: vector(1)` guarded by an `enabled` label), deployed briefly, observed firing in chat 193835258, then removed. Same chat as production — no separate test chat. Commit removes the rule after proof. Acceptance: message lands in chat AND `alertmanager_notifications_failed_total{integration="telegram"}` stayed 0 across the window.

### Polling
- **D-03 (Claude discretion):** SWR revalidate every 15s on `/alerts` (fresh enough for triage, low load). Nav badge keeps its existing cadence (whatever Phase 14-05 set — planner confirms and aligns if cheap). On upstream error return `healthy: false` + `stale_since` and render a banner — do not retry-storm.

### Claude's Discretion
- Polling cadence and stale-banner wording (D-03).
- Exact rule expression text for claude-usage.yml within the thresholds locked by ALERT-03 (researcher picks the right metric name from claude-usage-exporter).
- Table column widths, severity badge palette (follow ui-style-spec.md tokens).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §ALERT-01..06 — locked acceptance criteria

### Existing code (reuse targets)
- `apps/admin/lib/alerts-count.server.ts` — Prometheus client + `ALERTS{alertstate="firing"}` aggregator with `server-only` sentinel. New `/api/alerts/list` route follows this exact pattern.
- `apps/admin/app/api/alerts/count/route.ts` — auth + force-dynamic + always-200 healthy:false on upstream error. Template for the list route.
- `apps/admin/app/(auth)/alerts/page.tsx` — currently `<ComingSoon />` stub to replace.

### Infrastructure (already deployed)
- `servers/docker-tower/monitoring/alertmanager/alertmanager.yml` — telegram-homelab receiver to chat 193835258, bot token file, critical-severity fast-path (1h repeat)
- `servers/docker-tower/monitoring/alertmanager/README.md` — deploy flow
- `servers/docker-tower/monitoring/prometheus/alerts/homelab.yml` — pattern for rule file shape
- `servers/docker-tower/monitoring/prometheus/tests/homelab_test.yml` — pattern for promtool test file

### Shared standards
- `/Users/admin/hub/knowledge/standards/frontend-stack-spec.md` — Next.js 15 + shadcn + Auth.js
- `/Users/admin/hub/knowledge/standards/ui-style-spec.md` — table + badge tokens

### Project memory
- `project_mcow_egress_lesson.md` — Telegram egress NOT via mcow. Docker-tower's AM already egresses directly (Moscow ISP blocks were specific to mcow's path); E2E smoke will confirm.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/alerts-count.server.ts` — copy/extend to a `listFiringAlerts()` function returning full series labels + `ALERTS_FOR_STATE` derived duration.
- `/api/alerts/count` route.ts — clone to `/api/alerts/list` with same auth + always-200 + `healthy` envelope.
- `components/common/coming-soon.tsx` — delete usage in alerts page (remove after replacement).
- shadcn `<Table>` + `<Badge>` already in the ui-kit (used on /overview and /audit).

### Established Patterns
- All mutation-free read endpoints: `runtime: "nodejs"`, `dynamic: "force-dynamic"`, session-gated via `auth()`, always HTTP 200 (healthy:false on upstream err) to avoid SWR retry storms.
- PromQL literals live in a `*.server.ts` module with `import "server-only"`; route handler imports from there so `route.ts` can stay a plain Next.js filename.
- SWR wrapper used across dashboard pages — reuse for /alerts table.

### Integration Points
- Nav badge already consumes `/api/alerts/count` — no change needed unless cadence is tuned.
- Audit log (Phase 14-01/02) is write-path only; alerts page does not emit audit events (ALERT-02 = read-only).

</code_context>

<specifics>
## Specific Ideas

- Reuse `telegram-homelab` receiver as-is. No new receiver, no new route block.
- Smoke rule lives in `claude-usage.yml` behind a `smoke_test: "true"` label so it's obvious in review and easy to grep-remove after proof.
- Severity palette: `critical` = red, `warning` = amber, `info` = slate (matches ui-style-spec tokens).

</specifics>

<deferred>
## Deferred Ideas

- Alertmanager `/api/v2/alerts` client for richer annotations, silences, inhibited groups — revisit after Phase 22 if triage fidelity is insufficient.
- ClaudeQuotaRecovered info-level rule for explicit Telegram resolution pings — AM resolved messages cover this.
- Ack/silence from UI — permanently out of scope for v3.0 per ALERT-02.
- Per-severity nav badge (e.g. red dot for critical count) — revisit if operator asks.
- Second monitoring host (e.g. mcow AM mirror) — single-AM-on-docker-tower is sufficient; nether App Connector is available if docker-tower egress ever fails.

</deferred>

---

*Phase: 20-alerts-panel-rules*
*Context gathered: 2026-04-20*
