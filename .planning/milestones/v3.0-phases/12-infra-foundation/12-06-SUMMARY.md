---
phase: 12-infra-foundation
plan: "06"
subsystem: docs
tags: [oauth, security, docs, runbook]
dependency_graph:
  requires: [12-01]
  provides: [docs/setup-github-oauth.md, apps/admin/README.md]
  affects: [12-08, 12-09]
tech_stack:
  added: []
  patterns: [SOPS-key-reference, SEC-04-server-only, SEC-05-zod-routes, SEC-07-cookie-flags]
key_files:
  created:
    - docs/setup-github-oauth.md
    - apps/admin/README.md
  modified: []
decisions:
  - "D-12-06: GitHub OAuth app callback URL pinned to https://homelab.makscee.ru/api/auth/callback/github"
  - "AUTH_SECRET generated via openssl rand -base64 32; stored in SOPS homelab_admin.auth_secret"
  - "SEC-04/05/07 policy gates documented in apps/admin/README.md for Phase 13+ executor inheritance"
metrics:
  duration: "5m"
  completed: "2026-04-17"
  tasks_completed: 2
  files_created: 2
---

# Phase 12 Plan 06: Operator Docs (OAuth Runbook + Admin README) Summary

**One-liner:** GitHub OAuth one-time setup runbook and homelab-admin dev/policy README with SEC-04/05/07 forward gates.

## What Was Built

Two operator-facing docs committed — no code changes:

1. **`docs/setup-github-oauth.md`** — Unambiguous 5-step runbook for creating the GitHub OAuth app, generating AUTH_SECRET via `openssl rand -base64 32`, writing all four values into `secrets/mcow.sops.yaml` under `homelab_admin:`, verifying decryption, and committing. Includes rotation procedures for both client secret and AUTH_SECRET. Local dev options (shared callback URL vs. separate dev app) documented.

2. **`apps/admin/README.md`** — Dev workflow (`bun run dev` on `:3847`), scripts table, all six prod env vars, all eight route stubs with phase ownership. Three explicit policy-gate sections: SEC-04 (`server-only` lint enforcement), SEC-05 (Zod on every Route Handler + Drizzle prepared statements forward policy for Phase 14+), SEC-07 (session cookie flags). P-17 lockfile policy. Links to `docs/setup-github-oauth.md` and `12-CONTEXT.md`.

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Task 1: OAuth runbook | 5e4d895 | docs/setup-github-oauth.md |
| Task 2: Admin README | 5274f0e | apps/admin/README.md |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. This is a docs-only plan; no UI/data stubs introduced.

## Threat Flags

None. Plan threat model reviewed; no new runtime surface introduced (docs only). T-12-06-02 mitigation confirmed: callback URL appears verbatim in `docs/setup-github-oauth.md` (grep-verifiable).

## Self-Check: PASSED

- `docs/setup-github-oauth.md` exists and contains all required strings
- `apps/admin/README.md` exists and contains SEC-04, SEC-05, SEC-07, Zod, server-only, bun.lockb, bun run dev
- Commits 5e4d895 and 5274f0e both exist in git log
