# Technology Stack — v3.0 Unified Stack (Homelab Admin Dashboard)

**Project:** homelab admin dashboard (`homelab.makscee.ru`)
**Researched:** 2026-04-16
**Scope:** Dependency-level decisions for implementation. Core locked decisions (Bun, Next.js 15, React 19, TypeScript, Tailwind, shadcn/ui, Caddy, Tailscale, SOPS+age) are NOT re-litigated here.

---

## 1. Core Framework

| Package | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `next` | **15.2.4** | App framework | Latest stable. Use App Router (not Pages). |
| `react` | **19.2.5** | UI runtime | Exact peer required by Next 15.2. |
| `react-dom` | **19.2.5** | DOM renderer | Must match react version. |
| `@types/react` | **19.2.14** | TS types | Ship with react 19; no separate DefinitelyTyped needed. |
| `typescript` | **5.x** (latest) | Language | Next 15 scaffolds TS 5 natively. |

**Bun compatibility:** Next.js 15 works with Bun as package manager AND as runtime for `bun run dev` / `bun run start`. Official Bun docs have a Next.js guide. No known blockers as of 2026-04. One gotcha: `next build` still uses the Next.js bundler (Turbopack/webpack); Bun is the process runner, not the bundler.

**Confidence:** HIGH — official Bun docs + multiple 2025 production reports.

---

## 2. Database

| Package | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `drizzle-orm` | **0.45.2** | ORM + query builder | Use `bun:sqlite` driver, NOT `better-sqlite3`. |
| `drizzle-kit` | **0.31.10** | Migration CLI | `bunx drizzle-kit migrate` runs migrations. |

**Decision: use `bun:sqlite` (built-in), skip `better-sqlite3`.**

Drizzle officially supports `bun:sqlite` with a dedicated adapter (`drizzle-orm/bun-sqlite`). It is sync-capable, zero native compilation, and ships with Bun — no `npm rebuild` needed after deploy. `better-sqlite3` requires a native N-API binding compiled against Node; under Bun it works but requires a prebuilt that matches Bun's N-API shim version. Risk of breakage on Bun upgrades. Use `bun:sqlite` natively.

Migration pattern: `drizzle-orm/bun-sqlite/migrator` → `migrate(db, { migrationsFolder: './drizzle' })` called at app startup.

**Confidence:** HIGH — Drizzle official docs confirm `bun:sqlite` adapter.

---

## 3. Prometheus Query Client

| Package | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `prometheus-query` | **3.5.1** | HTTP API client for querying Prometheus | Query, range-query, metadata endpoints. |

**Why `prometheus-query` over raw fetch:** Typed request/response wrappers for `/api/v1/query`, `/api/v1/query_range`, `/api/v1/series`. No runtime deps. Actively maintained.

`prom-client` is the wrong tool here — it EXPOSES metrics. We need a QUERY client against the existing Prometheus at `docker-tower:9090`.

Alternatively, raw `fetch` to `http://100.101.0.8:9090/api/v1/query?query=...` is viable for a small number of queries — the Prometheus HTTP API is simple enough that thin typed wrappers over fetch work fine. Use `prometheus-query` if you want autocomplete on the response schema; raw fetch if you want zero deps.

**Recommendation:** `prometheus-query` 3.5.1 for typed DX. Fall back to raw fetch if the library causes issues under Bun.

**Confidence:** MEDIUM — package confirmed on npm; Bun fetch compatibility confirmed; no known issues.

---

## 4. Charts

**Recommendation: Recharts 3.8.1**

| Package | Version | Purpose |
|---------|---------|---------|
| `recharts` | **3.8.1** | Time-series + sparkline charts |

**Why Recharts over Tremor / Visx:**

- **Tremor** (`@tremor/react` 3.18.7): dashboard component library, not a charting primitive. Brings its own design system that conflicts with shadcn/ui. Overkill and opinionated — we already have shadcn.
- **Visx** (`@visx/visx` 3.12.0): low-level D3-backed primitives from Airbnb. Maximum control but high boilerplate; appropriate for custom data viz, not for a homelab dashboard with 4-5 chart types.
- **Recharts** (3.8.1): React-native SVG charts, composable, well-maintained, native React 19 support, smallest API surface for what we need (line charts for utilization over time, bar charts for credits). shadcn/ui chart primitives are built on top of Recharts — zero integration friction.

**Confidence:** HIGH — shadcn/ui docs explicitly use Recharts; React 19 compatible.

---

## 5. SOPS Integration

**Recommendation: spawn `sops` CLI as subprocess.**

Do NOT use `sops-age` JS library for WRITE operations. The JS library (`github.com/humphd/sops-age`) is decrypt-only and read-only — it cannot re-encrypt and write back. For a CRUD interface over SOPS-encrypted registry files, the only complete path is subprocess:

