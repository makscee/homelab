---
phase: 13
plan: 04
type: execute
wave: 3
depends_on: [13-01, 13-02, 13-03]
files_modified:
  - apps/admin/app/(auth)/tokens/page.tsx
  - apps/admin/app/(auth)/tokens/loading.tsx
  - apps/admin/app/(auth)/tokens/_components/TokensTable.tsx
  - apps/admin/app/(auth)/tokens/_components/UtilizationBar.tsx
  - apps/admin/app/(auth)/tokens/_components/ResetCountdown.tsx
  - apps/admin/app/(auth)/tokens/_components/Sparkline.tsx
  - apps/admin/app/(auth)/tokens/_components/DegradedBanner.tsx
  - apps/admin/app/(auth)/tokens/_components/AddTokenButton.tsx
  - apps/admin/app/(auth)/tokens/_lib/view-model.ts
  - apps/admin/app/(auth)/tokens/_lib/view-model.test.ts
autonomous: false
requirements:
  - TOKEN-01
  - TOKEN-02
  - TOKEN-07
user_setup: []
tags:
  - ui
  - tokens
  - list-view
  - rsc

must_haves:
  truths:
    - "Operator opens /tokens and sees a table row per registry entry with label, tier, owner, state"
    - "Each row shows an inline 5h bar, 7d bar, reset countdown, and 96px-wide sparkline"
    - "When sopsAvailable() is false, a destructive-colored alert banner appears above the table and the Add-token CTA is aria-disabled"
    - "When the registry is empty, the empty-state heading 'No tokens yet' and the Add-token CTA are visible"
    - "Color thresholds: bars are accent for <80%, amber for 80-94%, destructive for >=95%"
    - "Page loading.tsx renders 5 skeleton rows preserving 56px height"
    - "No sk-ant-oat01-* string ever appears in HTML response body"
  artifacts:
    - path: "apps/admin/app/(auth)/tokens/page.tsx"
      provides: "Server component: loads listTokens + prometheus samples, renders TokensTable"
      exports: ["default"]
    - path: "apps/admin/app/(auth)/tokens/_components/TokensTable.tsx"
      provides: "Server component: table with sortable columns, kebab placeholder, empty/degraded states"
    - path: "apps/admin/app/(auth)/tokens/_components/UtilizationBar.tsx"
      provides: "Progress bar with threshold color map + aria-valuenow + trailing % label"
    - path: "apps/admin/app/(auth)/tokens/_components/ResetCountdown.tsx"
      provides: "Humanized countdown from seconds-until-reset"
    - path: "apps/admin/app/(auth)/tokens/_components/Sparkline.tsx"
      provides: "96px Recharts line for 7d trend, Tooltip on hover"
    - path: "apps/admin/app/(auth)/tokens/_components/DegradedBanner.tsx"
      provides: "shadcn Alert destructive banner shown when SOPS write unavailable"
    - path: "apps/admin/app/(auth)/tokens/_lib/view-model.ts"
      provides: "Pure function that merges PublicTokenEntry[] + Prometheus samples into TokenRow[]"
      exports: ["buildTokenRows", "TokenRow"]
  key_links:
    - from: "apps/admin/app/(auth)/tokens/page.tsx"
      to: "apps/admin/lib/token-registry.server.ts"
      via: "listTokens()"
      pattern: "listTokens\\(\\)"
    - from: "apps/admin/app/(auth)/tokens/page.tsx"
      to: "apps/admin/lib/prometheus.server.ts"
      via: "queryInstant + queryRange"
      pattern: "query(Instant|Range)"
    - from: "apps/admin/app/(auth)/tokens/page.tsx"
      to: "DegradedBanner"
      via: "sopsAvailable() === false branch"
      pattern: "sopsAvailable"
---

<objective>
Ship the read-path for `/tokens`: an RSC that calls `listTokens()` from Plan 13-03, fetches live Prometheus samples via `queryInstant()` and 7-day sparkline series via `queryRange()`, and renders the full table per UI-SPEC. Degraded mode (SOPS unavailable) renders the banner and hides CRUD affordances. Mutations are scaffolded (kebab dropdown + CTA) but wire to no-op handlers until Plan 13-05 replaces them with the dialog components.

