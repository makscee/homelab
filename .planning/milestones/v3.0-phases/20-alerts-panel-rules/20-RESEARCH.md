# Phase 20: Alerts Panel + Rules — Research

**Researched:** 2026-04-20
**Domain:** Next.js 15 read-only page + Prometheus alert rules + promtool unit tests + Telegram E2E smoke
**Confidence:** HIGH

## Summary

Phase 20 ships three near-independent workstreams that converge on the same existing monitoring stack (docker-tower Prometheus + Alertmanager, already scraping Telegram-configured):

1. A read-only `/alerts` Next.js page in `apps/admin` that clones the established `/api/alerts/count` pattern into a `/api/alerts/list` route, backed by a `listFiringAlerts()` server module that issues ONE PromQL query on `ALERTS{alertstate="firing"}`.
2. Three new `claude-usage.yml` Prometheus rules — `ClaudeWeeklyQuotaHigh`, `ClaudeWeeklyQuotaCritical`, `ClaudeExporterDown` — in a NEW file `servers/docker-tower/monitoring/prometheus/alerts/claude-usage.yml` with a paired `promtool test rules` unit-test file.
3. A one-shot Telegram E2E smoke proof using a `smoke_test: "true"`-labelled rule with `expr: vector(1)` temporarily deployed, observed in chat 193835258, then removed in the same PR.

No new stack pieces, no new dependencies, no new Alertmanager receivers. Everything extends shipped patterns.

**Primary recommendation:** Clone `lib/alerts-count.server.ts` → `lib/alerts-list.server.ts` (server-only, Prometheus `ALERTS` + `ALERTS_FOR_STATE` composite query), clone `app/api/alerts/count/route.ts` → `app/api/alerts/list/route.ts`, replace the `ComingSoon` stub at `app/(auth)/alerts/page.tsx` with an SWR-driven table per UI-SPEC, add the 3 required rules in a NEW file (not `homelab.yml`), promtool-test them with the same fixture pattern as `homelab_test.yml`, and prove Telegram E2E via a labelled smoke rule that ships and reverts in the same wave.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `/alerts` reads Prometheus `ALERTS{alertstate="firing"}` only. Reuse the upstream + auth pattern of `lib/alerts-count.server.ts`. Do NOT add an Alertmanager `/api/v2/alerts` client this phase. Tradeoff accepted: no silences metadata, no AM annotations.description.
- **D-02:** `/alerts` renders a **table** (not cards). Columns: severity badge, alertname, instance, summary, firing duration, labels (collapsible). Sortable by severity + duration.
- **D-03 (discretion):** SWR revalidate every 15s on `/alerts`. On upstream error return `healthy: false` + `stale_since` and render a banner — do not retry-storm.
- **D-04 (discretion):** Ship ONLY the 3 required rules: `ClaudeWeeklyQuotaHigh` (≥0.80 for 15m, warning), `ClaudeWeeklyQuotaCritical` (≥0.95 for 15m, critical), `ClaudeExporterDown` (up==0 for 10m, critical). File: `servers/docker-tower/monitoring/prometheus/alerts/claude-usage.yml`. Tests at `.../tests/claude-usage_test.yml`. No "recovered" info rule — AM resolved messages cover it.
- **D-05:** Smoke test via temporarily-lowered threshold on a dedicated smoke rule (`expr: vector(1)` guarded by `smoke_test: "true"` label). Deploy briefly → observe in chat 193835258 → remove. Same chat as production. Acceptance: message lands in chat AND `alertmanager_notifications_failed_total{integration="telegram"}` stayed 0 across window.

### Claude's Discretion
- Exact polling cadence (locked to 15s via D-03 but banner wording flexible).
- Exact rule expression text (researcher picks the right metric name from claude-usage-exporter — see Metric Inventory below).
- Table column widths, severity badge palette (follows ui-style-spec.md tokens — already specified in UI-SPEC §Color).

