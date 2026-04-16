---
milestone: v2.0
name: Claude Code Usage Monitor
status: closed-with-pivot
closed_date: 2026-04-16
successor: v3.0 Unified Stack Migration
---

# v2.0 Milestone Close

## Summary

v2.0 was originally scoped as 7 phases (05-11) to build a Prometheus-based Claude Code usage monitor with Grafana dashboard. Phases 05-07 completed (05 formally, 06-07 operationally). Phases 08-11 are pivoted into v3.0 — a unified TypeScript/Next.js stack migration that absorbs the remaining monitoring scope plus VoidNet + Animaya frontend migrations.

## Phase dispositions

| Phase | Original scope | Disposition |
|-------|----------------|-------------|
| 05 Feasibility Gate | Go/no-go spike on `/api/oauth/usage` | **COMPLETE (formal)** — GATE-PASSED on operational evidence, ADR D-07 recorded |
| 06 Exporter Skeleton | Python exporter container on mcow | **COMPLETE (operational)** — exporter runs as systemd service on mcow:9101; tech-debt flagged for v3.0 |
| 07 Prometheus Wiring | docker-tower scrapes exporter | **COMPLETE (operational)** — Prometheus scraping successfully; tech-debt flagged |
| 08 SOPS Token Registry | Encrypted token registry + Ansible deploy | **SUPERSEDED** — absorbed into v3.0 Claude Tokens page (UI + backend) |
| 09 Alerts | Weekly/session threshold alerts via Telegram | **MOVED** — becomes v3.0 Phase 12 |
| 10 Grafana Dashboard | Provisioned Grafana dashboard | **KILLED** — replaced by v3.0 Next.js Claude Tokens page |
| 11 Multi-token Scale-out | 2-5 tokens running in prod | **ABSORBED** — achieved operationally (2 tokens live); token CRUD in v3.0 becomes the scale-out path |

## Why the pivot

Operator realized mid-Phase-05 that:
1. Feasibility was already proven by production exporter running ad-hoc outside GSD
2. A custom Next.js dashboard (with admin features for VoidNet + Animaya + homelab in one UI) is more valuable than a Grafana-only solution
3. Unifying all 3 projects on one TypeScript stack unblocks much faster AI-agent development going forward

## Tech debt carried to v3.0

From Phase 06/07 operational short-circuits:
- Exporter runs as root (should be uid 65534)
- Exporter binds 0.0.0.0:9101 (should be 100.101.0.9:9101)
- `promtool check metrics` never run against production `/metrics`
- Prometheus scrape config not captured in repo
- Exponential backoff on 429 never load-tested (0% 429 in prod so far)

Fix during v3.0 Phase 5 (Claude Tokens page migration) — exporter gets reworked into the monorepo.

## Artifacts preserved

- `.planning/phases/05-feasibility-gate/` — full phase (PLANs + SUMMARYs + GATE-PASSED.md + evidence/)
- `.planning/phases/06-exporter-skeleton/06-SUMMARY-OPERATIONAL.md` — evidence snapshot
- `.planning/phases/07-prometheus-wiring/07-SUMMARY-OPERATIONAL.md` — evidence snapshot
- ADR D-07 (Claude Code quota access strategy) in `.planning/PROJECT.md` Key Decisions — **stays validated**

## Next

Open v3.0 via `/gsd-new-milestone`.