Purpose: Prove SC #1 and #4 end-to-end with real data before any mutation dialog ships.
Output: Live `/tokens` page with all visual elements from UI-SPEC, empty state, loading state, degraded state.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/13-claude-tokens-page/13-CONTEXT.md
@.planning/phases/13-claude-tokens-page/13-UI-SPEC.md
@.planning/phases/13-claude-tokens-page/13-01-sops-zod-spike-PLAN.md
@.planning/phases/13-claude-tokens-page/13-03-backend-libs-PLAN.md
@apps/admin/components/layout/sidebar.tsx
@apps/admin/app/(auth)/tokens/page.tsx
@apps/admin/components.json

<interfaces>
<!-- From Plan 13-03 token-registry.server.ts -->
export type PublicTokenEntry = {
  id: string;
  label: string;
  tier: 'pro' | 'max' | 'enterprise';
  owner_host: string;
  enabled: boolean;
  added_at: string;
  rotated_at?: string;
  deleted_at?: string;
  notes?: string;
};
export function listTokens(): Promise<PublicTokenEntry[]>;

<!-- From Plan 13-03 prometheus.server.ts -->
export type PromInstantSample = { labels: Record<string,string>; value: number; ts: number };
export type PromRangeSeries = { labels: Record<string,string>; samples: [number,number][] };
export function queryInstant(promql: string): Promise<PromInstantSample[]>;
export function queryRange(promql: string, start: Date, end: Date, stepSec: number,
                            opts?: { revalidateSec?: number }): Promise<PromRangeSeries[]>;

<!-- From Plan 13-01 sops.server.ts -->
export function sopsAvailable(): boolean;

<!-- From Plan 13-02 exporter metric names (exact) -->
- claude_usage_5h_pct{label,tier,owner_host}
- claude_usage_7d_pct{label,tier,owner_host}
- claude_usage_reset_seconds{label,window}   // window = five_hour | seven_day
- claude_usage_poll_last_success_timestamp{label}

