---
phase: 12-infra-foundation
reviewed: 2026-04-17T00:00:00Z
depth: standard
files_reviewed: 51
files_reviewed_list:
  - .gitignore
  - ansible/group_vars/all.yml
  - ansible/playbooks/deploy-homelab-admin.yml
  - ansible/playbooks/tasks/homelab-admin-secrets.yml
  - ansible/playbooks/templates/caddy-homelab-admin.conf.j2
  - ansible/requirements.yml
  - apps/admin/.env.example
  - apps/admin/README.md
  - apps/admin/app/(auth)/alerts/page.tsx
  - apps/admin/app/(auth)/box/[vmid]/terminal/page.tsx
  - apps/admin/app/(auth)/layout.tsx
  - apps/admin/app/(auth)/page.tsx
  - apps/admin/app/(auth)/proxmox/page.tsx
  - apps/admin/app/(auth)/tokens/page.tsx
  - apps/admin/app/(auth)/voidnet/users/page.tsx
  - apps/admin/app/(public)/403/page.tsx
  - apps/admin/app/(public)/layout.tsx
  - apps/admin/app/(public)/login/page.tsx
  - apps/admin/app/api/auth/[...nextauth]/route.ts
  - apps/admin/app/api/health/route.ts
  - apps/admin/app/error.tsx
  - apps/admin/app/globals.css
  - apps/admin/app/layout.tsx
  - apps/admin/app/loading.tsx
  - apps/admin/app/not-found.tsx
  - apps/admin/auth.config.ts
  - apps/admin/auth.ts
  - apps/admin/components.json
  - apps/admin/components/common/coming-soon.tsx
  - apps/admin/components/layout/nav-items.ts
  - apps/admin/components/layout/sidebar.tsx
  - apps/admin/components/layout/topbar.tsx
  - apps/admin/components/ui/avatar.tsx
  - apps/admin/components/ui/button.tsx
  - apps/admin/components/ui/card.tsx
  - apps/admin/components/ui/dropdown-menu.tsx
  - apps/admin/components/ui/skeleton.tsx
  - apps/admin/eslint.config.mjs
  - apps/admin/lib/auth-allowlist.server.ts
  - apps/admin/lib/utils.ts
  - apps/admin/middleware.ts
  - apps/admin/next.config.mjs
  - apps/admin/package.json
  - apps/admin/postcss.config.mjs
  - apps/admin/tailwind.config.ts
  - apps/admin/tsconfig.json
  - apps/admin/types/next-auth.d.ts
  - docs/setup-github-oauth.md
  - package.json
  - servers/mcow/homelab-admin.service
  - servers/mcow/inventory.md
  - servers/mcow/lxc-probe.md
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-04-17T00:00:00Z
**Depth:** standard
**Files Reviewed:** 51
**Status:** issues_found

## Summary

This phase delivers the homelab-admin Next.js 15 shell: GitHub OAuth via Auth.js v5, a nonce-based CSP middleware, SOPS-encrypted secret delivery via Ansible, a systemd unit with strict KVM hardening, and Caddy TLS termination. The security architecture is solid — allowlist enforcement is applied at both the OAuth `signIn` callback and the Edge middleware, secrets never appear in logs (`no_log: true`), and in-memory secret facts are explicitly nulled after the env file is written.

Four warnings and four info items were found. No critical issues.

**Key concerns:**
- The `auth-allowlist.server.ts` module caches the allowlist at module-init time, meaning a redeploy is required to propagate allowlist changes without a process restart.
- The Ansible Bun install task pipes a remote install script directly through `bash` with no checksum verification.
- The `error.tsx` boundary leaks the raw `error.message` to the browser, which may expose internal stack traces in production.
- The sidebar has no active-route indicator, meaning the current page is not visually distinguished from other nav items.

---

## Warnings

### WR-01: `getAllowedLogins()` caches the allowlist permanently — changes require process restart

**File:** `apps/admin/lib/auth-allowlist.server.ts:3`
**Issue:** The `cached` variable is set once at first call and never invalidated. If `HOMELAB_ADMIN_ALLOWED_GITHUB_LOGINS` is updated and the env file is rewritten (e.g., a new operator is added via SOPS + redeploy), the running process continues to use the old allowlist until it is restarted. The Ansible playbook does restart the service when the env file changes (`notify: Restart homelab-admin`), so the real-world risk is limited to manual env edits — but the cache is a silent footgun if the restart is ever skipped or if the module is tested in-process with patched env vars.
**Fix:** Either remove the cache entirely (the `Set` construction from a short comma-separated string is negligible cost), or tie cache invalidation to the env value so tests and manual env patches take effect:
```ts
let cachedRaw: string | null = null;
let cached: Set<string> | null = null;

export function getAllowedLogins(): Set<string> {
  const raw = process.env.HOMELAB_ADMIN_ALLOWED_GITHUB_LOGINS ?? "";
  if (cached && raw === cachedRaw) return cached;
  cachedRaw = raw;
  cached = new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  return cached;
}
```

### WR-02: Bun install script piped directly to bash with no checksum verification

