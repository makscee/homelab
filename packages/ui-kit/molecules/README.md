# ui-kit Molecules — Contract API (v3.1+)

These molecules (`HostTile`, `AlertCard`, `AuditRow`, `NavAlertBadge`) define the
**contract API** for future consumers of the shared ui-kit — primarily animaya
and voidnet. Phase 22-04 establishes the contracts; it does not migrate
homelab-admin to them.

## Why homelab-admin did NOT adopt these molecules

Decision recorded 2026-04-21 by operator (Phase 22-04, Decision 2):

homelab-admin already ships richer equivalents:

| ui-kit molecule  | admin component                                    | Why admin kept its own                                                  |
| ---------------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| `HostTile`       | `apps/admin/components/overview/HostCard.tsx`      | Richer status states, inline metrics, LXC sub-rows                      |
| `AlertCard`      | `apps/admin/components/alerts/AlertsTable.tsx`     | Tabular multi-row view with ack/silence actions, severity coloring      |
| `AuditRow`       | `apps/admin/components/audit/AuditTable.tsx`       | Pagination, column sort, actor/action grouping                          |
| `NavAlertBadge`  | admin nav badge (inline)                           | Already wired to admin's alert-count API; 1:1 swap offered no benefit   |

Regressing admin to the generic contracts would have removed features the
dashboards rely on, with no upside. The contracts remain as the target shape
for **new** consumers.

## Contract semantics (for implementers)

- **HostTile** — render a single host's status + key metrics. Square-ish card.
- **AlertCard** — single alert rendering: severity, title, timestamp, actions.
- **AuditRow** — single audit log entry: actor, action, target, timestamp.
- **NavAlertBadge** — nav-bar pill showing unacked alert count + severity tint.

See each `.tsx` for typed props. Tokens come from
`packages/ui-kit/tokens/tokens.css` (must be imported before tailwindcss in the
consuming app's globals.css, as documented in the root `README.md`).

## Hub is SoT

Canonical source is `~/hub/knowledge/standards/ui-kit/`. This directory is a
vendored mirror (see `../.sync-from-hub`). To update: edit in hub, then run
`scripts/sync-ui-kit.sh` from homelab root.