<!-- View-model shape produced in this plan for TokensTable -->
export type TokenRow = {
  entry: PublicTokenEntry;
  pct5h: number | null;         // null = no Prometheus sample (new token / exporter down)
  pct7d: number | null;
  resetSecondsFiveHour: number | null;
  resetSecondsSevenDay: number | null;
  sparkline: Array<[number, number]>;   // may be empty
};
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: View-model + threshold helpers (pure, testable)</name>
  <files>apps/admin/app/(auth)/tokens/_lib/view-model.ts, apps/admin/app/(auth)/tokens/_lib/view-model.test.ts</files>
  <read_first>
    - apps/admin/lib/token-registry.server.ts (PublicTokenEntry shape)
    - apps/admin/lib/prometheus.server.ts (PromInstantSample/PromRangeSeries shape)
    - .planning/phases/13-claude-tokens-page/13-UI-SPEC.md §Color §Threshold color map
  </read_first>
  <behavior>
    - Test 1: buildTokenRows matches entries to instant samples by `labels.label === entry.label`
    - Test 2: Entries with no matching instant sample get `pct5h: null`, `pct7d: null`
    - Test 3: reset seconds are pulled from `claude_usage_reset_seconds` keyed by `{label, window}`
    - Test 4: sparkline is the `PromRangeSeries.samples` for the matching label; empty array if no series
    - Test 5: thresholdClass(0.79) === 'safe' (below 80%)
    - Test 6: thresholdClass(0.80) === 'warn' (inclusive lower bound)
    - Test 7: thresholdClass(0.94) === 'warn'
    - Test 8: thresholdClass(0.95) === 'critical' (inclusive lower bound)
    - Test 9: thresholdClass(1.5) === 'critical' (clamped)
    - Test 10: humanizeResetSeconds(3600) matches regex /^1h 0m$/ or equivalent spec — define exact output format
    - Test 11: humanizeResetSeconds(null) === 'unknown'
  </behavior>
  <action>
    Create `apps/admin/app/(auth)/tokens/_lib/view-model.ts`:

    ```typescript
    import type { PublicTokenEntry } from '@/lib/token-registry.server';
    import type { PromInstantSample, PromRangeSeries } from '@/lib/prometheus.server';

    export type TokenRow = {
      entry: PublicTokenEntry;
      pct5h: number | null;    // 0-100
      pct7d: number | null;    // 0-100
      resetSecondsFiveHour: number | null;
      resetSecondsSevenDay: number | null;
      sparkline: Array<[number, number]>;
    };

    export type Threshold = 'safe' | 'warn' | 'critical';

    export function thresholdClass(fraction: number): Threshold {
      // Accept percentage (0-100) or fraction (0-1) by normalizing
      const f = fraction > 1 ? fraction / 100 : fraction;
      if (f >= 0.95) return 'critical';
      if (f >= 0.80) return 'warn';
      return 'safe';
    }

    export function humanizeResetSeconds(s: number | null): string {
      if (s === null || s === undefined || Number.isNaN(s)) return 'unknown';
      if (s <= 0) return 'now';
      const days = Math.floor(s / 86400);
      const hours = Math.floor((s % 86400) / 3600);
      const minutes = Math.floor((s % 3600) / 60);
      if (days > 0) return `${days}d ${hours}h`;
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    }

    function sampleByLabel(samples: PromInstantSample[], label: string): number | null {
      const m = samples.find(s => s.labels.label === label);
      return m ? m.value : null;
    }

    function resetByWindow(samples: PromInstantSample[], label: string, window: string): number | null {
      const m = samples.find(s => s.labels.label === label && s.labels.window === window);
      return m ? m.value : null;
    }

    export function buildTokenRows(input: {
      entries: PublicTokenEntry[];
      pct5hSamples: PromInstantSample[];
      pct7dSamples: PromInstantSample[];
      resetSamples: PromInstantSample[];
      sparklines: PromRangeSeries[];
    }): TokenRow[] {
      return input.entries.map(entry => {
        const series = input.sparklines.find(s => s.labels.label === entry.label);
        return {
          entry,
          pct5h: sampleByLabel(input.pct5hSamples, entry.label),
          pct7d: sampleByLabel(input.pct7dSamples, entry.label),
          resetSecondsFiveHour: resetByWindow(input.resetSamples, entry.label, 'five_hour'),
          resetSecondsSevenDay: resetByWindow(input.resetSamples, entry.label, 'seven_day'),
          sparkline: series?.samples ?? [],
        };
      });
    }
    ```

    Create `view-model.test.ts` covering all 11 behaviors. Use Bun test.
  </action>
  <verify>
    <automated>cd apps/admin &amp;&amp; bun test 'app/(auth)/tokens/_lib/view-model.test.ts'</automated>
  </verify>
  <acceptance_criteria>
    - grep `export function buildTokenRows` returns 1 line
    - grep `export function thresholdClass` returns 1 line
    - grep `export function humanizeResetSeconds` returns 1 line
    - grep `'safe'` in view-model.ts returns at least 1 line
    - grep `'warn'` returns at least 1 line
    - grep `'critical'` returns at least 1 line
    - `bun test view-model.test.ts` exits 0; 11 passed
  </acceptance_criteria>
  <done>View-model transforms are pure functions, fully tested.</done>
</task>

