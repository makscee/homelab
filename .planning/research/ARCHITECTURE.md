# Architecture Patterns — v3.0 Homelab Admin Dashboard

**Domain:** Next.js 15 + Bun admin dashboard on mcow, integrating Prometheus, VoidNet API, SOPS secrets, Proxmox API, and web terminal
**Researched:** 2026-04-17
**Overall confidence:** HIGH (proxy/TLS/systemd patterns), MEDIUM (SOPS-in-Node write path, node-pty Bun native compatibility)

---

## Recommended Architecture

```
Internet (public DNS: homelab.makscee.ru → 100.101.0.9)
    │
    ▼ (Tailscale ACL: only Tailnet peers can reach 100.101.0.9:443)
[Caddy — :443]
    │  TLS termination (LE DNS-01 via Cloudflare — no port 80 required)
    │  Injects Tailscale identity via tailscale/cmd/nginx-auth UNIX socket
    │
    ▼
[Next.js 15 + Bun — 127.0.0.1:3000]  (custom server.js, systemd)
    │
    ├──► GET /api/metrics/*    → Prometheus HTTP API (100.101.0.8:9090)
    ├──► GET /api/claude/*     → claude-usage-exporter /metrics (100.101.0.9:9101 Tailnet)
    ├──► ANY /api/voidnet/*    → voidnet-api admin routes (127.0.0.1:<port>) + shared secret header
    ├──► ANY /api/proxmox/*    → Proxmox REST API (100.101.0.7:8006) + API token
    ├──► WS  /api/terminal/:id → node-pty → SSH to target host (xterm.js relay)
    └──► ANY /api/secrets/*    → sops-age TS lib decrypts secrets/claude-tokens.sops.yaml
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| Caddy | TLS termination, reverse proxy, Tailscale identity injection | Next.js app (:3000) |
| Next.js app (Bun) | UI + all API Route Handlers as proxy layer | Prometheus, voidnet-api, Proxmox, sops-age lib, node-pty |
| claude-usage-exporter (Python, existing) | Scrapes Anthropic OAuth usage endpoint, exposes /metrics | Prometheus (scrape source), Next.js (read consumer) |
| voidnet-api (Rust axum, existing) | VoidNet business logic, SQLite | Next.js admin consumer |
| Prometheus (docker-tower, existing) | Metrics storage | Next.js (query only) |
| Proxmox API (tower, existing) | LXC lifecycle and node info | Next.js operator |
| sops-age (npm lib) | Decrypt SOPS-encrypted secrets at runtime | Next.js API routes |
| node-pty + ws | PTY relay for web terminal sessions | Next.js WS handler, SSH targets |

---

## Integration Points — Every Cross-Service Call

### 1. Dashboard → Prometheus

- **Endpoint:** `http://100.101.0.8:9090/api/v1/`
- **Auth:** None. Prometheus on docker-tower is Tailnet-reachable only; no auth configured.
- **Call patterns:**
  - Gauge/instant: `GET /api/v1/query?query=<promql>&time=<unix>`
  - Graph/range: `GET /api/v1/query_range?query=<promql>&start=<>&end=<>&step=<>`
- **Caching:** Next.js Route Handlers use `export const revalidate = 15` (15 s, matching Prometheus scrape interval). Gauge values served stale-while-revalidate; graph range queries cached for the same window.
- **A depends on B:** Prometheus already operational on docker-tower. No new setup.

### 2. Dashboard → claude-usage-exporter

- **Current state:** Exporter runs on mcow as systemd unit, bound to `0.0.0.0:9101` (tech-debt).
- **Target state after rebind:** Bound to `100.101.0.9:9101` (Tailscale interface only — not 0.0.0.0, not 127.0.0.1). This preserves Prometheus scrape from docker-tower (100.101.0.8 → 100.101.0.9:9101 over Tailnet) while removing general public exposure.
- **Dashboard call:** `GET http://127.0.0.1:9101/metrics` from same host (loopback works regardless of bind interface). Parse Prometheus text exposition format in Next.js API route `/api/claude/usage`.
- **Decision:** Keep Python exporter. No TypeScript rewrite. It works in production (ADR D-07). Parse its text format in a thin TS wrapper.
- **A depends on B:** Exporter rebind (tech-debt task) is independent of dashboard build. Claude tokens page can stub with cached data while rebind is pending.

### 3. Dashboard → voidnet-api

