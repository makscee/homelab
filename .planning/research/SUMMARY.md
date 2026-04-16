# v3.0 Research Summary

Synthesis of STACK.md + FEATURES.md + ARCHITECTURE.md + PITFALLS.md for v3.0 Unified Stack Migration (homelab admin dashboard scope).

## Executive Summary

The v3.0 homelab admin dashboard is an **ops-focused, mutation-capable internal tool** — not a visualization dashboard. It proxies writes to four backend systems (SOPS registry, VoidNet API, Proxmox REST API, Alertmanager) and reads from two metric sources (Prometheus, claude-usage-exporter). No equivalent self-hosted tool (Grafana, Homarr, Beszel) covers this combination, justifying a custom build.

Stack is fully locked: **Bun + Next.js 15 + React 19 + TypeScript + Tailwind + shadcn/ui + Caddy**, with `bun:sqlite` + Drizzle for the audit log. Recommended build order is dependency-driven: infrastructure (OS user, Caddy, DNS-01 TLS, Tailscale nginx-auth socket) must land before a single authenticated page works.

## Stack (Bun-Native)

| Layer | Package | Version | Rationale |
|-------|---------|---------|-----------|
| Runtime | Bun | latest stable 2026-04 | native TS, integrated test runner |
| Framework | Next.js | 15.2.4 (pinned CVE-2025-66478 patched) | App Router, RSC, Turbopack |
| UI | React 19.2.5 + shadcn/ui + Tailwind | — | owned-source components AI edits directly |
| DB | Drizzle + bun:sqlite | 0.45.2 | avoid better-sqlite3 native build breakage |
| Charts | Recharts | 3.8.1 | shadcn blocks built on Recharts |
| Telegram | grammY | 1.42.0 | Bun-native, HTTP-only for alerts |
| Validation | Zod | pin 3.24.x | Zod 4 + shadcn forms needs spike |
| Proxy/TLS | Caddy + caddy-dns/cloudflare | xcaddy build | single binary, DNS-01 native |
| Prometheus query | raw fetch + PromQL | — | prometheus-query npm unverified on Bun |
| SSH | ssh2 (npm) | — | fallback if node-pty LXC spike fails |
| Web terminal | xterm.js + ssh2/node-pty | — | see P-04 spike |
| SOPS writes | spawnSync('sops', ...) | CLI subprocess | sops-age npm is decrypt-only |

## Feature Table Stakes (v3.0 must-have)

**Global Overview** — host stats (CPU/mem/disk/containers) + Claude usage summary + alert count + 30s SWR refresh

**Claude Tokens** (absorbs v2.0 Phase 08+11) — SOPS registry CRUD + per-token gauges + add/rotate/delete/rename + masked password UX (mirror VoidNet)

**VoidNet Management** (proxies voidnet-api) — user list + credits adjust + ban/unban + rename + box list w/ ssh+password (masked) + re-provision

**Proxmox Ops** — LXC list + start/`/shutdown` (graceful default) / restart + info panel + token rotation flow

**Cross-cutting:** audit log (SQLite row per mutation + viewer) + Tailscale identity auth + read-only Alertmanager consumer

## Differentiators (if time)

xterm.js web terminal for SSH-in (XL, last phase), in-UI token rotation, per-box live Claude logs, settings page

## Anti-features (explicitly OUT)

Grafana-equivalent ad-hoc query builder, multi-tenant roles, backup mgmt, VoidNet portal features

## Critical Path Build Order

```
[Phase 1: Infra Foundation]       blocks everything
    OS user, Caddy xcaddy, LE DNS-01, nginx-auth socket,
    Next.js scaffold 127.0.0.1, middleware auth, shadcn init

[Phase 2: Global Overview]        validates stack (reads-only)
    Prometheus proxy → Recharts

[Phase 3: Claude Tokens]          highest operator value
    SOPS write spike + Zod 4 spike (blocking)
    Registry CRUD, per-token gauges

[Phase 4: Audit Log]              MUST land before phases 5-7 writes
    SQLite table + middleware + viewer

[Phase 5: VoidNet]      ─┐
[Phase 6: Proxmox]       ├─ parallel-safe after Phase 4
[Phase 7: Alerts]       ─┘

[Phase 8: Web Terminal]           XL, highest risk, last
    node-pty LXC spike (blocking), xterm.js + ssh2 PTY relay

[Phase 9: Security + Deploy Hardening]
    Exporter rebind (v2.0 tech-debt), bun audit, bundle analysis,
    header-spoofing integration test, cert renewal alerts
```

## Top Pitfalls

**HIGH — must address in Phase 1:**
- **P-01 CVE-2025-66478** — Next.js RSC RCE, exploited. Pin to patched 15.x.
- **P-02 Tailscale header spoofing** — bind 127.0.0.1 + `tailscale whois` re-verification on mutations.
- **P-04 node-pty in LXC** — feasibility spike before any terminal code.
- **P-05 Bun native module compat** — `bun install` on mcow before committing.
- **P-06 Proxmox TLS** — CA cert pinning, NOT `NODE_TLS_REJECT_UNAUTHORIZED=0`.

**AI-agent specific (P-16 to P-20):**
- Secret leakage via RSC → client (server-only lint rule, "use server" discipline)
- SQL injection via raw Drizzle (prepared statements enforced)
- Next.js 15 SSR/CSR confusion (docs in CLAUDE.md)
- Proxmox `/stop` (hard-kill) vs `/shutdown` (graceful) confusion — mcow runs SQLite

## Things Already Decided — DO NOT Re-research

Caddy, Drizzle+bun:sqlite, grammY, systemd, bun test + Playwright, Recharts via shadcn, raw fetch for Proxmox, ssh2 for terminal, Tailscale identity via nginx-auth socket, LE DNS-01 (not HTTP-01), hybrid repo (this repo has `apps/admin/`, `hub-shared/ui-kit` is separate submodule)

## Open Questions — Need Operator Input Before Phases

1. **Cloudflare API token** — exists in `secrets/`? (zone:dns:edit for `makscee.ru`)
2. **tailscale-nginx-auth socket path** — `/run/tailscale/` or `/var/run/tailscale/`? (`ls` on mcow)
3. **mcow LXC privilege** — privileged/unprivileged? (`lxc-info -n 200` on tower)
4. **voidnet-api admin surface** — JSON API or HTMX-HTML only?
5. **voidnet-api port** on mcow?
6. **hub-shared/ui-kit** — scaffold in Phase 1 or defer?
7. **Proxmox API token** — one-time manual creation with `dashboard-operator` role

## Confidence

MVP phases (1-7): **HIGH**. Web terminal (8): **MEDIUM** pending LXC PTY spike. Security (9): **HIGH**.

## Phase Count

**9 phases** recommended. Maps to build order above. Each feature phase has one backend dependency; parallel-safe after Phase 4.

---
*Synthesized 2026-04-16 from 4 parallel researchers.*