<task type="auto">
  <name>Task 2: Install required shadcn components + leaf presentation components</name>
  <files>apps/admin/app/(auth)/tokens/_components/UtilizationBar.tsx, apps/admin/app/(auth)/tokens/_components/ResetCountdown.tsx, apps/admin/app/(auth)/tokens/_components/Sparkline.tsx, apps/admin/app/(auth)/tokens/_components/DegradedBanner.tsx</files>
  <read_first>
    - .planning/phases/13-claude-tokens-page/13-UI-SPEC.md (full spec)
    - apps/admin/components.json (shadcn config: slate/CSS vars)
    - apps/admin/app/globals.css (CSS variables: --primary, --secondary, --destructive)
    - apps/admin/components/ui/ (verify which shadcn components Plan 13-01 already installed via the spike)
  </read_first>
  <action>
    1. Ensure shadcn components are installed (Plan 13-01 spike should have done this; verify and install any missing):
       ```bash
       cd apps/admin
       bunx shadcn@latest add table progress tooltip alert badge sonner
       # Expected: no-op for already-installed components
       ```
       Add `amber-500` to the Tailwind theme if not present (UI-SPEC declares `38 92% 50%` — this is the default Tailwind amber-500).

    2. Create `UtilizationBar.tsx` (client component — needs no interactivity; mark `'use client'` only if adding hover tooltip):
       ```tsx
       import { cn } from '@/lib/utils';
       import { thresholdClass } from '../_lib/view-model';

       type Props = { label: '5h' | '7d'; value: number | null };

       export function UtilizationBar({ label, value }: Props) {
         if (value === null) {
           return (
             <div className="flex items-center gap-2">
               <div role="progressbar" aria-label={`${label} usage: pending`}
                    aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}
                    className="h-2 w-32 rounded bg-muted" />
               <span className="text-xs text-muted-foreground tabular-nums">—</span>
             </div>
           );
         }
         const pct = Math.min(100, Math.max(0, value));
         const cls = thresholdClass(pct);
         const fill =
           cls === 'critical' ? 'bg-destructive' :
           cls === 'warn' ? 'bg-amber-500' :
           'bg-primary';
         return (
           <div className="flex items-center gap-2">
             <div role="progressbar" aria-label={`${label} usage: ${pct.toFixed(0)}%`}
                  aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}
                  className="h-2 w-32 rounded bg-muted overflow-hidden">
               <div className={cn('h-full', fill)} style={{ width: `${pct}%` }} />
             </div>
             <span className="text-xs tabular-nums">{pct.toFixed(0)}%</span>
           </div>
         );
       }
       ```

    3. Create `ResetCountdown.tsx`:
       ```tsx
       import { humanizeResetSeconds } from '../_lib/view-model';
       type Props = { seconds: number | null };
       export function ResetCountdown({ seconds }: Props) {
         return <span className="text-xs tabular-nums">{humanizeResetSeconds(seconds)}</span>;
       }
       ```

    4. Create `Sparkline.tsx` (MUST be a client component for Recharts):
       ```tsx
       'use client';
       import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
       type Props = { samples: Array<[number, number]> };
       export function Sparkline({ samples }: Props) {
         if (samples.length === 0) {
           return <div className="w-24 h-6 bg-muted rounded" aria-label="no trend data" />;
         }
         const data = samples.map(([t, v]) => ({ t, v }));
         return (
           <div className="w-24 h-6">
             <ResponsiveContainer width="100%" height="100%">
               <LineChart data={data}>
                 <Line type="monotone" dataKey="v" stroke="hsl(var(--primary))"
                       strokeWidth={1.5} dot={false} isAnimationActive={false} />
                 <Tooltip formatter={(v: number) => [`${v.toFixed(0)}%`, '7d usage']}
                          labelFormatter={(t: number) => new Date(t * 1000).toLocaleDateString()}
                          contentStyle={{ fontSize: '11px', background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }} />
               </LineChart>
             </ResponsiveContainer>
           </div>
         );
       }
       ```
       If `recharts` is not yet in `package.json`, `bun add recharts` first.

    5. Create `DegradedBanner.tsx`:
       ```tsx
       import { AlertTriangle } from 'lucide-react';
       import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
       export function DegradedBanner() {
         return (
           <Alert variant="destructive" className="mb-6">
             <AlertTriangle className="h-4 w-4" />
             <AlertTitle>Read-only mode</AlertTitle>
             <AlertDescription>
               SOPS write path is unavailable. Existing tokens are shown from the exporter&rsquo;s last-known state. Add, rotate, rename, and delete are disabled until SOPS recovers.
             </AlertDescription>
           </Alert>
         );
       }
       ```

    All copy strings MUST match UI-SPEC §Copywriting Contract exactly.
  </action>
  <verify>
    <automated>cd apps/admin &amp;&amp; bun run build 2&gt;&amp;1 | tail -10 &amp;&amp; test -f apps/admin/components/ui/table.tsx &amp;&amp; test -f apps/admin/components/ui/progress.tsx &amp;&amp; test -f apps/admin/components/ui/alert.tsx</automated>
  </verify>
  <acceptance_criteria>
    - Files exist: UtilizationBar.tsx, ResetCountdown.tsx, Sparkline.tsx, DegradedBanner.tsx
    - grep `'use client'` in Sparkline.tsx returns 1 line
    - grep `role="progressbar"` in UtilizationBar.tsx returns at least 1 line
    - grep `aria-valuenow` in UtilizationBar.tsx returns at least 1 line
    - grep `Read-only mode` in DegradedBanner.tsx returns 1 line (exact UI-SPEC copy)
    - grep `bg-amber-500` in UtilizationBar.tsx returns 1 line
    - grep `bg-destructive` in UtilizationBar.tsx returns 1 line
    - grep `bg-primary` in UtilizationBar.tsx returns 1 line
    - `recharts` is present in apps/admin/package.json dependencies
    - `apps/admin/components/ui/table.tsx`, `progress.tsx`, `alert.tsx`, `tooltip.tsx`, `badge.tsx`, `sonner.tsx` all exist
    - `cd apps/admin && bun run build` exits 0
  </acceptance_criteria>
  <done>All 4 leaf components render threshold-colored bars, countdowns, sparklines, and the degraded banner with exact UI-SPEC copy.</done>