### Deferred Ideas (OUT OF SCOPE)
- Alertmanager `/api/v2/alerts` client for richer annotations / silences / inhibited groups — revisit post-Phase 22.
- `ClaudeQuotaRecovered` info rule — AM native resolved messages cover this.
- Ack/silence from UI — permanently out of scope for v3.0 per ALERT-02.
- Per-severity nav badge (red dot for critical count) — revisit on operator ask.
- Second monitoring host / mcow AM mirror — single-AM-on-docker-tower is sufficient.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ALERT-01 | Page `/alerts` shows current Alertmanager firing alerts with severity, summary, duration, labels | Served by PromQL `ALERTS{alertstate="firing"}` + `ALERTS_FOR_STATE` — all four columns present in standard Prometheus `ALERTS` series labels / annotations path [VERIFIED: apps/admin/lib/alerts-count.server.ts already reads the same series] |
| ALERT-02 | Read-only (no ack/silence from UI) — link-out to Alertmanager web UI | Ghost Button with `ExternalLink` icon per UI-SPEC; AM URL from server-side env var (new: `ALERTMANAGER_URL`, mirrors `PROMETHEUS_URL`) |
| ALERT-03 | 3 rules: `ClaudeWeeklyQuotaHigh` (≥0.80/15m), `ClaudeWeeklyQuotaCritical` (≥0.95/15m), `ClaudeExporterDown` (up==0/10m) | Metric name: `claude_usage_7d_utilization` [VERIFIED: apps/admin/app/(auth)/tokens/_lib/view-model.ts references it; homelab.yml already uses `claude_usage_7d_utilization > 0.8 / 0.95`] |
| ALERT-04 | Rules unit-tested via `promtool test rules` in `servers/docker-tower/monitoring/prometheus/alerts/claude-usage.yml` | promtool test-rules fixture shape available at `servers/docker-tower/monitoring/prometheus/tests/homelab_test.yml` — clone it |
| ALERT-05 | Telegram E2E: induced fire → message in chat 193835258; `alertmanager_notifications_failed_total{integration="telegram"}` == 0 over window | Existing receiver `telegram-homelab` (alertmanager.yml §receivers); smoke rule pattern per D-05 |
| ALERT-06 | Alert badge in shared nav shows firing count on every page | `NavAlertBadge` at `app/(auth)/_components/NavAlertBadge.tsx` ALREADY SHIPPED in Phase 14-05 — consumes `/api/alerts/count` — no change in this phase unless planner finds cadence trivially alignable |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fetch firing alerts (PromQL aggregation) | API / Backend (Next.js Route Handler `/api/alerts/list`) | — | Prometheus creds + URL must never reach client (DASH-05 pattern enforced by `server-only` sentinel) |
| Render alerts table | Browser / Client (SWR + React) | Frontend Server (initial RSC shell) | Auto-refresh every 15s is client-side concern; server renders skeleton shell |
| Alertmanager link-out | Frontend Server (reads `ALERTMANAGER_URL` env at render time) | — | URL known server-side only; anchor rendered into RSC |
| Alert rule definitions | Infrastructure (Prometheus rule files on docker-tower) | — | Owned by docker-tower monitoring stack — deployed via `ansible/playbooks/deploy-docker-tower.yml` (canonical per project memory) |
| Rule unit tests | CI / local `promtool` | — | Stateless, run against checked-in YAML fixtures — no infra dependency |
| Telegram delivery | Alertmanager → Telegram API (direct egress from docker-tower) | — | Already deployed; mcow egress issue per project memory does NOT apply to docker-tower path |
| Smoke test coordination | Planner/operator ritual — commit smoke rule, observe, revert commit | — | Not automated; documented in plan |

## Standard Stack

### Core (ALL VERIFIED present in repo — no new installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15.5.15+ | Route Handler + RSC for `/alerts` | [VERIFIED: apps/admin/package.json pinned per Phase 12] |
| React | 19 | Client components with SWR | [VERIFIED: repo stack] |
| SWR | (existing) | 15s auto-refresh polling with healthy:false fallback | [VERIFIED: reused across `/overview`, `/audit`, nav badge] |
| shadcn `<Table>`,`<Badge>`,`<Skeleton>`,`<Alert>` | (existing) | Table primitives | [VERIFIED: `ls apps/admin/components/ui/` — all four files present] |
| lucide-react | ^1.8.0 | Icons (`ArrowUpDown`, `AlertTriangle`, `ExternalLink`) | [VERIFIED: UI-SPEC + imports across app] |
| Auth.js v5 | (existing) | `auth()` session gate on route handler | [VERIFIED: `apps/admin/app/api/alerts/count/route.ts` uses it] |
| Prometheus | 2.x | Rule evaluation on docker-tower | [VERIFIED: `servers/docker-tower/monitoring/prometheus/prometheus.yml`] |
| Alertmanager | (existing) | Telegram routing | [VERIFIED: `servers/docker-tower/monitoring/alertmanager/alertmanager.yml`, receiver `telegram-homelab`, chat 193835258] |
| promtool | bundled with Prometheus | Rule unit tests | [CITED: prometheus.io/docs/prometheus/latest/configuration/unit_testing_rules/] |

### Metric Name Inventory (for ALERT-03 rule exprs)

Confirmed exporter metric shape (from existing consumers in repo):

| Metric | Type | Label keys | Source |
|--------|------|-----------|--------|
| `claude_usage_7d_utilization` | gauge 0..1 | `name` (token label) | [VERIFIED: `apps/admin/app/(auth)/tokens/_lib/view-model.ts`, `homelab.yml:ClaudeUsage7dHigh/Critical`] |
| `claude_usage_5h_utilization` | gauge 0..1 | `name` | [VERIFIED: same] |
| `claude_usage_7d_reset_timestamp` | gauge (unix ts) | `name` | [VERIFIED: tokens view-model] |
| `up{job="claude-usage"}` | gauge 0/1 | `instance`, `job` | [VERIFIED: `homelab.yml:ClaudeExporterDown`] |

**CRITICAL FINDING — potential rule-name collision:**
[VERIFIED: `servers/docker-tower/monitoring/prometheus/alerts/homelab.yml`] already contains `ClaudeUsage7dHigh` (>0.8 for 15m, warning), `ClaudeUsage7dCritical` (>0.95 for 5m, critical), AND `ClaudeExporterDown` (up{job="claude-usage"}==0 for 10m, **warning**).

Phase 20 ALERT-03 spec requires rules NAMED `ClaudeWeeklyQuotaHigh` / `ClaudeWeeklyQuotaCritical` / `ClaudeExporterDown` with `ClaudeExporterDown` at **critical** severity per CONTEXT D-04.