```typescript
import { spawnSync } from 'child_process';

// Decrypt to stdout
const decrypted = spawnSync('sops', ['--decrypt', filePath], { encoding: 'utf8' });

// Edit + re-encrypt in place
spawnSync('sops', ['--encrypt', '--in-place', tmpPath]);
```

Pattern: decrypt → parse YAML → mutate → write temp file → `sops --encrypt --in-place` → move to target.

`sops` binary must be on `PATH` on mcow (already a v1.0 requirement). The `age` key is at `~/.config/sops/age/keys.txt` or via `SOPS_AGE_KEY_FILE` env var set in the systemd unit.

No npm package needed for SOPS. `js-yaml` handles YAML parse/stringify.

| Package | Version | Purpose |
|---------|---------|---------|
| `js-yaml` | **4.1.0** | Parse/stringify YAML after sops decrypt |

**Confidence:** MEDIUM — sops-age JS library confirmed read-only by GitHub README; subprocess pattern is standard homelab practice.

---

## 6. SSH + Web Terminal

| Package | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `ssh2` | **1.17.0** | SSH client | Lower-level, stream-oriented — required for xterm.js piping. |
| `@xterm/xterm` | **6.0.0** | Terminal emulator (browser) | New scoped package; old `xterm` 5.x is deprecated. |
| `@xterm/addon-fit` | latest | Auto-resize terminal | Companion to @xterm/xterm. |
| `@xterm/addon-web-links` | latest | Clickable URLs in terminal | Optional quality-of-life. |

**Why `ssh2` over `node-ssh`:** `node-ssh` (13.2.1) is a convenience wrapper around `ssh2` — it's fine for scripted commands but its stream API is abstracted away, making it awkward to pipe raw PTY output to a WebSocket for xterm.js. Use `ssh2` directly for Proxmox web terminal: open a PTY channel, pipe to WebSocket, xterm.js renders on client. For non-interactive Ansible-style commands (restart LXC, etc.), `ssh2` handles those too — one library for both.

**Web terminal architecture:** Next.js API route cannot handle WebSocket upgrades in App Router serverless mode. Run a separate `bun ws-server.ts` process on port 3001 managed by a second systemd unit. This process owns `ssh2` PTY sessions and relays to browser xterm.js over `ws://localhost:3001`. Caddy proxies `/terminal/ws` to it.

**Confidence:** HIGH for ssh2; MEDIUM for xterm/WS architecture (custom server approach is well-established but adds deployment complexity).

---

## 7. Proxmox API

**Recommendation: direct `fetch` over the Proxmox REST API, NOT the `proxmox-api` npm package.**

`proxmox-api` (1.1.1) is a thin community wrapper with sparse docs and low download counts. The Proxmox VE REST API is well-documented and straightforward (JSON over HTTPS). Roll a minimal typed client:

```typescript
const PVE_BASE = 'https://100.101.0.7:8006/api2/json';
const headers = { Authorization: `PVEAPIToken=${token}` };
```

Operations needed: LXC status, start/stop/restart (`POST /nodes/{node}/lxc/{vmid}/status/restart`), config read. All are 2-3 fetch calls. A full npm library adds a maintenance surface for no gain.

Use the existing Proxmox API token (SOPS-stored). Self-signed cert on Proxmox: install the Proxmox CA cert on mcow for prod (preferred), or scope `NODE_TLS_REJECT_UNAUTHORIZED=0` to the Proxmox fetch client only (not globally).

**Confidence:** HIGH — Proxmox REST API is stable and well-documented; direct fetch is the standard homelab approach.

---

## 8. Telegram Bot (Alerts)

**Recommendation: grammY 1.42.0**

| Package | Version | Purpose |
|---------|---------|---------|
| `grammy` | **1.42.0** | Telegram Bot API client |

**Why grammY over Telegraf:**

- **TypeScript-first** — types are precise and ergonomic; Telegraf's TS migration left complex types that are hard to use correctly.
- **Bun-native** — grammY explicitly supports Bun, Deno, and Node; Telegraf is Node-first.
- **Alert-only use case** — we only need to send messages (no complex middleware pipeline), so grammY's simple API is ideal: `bot.api.sendMessage(chatId, text)`.

For alert delivery specifically, grammY does not even need to run as a polling bot — use `bot.api.sendMessage()` as a pure HTTP client. Zero overhead, no long-polling process needed.

**Confidence:** HIGH — grammY docs confirm Bun support; widely used in production.

---

## 9. Tailscale Header Auth

No npm package needed. Tailscale Serve injects headers on the reverse-proxy hop:

