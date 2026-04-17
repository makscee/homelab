---
phase: 14
plan: 02
subsystem: audit
tags: [sqlite, audit, bun, ansible, systemd, security, redaction]
dependency_graph:
  requires: []
  provides: [logAudit, redactPayload, audit-db-singleton, audit-dir-provisioning]
  affects: [apps/admin/lib/audit.server.ts, apps/admin/lib/audit-db.server.ts, apps/admin/lib/redact.server.ts, servers/mcow/homelab-admin.service, ansible/playbooks/deploy-homelab-admin.yml]
tech_stack:
  added: [bun:sqlite, @types/bun]
  patterns: [singleton-db, TDD-red-green, webpack-externals-shim, prepared-statements]
key_files:
  created:
    - apps/admin/lib/audit-db.server.ts
    - apps/admin/lib/audit.server.test.ts
    - apps/admin/lib/redact.server.test.ts
    - apps/admin/lib/bun-sqlite-shim.js
    - apps/admin/lib/bun-sqlite-shim.ts
    - ansible/playbooks/tasks/homelab-admin-audit-dir.yml
  modified:
    - apps/admin/lib/audit.server.ts
    - apps/admin/lib/redact.server.ts
    - apps/admin/.env.example
    - apps/admin/next.config.mjs
    - apps/admin/tsconfig.json
    - apps/admin/package.json
    - ansible/playbooks/deploy-homelab-admin.yml
    - servers/mcow/homelab-admin.service
decisions:
  - "bun:sqlite build shim via webpack externals callback interceptor — alias approach didn't fire before Next.js default externals; callback intercepts bun:sqlite first, returns commonjs path to bun-sqlite-shim.js"
  - "emitAudit() compat shim kept in audit.server.ts (PLAN-03-MIGRATE) — Phase 13 call-sites unchanged until Plan 03"
  - "WAL test uses PRAGMA synchronous=NORMAL (value=1) instead of journal_mode — :memory: always returns 'memory' for journal_mode, not 'wal'"
  - "@types/bun added as devDependency + types in tsconfig to satisfy Next.js TypeScript build"
metrics:
  duration: ~45min
  completed: 2026-04-17
  tasks_completed: 3
  files_modified: 14
requirements: [INFRA-05]
---

# Phase 14 Plan 02: SQLite Audit Log + Redaction Summary

Replaced the Phase 13 stdout audit stub with a `bun:sqlite`-backed `audit_log` table, implemented recursive payload redaction, and wired host-side Ansible provisioning + systemd allowlist.

## What Was Built

**Task 1 — redactPayload() (TDD)**
- Added `DENY_KEYS` set (9 keys) and `redactPayload()` to `redact.server.ts`
- Handles: strings (TOKEN_PATTERN replace), arrays (recursive map), objects (recursive with case-insensitive key check), primitives (passthrough)
- 8 tests green; `server-only` sentinel preserved; TOKEN_PATTERN confirmed `g`-flag

**Task 2 — audit-db.server.ts + audit.server.ts rewrite (TDD)**
- `getAuditDb()` singleton: WAL mode, NORMAL sync, FK on, idempotent schema (`CREATE TABLE IF NOT EXISTS audit_log`)
- `logAudit(AuditInput)` prepared-insert: `redactPayload()` applied before INSERT, 8192-byte truncation, ISO 8601 UTC timestamp
- TEMP compat shim: `emitAudit()` → `logAudit()` adapter for Phase 13 call-sites (removed in Plan 03)
- 9 tests green (insert, redaction, TOKEN_PATTERN, truncation, synchronous pragma, idempotent schema, NULL fields)
- Build fix: bun:sqlite is Bun-native; Next.js Node.js build worker can't resolve it. Fixed via webpack externals callback interceptor + `bun-sqlite-shim.js` CommonJS stub
- Added `@types/bun` devDep + `types` in tsconfig for TypeScript resolution