Planner MUST decide and document: (a) **rename-and-migrate** existing rules from `homelab.yml` into new `claude-usage.yml` (preferred — single source of truth, matches D-04 filename); or (b) delete old names and ship new file; or (c) keep both (risk: duplicate firing → Telegram spam). Recommended: **migrate — delete the 3 `homelab.claude` group rules from `homelab.yml` and re-author in `claude-usage.yml` with the new names + critical severity on ExporterDown**. Document this as a rule migration task in the plan.

**Also note:** `ClaudeUsage7dCritical` currently uses `for: 5m` in `homelab.yml`; ALERT-03 mandates `for: 15m` for the critical variant. This is a tightening — confirm with operator during discuss-phase if `for: 15m` is correct for the critical case (CONTEXT D-04 says "15m" for critical too).

### Installation
No new package installs needed for the Next.js side. On docker-tower: `promtool` is already present in the Prometheus container image.

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                     BROWSER (Operator)                        │
│                                                               │
│   /alerts page  ──(SWR 15s)──▶  /api/alerts/list              │
│        │                              │                       │
│        ▼                              │                       │
│   Table + Banner                      │                       │
└─────────────────────────────────────┼─────────────────────────┘
                                      │ HTTPS (Caddy + session cookie)
                                      ▼
┌──────────────────────────────────────────────────────────────┐
│              mcow — homelab-admin (Next.js)                   │
│                                                               │
│   Route Handler ──▶ auth() ─▶ listFiringAlerts()              │
│   (force-dynamic,             │                               │
│    always HTTP 200)           │ server-only module             │
│                               ▼                                │
│                     queryInstant(ALERTS{...})                 │
└─────────────────────────────────┼─────────────────────────────┘
                                  │ HTTP (Tailnet)
                                  ▼
