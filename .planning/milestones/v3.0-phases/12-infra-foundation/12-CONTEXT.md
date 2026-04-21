# Phase 12: Infra Foundation - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning
**Mode:** Operator delegated gray-area calls to Claude's discretion — all decisions below are Claude-picked defaults grounded in PROJECT.md / REQUIREMENTS.md / research. Operator reviews via this file before planning.

<domain>
## Phase Boundary

The admin dashboard skeleton is deployed on mcow, reachable at `https://homelab.makscee.ru` over Tailnet only, secured by GitHub OAuth (Auth.js v5), with hardened HTTP headers, all secrets in SOPS, and a base shell (sidebar + topbar + placeholder routes for every downstream page). Outcome: Phases 13-18 ship page content into this shell without touching infra, Caddy, auth, or deploy pipeline.

**In scope:**
- Next.js 15.2.4 + React 19 + Bun app scaffold at `apps/admin/` (Bun workspaces root)
- Auth.js v5 GitHub OAuth + user allowlist + 403 page
- Base layout: sidebar (all 8 planned routes stubbed), topbar (GitHub user chip + sign-out), dark mode default
- Security middleware: CSP, HSTS, X-Frame-Options, server-only lint rule, Zod input validation policy, Drizzle prepared-statement policy (no queries built yet)
- Caddy site block for `homelab.makscee.ru` on mcow (additive, HTTP-01 LE — reuse existing Caddy)
- Ansible playbook `deploy-homelab-admin.yml` (rsync, `bun install --frozen-lockfile`, `bun run build`, systemd unit install/reload, smoke check + rollback)
- SOPS-encrypted secrets wired via Ansible-decrypted `/etc/homelab-admin/env`
- `bun audit` clean + Next.js pinned to CVE-2025-66478-patched 15.2.4
- `/api/health` endpoint for deploy smoke test

**Out of scope (belongs in later phases):**
- Audit log SQLite table + middleware → Phase 14 (INFRA-05)
- Drizzle schema / bun:sqlite DB file → Phase 14 (no DB needed in Phase 12 — JWT sessions, no audit writes)
- Any Prometheus query, SOPS read/write, voidnet-api call, Proxmox call → their own pages (13-17)
- Shared `hub-shared/ui-kit` submodule extraction → Phase 19 (UI-01/UI-02). Phase 12 installs shadcn components locally under `apps/admin/components/ui/`.
- Caddy rate limiting → Phase 19 (SEC-01)

</domain>

<decisions>
## Implementation Decisions