**File:** `ansible/playbooks/deploy-homelab-admin.yml:87`
**Issue:** The task runs `curl -fsSL https://bun.sh/install | bash -s "bun-v{{ _bun_version }}"`. This is a classic supply-chain risk: if `bun.sh` is compromised or the CDN is MITM'd, arbitrary code runs as root on mcow. The `-f` flag prevents silent failure on 4xx/5xx, and `-L` follows redirects, but there is no integrity check on the downloaded bytes.
**Fix:** After downloading, verify the installer against a known SHA-256 or GPG signature before executing. At minimum, download to a temp file and verify the expected hash for the pinned version before piping to bash:
```yaml
- name: Download Bun installer
  ansible.builtin.get_url:
    url: "https://bun.sh/install"
    dest: /tmp/bun-install.sh
    mode: '0700'
    checksum: "sha256:<known-sha-for-this-installer-version>"
- name: Install Bun
  ansible.builtin.command:
    cmd: /tmp/bun-install.sh "bun-v{{ _bun_version }}"
```
If pinning the installer checksum is not feasible, document this as an accepted risk in a comment and consider using a pre-built binary download URL with a versioned checksum instead.

### WR-03: `error.tsx` renders raw `error.message` in the browser

**File:** `apps/admin/app/error.tsx:14`
**Issue:** `<p className="mt-2 text-sm text-muted-foreground">{error.message}</p>` renders the raw JavaScript error message directly into the DOM. In production, this can expose internal implementation details (file paths, module names, database error strings) to the browser. Next.js 15 does sanitize error objects on the client by replacing messages with a generic string in production builds when errors originate server-side, but client-side thrown errors and errors from `"use client"` components will still expose their original `.message`.
**Fix:** Show a safe generic message and use `error.digest` (already rendered) as the reference identifier for log correlation:
```tsx
<p className="mt-2 text-sm text-muted-foreground">
  An unexpected error occurred. Use the digest below to report this.
</p>
```
If the full message is needed for dev debugging, gate it on `process.env.NODE_ENV !== "production"`.

### WR-04: `isStaticAsset` regex in middleware allows bypass via crafted path

**File:** `apps/admin/middleware.ts:10`
**Issue:** The static-asset bypass uses `/\.[a-z0-9]+$/i.test(p)` — it matches any path ending with a dot-extension. A request to `/admin-data.json` or `/api/secret.csv` (if such routes existed in the future) would bypass auth entirely because the regex matches a file extension. For the current route set this is not exploitable, but it is a fragile pattern that creates a hidden auth bypass condition for any future route that happens to have a dot in its name.
**Fix:** Tighten the static-asset check to only match known Next.js static prefixes rather than any extension:
```ts
const isStaticAsset = (p: string) =>
  p.startsWith("/_next/") || p === "/favicon.ico";
```
If serving other static files (fonts, images under `/public`), enumerate their prefixes explicitly rather than relying on an extension heuristic.

---

## Info

### IN-01: `sidebar.tsx` has no active-route highlight

**File:** `apps/admin/components/layout/sidebar.tsx:9-18`
**Issue:** All nav links use identical static class names with no active-state indicator. The current page is visually indistinguishable from other nav items. This is a UX gap that will become noticeable once pages beyond the stubs are implemented.
**Fix:** Replace `Link` with Next.js `usePathname()` in a `"use client"` component (or use a server-component approach with `headers()`) to conditionally apply an active class:
```tsx
"use client";
import { usePathname } from "next/navigation";
// ...
const pathname = usePathname();
className={cn(
  "rounded-md px-2 py-1.5 text-sm",
  pathname === item.href
    ? "bg-accent text-accent-foreground"
    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
)}
```

### IN-02: `tailwind.config.ts` missing `sidebar` color token referenced in sidebar component

**File:** `apps/admin/components/layout/sidebar.tsx:6` / `apps/admin/tailwind.config.ts`
**Issue:** `sidebar.tsx` uses `bg-sidebar` as a background class, but `sidebar` is not defined in the Tailwind color token extension in `tailwind.config.ts`. This will silently produce no background styling unless the token is defined elsewhere (e.g., via a shadcn theme override or a future globals.css variable). It will not cause a build error.
**Fix:** Either add `sidebar` to the Tailwind color tokens in `tailwind.config.ts`:
```ts
sidebar: "hsl(var(--sidebar))",
```
and add `--sidebar` to `globals.css`, or replace `bg-sidebar` with an existing token such as `bg-card` or `bg-background`.

### IN-03: `next-auth` dependency is a beta release pinned to a specific beta version

**File:** `apps/admin/package.json:20`
**Issue:** `"next-auth": "5.0.0-beta.31"` is pinned to a specific beta. Beta software may have unannounced breaking changes or security patches in subsequent beta releases. The `^` semver prefix is absent (intentionally, to prevent uncontrolled beta upgrades), but this means security patches in beta.32+ will not be automatically picked up.
**Fix:** This is an acceptable tradeoff for a private internal tool, but document the intent explicitly in `package.json` or `README.md`, and add a periodic review reminder. When Auth.js v5 reaches stable, migrate promptly.

### IN-04: `deploy-homelab-admin.yml` renders Caddy config to `/tmp` on the controller with fixed filename

**File:** `ansible/playbooks/deploy-homelab-admin.yml:241-244`
**Issue:** The template is rendered to `/tmp/caddy-homelab-admin.conf` on the controller without a unique suffix. Concurrent runs of the playbook (e.g., from two operator machines simultaneously) would overwrite each other's temp file. This is a low-probability issue for a single-operator homelab, but the pattern is worth noting.
**Fix:** Use `ansible_date_time.epoch` or `ansible_hostname` in the temp path, or use the `tempfile` module:
```yaml
- name: Create temp file for Caddy block
  delegate_to: localhost
  ansible.builtin.tempfile:
    state: file
    suffix: .caddy
  register: caddy_tmp
```
Then render to `caddy_tmp.path` and clean it up afterward.

---

_Reviewed: 2026-04-17T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