┌──────────────────────────────────────────────────────────────┐
│           docker-tower — Prometheus :9090 + AM :9093          │
│                                                               │
│   /api/v1/query ──▶ ALERTS{alertstate="firing"}               │
│                     + ALERTS_FOR_STATE                         │
│                                                               │
│   rule_files: alerts/*.yml                                    │
│     homelab.yml      (existing — migrate claude rules OUT)    │
│     claude-usage.yml (NEW — 3 rules + smoke during E2E)       │
│        │                                                       │
│        ▼ (rule fires)                                          │
│   Alertmanager → telegram-homelab receiver                    │
│                    │                                           │
│                    ▼ HTTPS (direct egress, Moscow→Telegram)   │
│                  Telegram bot → chat 193835258                │
└──────────────────────────────────────────────────────────────┘

Smoke E2E (D-05):
  commit claude-usage.yml w/ smoke rule (vector(1), label smoke_test="true")
  → ansible-playbook deploy-docker-tower.yml
  → observe message in chat 193835258
  → curl prometheus :9090/metrics | grep alertmanager_notifications_failed_total
  → commit removal of smoke rule → redeploy
```

### Recommended Project Structure

```
apps/admin/
├── lib/
│   ├── alerts-count.server.ts      (existing — do not modify)
│   ├── alerts-list.server.ts       (NEW — Prometheus ALERTS + ALERTS_FOR_STATE)
│   └── prometheus.server.ts        (existing — queryInstant)
├── app/
│   ├── api/alerts/
│   │   ├── count/route.ts          (existing)
│   │   └── list/route.ts           (NEW — clone of count route)
│   └── (auth)/alerts/
│       ├── page.tsx                (REPLACE stub with RSC shell)
│       └── _components/
│           ├── AlertsTable.tsx     (NEW — SWR client component)
│           ├── SeverityBadge.tsx   (NEW — maps severity → Tailwind classes per UI-SPEC)
│           ├── LabelsCell.tsx      (NEW — collapsible "N labels" → key=value chips)
│           └── StaleBanner.tsx     (NEW or reuse StaleDot pattern)

servers/docker-tower/monitoring/prometheus/
├── alerts/
│   ├── homelab.yml                 (EDIT — remove homelab.claude group; migrate to new file)
│   └── claude-usage.yml            (NEW — 3 rules + smoke rule during E2E)
└── tests/
    ├── homelab_test.yml            (existing — remove claude tests if present)
    └── claude-usage_test.yml       (NEW — promtool fixtures for 3 rules)

ansible/playbooks/
└── deploy-docker-tower.yml         (existing — idempotently re-renders rules on docker-tower)
```

### Pattern 1: Clone the `/api/alerts/count` route skeleton verbatim
**What:** Clone `apps/admin/app/api/alerts/count/route.ts` as `.../list/route.ts`, swap the import from `getAlertCount` → `listFiringAlerts`.
**When to use:** Every new read-only Prometheus-backed route handler in this codebase.
**Example:**
```ts
// apps/admin/app/api/alerts/list/route.ts — Source: clone of count/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listFiringAlerts } from "@/lib/alerts-list.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session) return new NextResponse("unauthorized", { status: 401 });
  return NextResponse.json(await listFiringAlerts());
}
```

### Pattern 2: PromQL composite for rows + duration
**What:** Query `ALERTS{alertstate="firing"}` and `ALERTS_FOR_STATE` from Prometheus `/api/v1/query`. `ALERTS_FOR_STATE` returns the unix timestamp when each alert began firing → duration = `now - ALERTS_FOR_STATE`.
**When to use:** Read-only alert listing without an Alertmanager API client (D-01).
**Example:**
```ts
// apps/admin/lib/alerts-list.server.ts — Source: adapted from alerts-count.server.ts
import "server-only";
import { queryInstant } from "@/lib/prometheus.server";

const ALERTS_Q = `ALERTS{alertstate="firing"}`;
const FOR_STATE_Q = `ALERTS_FOR_STATE`;

export async function listFiringAlerts() {
  try {
    const [alerts, forState] = await Promise.all([
      queryInstant(ALERTS_Q),
      queryInstant(FOR_STATE_Q),
    ]);
    // Build Map<signature, startTs> from forState; join to alerts by label-set.
    // Return { healthy: true, alerts: [...] }
  } catch {
    return { healthy: false, stale_since: new Date().toISOString(), alerts: [] };
  }
}
```
[CITED: prometheus.io/docs/prometheus/latest/configuration/alerting_rules/#inspecting-alerts-during-runtime — ALERTS and ALERTS_FOR_STATE are the two built-in time series Prometheus emits per firing alert]

### Pattern 3: promtool rule unit-test fixture shape
**What:** One YAML file per rule file, co-located under `servers/docker-tower/monitoring/prometheus/tests/`.
**When to use:** Every Prometheus rule file that ships.
**Example:** [VERIFIED template: `servers/docker-tower/monitoring/prometheus/tests/homelab_test.yml`]
```yaml
# servers/docker-tower/monitoring/prometheus/tests/claude-usage_test.yml
rule_files:
  - ../alerts/claude-usage.yml

tests:
  - interval: 1m
    input_series:
      - series: 'claude_usage_7d_utilization{name="prod"}'
        values: '0.5 0.5 0.85 0.85 0.85 0.85 0.85 0.85 0.85 0.85 0.85 0.85 0.85 0.85 0.85 0.85 0.85'
    alert_rule_test:
      - eval_time: 17m
        alertname: ClaudeWeeklyQuotaHigh
        exp_alerts:
          - exp_labels:
              alertname: ClaudeWeeklyQuotaHigh
              severity: warning
              name: "prod"
            exp_annotations:
              summary: "Claude 7d usage 85% for prod"
              description: "..."
```
Run locally: `docker exec prometheus promtool test rules /etc/prometheus/tests/claude-usage_test.yml`. Ansible task wraps this.

### Pattern 4: SWR client component with stale banner
**What:** SWR with `refreshInterval: 15_000`, always HTTP 200 from server → never retry-storm; healthy:false drives banner.
**Example:**
```tsx
// apps/admin/app/(auth)/alerts/_components/AlertsTable.tsx
"use client";
import useSWR from "swr";
const fetcher = (u: string) => fetch(u).then(r => r.json());
export function AlertsTable() {
  const { data } = useSWR("/api/alerts/list", fetcher, { refreshInterval: 15_000 });
  if (!data) return <Skeleton rows={5} />;
  return <> {!data.healthy && <StaleBanner since={data.stale_since}/>}
            <Table>{/* sort by duration desc, render rows */}</Table> </>;
}
```

### Anti-Patterns to Avoid
- **Adding an Alertmanager `/api/v2/alerts` client** — explicitly deferred per D-01. Do not introduce.
- **Creating a new receiver or route block in alertmanager.yml** — out of scope per phase boundary.
- **Letting the client fetch Prometheus directly** — violates DASH-05 and `server-only` sentinel.
- **Putting the PromQL literal in `route.ts`** — the route filename cannot carry `server-only` lint (route.ts is mandated); literal must live in `*.server.ts`.
- **Retry-on-error in SWR when upstream is down** — triggers retry-storm on docker-tower outage. Always return HTTP 200 with `healthy: false`.
- **Shipping the smoke rule permanently** — D-05 mandates commit removal in the same PR after proof.
- **Duplicate rule names** — keeping `ClaudeUsage7dHigh` in `homelab.yml` alongside new `ClaudeWeeklyQuotaHigh` would double-fire → Telegram spam.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Alert firing duration calc | Custom `for` timer in app | `ALERTS_FOR_STATE` PromQL series | Prometheus emits it natively per firing alert |
| Label rendering (XSS) | Raw `{label}` interpolation | React escaping via `{value}` JSX | Existing `alerts-count.server.ts` already defends with enum-bucketing; same pattern here |
| Table sorting | Custom virtual DOM sort | `useMemo(() => rows.slice().sort(...), [rows, sort])` | 20-row dense table; no virtualization needed |
| Severity color map | `switch` in every component | Single `SeverityBadge` component with prop-driven class map per UI-SPEC | Already specified in UI-SPEC §Color |
| Rule testing | Ad-hoc "deploy and watch" | `promtool test rules` with input_series fixtures | Standard Prometheus tooling; fixture template present at `homelab_test.yml` |
| Telegram send verification | Custom bot polling | AM metric `alertmanager_notifications_failed_total{integration="telegram"}` | Published natively by Alertmanager |

**Key insight:** Prometheus + Alertmanager already ship every capability Phase 20 needs. The phase is plumbing, not new machinery.

## Runtime State Inventory

(Phase is additive — no rename/migration — but relevant for the rule-collision cleanup.)

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Prometheus TSDB on docker-tower has active series for `ClaudeUsage7dHigh` / `ClaudeUsage7dCritical` / `ClaudeExporterDown` defined in `homelab.yml`. Renaming the rules will rotate these series names. | Accept — rule-state renames are non-destructive; old series TTL out per retention |
| Live service config | Alertmanager `telegram-homelab` receiver in `alertmanager.yml` — unchanged | None |
| OS-registered state | None — rules are files, promtool is containerized | None |
| Secrets/env vars | `/etc/alertmanager/telegram_token` on docker-tower (SOPS-decrypted); `PROMETHEUS_URL` on mcow; NEW: `ALERTMANAGER_URL` required on mcow for link-out | Add `ALERTMANAGER_URL` to ansible env rendering for homelab-admin.service |
| Build artifacts | None | None |

## Common Pitfalls

### Pitfall 1: Duplicate alert firing due to rule-name overlap
**What goes wrong:** If new `ClaudeWeeklyQuotaHigh` ships without removing existing `ClaudeUsage7dHigh` from `homelab.yml`, BOTH fire at ≥0.80 → Telegram sends 2 messages per event → operator fatigue + noisy smoke test window.
**Why it happens:** Phase absorbs v2.0 Phase 09 but prior phase shipped working variants under different names.
**How to avoid:** Migration task: in same commit, DELETE `homelab.claude` group from `homelab.yml` AND add new rules to `claude-usage.yml`. Verify via `promtool check rules` across both files.
**Warning signs:** Two Telegram messages per quota breach during smoke test.

### Pitfall 2: `alertmanager_notifications_failed_total` counts ATTEMPTS, not success
**What goes wrong:** Project memory `mcow Telegram egress` — Moscow ISP L4-blocks Telegram IPv4 from mcow path; `_failed_total` can stay 0 if upstream retry succeeds but the metric lags.
**Why it happens:** Metric semantics: counter of permanently-failed notifications.
**How to avoid:** Smoke acceptance must include BOTH metric==0 AND human confirmation of message in chat 193835258. Do NOT accept `_failed_total == 0` alone.
**Warning signs:** Metric 0 but no Telegram message — check docker-tower AM container logs: `docker logs alertmanager | grep telegram`.
**Note:** Per project memory, docker-tower's path DOES work (only mcow's does not). This phase relies on docker-tower AM egress.

### Pitfall 3: `vector(1)` smoke rule needs a `for:` clause or fires instantly
**What goes wrong:** `expr: vector(1)` matches every eval → fires as soon as rule loads. If no `for:`, pending→firing transition is < 1 eval cycle and AM may group into noise.
**How to avoid:** Use `for: 0m` explicitly and label `smoke_test: "true"` to route into logs. Operator observes and reverts within 5 min.
**Warning signs:** Smoke rule never deploys to firing state — check prometheus `/alerts` UI.

### Pitfall 4: `ALERTS_FOR_STATE` join by label-set is non-trivial
**What goes wrong:** The two series (`ALERTS` and `ALERTS_FOR_STATE`) share alertname + labels but not an ID. Naive string-key join can lose label fidelity.
**How to avoid:** Build the join key deterministically by sorting label pairs: `Object.entries(labels).sort(...).map(([k,v]) => k+'='+v).join(',')`. Add a unit test that two alerts with the same alertname on different instances get distinct durations.
**Warning signs:** All alerts show the same firing duration in the table.

### Pitfall 5: Next.js RSC + `ALERTMANAGER_URL` env-var hydration
**What goes wrong:** Putting `process.env.ALERTMANAGER_URL` in a client component leaks empty string at build time (only `NEXT_PUBLIC_*` are hydrated).
**How to avoid:** Read `ALERTMANAGER_URL` in the RSC page and pass as prop to the client component; OR keep the link-out button in the server component.
**Warning signs:** "Open Alertmanager" button href is `undefined` in production bundle.

## Code Examples

### Example 1: listFiringAlerts server module
```ts
// apps/admin/lib/alerts-list.server.ts
// Source: adapted from lib/alerts-count.server.ts (same module, same sentinel)
import "server-only";
import { queryInstant } from "@/lib/prometheus.server";