- **Endpoint:** `http://127.0.0.1:<VOIDNET_PORT>/admin/*` (loopback; both on mcow)
- **Auth:** Shared secret header — `X-Admin-Token: <secret>`. Dashboard sends it on every request. voidnet-api validates in middleware. Secret stored in `VOIDNET_ADMIN_SECRET` env var on both sides, sourced from SOPS-decrypted secrets at service startup.
- **Why not Tailscale-User header here:** Tailscale-User identifies the human browser session; it cannot authenticate the dashboard server process making loopback calls. Shared secret is unambiguous for service-to-service.
- **A depends on B:** voidnet-api must expose `/admin/*` routes with this middleware before the VoidNet management page works. Route contract (list, request/response shapes) must be agreed before page implementation begins.

### 4. Dashboard → Proxmox API

- **Endpoint:** `https://100.101.0.7:8006/api2/json/`
- **Auth:** Proxmox API token — `Authorization: PVEAPIToken=homelab-admin@pve!dashboard=<uuid>:<secret>`
- **Role — `dashboard-operator`** — create on tower once:
  ```
  pveum user add homelab-admin@pve
  pveum role add dashboard-operator -privs "VM.Audit,VM.PowerMgmt,Datastore.Audit"
  pveum aclmod / -user homelab-admin@pve -role dashboard-operator
  pveum user token add homelab-admin@pve dashboard --privsep 1
  ```
  Explicitly excluded: `VM.Allocate`, `VM.Config.*`, `Sys.Modify`, `Permissions.Modify`.
- **TLS:** Proxmox uses a self-signed cert. Install Proxmox CA on mcow at `/usr/local/share/ca-certificates/proxmox-tower.crt` and run `update-ca-certificates`. Avoids disabling TLS verification globally.
- **A depends on B:** Proxmox API token creation (one-time manual step on tower) before Proxmox ops page works.

### 5. Tailscale Identity — Auth Model

- **Mechanism:** Caddy uses `forward_auth` directive pointing at the `tailscale/cmd/nginx-auth` UNIX socket. The socket validates the request came through Tailscale's kernel netfilter and returns identity headers. Caddy strips any inbound `Tailscale-*` headers before forwarding, then re-injects from auth result.
- **Headers passed to Next.js:** `Tailscale-User-Login` (email), `Tailscale-User-Name`, `Tailscale-Tailnet`.
- **Next.js reads:** `request.headers.get('tailscale-user-login')` in middleware or server components.
- **No login form.** Unauthenticated (no Tailscale-User-Login header) → 401.
- **Spoofing:** Impossible from browser — Caddy enforces header source; nginx-auth socket validates kernel-level Tailscale identity.
- **A depends on B:** `tailscale/cmd/nginx-auth` binary installed and socket running on mcow + Caddy configured with `forward_auth` before auth-gated pages can work.

### 6. Dashboard → SOPS Secrets (claude-tokens.sops.yaml)