| Header | Value |
|--------|-------|
| `Tailscale-User-Login` | `alice@example.com` |
| `Tailscale-User-Name` | `Alice Architect` |
| `Tailscale-User-Profile-Pic` | URL |

**Middleware pattern (Next.js App Router):**

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const user = req.headers.get('tailscale-user-login');
  if (!user) {
    return new NextResponse('Unauthorized — Tailscale access only', { status: 401 });
  }
  const res = NextResponse.next();
  res.headers.set('x-tailscale-user', user);
  return res;
}

export const config = { matcher: ['/((?!_next|favicon).*)'] };
```

**Critical requirement:** the Next.js server must listen on `127.0.0.1` only, so Tailscale Serve (via Caddy) is the only ingress path. If it binds on `0.0.0.0`, the headers can be forged by any caller on the same machine. Set `hostname: '127.0.0.1'` in the Next.js start command or bind via Caddy reverse_proxy upstream config.

Headers are only injected on Tailscale Serve traffic — not on Tailscale Funnel (public). Funnel is not used here.

**Confidence:** HIGH — Tailscale official docs confirm header injection via Serve; official demo repo `tailscale-dev/id-headers-demo` demonstrates the pattern.

---

## 10. Testing

| Package | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@playwright/test` | **1.59.1** | E2E browser tests | Confirmed locked decision. |
| Bun test (built-in) | — | Unit + integration tests | No additional package. `bun test` runs `.test.ts` files natively. |

**Why Bun test over Vitest:** Bun's built-in test runner (`bun test`) is Jest-compatible syntax, zero config, and faster than Vitest for Bun projects. Vitest adds 15-20 deps and is optimized for Vite bundler projects. For a Bun-native project, `bun test` is the obvious choice. Use Playwright for anything that touches the browser (Tailscale auth headers, dashboard rendering, xterm.js).

**Confidence:** HIGH — Bun test docs confirm Jest-compatible API; no additional package needed.

---

## 11. Deployment (systemd on mcow)

**Recommendation: systemd unit directly invoking `bun`, NO PM2.**

PM2 is a Node.js process manager — it works with Bun but adds a Node runtime dependency for no gain. On a systemd-managed host (Debian/Ubuntu LXC), systemd handles restart-on-crash, log capture to journald, and resource limits natively.

```ini
[Unit]
Description=Homelab Admin Dashboard
After=network.target

[Service]
Type=simple
User=homelab
WorkingDirectory=/opt/homelab-admin
ExecStart=/usr/local/bin/bun run start
Restart=always
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=/opt/homelab-admin/.env
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

`bun run start` executes `next start` via `package.json` scripts. Bun binary is a single static binary installed on mcow at `/usr/local/bin/bun`.

For the WebSocket terminal server: second systemd unit, same pattern, port 3001.

**Confidence:** HIGH — systemd is the standard for Debian LXC; Bun single-binary deployment is straightforward.

---

## 12. Logging

**Recommendation: pino 10.3.1**

| Package | Version | Purpose |
|---------|---------|---------|
| `pino` | **10.3.1** | Structured JSON logging |
| `pino-pretty` | **13.x** | Dev-mode human-readable output (dev dep only) |

**Why pino over winston:** pino is 5-8x faster than winston (async, streams-based), outputs newline-delimited JSON natively, and integrates with journald cleanly. winston is older, slower, and more complex to configure for structured output. For a systemd service, pino JSON → journald → `journalctl -u homelab-admin -o json` is the standard pipeline.

```typescript
import pino from 'pino';
export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
```

In dev: `bun run dev 2>&1 | bunx pino-pretty`

**Confidence:** HIGH — pino is the standard for performance-sensitive Node/Bun apps; journald JSON support is well-documented.

---

## 13. Env/Config Validation

**Recommendation: zod + Bun's built-in dotenv. No `dotenv` package needed.**

| Package | Version | Purpose |
|---------|---------|---------|
| `zod` | **4.3.6** | Schema validation for env vars + API inputs |

Bun natively loads `.env` files — `process.env` is populated automatically. No `dotenv` package needed.

```typescript
// lib/env.ts
import { z } from 'zod';

const EnvSchema = z.object({
  PROMETHEUS_URL: z.string().url(),
  PROXMOX_API_TOKEN: z.string(),
  TELEGRAM_BOT_TOKEN: z.string(),
  LOG_LEVEL: z.enum(['trace','debug','info','warn','error']).default('info'),
});