export type FiringAlert = {
  alertname: string;
  severity: "critical" | "warning" | "info" | "other";
  instance: string;
  summary: string;
  duration_seconds: number;
  labels: Record<string, string>;
};

export type AlertsList = {
  healthy: boolean;
  stale_since?: string;
  alerts: FiringAlert[];
};

const ALERTS_Q = `ALERTS{alertstate="firing"}`;
const FOR_STATE_Q = `ALERTS_FOR_STATE`;

function keyOf(labels: Record<string, string>): string {
  return Object.entries(labels).sort().map(([k, v]) => `${k}=${v}`).join(",");
}

export async function listFiringAlerts(): Promise<AlertsList> {
  try {
    const [alerts, forState] = await Promise.all([
      queryInstant(ALERTS_Q),
      queryInstant(FOR_STATE_Q),
    ]);
    const startByKey = new Map<string, number>();
    for (const s of forState) startByKey.set(keyOf(s.labels), Number(s.value));
    const now = Date.now() / 1000;
    const rows: FiringAlert[] = alerts.map((s) => {
      const sev = ((s.labels.severity ?? "").toLowerCase()) as FiringAlert["severity"];
      const start = startByKey.get(keyOf(s.labels)) ?? now;
      return {
        alertname: s.labels.alertname ?? "(unknown)",
        severity: ["critical","warning","info"].includes(sev) ? sev : "other",
        instance: s.labels.instance ?? "",
        summary: s.labels.summary ?? "", // note: summary is an annotation, not a label — may need /api/v1/rules fallback
        duration_seconds: Math.max(0, Math.floor(now - start)),
        labels: s.labels,
      };
    });
    return { healthy: true, alerts: rows };
  } catch {
    return { healthy: false, stale_since: new Date().toISOString(), alerts: [] };
  }
}
```

**Important:** The `ALERTS` series carries LABELS only, NOT annotations (summary/description). To surface `summary`, EITHER (a) read it from a companion `/api/v1/rules` fetch and join, OR (b) make the rule author copy summary into a label (not recommended). Planner MUST resolve this during planning — the UI-SPEC Summary column needs a source. Recommended: add a second `queryRules()` helper that hits `/api/v1/rules` and extracts annotations by alertname. This is still Prometheus-only (not Alertmanager API), honoring D-01.

### Example 2: claude-usage.yml rule file
```yaml
# servers/docker-tower/monitoring/prometheus/alerts/claude-usage.yml
groups:
  - name: claude-usage
    interval: 1m
    rules:
      - alert: ClaudeWeeklyQuotaHigh
        expr: claude_usage_7d_utilization >= 0.80
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Claude weekly quota high for {{ $labels.name }} ({{ $value | humanizePercentage }})"
          description: "Token {{ $labels.name }} 7-day utilization at or above 80% for 15 minutes."

      - alert: ClaudeWeeklyQuotaCritical
        expr: claude_usage_7d_utilization >= 0.95
        for: 15m
        labels:
          severity: critical
        annotations:
          summary: "Claude weekly quota CRITICAL for {{ $labels.name }} ({{ $value | humanizePercentage }})"
          description: "Token {{ $labels.name }} 7-day utilization at or above 95% — effectively rate-limited."

      - alert: ClaudeExporterDown
        expr: up{job="claude-usage"} == 0
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "Claude usage exporter unreachable"
          description: "Prometheus cannot scrape mcow:9101 for 10 minutes — quota visibility lost."