### Stack Versions (carried from PROJECT.md / research STACK.md — DO NOT re-litigate)
- **D-12-01:** Bun (pin exact `bun_version` in `ansible/group_vars/all.yml` once confirmed on mcow — planner to verify latest stable). Next.js `15.2.4`. React `19.2.5`. TypeScript latest. Tailwind + shadcn/ui. Zod pinned to `3.24.x` (Zod 4 + shadcn forms compat spike is Phase 13's problem — do NOT upgrade here).
- **D-12-02:** `bun.lockb` committed in same commit as any `package.json` change (P-17). Ansible uses `bun install --frozen-lockfile`.
- **D-12-03:** No Drizzle / no bun:sqlite in Phase 12. DB lands in Phase 14 with audit log. JWT session strategy chosen partly to keep this phase DB-free.

### App Binding
- **D-12-04:** App binds **`127.0.0.1:3847`** (loopback TCP, high port, not 3000 — Docker already owns 3000 per INFRA-02). Caddy reverse-proxies via `reverse_proxy 127.0.0.1:3847`. Rationale: simpler than Unix socket for a stock Next.js standalone build; loopback + Caddy + Tailscale ACL = adequate isolation on mcow (service users are limited). Unix socket considered but deferred — a Phase 18 custom WebSocket server may need to revisit this anyway.
- **D-12-05:** Port 3847 documented in `servers/mcow/inventory.md` (port allocations) to avoid future collisions.

### Auth (GitHub OAuth via Auth.js v5)
- **D-12-06:** **One GitHub OAuth app** created manually by operator before deploy. Homepage: `https://homelab.makscee.ru`. Callback: `https://homelab.makscee.ru/api/auth/callback/github`. Client ID + secret stored in `secrets/mcow.sops.yaml` under a new `homelab_admin:` section.
- **D-12-07:** **Allowlist via env var** `HOMELAB_ADMIN_ALLOWED_GITHUB_LOGINS=makscee` (comma-separated). Lives in `/etc/homelab-admin/env` (written by Ansible from SOPS). Not itself a secret (it's a list of GitHub usernames), but co-located with OAuth credentials for single-config load. Add users later by SOPS-editing mcow.sops.yaml and re-deploying.
- **D-12-08:** **JWT session strategy** (stateless, encrypted with `AUTH_SECRET` from SOPS). 8h TTL with Auth.js rolling refresh behavior (SEC-07). Cookie flags: `HttpOnly`, `Secure`, `SameSite=Lax`. DB sessions rejected — no DB in Phase 12; revocation via `AUTH_SECRET` rotation (acceptable for 1-operator allowlist).
- **D-12-09:** **403 enforcement before any page handler.** Next.js middleware (`middleware.ts`) checks session + allowlist. Non-allowlisted GitHub login → redirect to `/403`. No session → `/login`.
- **D-12-10:** Auth.js defaults confirmed for SEC-06: PKCE + state param enabled out of the box (planner verifies v5 default).

### Caddy Integration
- **D-12-11:** **Ansible `blockinfile`** patches `/etc/caddy/Caddyfile` on mcow with `# BEGIN homelab-admin` / `# END homelab-admin` markers. Content rendered from `ansible/playbooks/templates/caddy-homelab-admin.conf.j2`. Idempotent, additive — existing `vibe.makscee.ru` block untouched.
- **D-12-12:** **HTTP-01** challenge via existing Caddy (mirrors `vibe.makscee.ru` pattern — port 80 already open on mcow per v1.0). NOT DNS-01. NOT xcaddy. Standard Caddy package. This overrides research STACK.md recommendation which predated the auth switch.
- **D-12-13:** Caddy reload via Ansible handler: `systemctl reload caddy` (graceful, not restart).
- **D-12-14:** Site block sets response headers (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy) as defense-in-depth in addition to Next.js middleware setting them. Planner decides final header values; baseline OWASP per SEC-02.

### Secrets Wiring (INFRA-08)
- **D-12-15:** Extend **existing `secrets/mcow.sops.yaml`** (do not create a new file). Add keys:
  - `homelab_admin.github_oauth_client_id`
  - `homelab_admin.github_oauth_client_secret`
  - `homelab_admin.auth_secret` (32+ random bytes for JWT signing)
  - `homelab_admin.allowed_github_logins` (comma-separated, starts with `makscee`)
- **D-12-16:** Ansible decrypts at deploy time (localhost, `no_log: true`) and writes `/etc/homelab-admin/env` on mcow with mode `0600` owned by `homelab-admin:homelab-admin`.
- **D-12-17:** Env loaded at systemd unit start via `EnvironmentFile=/etc/homelab-admin/env`. App does NOT read SOPS at runtime in Phase 12 (SOPS runtime decrypt lands in Phase 13 for the token registry).
- **D-12-18:** age key deployment — planner confirms existing pattern (hub-level age key already provisioned on mcow for Ansible controller-side decrypt). No mcow-side age key needed in Phase 12 since app does not runtime-decrypt.

### Base Layout (UI-03, UI-04)
- **D-12-19:** **Sidebar stubs ALL 8 planned routes** (visual proof that nav works, catches routing bugs now):
  - `/` — Overview (placeholder: "Coming in Phase 14")
  - `/tokens` — Claude Tokens (placeholder: "Coming in Phase 13")
  - `/voidnet/users` — VoidNet (placeholder: "Coming in Phase 15")
  - `/proxmox` — Proxmox Ops (placeholder: "Coming in Phase 16")
  - `/alerts` — Alerts (placeholder: "Coming in Phase 17")
  - `/box/[vmid]/terminal` — Web Terminal (placeholder: "Coming in Phase 18")
  - `/login` — sign-in page (functional)
  - `/403` — unauthorized (functional, per UI-04)
- **D-12-20:** Top bar: GitHub user chip (avatar + login) on the right, sign-out button. App name on the left.
- **D-12-21:** **Dark mode default**, no toggle in Phase 12 (UI-05 deferred). Theme tokens set via CSS variables in shadcn convention so a toggle can land later without refactor.
- **D-12-22:** Standard error boundary + 404 page + loading skeleton pattern established in Phase 12 as reusable components (UI-04).

### Deploy Pipeline (INFRA-06)
- **D-12-23:** Ansible playbook `ansible/playbooks/deploy-homelab-admin.yml` mirrors the shape of `deploy-docker-tower.yml`. Steps:
  1. Decrypt secrets (localhost, no_log) → render `/etc/homelab-admin/env`
  2. Ensure `homelab-admin` OS user + group on mcow (system user, no shell)
  3. Rsync `apps/admin/` → `/opt/homelab-admin/app/` (exclude `node_modules`, `.next`)
  4. `bun install --frozen-lockfile` in `/opt/homelab-admin/app/`
  5. Build with rollback guard: `mv .next .next.prev; bun run build`; on failure restore `.next.prev`
  6. Install systemd unit `homelab-admin.service` (idempotent)
  7. `systemctl daemon-reload` + `systemctl restart homelab-admin`
  8. Smoke check: `uri http://127.0.0.1:3847/api/health → 200` (retry 10×1s); on failure rollback
  9. Patch Caddyfile via blockinfile + `systemctl reload caddy`
- **D-12-24:** Idempotency validated via `--check` run — SC #5 requires all-ok second run.

### Systemd Unit
- **D-12-25:** Service runs as `homelab-admin` user (P-anti-pattern 3). `User=`, `Group=` set.
- **D-12-26:** `PrivateTmp=` / `ProtectSystem=` hardening — planner probes mcow LXC privilege level first (STATE.md pending todo + P-15). If unprivileged LXC breaks these flags, document the degraded set in the unit file comment.
- **D-12-27:** `EnvironmentFile=/etc/homelab-admin/env`. `ExecStart=/usr/local/bin/bun run start` (or the Bun-installed path — planner decides concrete path per Ansible bun install).
- **D-12-28:** `Restart=on-failure`, `RestartSec=5s`.

### Repo Layout
- **D-12-29:** **Bun workspaces** — root `package.json` declares `workspaces: ["apps/*"]`. `apps/admin/` is the only app today; forward-compat for additional apps. `vendor/ui-kit/` submodule path reserved (added in Phase 19 — not in this phase).
- **D-12-30:** Root `.gitignore` additions: `apps/*/node_modules`, `apps/*/.next`, `.env.local`. `bun.lockb` committed at root.

### Health Endpoint
- **D-12-31:** `/api/health` returns `{ ok: true, version, commit_sha, uptime_s }` with HTTP 200. Used by Ansible smoke check. Deep check (`?deep=1` flag) postponed — add in Phase 13 when SOPS runtime path exists.

### Dev Workflow
- **D-12-32:** Local `bun run dev` on operator laptop. Tailnet-connected machines reach mcow Prometheus/backends via `100.101.0.x` IPs. Env vars sourced from `apps/admin/.env.local` (gitignored). `AUTH_URL=http://localhost:3000` + second GitHub OAuth app for dev (optional — operator may also dev against prod OAuth app with localhost callback added).

### Security (SEC-02, SEC-04, SEC-05, SEC-06, SEC-07)
- **D-12-33:** CSP, HSTS, X-Frame-Options set via **both** Next.js middleware (app-level) and Caddy site block (edge-level). Redundant is fine. CSP: strict-dynamic + nonce-based (Next.js middleware inject nonce per request). No `'unsafe-inline'` for scripts; `'unsafe-inline'` for styles is acceptable for shadcn — planner confirms.
- **D-12-34:** `eslint-plugin-server-only` + ESLint rule enforced: any file importing from `server-only` cannot be imported by a `"use client"` file. Wire into `bun run lint` so CI-equivalent (pre-deploy) catches P-03 / P-16.
- **D-12-35:** Zod 3.24.x validation is MANDATORY on every Route Handler input — policy documented in `apps/admin/README.md`. No routes have handlers beyond `/api/auth/*` + `/api/health` in Phase 12, so this is a forward-policy gate.
- **D-12-36:** Drizzle prepared-statements mandatory policy documented — no queries exist yet but the rule lands with the scaffold.
- **D-12-37:** Session cookie flags per SEC-07: `HttpOnly`, `Secure`, `SameSite=Lax`, TTL 8h. Auth.js v5 defaults verified by planner.

### Canonical Refs for Downstream Agents (STATE.md-obsoleted todos)
- **D-12-38:** STATE.md pending todo "verify Cloudflare API token exists" is **OBSOLETE** — HTTP-01 not DNS-01. Planner should mark it resolved in STATE.md cleanup.
- **D-12-39:** STATE.md pending todo "confirm tailscale-nginx-auth socket path" is **OBSOLETE** — GitHub OAuth replaces Tailscale header auth.
- **D-12-40:** STATE.md pending todo "confirm mcow LXC privilege level" remains **ACTIVE** — planner's first research task: `ssh root@tower "pct config <mcow-vmid>"` → determines systemd hardening flags set (P-15).

### Claude's Discretion (planner autonomy)
- Exact Bun binary version pin (latest stable at plan time)
- Exact Next.js 15.2.4+ patch level (must include CVE-2025-66478 fix; may bump to a higher 15.x patch if operator-verified clean)
- CSP directive values (OWASP baseline + shadcn/Recharts exceptions)
- systemd hardening flag set (conditional on LXC privilege discovery)
- Shadcn components scaffolded initially (minimum: `Button`, `Card`, `Avatar`, `DropdownMenu`, nav primitives; add as pages require)
- Concrete file names within `apps/admin/` except the high-level dirs fixed here

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before writing code. Skim all; focus on ⚠ items.**

### Phase-Level Intent
- `.planning/ROADMAP.md` §Phase 12 — goal + success criteria + requirements list (authoritative scope anchor)
- `.planning/REQUIREMENTS.md` §INFRA (01,02,03,04,06,07,08), §UI (03,04), §SEC (02,04,05,06,07) — exact acceptance criteria per requirement
- `.planning/PROJECT.md` §Key Decisions, §Constraints, §Current Milestone — v3.0 vision + stack lock + Claude-Code-as-operator constraint
- `.planning/STATE.md` §Pending Todos, §Decisions — pre-phase gates (LXC privilege check remains open)

### Research (authoritative for stack + patterns; see ⚠ for overrides)
- `.planning/research/STACK.md` — full dependency reference, exact versions, alternatives-considered
  - ⚠ **Override:** §9 Tailscale Header Auth section is obsolete — Auth.js v5 GitHub OAuth replaces it (see PROJECT.md §Current Milestone + REQUIREMENTS.md INFRA-04)
  - ⚠ **Override:** §Caddy Installation xcaddy/DNS-01 section is obsolete — use standard Caddy + HTTP-01 (REQUIREMENTS.md INFRA-03, mirrors existing vibe.makscee.ru pattern)
- `.planning/research/ARCHITECTURE.md` §File Layout on mcow, §Process Supervision (systemd), §Deploy Pipeline, §Reverse Proxy Caddy, §TLS Flow — adapt to HTTP-01 + GitHub OAuth, patterns still apply
- `.planning/research/PITFALLS.md` — must read all of:
  - P-01 CVE-2025-66478 (Next.js RSC RCE — pin version)
  - P-03 RSC secret leak (server-only lint rule)
  - P-05 Bun native module compat (validate `bun install` on mcow)
  - P-14 LE cert renewal silent failure (add Prometheus cert-expiry alert — Phase 17, but note here)
  - P-15 systemd `PrivateTmp`/`ProtectSystem` in Proxmox LXC
  - P-17 commit `bun.lockb` discipline
  - P-18 Zod validation on server actions
  - P-02 Tailscale header spoofing — **not applicable anymore** (auth switched), but documented rationale for the switch
- `.planning/research/SUMMARY.md` §Critical Path Build Order, §Things Already Decided — confirms Phase 12 scope

### Existing Infrastructure (source-of-truth to mirror / extend)
- `ansible/playbooks/deploy-docker-tower.yml` — shape to mirror for `deploy-homelab-admin.yml`
- `ansible/ansible.cfg`, `ansible/inventory/homelab.yml` — mcow host declaration (`100.101.0.9`, `ansible_user: root`)
- `ansible/group_vars/all.yml` — add `bun_version`, `homelab_admin_port: 3847` here
- `ansible/requirements.yml` — current Ansible collections (community.docker, community.proxmox may already be present)
- `.sops.yaml` — encryption rule (`secrets/.*\.sops\.yaml$` → age `age154sy5cc0masul6t7zyza76qw48dqcm700t43pvnwclcswl4leuvs5qrcjp`)
- `secrets/mcow.sops.yaml` — extend with `homelab_admin:` section (already exists, mode 0600)
- `servers/mcow/README.md`, `servers/mcow/inventory.md` — update with port 3847 + service entry
- `servers/mcow/voidnet-api.service` — existing systemd unit style reference
- `servers/nether/Caddyfile` — only existing in-repo Caddyfile (nether, not mcow); mcow Caddyfile lives on host, template lands in `ansible/playbooks/templates/`

### v1.0 Lessons (apply)
- Memory: `docker-tower canonical path: /opt/homelab/` — analogous canonical path for mcow is `/opt/homelab-admin/` (service-specific, not repo clone)
- Memory: `Verify UI visually` — API-200 ≠ works. Phase 12 deploy verification MUST include a browser visit to `https://homelab.makscee.ru` and screenshot evidence of sign-in + sidebar + 403.
- Memory: `mcow Telegram egress` — not relevant to Phase 12 (no alerting yet)

### Security Docs (apply to SEC reqs)
- Next.js 15 security headers documentation (planner fetches current via context7)
- Auth.js v5 docs (planner fetches current via context7 for: GitHub provider config, JWT session config, `authorized` callback for allowlist, cookie options)
- OWASP secure headers baseline (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy)

### No External Specs
No external ADR / spec docs referenced beyond `.planning/` and research. All decisions captured here or in cited files above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`ansible/playbooks/deploy-docker-tower.yml`** — reuse rollback/smoke-check pattern (block/rescue around build + systemctl + uri check)
- **`ansible/inventory/homelab.yml`** — `mcow` host already declared with Tailnet IP + root SSH
- **`secrets/mcow.sops.yaml`** — existing SOPS file, extend with `homelab_admin:` section (no new file needed)
- **`.sops.yaml`** — creation rule already matches `secrets/mcow.sops.yaml`
- **Existing Caddy on mcow** — already serves `vibe.makscee.ru` with HTTP-01; port 80 open; one directive-addition away from serving `homelab.makscee.ru`
- **`servers/mcow/voidnet-*.service`** — systemd unit style (User, Environment, ExecStart, Restart) to mirror for `homelab-admin.service`
- **group_vars/all.yml** — one-line vars file, easy to extend

### Established Patterns
- **SSH via Tailscale**: `ssh root@mcow` (`100.101.0.9`) — Ansible + manual ops both use this
- **SOPS+age**: `secrets/*.sops.yaml` encrypted, `*.yaml` gitignored, age key at hub level
- **Ansible-first, Docker-second on mcow** — mcow runs native systemd services (voidnet-*, claude-usage-exporter); Docker only for Grafana/Alertmanager. Homelab-admin follows the systemd-native pattern (no Docker).
- **Document-first, AI-readable** — every decision lands in a markdown file committed before code
- **Static inventory** — no dynamic inventory complexity

### Integration Points
- **Caddy on mcow** (existing, HTTP-01 LE, owns ports 80/443) — receives new site block for `homelab.makscee.ru`
- **SOPS on mcow** (already provisioned via v1.0) — no new setup, just extend mcow.sops.yaml
- **Ansible controller** (operator laptop) — runs decrypt-then-deploy playbook via SSH to mcow
- **GitHub OAuth** (external, operator creates app once) — callback URL locked to `https://homelab.makscee.ru/api/auth/callback/github`
- **Tailscale ACL** (existing) — restricts `100.101.0.9:443` to Tailnet peers. Public A-record for `homelab.makscee.ru` → `100.101.0.9` works only over Tailnet.

### No Prior Phase Precedent (new work)
- No `apps/` directory in this repo yet — Phase 12 creates it
- No TypeScript / Bun / Next.js code in this repo — Phase 12 introduces the toolchain
- No Caddy role or playbook in Ansible — Phase 12 creates the Caddy-config task via blockinfile (no full role yet)
- No systemd-for-Node/Bun units on mcow — Phase 12 creates the first

</code_context>

<specifics>
## Specific Ideas / Operator References

- **Mirror `vibe.makscee.ru` pattern** (operator's existing Caddy site block on mcow) for the homelab.makscee.ru block — planner asks operator for a snapshot of that block as the template base.
- **One operator (makscee)** in allowlist on Day 1. Other operators added via SOPS edit + redeploy (not a UI feature in v3.0 — allowlist management is an OUT-OF-SCOPE feature per requirements).
- **Ansible controller is the operator laptop**, not a dedicated runner — no CI. `claude-code` runs the playbook.
- **JWT over DB sessions** — operator-scoped tool with one user initially; revocation via `AUTH_SECRET` rotation is sufficient. DB sessions add complexity for no benefit in Phase 12.

</specifics>

<deferred>
## Deferred Ideas

**Captured but explicitly NOT in Phase 12 scope:**

- **ui-kit submodule extraction** — Phase 19 (UI-01, UI-02). Phase 12 uses local shadcn components under `apps/admin/components/ui/` with plan to extract later.
- **Audit log SQLite + middleware** — Phase 14 (INFRA-05). JWT sessions chosen in Phase 12 to keep DB out.
- **Drizzle + bun:sqlite setup** — Phase 14 with audit log (first DB user).
- **Caddy rate limiting** — Phase 19 (SEC-01). Not in Phase 12.
- **Light/dark theme toggle** — deferred (UI-05).
- **Deep `/api/health` check** (SOPS decrypt, Prometheus reach) — Phase 13 when runtime SOPS reads land.
- **Bundle analysis + secret-leak audit** — Phase 19 (SEC-08).
- **Cert-renewal monitoring alert** (P-14) — Phase 17 (alerts panel) — add Prometheus rule there.
- **Unix socket for app binding** — reconsider in Phase 18 when custom WebSocket server may need it anyway.
- **Header-spoofing integration test** — Phase 19 (SEC-08), though auth model change (GitHub OAuth) largely obsoletes this concern.
- **STATE.md cleanup of obsolete pre-phase todos** (Cloudflare token, tailscale-nginx-auth socket) — planner resolves in first commit.

### Reviewed Todos (not folded)
No GSD todos were matched to Phase 12 in the todo cross-reference scan.

</deferred>

---

*Phase: 12-infra-foundation*
*Context gathered: 2026-04-17*
*Prior discussion: skipped — operator delegated gray-area decisions to Claude's discretion. All decisions D-12-01 through D-12-40 above reflect Claude's defaults grounded in PROJECT.md, REQUIREMENTS.md, and research docs.*
