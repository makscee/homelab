---
id: backlog-subscription-expiry
captured: 2026-04-21
source: Phase 20 UAT conversation
---

# Track Claude subscription expiry on /tokens

## Ask
Display subscription renewal / expiry date per token on /tokens page.

## Current state
- Exporter surfaces `claude_usage_5h_reset_timestamp` and `claude_usage_7d_reset_timestamp` — these are **window resets**, not subscription end.
- Anthropic usage API does not clearly expose an absolute subscription-end timestamp for OAuth tokens (needs confirmation).

## Investigation TODO
- Check `/v1/organizations/usage_report` and `/v1/oauth/token/introspect` (or equivalents) for a `subscription.renews_at` / `expires_at` field.
- If not exposed, consider storing `added_at` + known billing cycle (monthly from added_at) as a heuristic.

## Schema change (when data available)
Extend `TokenEntrySchema` in `apps/admin/lib/sops.server.ts` with optional `expires_at: z.string().datetime().optional()`. Surface as new column on /tokens table.
