# Phase 20: Alerts Panel + Rules — Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 11 (new/modified)
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/admin/lib/alerts-list.server.ts` | service (server module) | request-response (Prom query) | `apps/admin/lib/alerts-count.server.ts` | exact |
| `apps/admin/app/api/alerts/list/route.ts` | controller (route handler) | request-response | `apps/admin/app/api/alerts/count/route.ts` | exact |
| `apps/admin/app/(auth)/alerts/page.tsx` | RSC page (replace stub) | request-response | `apps/admin/app/(auth)/audit/page.tsx` | role-match |
| `apps/admin/app/(auth)/alerts/_components/AlertsTable.tsx` | component (client SWR) | request-response | `apps/admin/app/(auth)/audit/_components/AuditTable.tsx` + `NavAlertBadge.tsx` (SWR cadence) | role-match |
| `apps/admin/app/(auth)/alerts/_components/SeverityBadge.tsx` | component (presentational) | none | `apps/admin/components/ui/badge.tsx` (primitive) | role-match |
| `apps/admin/app/(auth)/alerts/_components/LabelsCell.tsx` | component (expandable cell) | none | `apps/admin/app/(auth)/audit/_components/PayloadCell.tsx` | exact |
| `apps/admin/app/(auth)/alerts/_components/StaleBanner.tsx` | component (banner) | none | `apps/admin/app/(auth)/_components/StaleDot.tsx` + shadcn `Alert` | role-match |
| `apps/admin/lib/alerts-list.server.test.ts` | test (bun) | — | sibling `alerts-count.server.test.ts` pattern (via `_setQueryInstantForTest`) | exact |
| `servers/docker-tower/monitoring/prometheus/alerts/claude-usage.yml` | config (Prom rules) | event-driven | `servers/docker-tower/monitoring/prometheus/alerts/homelab.yml` (group `homelab.claude`) | exact |
| `servers/docker-tower/monitoring/prometheus/tests/claude-usage_test.yml` | test (promtool fixture) | — | `servers/docker-tower/monitoring/prometheus/tests/homelab_test.yml` | exact |
| `ansible/playbooks/tasks/homelab-admin-secrets.yml` (edit: add `ALERTMANAGER_URL`) | config (env rendering) | — | same file, existing `PROMETHEUS_URL` line 82 | exact |

## Pattern Assignments

### `apps/admin/lib/alerts-list.server.ts` (service, request-response)

**Analog:** `apps/admin/lib/alerts-count.server.ts` (lines 1-86)

**Imports + server-only sentinel + DI test hook** (lines 1-22):
```ts
import "server-only";

import {
  queryInstant as realQueryInstant,
  type PromInstantResult,
} from "@/lib/prometheus.server";

type QueryInstantImpl = (promql: string) => Promise<PromInstantResult>;
let queryInstantImpl: QueryInstantImpl | null = null;

/** Test-only: swap the queryInstant surface. Pass null to restore. */
export function _setQueryInstantForTest(impl: QueryInstantImpl | null): void {
  queryInstantImpl = impl;
}

