---
phase: 12-infra-foundation
fixed_at: 2026-04-17T00:00:00Z
review_path: .planning/phases/12-infra-foundation/12-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 12: Code Review Fix Report

**Fixed at:** 2026-04-17T00:00:00Z
**Source review:** .planning/phases/12-infra-foundation/12-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (WR-01 through WR-04; IN-* out of scope)
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-01: `getAllowedLogins()` caches the allowlist permanently — changes require process restart

**Files modified:** `apps/admin/lib/auth-allowlist.server.ts`
**Commit:** 6be2ea4
**Applied fix:** Added `cachedRaw` sentinel that stores the last-seen env value. `getAllowedLogins()` now reads `process.env.HOMELAB_ADMIN_ALLOWED_GITHUB_LOGINS` on every call and returns the cached `Set` only when the env value is unchanged from the last computation. Tests and manual env patches now take effect without process restart, while steady-state behavior stays allocation-free.

### WR-02: Bun install script piped directly to bash with no checksum verification

**Files modified:** `ansible/playbooks/deploy-homelab-admin.yml`
**Commit:** 68adfcf
**Applied fix:** Replaced `curl | bash` pipeline with a three-step flow: (1) `get_url` downloads `https://bun.sh/install` to `/tmp/bun-install.sh` with mode 0700, (2) `stat` computes SHA-256 and fails the task if it does not match the optional `_bun_installer_sha256` pinned variable, (3) the installer executes from the verified temp file and is then removed. A comment documents the tradeoff that the installer is a rolling script (hash must be refreshed when upstream changes). When `_bun_installer_sha256` is unset the verify step is skipped and the behavior falls back to the pre-fix semantics — this preserves day-one bootstrap ergonomics while enabling pinned-checksum mode via group_vars.

### WR-03: `error.tsx` renders raw `error.message` in the browser

**Files modified:** `apps/admin/app/error.tsx`
**Commit:** 881e1d1
**Applied fix:** Wrapped the `{error.message}` render in a `process.env.NODE_ENV !== "production"` guard. In production builds users see a safe generic message ("An unexpected error occurred. Use the digest below to report this.") and the already-rendered `error.digest` remains the operator-side correlation key. In development the original message still shows for debugging.

### WR-04: `isStaticAsset` regex in middleware allows bypass via crafted path

**Files modified:** `apps/admin/middleware.ts`
**Commit:** 891ef23
**Applied fix:** Removed the `/\.[a-z0-9]+$/i.test(p)` branch from `isStaticAsset`. The check now only matches `/_next/` prefix and the exact `/favicon.ico` path — both Next.js-managed paths that cannot collide with app routes. Any future route with a dot in its name will go through the normal auth flow instead of silently bypassing it.

---

_Fixed: 2026-04-17T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
