# Phase 22 — Discussion Log

**Date:** 2026-04-21
**Mode:** fast — user directive "finish it quick, only work on necessary stuff"

## Locked inputs (user)

- **ui-kit target location:** `/Users/admin/hub/knowledge/standards/` — `ui-style-spec.md` already lives there
- **A (consumption mechanism):** relative imports across `hub/` filesystem. No package, submodule, or publish step.
- **B (scope):** full kit — tokens + shadcn primitives + homelab-specific molecules (HostTile, AlertCard, AuditRow, NavAlertBadge)
- **C (security review surface):** Claude's discretion
- **D (launch checklist surface):** Claude's discretion

## Gray areas resolved by Claude

- **Directory layout:** `tokens/`, `primitives/`, `molecules/`, barrel `index.ts` per subfolder (D-22-04)
- **Versioning:** none — shared source, not a package (D-22-05)
- **Security review scope:** SEC-01 Caddy rate limit + audit hygiene + header re-audit + Proxmox token scope verify + header-spoofing integration test + Tailnet-only ingress test + cross-phase SECURITY aggregation (D-22-06..13)
- **Launch checklist:** SQLite backup/restore drill, runbook, rollback doc, admin-on-admin monitoring, DNS/TLS check, operator README handoff (D-22-14..19)

## Explicitly deferred

- SOPS key rotation drill, full pen-test, SEC-09 (fail2ban), SEC-10 (at-rest encryption) — out of v3.0
- Phase 18 (VoidNet) + Phase 21 (Web Terminal) — deferred to v4.0 (milestone scope cut 2026-04-21)
- ui-kit npm/bun publishing — not needed while consumers live in same `hub/` tree
- Formal SLOs / error budgets — single-operator tool

## Rounds

1. Locked inputs captured → gray areas (A/B/C/D) presented → user responded `A:a, B:c, C+D: you decide, finish quick` → CONTEXT.md written in single pass.