function queryInstant(promql: string): Promise<PromInstantResult> {
  return (queryInstantImpl ?? realQueryInstant)(promql);
}
```

**PromQL literal + aggregator shape** (lines 49-86): single `const QUERY = ...` literal, `try { ... } catch { healthy = false; }`, enum-bucket severity into `critical|warning|info|other` (XSS defense), return a flat envelope. New module follows this exactly but returns `{ healthy, stale_since?, alerts: FiringAlert[] }`.

**Key rule:** PromQL literals MUST live in this `*.server.ts` (not in `route.ts`) because route filename cannot carry the `server-only` sentinel lint (see commentary in `count/route.ts` lines 3-12).

**Label-join for duration:** `ALERTS_FOR_STATE` second query; build key via `Object.entries(labels).sort().map(([k,v]) => k+'='+v).join(',')` — see RESEARCH.md Pitfall 4.

---

### `apps/admin/app/api/alerts/list/route.ts` (controller, request-response)

**Analog:** `apps/admin/app/api/alerts/count/route.ts` (full file, 35 lines — clone verbatim, swap import + function name)

**Complete template** (lines 1-35):
```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listFiringAlerts } from "@/lib/alerts-list.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const payload = await listFiringAlerts();
  return NextResponse.json(payload);
}
```

**Invariants to preserve:**
- `runtime = "nodejs"` (Prom HTTP client needs TLS + MagicDNS)
- `dynamic = "force-dynamic"` (bypass Next.js fetch cache)
- Unauth → 401; ALL other responses → HTTP 200 (healthy:false envelope on upstream error) to avoid SWR retry storms
- NO `import "server-only"` in route.ts itself; transitive enforcement via the `.server.ts` import

---

### `apps/admin/app/(auth)/alerts/page.tsx` (RSC page — REPLACE stub)

**Analog:** `apps/admin/app/(auth)/audit/page.tsx` (lines 1-56)

**Current file** (5 lines) is a `<ComingSoon />` stub — DELETE usage of `@/components/common/coming-soon`.

**Replacement pattern** (from audit/page.tsx lines 22-55):
```tsx
export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const alertmanagerUrl =
    process.env.ALERTMANAGER_URL ?? "http://docker-tower:9093";

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Alerts</h1>
        <a href={alertmanagerUrl} target="_blank" rel="noreferrer" /* ghost Button + ExternalLink */>
          Open Alertmanager
        </a>
      </header>
      <AlertsTable />
    </div>
  );
}
```

**Invariants:**
- `dynamic = "force-dynamic"` + `auth()` gate + `redirect("/login")` on miss
- Page heading: `text-xl font-semibold` (UI-SPEC)
- Read `ALERTMANAGER_URL` server-side only; pass as prop or render anchor in RSC (RESEARCH Pitfall 5)

---

### `apps/admin/app/(auth)/alerts/_components/AlertsTable.tsx` (client SWR component)

**Analog (table structure):** `apps/admin/app/(auth)/audit/_components/AuditTable.tsx` (lines 58-97)
**Analog (SWR cadence):** `apps/admin/app/(auth)/_components/useAlertCount.ts:35` — existing admin pattern uses `refreshInterval: 30_000`; this phase overrides to 15_000 per D-03.

**Table shape excerpt** (audit AuditTable.tsx lines 58-97):
```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead className="w-36">Time</TableHead>
      <TableHead>User</TableHead>
      ...
    </TableRow>
  </TableHeader>
  <TableBody>
    {rows.map((row) => (
      <TableRow key={row.id}>
        <TableCell>...</TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

**Empty-state pattern** (AuditTable.tsx lines 42-52):
```tsx
if (rows.length === 0 && before === null) {
  return (
    <div className="py-12 text-center space-y-2">
      <h2 className="text-xl font-semibold">No audit entries yet</h2>
      <p className="text-sm text-muted-foreground">...</p>
    </div>
  );
}
```
Phase 20 copy per UI-SPEC: heading "No firing alerts", body "All configured alert rules are within thresholds. Prometheus is being polled every 15s."

**SWR pattern** (derived from NavAlertBadge.tsx + useAlertCount.ts):
```tsx
"use client";
import useSWR from "swr";
const fetcher = (u: string) => fetch(u).then(r => r.json());
export function AlertsTable() {
  const { data } = useSWR("/api/alerts/list", fetcher, { refreshInterval: 15_000 });
  ...
}
```

**Cell styling tokens** to reuse from AuditTable:
- Muted cell text: `text-sm text-muted-foreground`
- Monospace code-like values: `font-mono text-xs`
- Em-dash null fallback: `<span className="text-muted-foreground">—</span>`

---

### `apps/admin/app/(auth)/alerts/_components/LabelsCell.tsx` (collapsible cell)

**Analog:** `apps/admin/app/(auth)/audit/_components/PayloadCell.tsx` — same collapse/expand click pattern, already established in audit table. Follow its `useState(false)` toggle + inline expansion.

---

### `apps/admin/app/(auth)/alerts/_components/SeverityBadge.tsx` (presentational)

**Analog:** shadcn `apps/admin/components/ui/badge.tsx` primitive (use as base; apply inline classNames per UI-SPEC §Color).

**Class map (from UI-SPEC):**
```tsx
const SEV_CLASS: Record<string, string> = {
  critical: "bg-red-900/30 border-red-500/50 text-red-400",
  warning:  "bg-amber-900/30 border-amber-500/50 text-amber-400",
  info:     "bg-slate-700/50 border-slate-500/50 text-slate-300",
  other:    "bg-muted text-muted-foreground",
};
```

---

### `apps/admin/app/(auth)/alerts/_components/StaleBanner.tsx`

**Analog:** `apps/admin/app/(auth)/_components/StaleDot.tsx` (existing stale-indicator pattern) + shadcn `Alert` variant `destructive` with `AlertTriangle` lucide icon. Copy per UI-SPEC: "Prometheus unreachable — data last updated at {HH:MM}. Retrying every 15s."

---

### `apps/admin/lib/alerts-list.server.test.ts` (unit test)

**Analog:** sibling `alerts-count.server.test.ts` (implied by `_setQueryInstantForTest` export at lines 16-18 of alerts-count.server.ts). Use the DI hook; do NOT use `mock.module` (comment in analog explicitly warns against bleed-through).

**Pattern:**
```ts
import { _setQueryInstantForTest, listFiringAlerts } from "./alerts-list.server";

test("joins ALERTS and ALERTS_FOR_STATE by label-set", async () => {
  _setQueryInstantForTest(async (q) => {
    if (q.includes("ALERTS_FOR_STATE")) return [{ labels: {...}, value: 1700000000, ts: 0 }];
    return [{ labels: { alertname: "X", severity: "critical", ... }, value: 1, ts: 0 }];
  });
  const out = await listFiringAlerts();
  expect(out.healthy).toBe(true);
  ...
  _setQueryInstantForTest(null);
});
```

Cover: (a) label-join correctness for multiple instances (Pitfall 4), (b) severity enum-bucketing (including unknown → "other"), (c) healthy:false envelope on throw.

---

### `servers/docker-tower/monitoring/prometheus/alerts/claude-usage.yml` (NEW)

**Analog:** `servers/docker-tower/monitoring/prometheus/alerts/homelab.yml` group `homelab.claude` (lines 90-140). MIGRATE those rules (rename per D-04) AND delete the old group in the same commit (Pitfall 1 — duplicate firing risk).

**Group shape to clone** (lines 90-140):
```yaml
  - name: homelab.claude
    interval: 1m
    rules:
      - alert: ClaudeUsage7dHigh              # RENAME → ClaudeWeeklyQuotaHigh
        expr: claude_usage_7d_utilization > 0.8   # tighten to >= 0.80
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Claude 7d usage {{ $value | humanizePercentage }} for {{ $labels.name }}"
          description: "Token {{ $labels.name }} 7-day utilization above 80% for 15 minutes."

      - alert: ClaudeUsage7dCritical          # RENAME → ClaudeWeeklyQuotaCritical
        expr: claude_usage_7d_utilization > 0.95  # tighten to >= 0.95
        for: 5m                                    # change to 15m per D-04
        labels:
          severity: critical
        ...

      - alert: ClaudeExporterDown             # KEEP name, upgrade severity
        expr: up{job="claude-usage"} == 0
        for: 10m
        labels:
          severity: warning                         # upgrade → critical per D-04
```

**Migration checklist (derived from analog delta vs D-04):**
1. Delete `homelab.claude` group from `homelab.yml` (keep `homelab.nodes`, `homelab.containers`, `homelab.prometheus` groups intact).
2. Keep `ClaudeUsage5hHigh` / `ClaudeUsage5hCritical` — they are NOT in ALERT-03 scope; planner decides keep vs drop. Recommendation: keep them in `homelab.yml` (5h is a different window from weekly) OR migrate-with-original-names to `claude-usage.yml`.
3. New file ships 3 rules with the exact names from D-04 + `for: 15m` on ALL three (including critical), severity on ExporterDown upgraded to `critical`.

---

### `servers/docker-tower/monitoring/prometheus/tests/claude-usage_test.yml` (NEW)

**Analog:** `servers/docker-tower/monitoring/prometheus/tests/homelab_test.yml` (lines 1-112)

**Fixture header + rule_files ref** (lines 1-11):
```yaml
# promtool rule unit tests for claude-usage alert rules.
# Run with:
#   promtool test rules servers/docker-tower/monitoring/prometheus/tests/claude-usage_test.yml
rule_files:
  - ../alerts/claude-usage.yml

tests:
```

**Single-alert test shape** (HostDown block, lines 12-29 — cleanest template):
```yaml
  - interval: 1m
    input_series:
      - series: 'up{job="node",instance="100.101.0.8:9100"}'
        values: '1 1 1 1 1 0 0 0 0 0 0 0'
    alert_rule_test:
      - eval_time: 10m
        alertname: HostDown
        exp_alerts:
          - exp_labels:
              alertname: HostDown
              severity: critical
              job: node
              instance: "100.101.0.8:9100"
            exp_annotations:
              summary: "Host 100.101.0.8:9100 is down"
              description: "node-exporter ... for 5 minutes."
```

**Two-series ratio shape** (DiskUsageCritical block lines 33-51) — use for `claude_usage_7d_utilization` pending-to-firing transitions. Tests to write: one per rule × {pending@14m stays quiet, firing@16m matches labels+annotations}; plus `ClaudeExporterDown` using the 10m `up==0` pattern.

Also delete from `homelab_test.yml` any block referencing `ClaudeUsage7d*` (Wave 0 gap in RESEARCH.md §Validation).

---

### `ansible/playbooks/tasks/homelab-admin-secrets.yml` (EDIT — add `ALERTMANAGER_URL`)

**Analog:** same file, existing `PROMETHEUS_URL` line at 82 (verified via Grep).

**Excerpt (lines 80-82):**
```yaml
      # Non-secret: Prometheus base URL. docker-tower resolves via Tailnet MagicDNS on mcow.
      # Override in inventory via host_var `prometheus_url` if Prometheus relocates.
      PROMETHEUS_URL={{ prometheus_url | default('http://docker-tower:9090') }}
```

**Add immediately after (same pattern):**
```yaml
      # Non-secret: Alertmanager base URL for /alerts link-out (ALERT-02).
      # Override via host_var `alertmanager_url` if AM relocates.
      ALERTMANAGER_URL={{ alertmanager_url | default('http://docker-tower:9093') }}
```

No other ansible file changes needed; `deploy-homelab-admin.yml` already includes this task at Stage 4 via `tasks/homelab-admin-secrets.yml` (line 166 of the playbook).

---

## Shared Patterns

### Auth + session gate (route handlers)
**Source:** `apps/admin/app/api/alerts/count/route.ts` lines 28-32
**Apply to:** `/api/alerts/list/route.ts`
```ts
const session = await auth();
if (!session) return new NextResponse("unauthorized", { status: 401 });
```

### Auth + redirect gate (RSC pages)
**Source:** `apps/admin/app/(auth)/audit/page.tsx` lines 27-28
**Apply to:** `app/(auth)/alerts/page.tsx`
```ts
const session = await auth();
if (!session) redirect("/login");
```

### Always-HTTP-200 + healthy:false envelope
**Source:** `apps/admin/lib/alerts-count.server.ts` lines 63-86 + `count/route.ts` lines 28-35
**Apply to:** `alerts-list.server.ts` + `list/route.ts`
Wrap aggregator in `try { ... } catch { return { healthy: false, ...} }`; route always returns `NextResponse.json(payload)` with 200. Rationale: T-14-05-03 — SWR must not retry-storm on Prom outage.

### `server-only` sentinel placement
**Source:** comment block in `apps/admin/app/api/alerts/count/route.ts` lines 3-12
**Rule:** PromQL literals and `PROMETHEUS_URL` / `ALERTMANAGER_URL` access MUST live in `*.server.ts` modules (which carry `import "server-only"`). The route.ts filename is mandated by Next.js and cannot carry the sentinel; enforcement is transitive via import.

### Severity enum-bucketing (XSS defense)
**Source:** `apps/admin/lib/alerts-count.server.ts` lines 67-76
**Apply to:** `alerts-list.server.ts` per-row mapping
Unknown severity labels are bucketed to `other`, never rendered as raw label strings.

### SWR client cadence (existing 30s baseline; D-03 override)
**Source:** `apps/admin/app/(auth)/_components/useAlertCount.ts:35` (`refreshInterval: 30_000`), also `ClaudeSummary.tsx:128`, `HostGrid.tsx:17`
**Apply to:** `AlertsTable.tsx` — use `refreshInterval: 15_000` (D-03 locks 15s). Do NOT globally change existing 30s consumers unless cadence alignment is trivially a one-number edit (open question 3 in RESEARCH).

### Env rendering to `/etc/homelab-admin/env`
**Source:** `ansible/playbooks/tasks/homelab-admin-secrets.yml` line 82 (PROMETHEUS_URL)
**Apply to:** ALERTMANAGER_URL — identical shape, default `http://docker-tower:9093`, host_var override `alertmanager_url`.

### Prometheus rule group shape
**Source:** `servers/docker-tower/monitoring/prometheus/alerts/homelab.yml` lines 1-140
**Apply to:** `claude-usage.yml` — top-level `groups: - name: claude-usage` + `interval: 1m` + `rules: - alert: ... expr: ... for: ... labels: { severity } annotations: { summary, description }`.

### promtool test fixture shape
**Source:** `servers/docker-tower/monitoring/prometheus/tests/homelab_test.yml` lines 1-112
**Apply to:** `claude-usage_test.yml` — `rule_files: ['../alerts/claude-usage.yml']` + per-alert `interval: 1m` + `input_series` + `alert_rule_test` with `eval_time` + `exp_alerts.exp_labels` + `exp_annotations`.

## No Analog Found

None. All 11 files have an in-repo analog.

## Smoke E2E (ALERT-05 — no file artifact)

Not a code file — a commit-ritual. Pattern: append `ClaudeUsageSmokeTest` rule to `claude-usage.yml` with `expr: vector(1)`, `for: 0m`, labels `{ severity: warning, smoke_test: "true" }` (warning severity avoids the critical 1h-repeat route per alertmanager.yml, A4 in RESEARCH). Deploy via `ansible-playbook deploy-docker-tower.yml`, observe chat 193835258, curl `http://docker-tower:9093/metrics | grep alertmanager_notifications_failed_total`, then commit removal of the rule. No new receiver, no alertmanager.yml edits.

Optional helper script: `scripts/smoke-telegram-e2e.sh` — no analog; follow any existing `scripts/*.sh` shebang + `set -euo pipefail` convention found in repo.

## Metadata

**Analog search scope:** `apps/admin/lib/`, `apps/admin/app/api/alerts/`, `apps/admin/app/(auth)/`, `apps/admin/components/ui/`, `servers/docker-tower/monitoring/prometheus/`, `ansible/playbooks/`
**Files scanned:** 11 analogs fully read
**Pattern extraction date:** 2026-04-20
