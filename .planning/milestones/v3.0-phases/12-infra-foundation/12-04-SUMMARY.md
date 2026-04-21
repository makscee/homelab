---
phase: 12-infra-foundation
plan: "04"
subsystem: apps/admin
tags: [auth, nextauth, github-oauth, middleware, csp, security-headers, edge]
dependency_graph:
  requires: [12-01]
  provides: [auth-gate, csp-middleware, login-page, 403-page, allowlist-enforcement]
  affects: [12-05, 12-09, 12-10]
tech_stack:
  added:
    - next-auth@5.0.0-beta.31
    - "@auth/core@0.34.3"
    - server-only@0.0.1
  patterns:
    - Auth.js v5 split-config (auth.config.ts Edge-safe, auth.ts Node-only)
    - Edge middleware with per-request CSP nonce via crypto.getRandomValues
    - server-only guard on allowlist lib (P-03 RSC secret leak prevention)
    - Inline Edge-safe allowlist check in middleware (avoids server-only import in Edge runtime)
key_files:
  created:
    - apps/admin/auth.config.ts
    - apps/admin/auth.ts
    - apps/admin/lib/auth-allowlist.ts
    - apps/admin/types/next-auth.d.ts
    - apps/admin/app/api/auth/[...nextauth]/route.ts
    - apps/admin/middleware.ts
    - apps/admin/app/login/page.tsx
    - apps/admin/app/403/page.tsx
  modified:
    - apps/admin/package.json
    - bun.lock
decisions:
  - "next-auth@5.0.0-beta.31 pinned (v5 stable not yet released; beta tag resolves to this exact version)"
  - "Middleware inlines allowlist check rather than importing lib/auth-allowlist.ts — avoids importing server-only into Edge runtime"
  - "Local dev smoke test skipped (curl blocked by context-mode sandbox); build verification (exit 0) accepted as gate per plan spec"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-17"
  tasks_completed: 2
  tasks_total: 2
  files_created: 8
  files_modified: 2
---

# Phase 12 Plan 04: Auth.js v5 GitHub OAuth + Security Middleware Summary

Auth.js v5 (5.0.0-beta.31) GitHub OAuth wired with JWT 8h sessions, allowlist enforcement in Edge middleware, nonce-based CSP + HSTS + X-Frame-Options on every response, and functional /login + /403 pages.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install Auth.js v5, scaffold auth config + allowlist + API route | 95e60de | auth.ts, auth.config.ts, lib/auth-allowlist.ts, types/next-auth.d.ts, app/api/auth/[...nextauth]/route.ts |
| 2 | Edge middleware + CSP/HSTS/XFO + login/403 pages | 266d341 | middleware.ts, app/login/page.tsx, app/403/page.tsx |

## Key Outputs

**next-auth version resolved:** `5.0.0-beta.31` (dist-tag: `beta`; `latest` is still 4.24.14 — v5 not yet stable)

**Local dev smoke:** Skipped — `curl` blocked by context-mode sandbox rules. Build verification (`bun run build` exit 0 with all routes present in output) accepted as the build gate. Deploy-time smoke (real GitHub OAuth, redirect, 403) is Plan 10's job.

**Security headers confirmed in middleware.ts (applied on every response):**
- `Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{per-request}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://avatars.githubusercontent.com; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Middleware inlines allowlist check instead of importing server-only lib**
- **Found during:** Task 2 — `lib/auth-allowlist.ts` starts with `import "server-only"` which throws at import in Edge runtime
- **Issue:** Plan's middleware code imported `isLoginAllowed` from `@/lib/auth-allowlist`, but Edge runtime rejects `server-only` imports
- **Fix:** Inlined the same allowlist logic as `isLoginAllowedEdge()` in `middleware.ts` — reads the same `HOMELAB_ADMIN_ALLOWED_GITHUB_LOGINS` env var, identical O(1) Set lookup semantics, no `server-only` import
- **Files modified:** apps/admin/middleware.ts
- **Commit:** 266d341

## Auth.js v5 API Surprises (for Phase 13+)

- `next-auth@5` is a semver beta tag on npm (`5.0.0-beta.31`); it will NOT resolve with `bun add next-auth@5` (no matching stable version). Must pin exact beta string: `bun add next-auth@5.0.0-beta.31`.
- A transitively-pulled `@auth+core@0.41.2` (via another dep) emits `DecompressionStream` Edge runtime warning during build. This is non-fatal — build succeeds. The pinned `@auth/core@0.34.3` used by `next-auth@5.0.0-beta.31` is the correct dependency; the 0.41.2 warning is from a separate transitive path.
- Auth.js v5 split-config is mandatory: `auth.config.ts` (Edge-safe, no Node-only imports) for middleware; `auth.ts` (full config with callbacks) for server components and API route. Middleware must call `NextAuth(authConfig)` using the edge-safe config only.
- `signIn` callback in `auth.ts` is the primary allowlist gate (no session issued for non-allowlisted logins). Middleware is a secondary defense-in-depth gate.

## Known Stubs

None — all acceptance criteria are wired to real logic. The `/login` and `/403` pages are functional server components. Real end-to-end OAuth flow verified in Plan 10 after deploy.

## Self-Check: PASSED

- apps/admin/auth.ts — FOUND
- apps/admin/auth.config.ts — FOUND
- apps/admin/lib/auth-allowlist.ts — FOUND
- apps/admin/middleware.ts — FOUND
- apps/admin/app/login/page.tsx — FOUND
- apps/admin/app/403/page.tsx — FOUND
- Commit 95e60de — FOUND
- Commit 266d341 — FOUND
- `bun run build` — exit 0 confirmed
