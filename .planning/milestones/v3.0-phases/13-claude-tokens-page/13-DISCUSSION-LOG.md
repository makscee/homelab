# Phase 13: Claude Tokens Page - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 13-claude-tokens-page
**Areas discussed:** Token list UI + actions

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| SOPS write + registry | Subprocess pattern, registry file location, concurrency lock. | |
| Exporter reload flow | Full Ansible redeploy vs file-mtime poll vs signal/HTTP reload endpoint. | |
| Audit log boundary | Stub events in Phase 13 (journald/JSON) and store in Phase 14, or build bun:sqlite here? | |
| Token list UI + actions | Layout, action UX, rotate semantics. | ✓ |

**Unselected areas:** resolved at Claude's Discretion based on roadmap SC, PITFALLS P-03, and Phase 12 carry-forward patterns. See CONTEXT.md D-13-06 through D-13-14.

---

## Token list UI + actions

### Q1: Primary layout for the token list on /tokens?

| Option | Description | Selected |
|--------|-------------|----------|
| Card grid | Visual dashboard; scales poorly past ~10 tokens. | |
| Table with inline bars | Dense, sortable, scales to 50+ tokens; operator-y. | ✓ |
| Hybrid: table + detail panel | Compact table + side panel on row click. | |

**User's choice:** Table with inline bars.
**Notes:** Chose the ASCII preview that included sparkline column and kebab trigger.

### Q2: How should live utilization surface on the list view?

| Option | Description | Selected |
|--------|-------------|----------|
| Always visible: bars + sparkline | Every token shows 5h + 7d bars + reset countdown + 7d sparkline inline. | ✓ |
| Always visible: bars only | 5h + 7d bars + reset; chart hidden. | |
| Expand-to-reveal | Minimal row, expand for gauges + chart. | |

**User's choice:** Always visible: bars + sparkline.
**Notes:** Dashboard feel preferred over density minimization.

### Q3: How should per-token actions be exposed?

| Option | Description | Selected |
|--------|-------------|----------|
| Kebab dropdown per row | `⋯` → DropdownMenu; reuses shadcn component from Phase 12. | ✓ |
| Inline icon buttons | Rotate/Disable/Delete buttons directly on row; visually noisy. | |
| Row-click → detail page | Row is a link; all actions on detail page. | |

**User's choice:** Kebab dropdown per row.
**Notes:** Combined with D-13-04 decision — label cell links to `/tokens/[id]` detail, kebab is mutation-only.

### Q4: What does 'rotate' mean atomically?

| Option | Description | Selected |
|--------|-------------|----------|
| Atomic swap | Single SOPS commit; old unusable immediately; brief exporter gap. | ✓ |
| Grace overlap window | Dual-poll for N seconds; complicates exporter + audit. | |
| Manual 2-step | Add new, verify, disable old via separate action. | |

**User's choice:** Atomic swap.
**Notes:** Accepts ~60s exporter reload gap in exchange for simpler exporter code and cleaner audit events.

---

## Claude's Discretion

User explicitly chose "I'm ready for context" and accepted defaults for the remaining gray areas. Defaults set:

- SOPS write pattern: `spawnSync('sops', ['--set', ...])` with in-process mutex, new file `secrets/claude-tokens.sops.yaml`.
- Exporter reload: file-mtime polling (30s interval).
- Audit log: emit JSON events to stdout/journald this phase; Phase 14 stores + renders.
- Prometheus client: server-side `fetch()`, live gauges uncached, 7d range query `next.revalidate = 60`.
- Degraded read-path: server-side `sops --decrypt` probe at page load; fallback source = exporter's decrypted read path.
- Add form: shadcn Dialog + Form + Zod v4.
- Delete confirmation: type-the-label AlertDialog; soft-delete with `deleted_at` (planner may simplify to hard delete).
- Registry schema: id, label, value, tier (pro/max/enterprise), owner_host, enabled, added_at, rotated_at?, deleted_at?, notes?.
- Exporter rebind: 100.101.0.9:9101, uid 65534 (SEC-03).

## Deferred Ideas

- Audit log storage/viewer → Phase 14.
- Soft-delete pruning cron → future phase.
- Token usage alerts → Phase 17.
- Per-token RBAC → not in v3.0.
- Exporter dual-poll during rotate → revisit if atomic-swap gap proves problematic.
