---
id: 260416-nyb
mode: quick
description: Feasibility probe — Claude Code OAuth token usage stats on mcow
date: 2026-04-16
---

# Quick Probe — OAuth `/api/oauth/usage` feasibility

## Goal
Before committing to v2.0 milestone Phase 05 soak, empirically check whether the operator's `sk-ant-oat01-*` token can read `https://api.anthropic.com/api/oauth/usage` from mcow. One-shot smoke, no systemd timer, no repo writes.

## Tasks

### Task 1: Probe from mcow
- **action:** `ssh root@mcow` + curl `GET /api/oauth/usage` with `Authorization: Bearer <tok>` + `anthropic-beta: oauth-2025-04-20`.
- **verify:** Record HTTP status, response body (no Authorization echoed), remote_ip.
- **done:** Status + body captured.

### Task 2: Triangulate from nether (NL)
- **action:** Repeat same request from nether — isolates geo block vs auth issue.
- **verify:** Compare response shape/body between mcow and nether.
- **done:** Two transcripts on hand.

### Task 3: Scope discovery
- **action:** Probe `/v1/messages`, `/api/oauth/profile`, `/api/oauth/me`, `/api/oauth/token/info`, `/api/oauth/scopes` with same token from nether.
- **verify:** Record which endpoints return 200 vs 403 (scope error) vs 404.
- **done:** Token scope inventory captured.

## Scope/non-goals
- No App Connector changes (admin-console action, separate Phase 05-01).
- No systemd units, no JSONL logger, no repo config files — disposable probe only.
- Token is NOT written to repo.
