# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v3.0 — Unified Stack Migration

**Shipped:** 2026-04-21
**Phases:** 10 delivered (12, 13, 14, 15, 16, 17, 17.1, 19, 20, 22) | **Plans:** 45 | **Timeline:** 2026-04-17 → 2026-04-21 (5 days)
**Deferred:** Phase 18 (VoidNet admin), Phase 21 (Web Terminal) → v4.0

### What Was Built
- Homelab admin dashboard live at `homelab.makscee.ru` — Next.js 15.5 + React 19 + Bun runtime on mcow, Tailnet-only ingress behind Caddy + LE HTTP-01 + GitHub OAuth
- SOPS-backed Claude token CRUD with per-token live quota gauges; v2.0 exporter tech-debt retired (Tailnet-bind + uid 65534)
- `/overview` host tiles (Prometheus PromQL), `/audit` mutation log (bun:sqlite + emitAudit shim), `/alerts` Alertmanager consumer
- Read-only Proxmox ops page (CA-pinned undici, VM.Audit+Datastore.Audit token only, click-to-expand task log)
- Frontend stack upgrades: Tailwind v3.4 → v4.2 CSS-first (+ tailwind-merge 3), TypeScript 6.0.3, ESLint 10 + Node types 24
- Jellyfin migrated to dedicated LXC 101 on tower (tmpfs transcodes + RO media bindmounts + Tailscale-direct ingress via tower socat)
- ui-kit vendored at `packages/ui-kit` with `@ui-kit/*` alias; sync script re-mirrors from hub SoT
- Security launch gate: bun audit, bundle secret scan, header re-audit, self-monitoring alert rule, DNS/TLS probe, operator handoff README

### What Worked
- **Pixel-diff via Playwright MCP** on Tailwind v4 migration caught codemod false-positives (`"outline"` → `"outline-solid"` in JSX props) before they shipped
- **Auto-deviation rules** (Rule 1/3) saved full playbook restarts repeatedly — host-key acceptance, FQCN corrections, package-name fixes all applied inline
- **Scope cuts over stall** — SEC-01/SEC-11 deferred to v3.1 when Caddy rate-limit upstream was broken; Phases 18/21 deferred when launch deadline pressed. Shipped v3.0 on time
- **Short phases (1-3 plans)** for frontend stack bumps (15/16/17) — isolation made regressions obvious and rollback cheap

### What Was Inefficient
- **D-17 Jellyfin HW transcode** discovered late that tower's `/dev/dri/renderD128` is nouveau (dGPU), not Intel iGPU — iGPU BIOS-disabled. Cost one full plan + probe doc before operator chose CPU-only deferral
- **Tower ingress** shipped as iptables DNAT in Plan 17.1-04, failed WAN UAT post-merge (asymmetric routing over tailscale0), rewritten post-hoc as userspace socat. Decision rule now captured as memory
- **ROADMAP.md checkbox drift** — Phase 22 plans showed `[ ]` in ROADMAP while SUMMARYs existed on disk; STATE.md + filesystem were authoritative. Manual checkbox maintenance = pure overhead

### Patterns Established
- **Tailnet-only userspace ingress** on tower (socat services) for WAN → LXC forwarding — DNAT is asymmetric under tailscale0
- **SOPS write spikes before CRUD** — spawnSync(`sops`, ...) + Zod 4 + shadcn form compat proved out in Phase 13 first-task spike before commitment
- **Vendored ui-kit with SoT-in-hub + sync script** — no npm publish, relative imports via path alias, one-way re-mirror
- **bun:sqlite webpack externals callback interceptor** + `bun-sqlite-shim.js` — pattern for Next.js Node build worker compat
- **Per-phase VERIFICATION.md with WARN tier** for accepted-deferral items (D-17 in 17.1, SEC-01/11 in 22) — not everything needs to be FAIL-gated

### Key Lessons
1. **Trust filesystem over markdown checkboxes** — STATE.md + phase-dir contents are source of truth; `- [ ]` marks in ROADMAP.md rot
2. **Probe hardware assumptions early** — "`/dev/dri/renderD128` means Intel iGPU" was wrong on tower; a 10-minute `lspci` in the feasibility gate would have surfaced the BIOS setting before Plan 17.1-02
3. **Asymmetric routing under Tailscale** — any WAN → LXC path that answers on `tailscale0` must be userspace, not DNAT; policy-route the reply, not the request
4. **Defer, don't stall** — SEC-01 upstream outage → v3.1. Legitimate deferrals with explicit WARN checks in verify scripts keep momentum without hiding debt
5. **OAuth gate flips the CSP cost/benefit** — strict CSP on a 2-user GitHub-OAuth-gated internal panel is defense-in-depth, not a launch blocker

### Cost Observations
- Opus-heavy milestone (planning + research + complex Ansible/Next.js plumbing)
- 5-day timeline across ~10 phases — shortest milestone yet per-phase, aided by tight scope + parallel-safe stack bumps (15/16/17 ran near-sequentially but independently)

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Timeline | Key Change |
|-----------|--------|----------|------------|
| v1.0 | 4 | 2026-04-10 → 2026-04-15 (6d) | Initial IaC foundation + SOPS + monitoring |
| v2.0 | 3 delivered + 4 pivoted | 2026-04-15 → 2026-04-16 (2d) | Short feasibility-gated milestone; pivot discipline |
| v3.0 | 10 delivered + 2 deferred | 2026-04-17 → 2026-04-21 (5d) | Unified Next.js stack; vendored ui-kit; Playwright MCP UAT standard; scope-cut to ship |

### Top Lessons (Verified Across Milestones)

1. **Short feedback-loop phases ship** (v1.0, v2.0, v3.0) — 1-3 plan phases verify cleanly; 5+ plan phases drift
2. **Operational evidence > formal soak** (v2.0 D-07, v3.0 17.1 CPU-only signoff) — if production is already answering, short-circuit the ceremony
3. **SOPS + Ansible decrypt-on-controller** is the stable secrets pattern — no raw secrets on hosts, one include pattern reused across phases
4. **Tailscale is the security boundary** — public DNS + Tailnet-only ACL lets LE HTTP-01 work while keeping the surface private
