# Phase 13: Claude Tokens Page - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 13 delivers the `/tokens` page and the full token-registry mutation pipeline:

- List all Claude Code tokens from the SOPS registry with live utilization (5h + 7d bars, reset countdown, 7d sparkline inline).
- CRUD: add, rotate, disable/enable, rename, delete — each via a server action that writes SOPS and emits an audit event.
- Per-token 7-day timeseries chart (Recharts) on detail view, fed by Prometheus range query.
- Exporter tech-debt (SEC-03): rebind to Tailnet-only `100.101.0.9:9101`, run as `uid 65534`.
- Degraded read-path: page still lists existing tokens when SOPS write is unavailable; CRUD affordances hidden.

Out of scope (belongs elsewhere):
- Audit log **storage/viewer** — Phase 14 (this phase only emits events, per SC #3).
- Any non-token page (Overview, VoidNet, Proxmox, Alerts, Terminal) — later phases.
- Multi-tenant or role-based access — Phase 12 allowlist model carries.

</domain>

<decisions>
## Implementation Decisions

### Token list UI
- **D-13-01:** Layout is a **table with inline bars**. Columns: Label · Tier · Owner · 5h bar · 7d bar · Reset countdown · 7d sparkline · Kebab actions. Sortable on Label, Tier, Owner, 5h%, 7d%.
- **D-13-02:** Live utilization is **always visible** — 5h bar, 7d bar, reset countdown, and 7d sparkline all render inline on the list view (no expand-to-reveal). Accept the denser row height in exchange for at-a-glance dashboard feel.
- **D-13-03:** Per-row actions surface via **kebab dropdown** (`⋯`) using the shadcn `DropdownMenu` already installed in Phase 12. Items: Rotate · Disable/Enable (toggle) · Rename · Delete.
- **D-13-04:** Label cell is a **link to `/tokens/[id]`** — detail page hosts the full Recharts 7-day chart and any expanded metadata. Keeps the kebab reserved for mutations only.

### Rotate semantics
- **D-13-05:** Rotate = **atomic swap**. Single SOPS commit replaces the token value and bumps `rotated_at`; old value is immediately unusable. Accept a brief (~60s worst-case) exporter reload gap where neither value is polling. No dual-poll / grace overlap (keeps exporter code and audit semantics simple).

### Claude's Discretion
User only asked to discuss Token list UI + actions. The following are locked at Claude's discretion based on SC, prior phases, and requirements — downstream agents (researcher, planner) may refine, but defaults stand:

- **D-13-06 (SOPS write pattern):** New file `secrets/claude-tokens.sops.yaml` (keeps token registry isolated from `secrets/mcow.sops.yaml` server-env). Mutations use `spawnSync('sops', ['--set', ...])` for single-field edits and a decrypt→edit→re-encrypt cycle for schema-shape mutations (add/delete entries). Serialize through an in-process async mutex so concurrent server actions can't corrupt the file. Research must validate `sops --set` syntax against v3.9.
- **D-13-07 (Exporter reload):** File-mtime polling by the exporter (check decrypted registry every 30s; reload on mtime change). Admin server action writes SOPS → re-runs `sops -d` to the exporter's read path → exporter picks up within ~60s. No per-mutation Ansible redeploy. Exporter code change is in scope for this phase.
- **D-13-08 (Audit events — Phase 14 contract):** Mutations emit structured JSON events to journald via stdout with fields `{ts, actor, action, token_id, diff}`. Phase 14 wires bun:sqlite storage + viewer that consumes the same event shape. This phase does not store or render the log.
- **D-13-09 (Prometheus client):** Server-side `fetch()` from `http://mcow:9090/api/v1/query` (live) and `/api/v1/query_range` (7d chart). Tailnet-bound, no auth. Live gauges = no cache (per-request). 7d range query = `next.revalidate = 60`. Metric names: `claude_usage_5h_pct`, `claude_usage_7d_pct`, `claude_usage_reset_seconds` (confirm exact names against exporter during research).
- **D-13-10 (Degraded read-path):** On page load a server probe calls `sops --decrypt secrets/claude-tokens.sops.yaml` to `/dev/null`. On failure, the page renders with `sopsWriteAvailable: false`; the UI hides kebab menus and "Add token" CTA, shows a banner "SOPS write path unavailable — read-only mode". Last-known-good entries come from the exporter's decrypted read path as the source of truth when SOPS is broken (no separate cache layer).
- **D-13-11 (Add-token form):** shadcn `Dialog` + `Form` + `react-hook-form` + Zod v4 schema. Format regex: `/^sk-ant-oat01-[A-Za-z0-9_-]+$/`. Token value never echoed in response HTML, never logged. Success = dialog closes + `router.refresh()`. Errors = inline field error + shadcn `Toast`.
- **D-13-12 (Delete confirmation):** shadcn `AlertDialog` with type-the-label confirmation (destructive convention). Delete is soft by default: sets `deleted_at` in registry; a cron task (out of phase) prunes after 30 days. If simplicity wins during planning, drop soft-delete for hard delete — planner decides.
- **D-13-13 (Registry schema):** Fields per entry — `id` (uuid), `label`, `value` (string, SOPS-encrypted), `tier` (enum: `pro` | `max` | `enterprise`), `owner_host` (string matching an inventory host), `enabled` (bool), `added_at`, `rotated_at?`, `deleted_at?`, `notes?`.
- **D-13-14 (Exporter rebind — SEC-03):** Rebind from `0.0.0.0:9101` → `100.101.0.9:9101`; systemd unit runs as `nobody(65534)` with read-only bind mount of decrypted registry. Ansible playbook update in this phase; verification = SC #5 curl probes.

### Folded Todos

None — cross-reference against `.planning/TODOS*` produced no matches for Phase 13 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and success criteria
- `.planning/ROADMAP.md` §"Phase 13: Claude Tokens Page" (L177-L195) — goal, rationale, deps, SC.
- `.planning/REQUIREMENTS.md` — TOKEN-01, TOKEN-02, TOKEN-03, TOKEN-04, TOKEN-05, TOKEN-06, TOKEN-07, SEC-03.

### Project-level decisions
- `.planning/PROJECT.md` §Key Decisions — D-07 (endpoint-scrape strategy; informs exporter rebind assumptions).
- `.planning/research/PITFALLS.md` — P-03 (SOPS write spike + Zod 4 + shadcn Form compat check is the first task of this phase).
- `.planning/research/STACK.md` — v3.0 stack lockdown (Next.js 15.5.15, Bun 1.1.38, Zod v4, Recharts, shadcn set).
- `.planning/research/ARCHITECTURE.md` — data flow between admin app, SOPS, exporter, Prometheus.

### Phase 12 carry-forward
- `.planning/phases/12-infra-foundation/12-CONTEXT.md` — Auth.js pattern, server action conventions, CSP/nonce middleware, env/secret flow.
- `apps/admin/app/(auth)/tokens/page.tsx` — existing stub to replace.
- `apps/admin/middleware.ts` — CSP + allowlist enforcement.
- `apps/admin/auth.ts`, `apps/admin/auth.config.ts` — GitHub OAuth + allowlist callback.
- `apps/admin/lib/auth-allowlist.server.ts` — allowlist read helper (post-fix WR-01 cache invalidation).

### Exporter + infra
- `ansible/playbooks/deploy-homelab-admin.yml` — admin app deploy pattern (SOPS decrypt + no_log + env file render).
- `ansible/playbooks/deploy-claude-usage-exporter.yml` (or equivalent under `ansible/playbooks/`) — to be updated for SEC-03 rebind.
- `servers/mcow/` — target host; exporter currently on `0.0.0.0:9101`, being rebound.
- `secrets/mcow.sops.yaml` — existing server env (do NOT merge token registry into this).
- `secrets/claude-tokens.sops.yaml` — NEW file this phase creates (canonical token registry).

### External specs
- SOPS v3.9 docs (for `--set` syntax verification) — check via Context7 during research.
- Prometheus HTTP API `/api/v1/query` + `/api/v1/query_range` — range query params for 7d chart.
- Recharts line-chart docs — for 7d timeseries component.
- Zod v4 migration notes — PITFALLS P-03 compat check.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/admin/components/ui/dropdown-menu.tsx` (shadcn) — drives the per-row kebab actions directly. No new component needed.
- `apps/admin/components/ui/card.tsx`, `button.tsx`, `avatar.tsx`, `skeleton.tsx` (shadcn, installed Phase 12).
- `apps/admin/components/layout/sidebar.tsx` — already contains a `/tokens` nav entry stubbed "Coming in Phase 13"; this phase flips it live.
- `apps/admin/lib/auth-allowlist.server.ts` — used to gate all mutation server actions.

### Established Patterns
- **Server components + server actions** are the default. Token list page is an RSC that reads registry; mutations are server actions marked `'use server'`.
- **`eslint-plugin-server-only`** blocks RSC secret leaks — continue to rely on it for token values.
- **CSP nonce middleware** — any inline scripts (Recharts should not need them) must consume the per-request nonce.
- **SOPS decrypt via Ansible at deploy** is the static-env pattern; Phase 13 adds the **runtime subprocess** pattern on top (this is the first runtime-SOPS feature in the repo).
- **Structured errors** via `error.tsx` boundary (post-fix WR-03 behavior: dev shows `error.message`, prod masks it).

### Integration Points
- `apps/admin/app/(auth)/tokens/page.tsx` — replace stub with the full table page.
- `apps/admin/app/(auth)/tokens/[id]/page.tsx` — NEW detail page with Recharts 7d chart (from D-13-04).
- `apps/admin/lib/sops.server.ts` — NEW module: `spawnSync('sops', …)` wrapper with mutex + error mapping.
- `apps/admin/lib/prometheus.server.ts` — NEW module: fetch wrapper + typed helpers for `query` and `query_range`.
- `apps/admin/lib/audit.server.ts` — NEW module: emit JSON event to stdout (journald picks it up). Phase 14 replaces the sink.
- Exporter code (on mcow; path TBD during research) — add mtime-poll reload; rebind to Tailnet IP; drop privileges to 65534.

</code_context>

<specifics>
## Specific Ideas

- Sparkline column in the table is intentional even though it adds a Recharts dependency on the list view. Operator wants a dashboard feel, not a config screen. Detail page has the full chart.
- "Atomic rotate" explicitly accepts a short exporter reload gap over the complexity of dual-poll. If operations later show this gap matters, revisit in v3.x.
- Registry file is split from `mcow.sops.yaml` — tokens are a distinct asset class and get their own SOPS file + access policy.
- Degraded mode reads from the exporter's decrypted path as the fallback source, not a separate snapshot. Fewer moving parts.

</specifics>

<deferred>
## Deferred Ideas

- **Audit log viewer / storage** — Phase 14 (already scoped; SC #3 explicitly hands off).
- **Soft-delete pruning cron** — out of scope; if soft-delete is kept, planner notes the cron as a future task.
- **Token usage alerts** (e.g. "5h > 90%") — Phase 17 (Alerts Panel + Rules).
- **Per-token RBAC** (who can rotate which token) — not in v3.0 scope; all allowlist members have full CRUD.
- **Exporter dual-poll / grace overlap** during rotate — revisit only if the atomic-swap gap proves problematic operationally.

### Reviewed Todos (not folded)
- None — no pending todos matched Phase 13 scope.

</deferred>

---

*Phase: 13-claude-tokens-page*
*Context gathered: 2026-04-17*
