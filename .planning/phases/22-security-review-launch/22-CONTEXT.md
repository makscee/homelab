# Phase 22: Security Review + Launch — Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Final v3.0 ship gate. Three tracks, all mandatory:

1. **Security review** (SEC-08) — prove the dashboard is safe for ongoing operator use before flipping the "launched" bit.
2. **Shared ui-kit extraction** (UI-01, UI-02) — move reusable UI out of `apps/admin` into `/Users/admin/hub/knowledge/standards/` so `animaya`, `voidnet`, and future apps consume the same primitives.
3. **Launch checklist** — backup/restore drill, runbook docs, rollback procedure, self-monitoring, DNS/TLS verification.

**Out of scope:** Phase 18 (VoidNet) and Phase 21 (Web Terminal) are deferred to v4.0. SEC-09 (fail2ban) and SEC-10 (at-rest encryption) remain deferred.

</domain>

<decisions>
## Implementation Decisions

### ui-kit extraction

- **D-22-01:** Target location = `/Users/admin/hub/knowledge/standards/` (shared across all hub workspaces; `ui-style-spec.md` already lives there)
- **D-22-02:** Consumption mechanism = relative imports across `hub/` filesystem. No local npm/bun package, no submodule, no publish step. Consumers reference files directly via relative path (e.g. `apps/admin` imports from `../../../knowledge/standards/ui-kit/...`)
- **D-22-03:** Scope = full kit. Tokens (colors, spacing, type scale) + shadcn primitives currently used by admin (Button, Card, Input, Table, Badge, Dialog, Select, Toast) + homelab-specific molecules (HostTile, AlertCard, AuditRow, NavAlertBadge). Admin will import everything from `knowledge/standards/ui-kit/` after extraction
- **D-22-04:** Directory layout inside `knowledge/standards/ui-kit/`: `tokens/` (CSS custom properties, Tailwind theme), `primitives/` (shadcn-style leaves), `molecules/` (composite components), `index.ts` barrel per subfolder. Follow `ui-style-spec.md` and `frontend-stack-spec.md` already in `knowledge/standards/`
- **D-22-05:** No versioning, no changelog, no build step. This is shared source, not a package. Breakage risk is managed by tests in consuming apps

### Security review (SEC-08 surface)

Claude's discretion — locked surface:

- **D-22-06:** SEC-01 (Caddy per-IP rate limit on auth routes — 60 req/min) — new implementation work
- **D-22-07:** `bun audit` clean, `npm audit` clean for any transitive Node deps
- **D-22-08:** Bundle scan for secret leakage (grep final `.next/` build for every SOPS-backed env var name + known token prefixes)
- **D-22-09:** Header re-audit against deployed `homelab.makscee.ru`: CSP strict (no `unsafe-inline`), HSTS preload-ready, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`
- **D-22-10:** Proxmox token scope re-verify: `VM.Audit+Datastore.Audit` only; no `VM.PowerMgmt` (locks Phase 19 D-03)
- **D-22-11:** Header-spoofing integration test: send forged `X-Tailscale-User` / `X-Forwarded-User` headers directly to admin — MUST 401 (GitHub OAuth is the only identity source)
- **D-22-12:** Tailnet-only ingress verification: curl from WAN → 403/timeout; curl from Tailnet → 200
- **D-22-13:** Cross-phase SECURITY aggregation: produce a single `v3.0-SECURITY.md` under `.planning/milestones/` summarising per-phase SECURITY.md verdicts (Phases 12, 13, 14, 17.1, 19, 20)

**Excluded from v3.0 review:** SOPS key rotation drill (adds ops risk, not required to ship), full pen-test (deferred to v3.x if ever)

### Launch checklist

Claude's discretion — locked surface:

- **D-22-14:** SQLite backup/restore drill — dump `/var/lib/homelab-admin/audit.db`, restore to a scratch path, verify `SELECT COUNT(*)` matches. Cron the backup
- **D-22-15:** Runbook under `.planning/milestones/v3.0-RUNBOOK.md`: deploy procedure, secret rotation, Caddy reload, Auth.js session reset, exporter restart, common failure modes
- **D-22-16:** Rollback procedure = `ansible-playbook deploy-homelab-admin.yml -e ref=<prev-sha>`. Document in runbook; no automated rollback tooling
- **D-22-17:** Admin-on-admin monitoring: Prometheus scrape `homelab-admin.service` up/down; alert on down > 2m. Surface in `/alerts`
- **D-22-18:** DNS/TLS validity check: `curl -vI https://homelab.makscee.ru` cert chain + expiry > 30d; automate in launch script
- **D-22-19:** Operator handoff: update `apps/admin/README.md` with "how to use", link runbook