```

### Example 3: smoke rule (temporary, D-05)
```yaml
# APPEND to claude-usage.yml in smoke commit; remove in followup commit.
      - alert: ClaudeUsageSmokeTest
        expr: vector(1)
        for: 0m
        labels:
          severity: warning
          smoke_test: "true"
        annotations:
          summary: "Smoke test — Telegram E2E (ignore, rule will be removed)"
          description: "Phase 20 ALERT-05 smoke. If you see this, E2E works."
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline Alertmanager `/api/v2/alerts` client | Prometheus `ALERTS` series read | Phase 20 CONTEXT D-01 | Simpler; no silences but read-only triage sufficient |
| `ClaudeUsage7dHigh/Critical` rule names in `homelab.yml` | `ClaudeWeeklyQuotaHigh/Critical` in `claude-usage.yml` | Phase 20 per ALERT-03 + D-04 | Semantic naming, separate file for ops ownership |

**Deprecated/outdated:**
- v2.0 Phase 09 (Telegram rules + delivery) → absorbed into Phase 20; no separate phase directory exists in `.planning/phases/` (roadmap lists 01–07, 12–17, 17.1, 19, 20 — gap at 08–11 per milestone close).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Summary annotation must come from `/api/v1/rules`, not `ALERTS` labels | Code Examples Pitfall / Example 1 | If wrong (e.g. summary carried as label), planner adds unneeded fetch. Easy to verify — `curl prometheus:9090/api/v1/query?query=ALERTS` and inspect labels. Planner should verify this in first plan task. [ASSUMED] |
| A2 | `ALERTMANAGER_URL` env var does not yet exist in mcow deployment | Standard Stack / Runtime State | If already set, ansible step is no-op. Check `ansible/playbooks/deploy-homelab-admin.yml` env block. [ASSUMED] |
| A3 | Existing `ClaudeExporterDown` at warning severity in `homelab.yml` is safe to upgrade to critical | Metric Name Inventory / Pitfall 1 | Upgrading severity → potentially triggers 1h-repeat route. Operator confirmation recommended. [ASSUMED per D-04] |
| A4 | Smoke rule doesn't need a stronger guard than `smoke_test: "true"` label to avoid routing mishap | Example 3 | If AM route-matching ignores labels, smoke rule fires real critical route. Current `alertmanager.yml` only matches `severity=critical` → smoke uses `severity: warning` → safe. [VERIFIED: reviewed alertmanager.yml route block above] |
| A5 | `promtool test rules` runs in-container on docker-tower, not on operator machine | Pattern 3 | If planner puts promtool in CI requiring local install, wasted time. Recommended: run via `docker exec prometheus promtool ...` to match deployed version. [ASSUMED] |

## Open Questions