</task>

<task type="auto">
  <name>Task 3: TokensTable + AddTokenButton + page.tsx (RSC orchestration)</name>
  <files>apps/admin/app/(auth)/tokens/_components/TokensTable.tsx, apps/admin/app/(auth)/tokens/_components/AddTokenButton.tsx, apps/admin/app/(auth)/tokens/page.tsx, apps/admin/app/(auth)/tokens/loading.tsx</files>
  <read_first>
    - apps/admin/app/(auth)/tokens/page.tsx (current stub content)
    - apps/admin/app/(auth)/layout.tsx (shared layout header slot — if Phase 12 wired it)
    - .planning/phases/13-claude-tokens-page/13-UI-SPEC.md §Table column headers + §Empty state
  </read_first>
  <action>
    1. Replace `apps/admin/app/(auth)/tokens/page.tsx` with an RSC:
       ```tsx
       import { listTokens } from '@/lib/token-registry.server';
       import { sopsAvailable } from '@/lib/sops.server';
       import { queryInstant, queryRange } from '@/lib/prometheus.server';
       import { buildTokenRows } from './_lib/view-model';
       import { TokensTable } from './_components/TokensTable';
       import { DegradedBanner } from './_components/DegradedBanner';
       import { AddTokenButton } from './_components/AddTokenButton';

       export const dynamic = 'force-dynamic';  // live data, never static

       export default async function TokensPage() {
         const writeAvailable = sopsAvailable();
         const entries = await listTokens();

         const now = new Date();
         const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

         // Run Prometheus queries in parallel. Empty arrays on failure — page must still render.
         const [pct5h, pct7d, resets, sparklines] = await Promise.all([
           queryInstant('claude_usage_5h_pct').catch(() => []),
           queryInstant('claude_usage_7d_pct').catch(() => []),
           queryInstant('claude_usage_reset_seconds').catch(() => []),
           queryRange('claude_usage_7d_pct', sevenDaysAgo, now, 3600, { revalidateSec: 60 }).catch(() => []),
         ]);

         const rows = buildTokenRows({
           entries,
           pct5hSamples: pct5h,
           pct7dSamples: pct7d,
           resetSamples: resets,
           sparklines,
         });

         return (
           <div className="p-8">
             <div className="flex items-start justify-between mb-6">
               <div>
                 <h1 className="text-xl font-semibold">Claude tokens</h1>
                 <p className="text-sm text-muted-foreground mt-1">
                   Manage Claude Code OAuth tokens. Live utilization from the exporter on mcow.
                 </p>
               </div>
               <AddTokenButton disabled={!writeAvailable} />
             </div>

             {!writeAvailable && <DegradedBanner />}

             <TokensTable rows={rows} writeAvailable={writeAvailable} />
           </div>
         );
       }
       ```

    2. Create `loading.tsx`:
       ```tsx
       import { Skeleton } from '@/components/ui/skeleton';
       export default function Loading() {
         return (
           <div className="p-8">
             <Skeleton className="h-7 w-48 mb-2" />
             <Skeleton className="h-4 w-96 mb-6" />
             <div className="space-y-1">
               {[0,1,2,3,4].map(i => (
                 <Skeleton key={i} className="h-14 w-full" />
               ))}
             </div>
           </div>
         );
       }
       ```
       (5 rows × 56px height per UI-SPEC §Loading state.)

    3. Create `AddTokenButton.tsx` (placeholder — Plan 13-05 replaces the onClick with a real dialog):
       ```tsx
       'use client';
       import { Button } from '@/components/ui/button';
       import { Plus } from 'lucide-react';

       type Props = { disabled?: boolean };
       export function AddTokenButton({ disabled }: Props) {
         return (
           <Button
             disabled={disabled}
             aria-disabled={disabled ? 'true' : undefined}
             className={disabled ? 'cursor-not-allowed' : undefined}
             onClick={() => {
               // Plan 13-05 replaces with useState<boolean> dialog trigger
               if (disabled) return;
               alert('Add-token dialog — Plan 13-05');
             }}
           >
             <Plus className="mr-2 h-4 w-4" />
             Add token
           </Button>
         );
       }
       ```
       NOTE: The `alert('... Plan 13-05')` is a visible marker so the checker can verify the component wires through. Plan 13-05 replaces this with the real dialog.

    4. Create `TokensTable.tsx` (server component — rendering only, no interaction):
       ```tsx
       import Link from 'next/link';
       import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
       import { Badge } from '@/components/ui/badge';
       import { Button } from '@/components/ui/button';
       import { MoreVertical } from 'lucide-react';
       import type { TokenRow } from '../_lib/view-model';
       import { UtilizationBar } from './UtilizationBar';
       import { ResetCountdown } from './ResetCountdown';
       import { Sparkline } from './Sparkline';

       type Props = { rows: TokenRow[]; writeAvailable: boolean };

       export function TokensTable({ rows, writeAvailable }: Props) {
         if (rows.length === 0) {
           return (
             <div className="flex flex-col items-center justify-center py-12 text-center">
               <h2 className="text-xl font-semibold">No tokens yet</h2>
               <p className="text-sm text-muted-foreground mt-2 max-w-md">
                 Add your first Claude Code OAuth token to start tracking usage. Paste the token value &mdash; it will be encrypted with SOPS before it touches disk.
               </p>
             </div>
           );
         }
         return (
           <Table>
             <TableHeader>
               <TableRow>
                 <TableHead>Label</TableHead>
                 <TableHead>Tier</TableHead>
                 <TableHead>Owner</TableHead>
                 <TableHead>5h usage</TableHead>
                 <TableHead>7d usage</TableHead>
                 <TableHead>Resets in</TableHead>
                 <TableHead>7-day trend</TableHead>
                 <TableHead>State</TableHead>
                 <TableHead aria-label="Row actions" />
               </TableRow>
             </TableHeader>
             <TableBody>
               {rows.map(row => (
                 <TableRow key={row.entry.id} className="h-14">
                   <TableCell>
                     <Link href={`/tokens/${row.entry.id}`} className="font-medium hover:underline">
                       {row.entry.label}
                     </Link>
                   </TableCell>
                   <TableCell><Badge variant="secondary">{row.entry.tier}</Badge></TableCell>
                   <TableCell className="text-sm text-muted-foreground">{row.entry.owner_host}</TableCell>
                   <TableCell><UtilizationBar label="5h" value={row.pct5h} /></TableCell>
                   <TableCell><UtilizationBar label="7d" value={row.pct7d} /></TableCell>
                   <TableCell><ResetCountdown seconds={row.resetSecondsFiveHour} /></TableCell>
                   <TableCell><Sparkline samples={row.sparkline} /></TableCell>
                   <TableCell>
                     {row.entry.enabled
                       ? <Badge variant="secondary">Enabled</Badge>
                       : <Badge variant="outline">Disabled</Badge>}
                   </TableCell>
                   <TableCell>
                     <Button
                       variant="ghost" size="icon" aria-label="Row actions"
                       disabled={!writeAvailable}
                       aria-disabled={!writeAvailable ? 'true' : undefined}
                       className="h-8 w-8"
                     >
                       <MoreVertical className="h-4 w-4" />
                     </Button>
                   </TableCell>
                 </TableRow>
               ))}
             </TableBody>
           </Table>
         );
       }
       ```

    5. Verify sidebar nav entry for `/tokens` in `apps/admin/components/layout/sidebar.tsx` now shows Active when on `/tokens` (already wired Phase 12; no code change, just visual verification in Task 4 checkpoint).
  </action>
  <verify>
    <automated>cd apps/admin &amp;&amp; bun run build 2&gt;&amp;1 | tail -20 &amp;&amp; grep -q 'Claude tokens' apps/admin/app/\(auth\)/tokens/page.tsx &amp;&amp; grep -q 'force-dynamic' apps/admin/app/\(auth\)/tokens/page.tsx</automated>
  </verify>
  <acceptance_criteria>
    - apps/admin/app/(auth)/tokens/page.tsx contains `export const dynamic = 'force-dynamic';`
    - grep `listTokens()` in page.tsx returns 1 line
    - grep `sopsAvailable()` in page.tsx returns 1 line
    - grep `queryInstant(` in page.tsx returns at least 3 lines (5h, 7d, resets)
    - grep `queryRange(` in page.tsx returns 1 line (sparklines)
    - grep `Claude tokens` in page.tsx returns 1 line (exact h1 per UI-SPEC)
    - grep `Manage Claude Code OAuth tokens` in page.tsx returns 1 line (subtitle per UI-SPEC)
    - grep `No tokens yet` in TokensTable.tsx returns 1 line
    - grep `7-day trend` in TokensTable.tsx returns 1 line (column header)
    - grep `Resets in` in TokensTable.tsx returns 1 line
    - grep `h-14` in TokensTable.tsx returns at least 1 line (56px row height)
    - loading.tsx renders exactly 5 Skeleton rows (grep `h-14 w-full` returns 1 line + count 5 via map)
    - `cd apps/admin && bun run build` exits 0 with no type errors
    - No `sk-ant-oat01-` literal appears in any file under apps/admin/app/(auth)/tokens/ except inside Zod regex literals
  </acceptance_criteria>
  <done>Page.tsx orchestrates listTokens + Prometheus in parallel, renders table or empty state or degraded banner; build clean; no token leakage.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Visual verification of /tokens read-path (feedback_verify_ui — API-200 != works)</name>
  <what-built>Full RSC page rendering token list with inline bars, sparklines, countdowns, empty state, and degraded banner — no mutations yet.</what-built>
  <how-to-verify>
    From the operator machine, AFTER deploying the new admin build to mcow (via Phase 12 playbook) and ensuring the exporter from Plan 13-02 Task 4 is running:

    1. Visit `https://homelab.makscee.ru/tokens` in a Tailnet browser. Sign in as `makscee` if prompted.
    2. **Empty-state check** (expected: `secrets/claude-tokens.sops.yaml` is `{tokens:[]}` from Plan 13-01):
       - Expected heading: `No tokens yet`
       - Expected body copy: `Add your first Claude Code OAuth token to start tracking usage. Paste the token value — it will be encrypted with SOPS before it touches disk.`
       - Expected CTA: `Add token` button visible (clicking shows the placeholder alert — that is Plan 13-05 work).
    3. **Loading skeleton check:** Do a hard-reload with throttled Fast-3G devtools network. Expected: 5 skeleton rows appear for ~1s before data paints; layout does not shift when data arrives.
    4. **Degraded banner check:** SSH to mcow and temporarily rename the sops binary: `ssh root@mcow 'mv /usr/local/bin/sops /usr/local/bin/sops.bak'`. Reload `/tokens`. Expected:
       - Destructive-colored alert banner with heading `Read-only mode` at top
       - `Add token` CTA shows disabled (greyed, `aria-disabled=true`)
       - Row kebab buttons show disabled
       - Existing entries still list (from exporter snapshot — may be empty on fresh seed). Restore: `ssh root@mcow 'mv /usr/local/bin/sops.bak /usr/local/bin/sops'`.
    5. **Manually seed a test token (temporary, for visual verification):**
       - On operator machine: run `sops secrets/claude-tokens.sops.yaml` and insert one entry using the Plan 13-01 schema (any fake-looking value matching the regex, e.g. `sk-ant-oat01-TESTVISUAL_______________`). Save.
       - Re-run `ansible-playbook ansible/playbooks/deploy-claude-usage-exporter.yml`.
       - Reload `/tokens`. Expected:
         - One row appears with label/tier/owner from the seed entry
         - Utilization bars show `—` placeholder (no Prometheus samples yet for the fake token)
         - Sparkline column shows empty muted box
         - State badge shows `Enabled`
         - Kebab button is visible and enabled (since SOPS is back up)
         - Page HTML source (View Source): grep for `sk-ant-oat01-` returns zero matches — the value must NOT be in the HTML.
       - CLEANUP after check: `sops secrets/claude-tokens.sops.yaml` and remove the test entry; redeploy.
    6. **Responsive check:** Narrow browser to 1024px width — table should scroll horizontally (no layout break). At 768px, accept that the table may be ugly (dashboard is desktop-first per milestone context).
    7. **Accessibility spot check:** Open Chrome DevTools Lighthouse Accessibility audit on `/tokens`. Expected score >= 90. `aria-valuenow` on each UtilizationBar verified via DOM inspection.

    Paste results (copy the key observations + any screenshot links) in the resume message.
  </how-to-verify>
  <resume-signal>Type "approved" with observations, or describe the failure (e.g. "step 5: value appeared in HTML source").</resume-signal>
  <acceptance_criteria>
    - Step 2: Empty-state heading + body + CTA match UI-SPEC copy exactly
    - Step 3: Skeleton rows render; layout does not shift on data arrival
    - Step 4: Degraded banner appears when sops binary is absent; CTA + kebabs disabled
    - Step 5: View-source grep for `sk-ant-oat01-` returns 0 hits (TOKEN-03 never-reflect requirement proven)
    - Step 5: Kebab button is enabled after SOPS recovers
    - Step 7: Lighthouse a11y score >= 90; aria-valuenow present on bars
  </acceptance_criteria>
  <done>Read-path operator-verified: SC #1 proven end-to-end; TOKEN-03 never-reflect property proven; degraded mode works.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| RSC render → HTML response body | Must strip token values (PublicTokenEntry) |