**Excluded:** Formal SLOs/error budgets (single-operator tool, not required)

### Claude's Discretion

- Specific script locations, test framework choices for integration tests, ansible role layout — planner decides based on existing patterns
- Whether SEC-08 items run as CI checks, pre-deploy scripts, or one-shot playbooks — planner decides

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### UI / Frontend standards
- `/Users/admin/hub/knowledge/standards/ui-style-spec.md` — locked UI style contract (spacing, typography, color, component patterns). ui-kit extraction MUST conform
- `/Users/admin/hub/knowledge/standards/frontend-stack-spec.md` — locked frontend stack (Next.js 15, Bun, Tailwind v4, tailwind-merge 3, shadcn primitives)

### Requirements + roadmap
- `.planning/REQUIREMENTS.md` §SEC, §UI — UI-01, UI-02, SEC-01, SEC-08 definitions
- `.planning/ROADMAP.md` §Phase 22 — goal statement and dependency notes

### Prior security artefacts (aggregate in D-22-13)
- `.planning/phases/20-alerts-panel-rules/20-SECURITY.md` — 18/18 closed (verified 2026-04-21)
- Per-phase SECURITY.md for 12/13/14/17.1/19 — confirm presence during aggregation; generate if missing via `/gsd-secure-phase`

### Operational context
- `/Users/admin/hub/workspace/homelab/CLAUDE.md` — infrastructure map (Tailnet IPs, hostnames)
- `servers/mcow/` — mcow KVM + hardened systemd unit context (Phase 12-07)
- `ansible/playbooks/deploy-homelab-admin.yml` — canonical deploy entrypoint (referenced by rollback D-22-16)

### Auth + routing
- `apps/admin/src/app/api/auth/[...nextauth]/route.ts` — GitHub OAuth (Auth.js v5) — target of SEC-01 rate limit
- `servers/mcow/caddy/` — Caddy site block for `homelab.makscee.ru`, target of SEC-01

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets (ui-kit extraction candidates)
- `apps/admin/src/components/ui/*` — shadcn primitives (Button, Card, Input, Table, Badge, Dialog, Select, Toast). Direct copy → `knowledge/standards/ui-kit/primitives/`
- `apps/admin/src/components/HostTile.tsx`, `AlertCard.tsx`, `AuditRow.tsx`, `NavAlertBadge.tsx` — homelab-specific molecules. Move to `knowledge/standards/ui-kit/molecules/`
- `apps/admin/src/app/globals.css` — Tailwind v4 `@theme inline` + design tokens. Split tokens into `knowledge/standards/ui-kit/tokens/`
- `apps/admin/lib/utils.ts` — single `cn()` call site using tailwind-merge 3

### Established patterns to preserve
- Tailwind v4 CSS-first config with `@theme inline` + `@custom-variant dark` (Phase 15-01)
- `import "server-only"` guard on server-only modules
- Zod on every Route Handler input (SEC-05)
- `emitAudit()` wrapping on every mutation route (Phase 14)

### Integration points
- Caddy site block `servers/mcow/caddy/Caddyfile` — SEC-01 rate limit plugin site
- `ansible/playbooks/deploy-homelab-admin.yml` — launch script hook
- Prometheus `ansible/roles/prometheus/files/rules/` — admin-on-admin alert rule (D-22-17) lands here

</code_context>

<specifics>
## Specific Ideas

- ui-kit import path from `apps/admin/src/`: `../../../knowledge/standards/ui-kit/primitives/button`. Use TS path aliases in `tsconfig.json` to shorten to `@ui-kit/*`
- Header-spoofing test can use existing vitest/playwright harness; no new framework needed
- Bundle secret-leak scan = `rg -n "$SOPS_SECRET_PATTERN" apps/admin/.next/` after `bun run build` in a CI-style script

</specifics>

<deferred>
## Deferred Ideas

- SOPS key rotation drill — out of v3.0 scope (adds ops risk without shipping value)
- Formal SLOs / error budgets — single-operator tool; revisit if shared
- Full pen-test — v3.x if ever
- SEC-09 (fail2ban at Caddy), SEC-10 (at-rest encryption for in-app secrets) — remain deferred per REQUIREMENTS.md
- ui-kit publishing to npm/bun registry — not needed while consumers live in same `hub/` tree
- Phase 18 (VoidNet), Phase 21 (Web Terminal) — deferred to v4.0 (milestone scope cut 2026-04-21)

</deferred>

---

*Phase: 22-security-review-launch*
*Context gathered: 2026-04-21*
