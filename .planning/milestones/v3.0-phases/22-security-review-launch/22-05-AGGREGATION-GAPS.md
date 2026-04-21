# Phase 22 Aggregation Gaps

D-22-13 scope: Phases **12, 13, 14, 17.1, 19, 20**. This file lists which of
those have an on-disk SECURITY.md and which do not, so the operator can decide
whether to flip the v3.0 launch bit now (with the gaps accepted as technical
debt) or block launch on backfill.

| Phase                    | SECURITY.md present? | Action                                                                    |
| ------------------------ | -------------------- | ------------------------------------------------------------------------- |
| 12 infra-foundation      | NO                   | Operator: run `/gsd-secure-phase 12` post-launch to backfill              |
| 13 claude-tokens-page    | NO                   | Operator: run `/gsd-secure-phase 13` post-launch to backfill              |
| 14 observability-audit   | NO                   | Operator: run `/gsd-secure-phase 14` post-launch to backfill              |
| 17.1 jellyfin-migrate    | YES                  | Linked in `.planning/milestones/v3.0-SECURITY.md` (result: SECURED)       |
| 19 proxmox-readonly      | YES                  | Linked in `.planning/milestones/v3.0-SECURITY.md` (15 threats all closed) |
| 20 alerts-panel          | YES                  | Linked in `.planning/milestones/v3.0-SECURITY.md` (18/18 closed)          |

**Not backfilled by this plan.** Phase 22 is not authorised to synthesize
retrospective threat models for phases that never had one — that would be
false assurance. The 3 gap phases (12, 13, 14) shipped before the
`/gsd-secure-phase` gate was introduced in the GSD workflow.

**Operator decision required at launch:**

1. Flip v3.0 launch bit WITH the three gap rows (i.e. accept the backfill as
   v3.x scheduled work), OR
2. Block v3.0 launch on completing `/gsd-secure-phase 12/13/14` first.

Recommendation (planner): option 1. Phases 12–14 predate the gate and their
security posture is covered indirectly by:

- Phase 12: covered by 17.1 + 19 + 20 ingress / auth reviews (same code path).
- Phase 13: SOPS+zod secret pipeline threat-modeled in the 13-01-spike notes
  and 19-SECURITY (`T-19-01`, `T-19-05`, `T-19-07`).
- Phase 14: observability read-only surface — no mutating endpoints; same
  auth middleware gate verified in D-22-11 (header-spoofing test).

That indirect coverage is NOT a substitute for a dedicated SECURITY.md;
therefore these rows are flagged as **GAP** in the aggregation, not masked.