export const env = EnvSchema.parse(process.env);
```

Zod is also used for API route input validation and VoidNet API response validation — consolidate on one library rather than adding `yup` or `joi`.

**Zod 4 vs Zod 3 gotcha:** shadcn/ui form examples and most tutorials reference Zod 3 (`3.x`). Zod 4 has API changes. Verify shadcn form integration works with Zod 4 before committing; if not, pin `zod@3.24.x` and migrate later.

**Confidence:** HIGH — Bun dotenv behavior documented; Zod 4.x is stable; TS 5 compatible.

---

## Complete Dependency Reference

### Production dependencies

```bash
bun add next@15.2.4 react@19.2.5 react-dom@19.2.5
bun add drizzle-orm@0.45.2
bun add recharts@3.8.1
bun add prometheus-query@3.5.1
bun add js-yaml@4.1.0
bun add ssh2@1.17.0
bun add @xterm/xterm@6.0.0 @xterm/addon-fit @xterm/addon-web-links
bun add grammy@1.42.0
bun add pino@10.3.1
bun add zod@4.3.6
```

### Dev dependencies

```bash
bun add -d drizzle-kit@0.31.10
bun add -d @types/react@19.2.14 @types/react-dom @types/ssh2 @types/js-yaml
bun add -d typescript
bun add -d @playwright/test@1.59.1
bun add -d pino-pretty
```

### No npm packages needed for

- **Proxmox API** — raw `fetch` with typed wrapper
- **dotenv** — Bun built-in
- **Unit testing** — `bun test` built-in
- **SOPS read/write** — `sops` CLI subprocess
- **Tailscale auth** — standard HTTP header parsing in `middleware.ts`

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| SQLite driver | `bun:sqlite` (built-in) | `better-sqlite3` | Native N-API binding; risky on Bun upgrades |
| Charts | Recharts | Tremor | Own design system conflicts with shadcn/ui |
| Charts | Recharts | Visx | Too low-level; high boilerplate for 4-5 chart types |
| SSH | `ssh2` | `node-ssh` | node-ssh hides PTY streams needed for xterm.js |
| Proxmox | raw fetch | `proxmox-api` npm | Sparse docs, low adoption; REST API is simple |
| Telegram | grammY | Telegraf | Telegraf TS types are complex; Node-first not Bun-first |
| Logging | pino | winston | winston 5-8x slower; harder to configure structured output |
| Test runner | `bun test` | Vitest | Vitest is Vite-optimized; `bun test` is zero-config native |
| Process mgr | systemd | PM2 | PM2 adds Node runtime dep; systemd already on mcow |
| SOPS integration | CLI subprocess | `sops-age` JS lib | sops-age is decrypt-only; cannot write back encrypted files |

---

## Known Gotchas

1. **`bun:sqlite` in Next.js middleware:** Bun's SQLite driver only works in Bun runtime, not the Next.js Edge Runtime. Keep all DB access in Server Components or API routes, never in `middleware.ts` (which runs on the edge runtime even in local Bun).

2. **`@xterm/xterm` is a breaking rename from `xterm`:** the old `xterm` package is deprecated as of v5. Import from `@xterm/xterm` and `@xterm/addon-*`.

3. **Proxmox self-signed TLS:** Install Proxmox CA cert on mcow (`/usr/local/share/ca-certificates/` + `update-ca-certificates`) for clean TLS. Avoid global `NODE_TLS_REJECT_UNAUTHORIZED=0`.

4. **WebSocket + Next.js App Router:** App Router does not support `ws://` upgrades on the Next.js port without a custom server. Plan a separate `bun ws-server.ts` on port 3001 + second systemd unit for the xterm.js terminal. Caddy proxies `/terminal/ws` to it.

5. **pino in Next.js dev mode:** `pino-pretty` must only load in dev. Use transport config: `pino({ transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined })`.

6. **Zod 4 + shadcn/ui forms:** shadcn/ui examples were written for Zod 3. Test form validation with Zod 4 early; the `z.object` API is compatible but some refinement methods changed. Fallback: pin `zod@3.24.x`.

---

## Sources

- [Bun + Next.js guide](https://bun.com/docs/guides/ecosystem/nextjs) — HIGH confidence
- [Drizzle ORM + bun:sqlite](https://orm.drizzle.team/docs/connect-bun-sqlite) — HIGH confidence
- [shadcn/ui React 19 + Recharts](https://ui.shadcn.com/docs/react-19) — HIGH confidence
- [Tailscale identity headers](https://tailscale.com/docs/concepts/tailscale-identity) — HIGH confidence
- [Tailscale id-headers-demo](https://github.com/tailscale-dev/id-headers-demo) — HIGH confidence
- [grammY framework](https://grammy.dev/) — HIGH confidence
- [prometheus-query npm](https://www.npmjs.com/package/prometheus-query) — MEDIUM confidence
- [sops-age JS library (decrypt-only)](https://github.com/humphd/sops-age) — MEDIUM confidence
- npm registry version checks — all versions verified 2026-04-16
