# Phase 12: Infra Foundation - Discussion Log

> **Audit trail only.** Not consumed by downstream agents. CONTEXT.md is the canonical artifact.

**Date:** 2026-04-17
**Phase:** 12-infra-foundation
**Mode:** Operator delegated to Claude's discretion ("use your discretion and let's go straight to plan")
**Areas discussed:** None interactively — all gray areas resolved by Claude using defaults grounded in PROJECT.md / REQUIREMENTS.md / research.

---

## Gray Areas Identified (not interactively discussed)

Claude analyzed the phase and identified 4-6 gray areas worth discussing. Operator declined the interactive questioning and delegated all calls. Areas + Claude's picks below:

### App Binding
**Options considered:**
| Option | Pros | Cons |
|--------|------|------|
| Unix socket at `/run/homelab-admin/app.sock` | Filesystem-perm isolation; no port management | Next.js stock `bun run start` binds TCP; custom server needed |
| `127.0.0.1:3847` (loopback TCP, non-3000 port) ✓ | Stock Next.js works; Caddy reverse_proxy trivial | Relies on mcow service-user isolation for process boundary |
| `127.0.0.1:3000` | Simplest Next.js default | **Violates INFRA-02** (Docker owns 3000) |

**Claude's pick:** 127.0.0.1:3847. Rationale: stock Next.js standalone build, adequate isolation given Caddy front + Tailscale ACL + limited service users on mcow. Unix socket deferred — revisit in Phase 18 if custom WS server needs it.

### Auth Details (OAuth app, allowlist, session)
**Decisions made:**
- OAuth app: single app for prod (homelab.makscee.ru callback); optional second for dev
- Allowlist: env var `HOMELAB_ADMIN_ALLOWED_GITHUB_LOGINS` loaded from `/etc/homelab-admin/env` (Ansible-decrypted from SOPS)
- Session: JWT (stateless), 8h TTL, rolling refresh; HttpOnly+Secure+Lax cookies
- Callback URL: `https://homelab.makscee.ru/api/auth/callback/github`

**Rationale:** JWT avoids DB in Phase 12 (DB arrives in Phase 14 with audit log). One-operator allowlist doesn't need per-session revocation granularity — AUTH_SECRET rotation suffices. SEC-06/SEC-07 satisfied by Auth.js v5 defaults + cookie config.

### Caddy Site Block Strategy
**Options considered:**
| Option | Pros | Cons |
|--------|------|------|
| Ansible `blockinfile` patch ✓ | Additive; doesn't own whole Caddyfile; idempotent | Relies on marker comments for re-apply |
| Template full Caddyfile | Deterministic | Requires capturing existing vibe.makscee.ru + other blocks into repo |
| Manual edit on mcow | Fastest | Non-idempotent, violates operator=Claude constraint |

**Claude's pick:** Ansible `blockinfile` with `# BEGIN homelab-admin` / `# END homelab-admin` markers. Reason: least-risky for shared /etc/caddy/Caddyfile that already has vibe.makscee.ru + likely other host-managed config.

### Base Layout Scope
**Options considered:**
| Option | Pros | Cons |
|--------|------|------|
| All 8 downstream routes stubbed ✓ | Visual nav proof; catches routing bugs now; downstream phases just fill content | 8 one-liner placeholder components as "dead code" until filled |
| Minimal: `/` + `/login` + `/403` only | Lean, no unused code | Sidebar nav validation deferred; each later phase touches nav+routing |

**Claude's pick:** Stub all 8 routes. Rationale: sidebar nav is part of Phase 12's UI-03 deliverable; stubs prove it visually and lock route structure so Phases 13-18 can't drift.

### Repo Structure
**Options considered:** Bun workspaces `apps/*` at root vs single-app repo (Next.js at root).

**Claude's pick:** Bun workspaces with `apps/admin/`. Rationale: REQUIREMENTS.md says `apps/admin/` (monorepo shape). Forward-compat for future apps. Single-app today, zero-cost forward-design.

### Not Discussed (planner decides)
- Exact Bun version pin
- Exact Next.js 15.x patch level (≥15.2.4)
- Systemd hardening flag set (conditional on LXC privilege discovery)
- CSP directive values
- Initial shadcn component set beyond Button/Card/Avatar/DropdownMenu

## Deferred Ideas
See CONTEXT.md §deferred. Notably: ui-kit extraction (Phase 19), audit log + DB (Phase 14), rate limiting (Phase 19), light/dark toggle (future).

## Scope Creep Redirected
None — operator chose straight-to-plan without surfacing ideas.
