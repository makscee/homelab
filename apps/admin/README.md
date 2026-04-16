# homelab-admin

Next.js 15 + React 19 + Bun admin dashboard for `homelab.makscee.ru`.

**Decisions of record:** `.planning/phases/12-infra-foundation/12-CONTEXT.md` (D-12-01 through D-12-40).
**Threat model:** each Phase 12 plan's `<threat_model>` block.

## Dev Workflow

```bash
# From repo root (Bun workspace resolves apps/admin)
bun install --frozen-lockfile

# Create apps/admin/.env.local (gitignored) — see .env.example for keys
cp apps/admin/.env.example apps/admin/.env.local
# Fill in GitHub OAuth values (see docs/setup-github-oauth.md)

# Run dev server
cd apps/admin && bun run dev
# Open http://localhost:3847 — redirects to /login
```

## Scripts

| Script                          | Purpose                                                |
|---------------------------------|--------------------------------------------------------|
| `bun run dev`                   | Next.js dev mode on `127.0.0.1:3847`                   |
| `bun run build`                 | Production build (`output: 'standalone'`)              |
| `bun run start`                 | Start the built app on `127.0.0.1:3847`                |
| `bun run lint`                  | ESLint including the `server-only` rule (SEC-04 gate)  |
| `bun audit --audit-level high`  | Supply-chain audit (gates deploy — INFRA-07 / P-01)    |

## Policy Gates (Forward — enforced from Phase 13 onward)

These gates are scaffolded in Phase 12 and MUST hold for every PR / deploy:

### SEC-04 — `server-only` enforcement

- Any file that reads `process.env.*` OR calls a server-only library MUST start with `import "server-only"`.
- `eslint-plugin-server-only` rejects `"use client"` files that import from a `server-only` module (P-03).
- `bun run lint` runs this rule at `error` severity.

### SEC-05 — Zod validation on every Route Handler input

- Every new handler under `apps/admin/app/api/**/route.ts` MUST `.parse()` inputs with Zod 3.24.x (P-18).
- Pattern to mirror:
  ```ts
  import { z } from "zod";
  const BodySchema = z.object({ /* ... */ });
  export async function POST(req: Request) {
    const body = BodySchema.parse(await req.json());
    // ... handler logic
  }
  ```
- Zod errors convert to HTTP 400. NEVER `as unknown as T` to dodge the schema.

### SEC-05 — Drizzle prepared statements on every query

- DB lands in Phase 14 (audit log). From that point forward: every query MUST use Drizzle's `.prepare()` API. No raw SQL. No string interpolation into queries.
- Policy lives here so Phase 14 executors inherit it.

### SEC-07 — Session cookie flags

- Auth.js v5 config in `auth.ts` sets `httpOnly: true`, `sameSite: "lax"`, `secure: process.env.NODE_ENV === "production"`, 8h TTL.
- Do NOT change these without updating `12-CONTEXT.md` D-12-37.

### P-17 — Commit `bun.lockb`

- `bun.lockb` at repo root is committed with any `package.json` change. Ansible deploy (Plan 09) uses `--frozen-lockfile`; an uncommitted lockfile breaks deploy.

## Environment Variables

All read from `/etc/homelab-admin/env` in prod (systemd `EnvironmentFile=`) OR `apps/admin/.env.local` in dev.

| Var                                       | Purpose                                            |
|-------------------------------------------|----------------------------------------------------|
| `AUTH_SECRET`                              | JWT signing (SOPS → 32+ bytes)                     |
| `AUTH_URL`                                 | `https://homelab.makscee.ru` in prod               |
| `HOMELAB_ADMIN_GITHUB_OAUTH_CLIENT_ID`     | GitHub OAuth client id (SOPS)                      |
| `HOMELAB_ADMIN_GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth client secret (SOPS)                  |
| `HOMELAB_ADMIN_ALLOWED_GITHUB_LOGINS`      | Comma-separated allowlist (SOPS, default `makscee`) |
| `HOMELAB_ADMIN_COMMIT_SHA`                 | Git SHA baked in at deploy time (Plan 09)          |

Secrets NEVER committed. `.env.local` is gitignored. See `docs/setup-github-oauth.md`.

## Routes (Phase 12 shell — all 8)

| Route                     | Status     | Owner Phase |
|---------------------------|------------|-------------|
| `/`                       | stub       | Phase 14    |
| `/tokens`                 | stub       | Phase 13    |
| `/voidnet/users`          | stub       | Phase 15    |
| `/proxmox`                | stub       | Phase 16    |
| `/alerts`                 | stub       | Phase 17    |
| `/box/[vmid]/terminal`    | stub       | Phase 18    |
| `/login`                  | functional | Phase 12    |
| `/403`                    | functional | Phase 12    |
| `/api/health`             | functional | Phase 12    |

## Deploy

```bash
cd ansible && ansible-playbook playbooks/deploy-homelab-admin.yml
```

See `ansible/playbooks/deploy-homelab-admin.yml` for the full pipeline (Plan 12-09).