1. **Should the 3 existing `homelab.claude` rules be migrated to `claude-usage.yml` with renamed identifiers, or does the operator want the old names preserved?**
   - What we know: D-04 says "Ship the 3 required rules only" at new file path with new names. Old rules overlap semantically.
   - What's unclear: Whether removing old names breaks any downstream alert history or Grafana panel references.
   - Recommendation: Planner adds a pre-phase task to `grep -r ClaudeUsage7d servers/ dashboards/ apps/` and confirms no orphan references, then proceeds with migration.

2. **Source of `summary` column in the /alerts table**
   - What we know: `ALERTS` series carries labels, not annotations. UI-SPEC requires Summary column.
   - What's unclear: Whether to fetch `/api/v1/rules` and join, or display alertname + instance and drop Summary column.
   - Recommendation: Go with `/api/v1/rules` join — keep UI-SPEC intact, minor server-side cost, still honors D-01 (Prometheus-only, no AM client).

3. **Nav badge cadence alignment (D-03 hedge)**
   - What we know: `NavAlertBadge` consumes `/api/alerts/count` at whatever cadence Phase 14-05 set.
   - What's unclear: Current cadence. UI-SPEC says "cadence unchanged unless trivially alignable to 15s".
   - Recommendation: Planner `grep -r refreshInterval apps/admin/app/(auth)/_components/useAlertCount` and align to 15s iff the change is literally one-number edit.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Prometheus on docker-tower | `/api/alerts/list`, rules | ✓ | 2.x via existing compose | — |
| Alertmanager on docker-tower | Telegram delivery | ✓ | existing compose | — |
| promtool | ALERT-04 unit tests | ✓ | bundled with Prometheus image | Run via `docker exec prometheus promtool` |
| Telegram bot token file at `/etc/alertmanager/telegram_token` | ALERT-05 | ✓ | existing SOPS decrypt flow | — |
| Next.js 15 + Bun on mcow | `/alerts` page | ✓ | Phase 12 shipped | — |
| shadcn primitives `Table/Badge/Skeleton/Alert` | UI | ✓ | `apps/admin/components/ui/` present | — |
| SWR | Client auto-refresh | ✓ | existing consumer in other pages | — |
| `ALERTMANAGER_URL` env var on mcow | ALERT-02 link-out | ✗ | — | Hardcode `http://docker-tower:9093` fallback in RSC; add ansible env rendering task |
| Ansible playbook `deploy-docker-tower.yml` | Rule deploy | ✓ | canonical per project memory | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:**
- `ALERTMANAGER_URL` env — planner adds rendering task to `ansible/playbooks/deploy-homelab-admin.yml` environment block; until landed, RSC can read from `process.env.ALERTMANAGER_URL ?? "http://docker-tower:9093"`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (Next.js side) | Bun test runner (existing — used in `apps/admin/lib/*.test.ts`) |
| Framework (rules side) | `promtool test rules` (native Prometheus tool) |
| Config file | `apps/admin/package.json` (`bun test`); promtool consumes `tests/*.yml` directly (no config) |
| Quick run command | `cd apps/admin && bun test lib/alerts-list` |
| Full suite command | `cd apps/admin && bun test` + `docker exec prometheus promtool test rules /etc/prometheus/tests/claude-usage_test.yml` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ALERT-01 | `/api/alerts/list` returns firing alerts with all 4 fields | unit | `cd apps/admin && bun test lib/alerts-list.server.test.ts` | ❌ Wave 0 |
| ALERT-01 | Page renders table with rows | integration | `cd apps/admin && bun test app/\(auth\)/alerts/page.test.tsx` | ❌ Wave 0 |
| ALERT-02 | Link-out anchor has correct href | unit | same as above | ❌ Wave 0 |
| ALERT-03 | 3 rules parse as valid PromQL and load | unit | `docker exec prometheus promtool check rules /etc/prometheus/alerts/claude-usage.yml` | n/a (tool) |
| ALERT-04 | Rules fire at correct thresholds + for-durations | unit | `docker exec prometheus promtool test rules /etc/prometheus/tests/claude-usage_test.yml` | ❌ Wave 0 |
| ALERT-05 | Smoke message appears in chat 193835258 | manual + metric | Operator eye-check + `curl http://docker-tower:9093/metrics \| grep alertmanager_notifications_failed_total` returns 0 over window | manual |
| ALERT-06 | NavAlertBadge shows count on every authed page | existing — already shipped Phase 14-05 | `cd apps/admin && bun test useAlertCount` (existing) | ✓ |

### Sampling Rate
- **Per task commit:** `cd apps/admin && bun test lib/alerts-list` (< 2s)
- **Per wave merge:** full `bun test` + `promtool test rules` + `promtool check rules` on BOTH `homelab.yml` and `claude-usage.yml`
- **Phase gate:** Telegram E2E smoke documented PASS + operator UAT on `/alerts` at https://homelab.makscee.ru/alerts

