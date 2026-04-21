# Milestones

## v3.0 Unified Stack Migration (Shipped: 2026-04-21)

**Phases completed:** 10 phases, 39 plans, 22 tasks

**Key accomplishments:**

- One-liner:
- Task 1 — group_vars/all.yml extended (commit 90636ac)
- One-liner:
- next-auth version resolved:
- One-liner:
- One-liner:
- One-liner:
- SOPS-encrypted homelab_admin OAuth block added to mcow.sops.yaml + Ansible task include that decrypts on controller and renders /etc/homelab-admin/env with mode 0600
- 1. [Rule 1 - Bug] blockinfile FQCN corrected from community.general to ansible.builtin
- Ansible playbook deployed homelab-admin to mcow at homelab.makscee.ru; all 5 ROADMAP Phase 12 success criteria captured as evidence and verified GREEN in 12-VERIFICATION.md
- 1. [Rule 3 — Blocking] `server-only` sentinel module throws in bun test runner
- None — spec executed as written.
- 1. [Rule 3 — Blocking] Pre-existing `server-only` ESLint rule flagged `.server.test.ts` files
- 1. [Rule 1 — Bug] Sparkline Tooltip formatter type mismatch in recharts v3
- 1. [Rule 3 — Blocking] shadcn Textarea not installed from Plan 13-01
- node_exporter playbook extended to all 6 Tailnet hosts + cAdvisor playbook created for docker-tower/mcow, both binding exclusively to Tailscale IPs; Prometheus file_sd targets updated with hostname labels
- Task 1 — redactPayload() (TDD)
- Task 1 — /audit RSC page + AuditTable + PayloadCell (TDD)
- 1. [Rule 3 — Blocking] `import "server-only"` moved out of `route.ts`
- Fixed /audit digest crash by proxying native bun:sqlite through the shim under Bun runtime and forcing `next start` to run under Bun via systemd `--bun` flag.
- Overview host tiles now populate with live CPU/Mem/Disk/Uptime/Load/Containers from Prometheus via a two-sided fix: code default flipped to docker-tower:9090, and ansible renders PROMETHEUS_URL into /etc/homelab-admin/env on mcow.
- apps/admin upgraded from Tailwind 3.4 → 4.2 via CSS-first config, autoprefixer removed, shadcn primitives pixel-verified via Playwright against prod v3 baseline.
- tailwind-merge bumped to ^3.0.0 paired with Tailwind v4.2 — single-file dep upgrade, zero code changes, Playwright-verified pixel-identical on prod.
- 1. [Rule 1 - Bug] TS2882 on CSS side-effect import
- 1. [Rule 3 - P-1 fallback] eslint-plugin-server-only crashed on ESLint 10
- One-liner:
- One-liner:
- 1. [Rule 3 - Blocking] Plan assumed vainfo would report iHD/Intel — it reports nouveau
- Not needed.
- One-liner:
- 1. [Rule 3 - Blocking] Ansible rule deploy blocked by pre-existing /opt/homelab drift
- 1. [Rule 3 — Blocking] `yq` not installed on operator machine
- 1. [Decision 2] Admin migration skipped (Tasks 3 and 4 of original plan)
- 1. [Rule 1 - Bug] Tailnet ingress probe URL
- 1. [Rule 1 – Bug] Prometheus scrape parse error on JSON body.

---

## v1.0 — Homelab Infrastructure-as-Code

**Shipped:** 2026-04-15
**Phases:** 4 (foundations, service-documentation, health-monitoring, operator-dashboard)
**Plans:** 18
**Requirements:** 18/18 satisfied (SVC-06 invalidated, DR-01..04 deferred to v2)
**Git Range:** `7b643b1` → `9ac1956` (6 days, 116 commits, 190 files, +44,833 / -2)
**Tag:** `v1.0`

### Delivered

Any server's full stack is reproducible from this repo alone. 6/6 Tailnet hosts monitored via Prometheus + node-exporter; operator overview dashboard on mcow; Telegram alert delivery proven end-to-end.

### Key Accomplishments

1. **SOPS + age secrets foundation** with hardened .gitignore (Phase 01).
2. **Full service reproducibility** — Docker Compose + LXC configs + AmneziaWG + Tailscale provisioning (Phase 02).
3. **Monitoring stack** — Prometheus + Alertmanager + cAdvisor + Grafana + node-exporter across all hosts with healthcheck CLI (Phase 03).
4. **Operator plane on mcow** — Grafana 12.3.1 + Alertmanager migrated; overview dashboard pinned as home (Phase 04-01/02).
5. **Alert pipeline proven E2E** — real rule fire → Telegram delivery via `@void_homelab_bot`; App Connector fallback for IPv4 egress (Phase 04-03).
6. **6/6 host monitoring coverage** — animaya-dev unblocked via `pct exec` (Phase 04-04).

### Audit

`tech_debt` (non-blocking). All requirements satisfied with E2E integration evidence. See `.planning/v1.0-MILESTONE-AUDIT.md`.

### Known Tech Debt (carried forward)

- DiskUsageCritical persistent on tower + docker-tower (root cause outstanding).
- Phase 01 + 02 VALIDATION.md status: draft (pre-Nyquist framework).
- Phase 03 missing VERIFICATION.md (procedural).
- nether secrets cleanup — `GF_SECURITY_ADMIN_*` unreferenced post-decommission.
- docker-tower volume + stale compose path cleanup scheduled 2026-04-22.
- D-06 ADR update pending.

### Archives

- `.planning/milestones/v1.0-ROADMAP.md` — full phase details
- `.planning/milestones/v1.0-REQUIREMENTS.md` — requirements with outcomes
- `.planning/v1.0-MILESTONE-AUDIT.md` — audit report

---

## v2.0 — Claude Code Usage Monitor

**Closed with pivot:** 2026-04-16
**Phases:** 7 scoped (05-11), 3 shipped (05 formal + 06-07 operational), 4 pivoted into v3.0 (08 superseded, 09 moved, 10 killed, 11 absorbed)
**Tag:** `v2.0`

### Delivered (operational)

1. **Feasibility gate formally passed** — ADR D-07 locked (Claude Code quota access via OAuth endpoint) with GATE-PASSED evidence.
2. **Python Claude-usage exporter** running as systemd on mcow:9101 — per-token gauges for weekly/session utilization live since 2026-04-16.
3. **Prometheus scraping operational** — docker-tower Prometheus `up{job="claude-usage"}==1`; metrics flowing into TSDB.
4. **2 real tokens live** — personal + worker LXC tokens emitting distinct label series (Phase 11 scale-out achieved operationally before formal plan).

### Why the pivot

Mid-Phase-05 realization: (1) feasibility already proven by ad-hoc production exporter; (2) a custom Next.js admin dashboard covering VoidNet + Animaya + homelab in one UI is higher-value than Grafana-only; (3) unifying all 3 projects on one TypeScript stack accelerates AI-agent development.

### Tech Debt (carried forward / resolved in v3.0)

- Exporter ran as root (should be uid 65534) → **resolved v3.0 Phase 13-02**
- Exporter bound 0.0.0.0:9101 (should be 100.101.0.9:9101) → **resolved v3.0 Phase 13-02**
- `promtool check metrics` never run against prod
- Prometheus scrape config not captured in repo
- 429 backoff never load-tested (0% 429 in prod so far)

### Archives

- `.planning/milestones/v2.0-ROADMAP.md` — full phase dispositions
- `.planning/milestones/v2.0-REQUIREMENTS.md` — requirement carry-forward map
- `.planning/milestones/v2.0-MILESTONE-CLOSE.md` — close memo

---
