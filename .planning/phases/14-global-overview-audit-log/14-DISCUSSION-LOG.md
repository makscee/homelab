# Phase 14: Global Overview + Audit Log - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 14-global-overview-audit-log
**Areas discussed:** node-exporter provisioning, host tile density, audit viewer scope, audit storage + retention, alert count source, stale/error UX, Claude usage summary shape

---

## 1. node-exporter provisioning

| Option | Description | Selected |
|--------|-------------|----------|
| A | Provision node-exporter + cAdvisor via Ansible on all 6 hosts as part of Phase 14 | ✓ |
| B | Scope to already-instrumented hosts (docker-tower, mcow) with placeholders for rest | |
| C | Split 14a (provisioning) / 14b (UI) | |

**User's choice:** A
**Notes:** SC-1 requires live data on all 6 tiles. ~30 line Ansible role. cAdvisor only where Docker runs.

---

## 2. Host tile density

| Option | Description | Selected |
|--------|-------------|----------|
| A | Minimal: hostname + 3 bars + container count | |
| B | Rich: hostname + role + CPU/mem/disk + uptime + load + net sparkline + container count | ✓ |
| C | Glanceable + expandable drawer to `/hosts/[name]` | |

**User's choice:** B
**Notes:** Followed with layout choice — `md:grid-cols-2 xl:grid-cols-3` (2×3 on desktop, 3×2 on wide).

---

## 3. Audit viewer scope

| Option | Description | Selected |
|--------|-------------|----------|
| A | Defer viewer entirely (sqlite CLI) | |
| B | Minimal `/audit` paginated table, no filters | ✓ |
| C | Rich viewer with filters + diff view | |

**User's choice:** B
**Notes:** Rich filters deferred to Phase 19.

---

## 4. Audit log storage + retention

| Option | Description | Selected |
|--------|-------------|----------|
| A | Monorepo-local `apps/admin/data/audit.db` | |
| B | Host path `/var/lib/homelab-admin/audit.db` mounted into container | ✓ |

**User's choice:** B
**Notes:** Append-only, keep forever, `bun:sqlite`. Schema with `id, created_at, user, action, target, payload_json, ip` + indexes on created_at DESC and user.

---

## 5. Alert count source

| Option | Description | Selected |
|--------|-------------|----------|
| A | Prometheus `ALERTS` metric now, swap to Alertmanager in Phase 17 | ✓ |
| B | Placeholder until Phase 17 | |
| C | Alertmanager API now (but no rules deployed yet) | |

**User's choice:** A
**Notes:** Swap localized to server module; UI shape unchanged.

---

## 6. Stale/error UX

| Option | Description | Selected |
|--------|-------------|----------|
| A | Per-card stale dot only | |
| B | Page banner only | |
| C | Both — per-card dot + page banner on full outage | ✓ |

**User's choice:** C
**Notes:** 90s stale threshold (3× refresh). Green <90s, yellow 90-300s, red >300s or error. Banner only when Prometheus HTTP itself fails. Last known values retained during outage.

---

## 7. Claude usage summary shape

| Option | Description | Selected |
|--------|-------------|----------|
| A | Inline per-token cards (label + 5h + 7d bars) | ✓ |
| B | Aggregated single card with max utilization + count | |
| C | Hybrid: aggregated + hot (>80%) list | |

**User's choice:** A
**Notes:** Works while N tokens stays small (current N=2). Revisit hybrid at >4-5 tokens.

---

## Claude's Discretion

- Tile CSS / spacing — follow Phase 13 card rhythm
- Sparkline library — reuse Recharts
- Loading skeletons — reuse Phase 13 shadcn skeletons
- Error boundary placement — Next.js conventions

## Deferred Ideas

- Rich audit filters → Phase 19
- `/hosts/[name]` detail route → future phase
- Audit rotation/archival → when DB > 1 GB
- Aggregated Claude usage card → if tokens > 4-5