- **Mechanism:** `sops-age` npm library (TypeScript, works in Bun). No shell-out to `sops` CLI for reads.
- **Age key location:** `/etc/homelab-admin/age.key` — owner `root`, group `homelab-admin`, mode `0440`. Dashboard process runs as `homelab-admin` user.
- **Env var:** `SOPS_AGE_KEY_FILE=/etc/homelab-admin/age.key` in systemd unit's `EnvironmentFile`.
- **Secret file:** `/opt/homelab-admin/secrets/claude-tokens.sops.yaml` (rsync'd from repo at deploy time — SOPS-encrypted, never plaintext on disk).
- **Read pattern:** API route `/api/secrets/claude-tokens` — decrypt on-demand, return JSON, discard plaintext at end of request. Do not cache decrypted secrets across requests.
- **Write/rotate pattern:** Decrypt → mutate → re-encrypt via `sops-age` encrypt (MEDIUM confidence on write API — verify during implementation; fallback: shell out to `sops --encrypt`). Write back to file. Git commit is out of scope for dashboard — operator confirms via Claude Code.
- **A depends on B:** Age private key provisioned on mcow (`/etc/homelab-admin/age.key`, matching the `age:` recipient in `.sops.yaml`) before Claude tokens page works.

### 7. Web Terminal — SSH via node-pty

- **Flow:**
  1. Browser (xterm.js) opens WebSocket to `/api/terminal/cc-worker`
  2. Next.js custom server WS handler looks up target: box name → Tailscale IP (config map in `/etc/homelab-admin/env` or hardcoded registry)
  3. Retrieves SSH credential: dashboard SSH keypair preferred (`/etc/homelab-admin/dashboard_id_rsa`, added to `authorized_keys` on each target box via Ansible)
  4. `node-pty` forks PTY running `ssh -i /etc/homelab-admin/dashboard_id_rsa -o StrictHostKeyChecking=no root@<tailscale-ip>`
  5. PTY stdout → WS `send()`. WS inbound messages → PTY `write()`
- **Session lifetime:** WS disconnect → `SIGHUP` to PTY child. Idle timeout: 30 min (PTY stdin timeout via `setTimeout`).
- **Custom server requirement:** Next.js App Router cannot handle raw WebSocket upgrades — `next start` does not expose the underlying `http.Server`. A custom `server.js` is mandatory (see Pattern 3 below).
- **SSH credential model:** Dashboard SSH keypair (generate once, Ansible provisions to target boxes) is preferred over per-session SOPS-decrypted passwords. Password model adds SOPS decrypt latency and leaves decrypted material in memory longer.
- **A depends on B:** node-pty native addon must build successfully under Bun (`bun install`). Dashboard SSH key provisioned to target boxes via Ansible before terminal works. node-pty Bun compatibility is a MEDIUM-confidence gap — verify at build time (see Gaps section).

---

## Reverse Proxy: Caddy (chosen over nginx and Traefik)

| Criterion | Caddy | nginx | Traefik |
|-----------|-------|-------|---------|
| DNS-01 Cloudflare | Native via `caddy-dns/cloudflare` module; one Caddyfile directive | Requires certbot sidecar + renewal cron + reload hook | Native but TOML/YAML config more complex |
| Tailscale identity | `forward_auth` directive works with nginx-auth socket (despite branding) | nginx-auth is natively designed for it | Supported but more middleware config |
| AI-editable config | Single Caddyfile, minimal syntax | nginx.conf verbose, many pitfalls | TOML/YAML, more files |
| systemd | Official `caddy.service` unit; `systemctl reload caddy` is graceful | Standard but certbot adds second unit | Standard |
| Footprint | ~50 MB RAM, single Go binary | ~20 MB but certbot adds Python process | ~80 MB |

**Verdict:** Caddy. One binary, one config file, automatic cert renewal without sidecars.

**Installation:** Standard package `caddy` cannot be used because the Cloudflare DNS module requires a custom build:
```bash
go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest
xcaddy build --with github.com/caddy-dns/cloudflare
# Place resulting ./caddy binary at /usr/local/bin/caddy
```
Ansible task manages this at deploy time; binary is version-pinned in Ansible vars.

---

## TLS Flow — LE DNS-01 via Cloudflare

```
Caddy starts → reads Caddyfile global block: acme_dns cloudflare {env.CF_API_TOKEN}
    │
    ▼
Caddy contacts Let's Encrypt ACME: "I want cert for homelab.makscee.ru"
    │
    ▼
LE issues DNS-01 challenge: "set TXT _acme-challenge.homelab.makscee.ru = <token>"
    │
    ▼
Caddy calls Cloudflare DNS API (Zone:DNS:Edit token) → TXT record created
    │
    ▼
LE validates TXT record → issues cert
    │
    ▼
Caddy stores cert at /var/lib/caddy/.local/share/caddy/ (automatic, managed by Caddy)
    │
    ▼
Renewal: Caddy checks expiry every 12 h; renews 30 days before expiry; same DNS-01 flow
```

**Key facts:**
- Port 80 NOT required (DNS-01, not HTTP-01). Caddy binds only :443.
- `homelab.makscee.ru` public A-record → `100.101.0.9`. Tailscale ACL blocks non-Tailnet connections. DNS resolves publicly, traffic only reaches Tailnet peers.
- Cloudflare API token scope: `Zone > DNS > Edit` on zone `makscee.ru` only.
- Token stored in `/etc/caddy/cloudflare.env` (mode `0600`, owner `caddy`), loaded via `EnvironmentFile=` in caddy.service drop-in.

**Caddyfile skeleton:**
```
{
    acme_dns cloudflare {env.CF_API_TOKEN}
}

homelab.makscee.ru {
    forward_auth unix//run/tailscale/tailscale-nginx-auth.sock {
        uri /auth
        copy_headers Tailscale-User-Login Tailscale-User-Name Tailscale-Tailnet
    }
    reverse_proxy 127.0.0.1:3000
}
```

---

## Process Supervision — systemd Unit

```ini
# /etc/systemd/system/homelab-admin.service
[Unit]
Description=Homelab Admin Dashboard (Next.js 15 + Bun)
After=network.target tailscaled.service
Wants=tailscaled.service

[Service]
Type=simple
User=homelab-admin
Group=homelab-admin
WorkingDirectory=/opt/homelab-admin/app
EnvironmentFile=/etc/homelab-admin/env
ExecStart=/usr/local/bin/bun server.js
Restart=on-failure
RestartSec=5s
StartLimitIntervalSec=60s
StartLimitBurst=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=homelab-admin
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/homelab-admin/app/.next/cache
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

**Decisions:**
- `Type=simple` — Bun starts the HTTP server synchronously, no forking.
- `Restart=on-failure` not `always` — clean exit (e.g. during deploy stop) does not trigger restart.
- `EnvironmentFile=/etc/homelab-admin/env` — contains `NODE_ENV=production`, `PORT=3000`, `SOPS_AGE_KEY_FILE`, `VOIDNET_ADMIN_SECRET`, `PROXMOX_API_TOKEN`. Mode `0600`, owner `homelab-admin`.
- Logs via journalctl only: `journalctl -u homelab-admin -f`. No log rotation to manage.

---

## File Layout on mcow

```
/opt/homelab-admin/
├── app/                          # Next.js app (rsync'd from repo apps/admin/)
│   ├── server.js                 # Custom HTTP+WS server entry point
│   ├── package.json
│   ├── bun.lockb
│   ├── node_modules/             # bun install --frozen-lockfile
│   └── .next/                    # bun run build output
│       └── cache/                # writable (ReadWritePaths in unit)
└── secrets/
    └── claude-tokens.sops.yaml   # Rsync'd from repo secrets/ (SOPS-encrypted)

/etc/homelab-admin/
├── env                           # Env vars (mode 0600, homelab-admin:homelab-admin)
├── age.key                       # age private key (mode 0440, root:homelab-admin)
└── dashboard_id_rsa              # SSH keypair for web terminal (mode 0400, homelab-admin)

/etc/caddy/
├── Caddyfile                     # (mode 0644, caddy:caddy)
└── cloudflare.env                # CF_API_TOKEN (mode 0600, caddy:caddy)

/usr/local/bin/
└── caddy                         # xcaddy-built binary with cloudflare module
```

**Permission model:**

| Path | Owner | Mode | Reason |
|------|-------|------|--------|
| `/etc/homelab-admin/env` | `homelab-admin:homelab-admin` | `0600` | Plaintext secrets in env vars |
| `/etc/homelab-admin/age.key` | `root:homelab-admin` | `0440` | age private key; root-owned, group-readable by service user |
| `/etc/homelab-admin/dashboard_id_rsa` | `homelab-admin:homelab-admin` | `0400` | SSH private key for terminal |
| `/opt/homelab-admin/app/` | `homelab-admin:homelab-admin` | `0755` | App files |
| `/opt/homelab-admin/app/.next/cache/` | `homelab-admin:homelab-admin` | `0755` | Next.js writable cache |
| `/opt/homelab-admin/secrets/` | `homelab-admin:homelab-admin` | `0700` | SOPS files; only service user reads them |
| `/etc/caddy/cloudflare.env` | `caddy:caddy` | `0600` | Cloudflare API token |

---

## Deploy Pipeline

Pattern mirrors `ansible/playbooks/deploy-docker-tower.yml`. Ansible playbook `ansible/playbooks/deploy-homelab-admin.yml`:

```
1. Secrets (delegate_to: localhost, no_log: true)
   sops --decrypt secrets/claude-tokens.sops.yaml → extract VOIDNET_ADMIN_SECRET, PROXMOX_API_TOKEN
   Write /etc/homelab-admin/env on mcow

2. Rsync app source
   rsync apps/admin/ → /opt/homelab-admin/app/  (exclude: node_modules, .next)
   rsync secrets/claude-tokens.sops.yaml → /opt/homelab-admin/secrets/

3. Install
   bun install --frozen-lockfile  (cwd: /opt/homelab-admin/app)

4. Build (with rollback guard)
   mv .next .next.prev  (if exists)
   bun run build
   on failure: mv .next.prev .next → restart → fail task

5. Restart
   systemctl restart homelab-admin

6. Smoke check
   uri: http://127.0.0.1:3000/api/health → 200
   on failure: trigger rollback (restore .next.prev, restart)
```

**Rollback:** Ansible `block/rescue` — on smoke failure, restore `.next.prev` and restart. Previous build always kept until new build is proven healthy.

**Version pinning:** `bun.lockb` committed. `--frozen-lockfile` enforced. Bun binary version pinned in Ansible vars: `bun_version: "1.x.y"`, installed from official install script at exact tag.

---

## Code Patterns

### Pattern 1: API Route as Proxy with Cache

All external calls go through Next.js Route Handlers. Browser never calls Prometheus, voidnet-api, or Proxmox directly.

```typescript
// app/api/metrics/cpu/route.ts
export const revalidate = 15;

export async function GET() {
  const res = await fetch(
    'http://100.101.0.8:9090/api/v1/query?query=100-(avg+by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])*100))'
  );
  return Response.json(await res.json());
}
```

### Pattern 2: Auth Extraction in Middleware

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const user = req.headers.get('tailscale-user-login');
  if (!user) return new Response('Unauthorized', { status: 401 });
  const headers = new Headers(req.headers);
  headers.set('x-dashboard-user', user);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/((?!_next|favicon).*)'] };
```

### Pattern 3: Custom Server for WebSocket

Required because Next.js App Router cannot expose raw `http.Server` for WS upgrades.

```typescript
// server.js  (entry point: bun server.js)
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import next from 'next';
import { handleTerminalSession } from './lib/terminal.js';

const app = next({ dev: false });
const handle = app.getRequestHandler();
await app.prepare();

const server = createServer((req, res) => handle(req, res));
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/api/terminal/')) {
    wss.handleUpgrade(req, socket, head, (ws) => handleTerminalSession(ws, req));
  } else {
    socket.destroy();
  }
});

server.listen(Number(process.env.PORT ?? 3000), '127.0.0.1');
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Fetching from Prometheus in Client Components
Browser calling `http://100.101.0.8:9090/...` directly. Exposes internal Tailnet address; CORS blocked; no caching.
**Instead:** Always proxy through Next.js Route Handler.

### Anti-Pattern 2: Caching Decrypted Secrets Across Requests
Module-scope `const secrets = await decryptSops(...)`. Plaintext stays in memory for process lifetime.
**Instead:** Decrypt per-request in API route, discard after response.

### Anti-Pattern 3: Running Dashboard as Root
`User=root` in systemd unit. Compromised app = full mcow access.
**Instead:** `homelab-admin` user with scoped file permissions.

### Anti-Pattern 4: App Router WebSocket
Handling WS upgrades in a Next.js App Router Route Handler. App Router does not expose raw `http.Server`; upgrade is impossible.
**Instead:** Custom `server.js` with `ws` package as entry point.

### Anti-Pattern 5: Proxmox API with Root or PVEAdmin Token
Full cluster access — one XSS or SSRF = game over.
**Instead:** `dashboard-operator` role with only `VM.Audit + VM.PowerMgmt + Datastore.Audit`.

### Anti-Pattern 6: Binding claude-usage-exporter to 0.0.0.0
Current tech-debt state. Exposes metrics port to any network interface.
**Instead:** Rebind to `100.101.0.9` (Tailscale interface only). Prometheus on docker-tower still scrapes via Tailnet; general internet cannot reach it.

---

## Build Order — Dependency Graph

```
[1] mcow OS user + dirs provisioned
    homelab-admin uid=1500, /opt/homelab-admin/, /etc/homelab-admin/
    → ALL subsequent steps depend on this

[2] age private key on mcow
    /etc/homelab-admin/age.key (root:homelab-admin 0440)
    → [6] SOPS decrypt works → Claude tokens page
    → [3] VOIDNET_ADMIN_SECRET can be sourced from SOPS into env

[3] Caddy installed (xcaddy build with cloudflare module)
    → [4] TLS cert obtained
    → [5] Tailscale identity headers injected into app

[4] Cloudflare API token + DNS-01 cert for homelab.makscee.ru
    → dashboard is publicly reachable (Tailnet-only via ACL)

[5] tailscale-nginx-auth socket running on mcow
    → auth-gated pages display correct user identity

[6] sops-age lib + age key working in Next.js
    → Claude tokens CRUD page
    → Web terminal SSH credential retrieval (fallback path)

[7] voidnet-api admin routes + VOIDNET_ADMIN_SECRET agreed
    → VoidNet management page

[8] Proxmox API token created on tower (homelab-admin@pve, dashboard-operator role)
    → Proxmox ops page (LXC list, restart)

[9] node-pty builds successfully under Bun + dashboard SSH key on target boxes
    → Web terminal

[10] claude-usage-exporter rebound to 100.101.0.9 (Tailscale interface)
     → Claude tokens live metrics in dashboard

[11] Prometheus range/instant queries working from dashboard
     → Global overview graphs (may work before [10]; independent)
```

**Critical path to MVP (dashboard reachable + global overview):**
`[1] → [3] → [4] → [5]` + `[11]`

**Phase groupings implied:**
- Phase A: `[1] + [3] + [4] + [5]` — infra foundation (user, Caddy, TLS, auth)
- Phase B: `[11]` — global overview page (Prometheus queries)
- Phase C: `[2] + [6] + [10]` — Claude tokens page (SOPS + exporter rebind)
- Phase D: `[7]` — VoidNet management page (depends on voidnet-api contract)
- Phase E: `[8]` — Proxmox ops page
- Phase F: `[9]` — Web terminal (highest complexity, most unknowns)

---

## Gaps Requiring Phase-Specific Research

| Gap | Risk | Mitigation |
|-----|------|------------|
| node-pty Bun native addon compatibility | node-pty uses native Node.js addons; Bun's Node compatibility may not fully support node-gyp builds | Test `bun install node-pty` in Phase F spike. Fallback: use `ssh2` Node.js library (pure JS, no native build) for non-interactive commands; accept reduced terminal fidelity |
| sops-age write/encrypt API | `humphd/sops-age` library documentation focuses on decrypt; encrypt API less proven | Verify round-trip in Phase C. Fallback: shell out to `sops --encrypt` CLI for writes only |
| voidnet-api admin route contract | Route list, request/response shapes, and VOIDNET_ADMIN_SECRET header name must be confirmed with voidnet-api codebase before VoidNet page is built | Coordinate in Phase D planning; read voidnet-api source before coding |
| tailscale-nginx-auth socket path on mcow's Debian | Socket path may be `/var/run/tailscale/tailscaled.sock` or `/run/tailscale/tailscaled.sock` depending on Debian version | Verify with `ls /run/tailscale/` on mcow before writing Caddyfile |
| Cloudflare API token — new or existing? | Unknown whether a Cloudflare token already exists in SOPS secrets for this zone | Check `secrets/` for existing Cloudflare credentials before creating a new token |

---

## Sources

- [Caddy DNS-01 Cloudflare module — caddy-dns/cloudflare](https://github.com/caddy-dns/cloudflare)
- [Caddy + Cloudflare DNS-01 setup guide — Akash Rajpurohit](https://akashrajpurohit.com/blog/setup-caddy-with-automatic-ssl-certificates-with-cloudflare/)
- [Traefik vs Caddy vs nginx Proxy Manager 2026 — SelfHostWise](https://selfhostwise.com/posts/traefik-vs-caddy-vs-nginx-proxy-manager-which-reverse-proxy-should-you-choose-in-2026/)
- [nginx vs Caddy 2025 — MangoHost](https://mangohost.net/blog/nginx-vs-caddy-in-2025-which-is-better-for-performance-and-tls-automation-2/)
- [Tailscale identity headers — Tailscale Docs](https://tailscale.com/docs/concepts/tailscale-identity)
- [tailscale/cmd/nginx-auth — works with Caddy forward_auth](https://github.com/tailscale/tailscale/tree/main/cmd/nginx-auth)
- [sops-age TypeScript/Bun library — humphd/sops-age](https://github.com/humphd/sops-age/)
- [Bun production deployment with systemd — OneUptime](https://oneuptime.com/blog/post/2026-01-31-bun-production-deployment/view)
- [xterm.js + node-pty + WebSocket web terminal](https://ashishpoudel.substack.com/p/web-terminal-with-xtermjs-node-pty)
- [Proxmox User Management and API tokens](https://pve.proxmox.com/wiki/User_Management)
- [Proxmox VM.PowerMgmt privilege for LXC restart](https://forum.proxmox.com/threads/help-with-api-permissions.163310/)