**Task 3 — Ansible + systemd**
- New task file `homelab-admin-audit-dir.yml`: creates `/var/lib/homelab-admin` owner=homelab-admin mode=0750
- Wired into `deploy-homelab-admin.yml` via `include_tasks` before Stage 8 (systemd unit install)
- `homelab-admin.service`: appended `/var/lib/homelab-admin` to `ReadWritePaths`; added `AUDIT_DB_PATH` env var
- `ProtectSystem=strict` and all hardening directives preserved
- Ansible syntax-check clean

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | fb49caa | feat(14-02): add redactPayload() recursive redactor |
| 2 | 4385169 | feat(14-02): implement bun:sqlite audit_log + rewrite audit.server.ts |
| 3 | aefb217 | feat(14-02): Ansible audit dir provisioning + systemd ReadWritePaths allowlist |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] bun:sqlite DB_PATH read at module load time**
- Found during: Task 2 GREEN phase (tests failing with SQLiteError: unable to open database file)
- Issue: `const DB_PATH = process.env.AUDIT_DB_PATH ?? "..."` evaluated at import time before `beforeEach` set `AUDIT_DB_PATH=":memory:"`
- Fix: moved path resolution inside `getAuditDb()` so env var is read at call time
- Files: `apps/admin/lib/audit-db.server.ts`
- Commit: 4385169

**2. [Rule 1 - Bug] WAL test incompatible with :memory: databases**
- Found during: Task 2 GREEN phase (test expecting "wal" received "memory")
- Issue: SQLite `:memory:` databases always report `journal_mode = memory`; WAL cannot be applied
- Fix: replaced WAL pragma test with `PRAGMA synchronous` check (returns 1 = NORMAL), which confirms the init pragmas ran
- Files: `apps/admin/lib/audit.server.test.ts`
- Commit: 4385169

**3. [Rule 2 - Missing] @types/bun required for TypeScript build**
- Found during: Task 2 build verification (`bun run build`)
- Issue: `import { Database } from "bun:sqlite"` caused TS error "Cannot find module 'bun:sqlite' or its corresponding type declarations"
- Fix: `bun add -d @types/bun@1.3.12`; added `"types": ["@types/bun"]` to tsconfig.json
- Files: `apps/admin/package.json`, `apps/admin/tsconfig.json`
- Commit: 4385169

**4. [Rule 1 - Bug] Next.js Node.js build worker cannot resolve bun:sqlite**
- Found during: Task 2 build verification
- Issue: Next.js "collecting page data" runs bundled routes in a Node.js worker; `require("bun:sqlite")` fails because bun:sqlite is a Bun-native virtual module
- Fix attempts: `serverExternalPackages` (no effect), webpack alias (bypassed by Next.js default externals), async webpack (rejected by Next.js), then webpack externals callback interceptor + `bun-sqlite-shim.js` CommonJS stub — this worked
- Files: `apps/admin/next.config.mjs`, `apps/admin/lib/bun-sqlite-shim.js`, `apps/admin/lib/bun-sqlite-shim.ts`
- Commit: 4385169

## Known Stubs

None. `logAudit()` is fully wired: real SQLite insert with redaction and truncation. Phase 13 `emitAudit()` shim is intentional (documented PLAN-03-MIGRATE) — Plan 03 migrates call-sites.

## Threat Flags

None. All T-14-02-xx mitigations implemented:
- T-14-02-01: `redactPayload()` recursive walker tested
- T-14-02-02: `db.prepare()` positional `?` params only — no string concat
- T-14-02-03: PAYLOAD_MAX=8192 truncation tested
- T-14-02-04: Ansible dir 0750 + systemd ReadWritePaths allowlist
- T-14-02-07: `sanitizeErrorMessage` already wraps client responses (Phase 13)

## Self-Check

## Self-Check: PASSED

- FOUND: apps/admin/lib/audit-db.server.ts
- FOUND: apps/admin/lib/audit.server.ts
- FOUND: apps/admin/lib/redact.server.ts
- FOUND: ansible/playbooks/tasks/homelab-admin-audit-dir.yml
- FOUND: servers/mcow/homelab-admin.service
- FOUND commit fb49caa (Task 1)
- FOUND commit 4385169 (Task 2)
- FOUND commit aefb217 (Task 3)