### Wave 0 Gaps
- [ ] `apps/admin/lib/alerts-list.server.test.ts` — covers ALERT-01 label-join, severity-bucketing, healthy:false envelope
- [ ] `apps/admin/app/(auth)/alerts/page.test.tsx` — renders table, empty state, stale banner
- [ ] `servers/docker-tower/monitoring/prometheus/tests/claude-usage_test.yml` — covers ALERT-03/04 (3 rules × at-least pending + firing transitions)
- [ ] Remove (or update) any `ClaudeUsage7d*` promtool tests currently in `homelab_test.yml` after rule migration
- [ ] Manual smoke playbook script: `scripts/smoke-telegram-e2e.sh` that deploys, waits, greps metric, collects log line from chat (semi-automated)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Auth.js v5 session gate via `auth()` in route handler (existing pattern, unchanged) |
| V3 Session Management | yes | Session cookie HttpOnly/Secure/SameSite=Lax (SEC-07, already shipped) |
| V4 Access Control | yes | GitHub login allowlist (INFRA-04, already shipped); no role split in v3 |
| V5 Input Validation | partial | Route is GET with no body; query params untrusted — none accepted in this route |
| V6 Cryptography | no | No new crypto surface |
| V7 Error Handling | yes | `healthy: false` envelope, never leak Prometheus errors to client |
| V10 Malicious Code | yes | `server-only` sentinel on `alerts-list.server.ts` prevents `PROMETHEUS_URL` bundling |
| V12 Files | no | No file IO |
| V14 Configuration | yes | `ALERTMANAGER_URL` must not be `NEXT_PUBLIC_*` (server-only); bot token file permissions 0600 on docker-tower (existing) |

### Known Threat Patterns for {Next.js + Prometheus + Alertmanager}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via malicious label value (e.g. severity="<script>") | Tampering | Enum-bucket severity to critical/warning/info/other (existing pattern in `alerts-count.server.ts`); React auto-escapes `{labels[k]}` text |
| SSRF via Prometheus URL injection | Tampering | `PROMETHEUS_URL` is server env only, not derived from request |
| Retry storm on Prometheus outage | DoS self | Always HTTP 200 + `healthy: false`; SWR does not retry |
| Telegram bot token leak | Information disclosure | Token in `bot_token_file` (not env), SOPS-decrypted, file mode 0600 on docker-tower (existing) |
| Alert spam / notification storm (D-05 smoke) | Availability | Smoke rule uses `severity: warning` + `smoke_test: "true"` label; operator removes within same PR within <10 min |
| Unauthorized access to `/alerts` | Spoofing | `auth()` gate + 401; middleware redirect to /login for page route |
| Cache poisoning of `/api/alerts/list` | Tampering | `dynamic = "force-dynamic"` + `runtime = "nodejs"` — no static cache |

## Project Constraints (from CLAUDE.md)

- Docker builds: use `--no-cache` or confirm running container matches latest code. For this phase: `ansible-playbook deploy-docker-tower.yml` reloads Prometheus/AM config via `SIGHUP`, not rebuild — low risk, but confirm `prometheus_reload` handler runs after rule file change.
- Canonical docker-tower path: `/opt/homelab/` (SoT clone); `/opt/homestack/` deleted 2026-04-16 — rule files deploy there.
- Always verify API signatures: `ALERTS_FOR_STATE`, `/api/v1/rules` JSON shape — spike in first task.
- `mcow` Telegram egress is L4-blocked (project memory): IRRELEVANT here — docker-tower AM egresses directly to Telegram; smoke proves this.
- Deploy and test yourself (project memory): operator runs ansible + greps metrics; only visual UI feedback deferred to user.
- Test UI with Playwright (project memory): `/alerts` table UAT via Playwright MCP after deploy — match severity badge colors, empty state, stale banner copy.

## Sources

### Primary (HIGH confidence)
- Repo code [VERIFIED]: `apps/admin/lib/alerts-count.server.ts`, `apps/admin/app/api/alerts/count/route.ts`, `apps/admin/app/(auth)/_components/NavAlertBadge.tsx`
- Repo infra [VERIFIED]: `servers/docker-tower/monitoring/alertmanager/alertmanager.yml`, `servers/docker-tower/monitoring/prometheus/alerts/homelab.yml`, `servers/docker-tower/monitoring/prometheus/tests/homelab_test.yml`, `servers/docker-tower/monitoring/prometheus/prometheus.yml`
- CONTEXT.md [VERIFIED]: `.planning/phases/20-alerts-panel-rules/20-CONTEXT.md` (all decisions D-01..D-05)
- UI-SPEC.md [VERIFIED]: `.planning/phases/20-alerts-panel-rules/20-UI-SPEC.md`
- REQUIREMENTS.md §ALERT-01..06 [VERIFIED]

### Secondary (MEDIUM-HIGH)
- Prometheus docs [CITED]: `prometheus.io/docs/prometheus/latest/configuration/alerting_rules/#inspecting-alerts-during-runtime` — `ALERTS` and `ALERTS_FOR_STATE` series semantics
- Prometheus docs [CITED]: `prometheus.io/docs/prometheus/latest/configuration/unit_testing_rules/` — promtool test file schema
- Alertmanager docs [CITED]: `prometheus.io/docs/alerting/latest/configuration/#telegram_config` — `bot_token_file`, metric `alertmanager_notifications_failed_total`

### Tertiary (LOW / not applied)
- None — no web search needed; all claims backed by repo or official Prometheus docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all components verified in repo
- Architecture: HIGH — clones existing shipped patterns
- Pitfalls: MEDIUM-HIGH — rule-name collision risk is real and verified in existing `homelab.yml`; other pitfalls are experiential
- Rule migration recommendation: MEDIUM — operator confirmation recommended on rename (A3)

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (30 days — stack is stable, no fast-moving deps)
