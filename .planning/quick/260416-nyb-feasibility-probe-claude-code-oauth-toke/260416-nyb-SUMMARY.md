---
id: 260416-nyb
mode: quick
date: 2026-04-16
verdict: BLOCKED (token scope)
---

# Quick Probe Summary — OAuth `/api/oauth/usage` feasibility

## TL;DR

**BLOCKED.** The operator's `sk-ant-oat01-*` token has **inference scope only** (`user:inference`) and lacks the `user:profile` scope that `/api/oauth/usage` requires. The endpoint itself is live and reachable; this specific token cannot read it. **v2.0 milestone Phase 05 feasibility is not proven with this token.**

Secondary finding: mcow (Moscow) is **geo-blocked at Anthropic's edge WAF** — confirms D-05-13 (App Connector via nether is required for the real soak).

## Findings

### 1. mcow → api.anthropic.com: WAF-blocked pre-auth

```
GET https://api.anthropic.com/            → 403 remote_ip=160.79.104.10
GET https://api.anthropic.com/api/oauth/usage (with token) → 403
Body: {"error":{"type":"forbidden","message":"Request not allowed"}}
```

- Same vague body for every path (including unauth'd `/`). Not an auth check — WAF geo-deny.
- `remote_ip=160.79.104.10` = public Anthropic edge IP, NOT a Tailscale 100.x. Confirms mcow is hitting the internet directly, connector for `api.anthropic.com` is NOT yet configured (as expected — Phase 05-01 not executed).
- Baseline: matches v1.0 Telegram egress lesson — Moscow ISP/Anthropic geo-fence blocks this traffic shape.

### 2. nether (NL) → api.anthropic.com: passes WAF, hits auth layer

```
GET https://api.anthropic.com/api/oauth/usage (with token)
→ 403
Body: {"type":"error","error":{"type":"permission_error",
       "message":"OAuth token does not meet scope requirement user:profile"}}
```

Different error shape = request reached Anthropic's app layer, token was parsed, scope check failed.

### 3. Scope inventory for THIS token (from nether)

| Endpoint | Method | Status | Body signal |
|----------|--------|--------|-------------|
| `/v1/messages` (Haiku 4.5, 5 tokens) | POST | **200** | Full Haiku response — `user:inference` scope present |
| `/api/oauth/profile` | GET | 403 | requires `any_of(user:profile, user:office)` |
| `/api/oauth/usage` | GET | 403 | requires `user:profile` |
| `/api/oauth/claude_cli/usage` | GET | 404 | endpoint not found |
| `/api/claude_code/usage` | GET | 404 | endpoint not found |
| `/api/oauth/me` | GET | 404 | not found |
| `/api/oauth/token/info` | GET | 404 | not found |
| `/api/oauth/scopes` | GET | 404 | not found |

**Conclusion:** This token carries `user:inference` only. The `/api/oauth/usage` endpoint is the right endpoint (STACK.md §Critical confirmed), but this token type can't read it.

## Why this matters for v2.0

Phase 05 assumed (D-05-04) that reusing the **operator's existing OAuth token** would work for the 24h soak. That assumption is falsified for the token provided.

Two open paths:

1. **Regenerate a token with `user:profile` scope.** `claude setup-token` output varies by flow — a token created via Claude Code's OAuth login (browser round-trip from `claude` CLI) grants `user:profile` (CLI needs it to display "logged in as"). A bare API token does not. **Requires operator to inspect how the provided token was minted.**
2. **Switch away from endpoint-scrape.** D-05-01 explicitly rejected local-log/ccusage fallback. If a scoped token can't be produced, the milestone may need re-scoping.

## Security hygiene

- Token passed via SSH `export` + curl `-H Authorization: Bearer` — never written to disk on mcow/nether.
- No repo commit contains the token.
- Probe responses committed contain no token material (Authorization header never echoed in error bodies; request_ids only).

## Next actions (for operator)

1. Decide: regenerate token with `user:profile` scope, or re-scope v2.0 milestone.
2. If regenerating: verify new token scope via `/api/oauth/profile` from nether (expected 200, not 403).
3. Independent of #1: Phase 05-01 (App Connector `api.anthropic.com` admin-console entry) is still needed for mcow egress — this probe confirmed WAF geo-block is real.

## Evidence

Raw transcripts captured in this conversation (not persisted — disposable probe). Reproduce by re-running the three curls above from nether with any token whose scope inventory you want to check.