| RSC → Prometheus | Server-side only; no creds; Tailnet network |

## STRIDE Threat Register

| Threat ID | Category | Component | ASVS | Disposition | Mitigation Plan |
|-----------|----------|-----------|------|-------------|-----------------|
| T-13-04-01 | Information Disclosure | Token value rendered in HTML | V7.1 | mitigate | PublicTokenEntry (Plan 13-03 Task 3) strips `value`; RSC imports listTokens() which returns PublicTokenEntry[]; Task 4 step 5 proves via view-source grep |
| T-13-04-02 | Information Disclosure | Prometheus URL / creds leaked to client | V8.1 | mitigate | queryInstant/queryRange are `.server.ts` and blocked by eslint-plugin-server-only from RSC/client imports; RSC only |
| T-13-04-03 | Denial of Service | Prometheus hang blocks page render | V8.2 | mitigate | All 4 prom queries run in Promise.all with .catch(() => []); degraded-data but rendered page |
| T-13-04-04 | Information Disclosure | Error boundary leaks stack to client | V7.4 | mitigate | Phase 12 error.tsx masks in production (WR-03 behavior); test via NODE_ENV=production build |
| T-13-04-05 | Spoofing | Unauth user reaches /tokens | V4.1 | mitigate | Phase 12 middleware.ts enforces allowlist on `(auth)` group; 403 before render |
| T-13-04-06 | Information Disclosure | Console logs token on server during Prom fail | V7.1 | accept | Plan 13-01 sanitizes; Plan 13-03 sanitizes; Task 3 in this plan only calls the safe wrappers |
| T-13-04-07 | Tampering | CSP bypass via Recharts inline SVG | V14.5 | mitigate | Recharts uses external CSS/JS only; no inline scripts; CSP nonce middleware unchanged from Phase 12 |

All threats have a disposition. No high-severity unmitigated.
</threat_model>

<verification>
- `cd apps/admin && bun test app/(auth)/tokens/_lib/view-model.test.ts` passes (11 tests)
- `cd apps/admin && bun run build` succeeds
- Task 4 all 7 visual checks pass, including view-source no-token-leak
</verification>

<success_criteria>
SC #1 + SC #4 (read-path part) proven: page loads registry, renders per-token gauges from Prometheus, degrades gracefully when SOPS write is down. Mutations are scaffolded but intentionally non-functional until Plan 13-05.
</success_criteria>

<output>
After completion, create `.planning/phases/13-claude-tokens-page/13-04-SUMMARY.md` with: screenshot refs (if any), Lighthouse a11y score, view-source grep proof, list of UI-SPEC copy strings verified verbatim.
</output>
