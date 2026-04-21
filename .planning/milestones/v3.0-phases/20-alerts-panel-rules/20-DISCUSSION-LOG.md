# Phase 20: Alerts Panel + Rules - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 20-alerts-panel-rules
**Areas discussed:** Data source, Layout, Polling, Rule scope, E2E smoke

---

## Data source for /alerts

| Option | Description | Selected |
|--------|-------------|----------|
| Alertmanager /api/v2/alerts | Richer (annotations, silences, inhibited groups), adds second upstream | |
| Prometheus ALERTS{firing} | Reuse existing pattern from alerts-count.server.ts | ✓ |

**User's choice:** Prometheus only for now.
**Notes:** Tradeoff accepted — no silences metadata, no AM-side annotations. Deferred to backlog.

---

## Page layout/density

| Option | Description | Selected |
|--------|-------------|----------|
| Stacked cards | Easier visual triage, roomier | |
| Table | Dense, sortable by severity/duration | ✓ |

**User's choice:** Table.

---

## Polling cadence + stale behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Operator decides cadence | User picks explicit interval | |
| Claude's discretion | Builder picks reasonable defaults | ✓ |

**User's choice:** You decide.
**Notes:** Claude picked 15s SWR revalidate + healthy:false banner on upstream error. Nav badge cadence preserved.

---

## claude-usage.yml scope

| Option | Description | Selected |
|--------|-------------|----------|
| 3 required rules only | ClaudeWeeklyQuotaHigh/Critical + ClaudeExporterDown | ✓ |
| Plus ClaudeQuotaRecovered | Info-level rule for explicit resolve ping | |

**User's choice:** You decide.
**Notes:** Claude picked minimal — AM sends resolved messages natively.

---

## E2E smoke proof

| Option | Description | Selected |
|--------|-------------|----------|
| Separate test chat | Isolates prod chat from noise | |
| Temporary low threshold + clear on resolve | Uses prod chat, commit removes rule after proof | ✓ |
| amtool replay | Simulated send without real rule fire | |

**User's choice:** Temporary low threshold + clear on resolve.
**Notes:** Smoke rule labeled `smoke_test: "true"` for grep-removal. Commit removes rule after proof.

## Claude's Discretion

- Polling cadence (15s) + stale banner wording
- Exact PromQL for claude-usage rules within locked thresholds
- Table column widths, severity badge palette (follow ui-style-spec tokens)

## Deferred Ideas

- Alertmanager /api/v2 client (richer triage)
- ClaudeQuotaRecovered info rule
- UI ack/silence (permanently OOS)
- Per-severity nav badge
- Second AM host mirror
