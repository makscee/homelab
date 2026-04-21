---
phase: 13-claude-tokens-page
reviewed: 2026-04-17T00:00:00Z
depth: standard
files_reviewed: 35
files_reviewed_list:
  - ansible/group_vars/all.yml
  - ansible/playbooks/deploy-claude-usage-exporter.yml
  - apps/admin/app/(auth)/layout.tsx
  - apps/admin/app/(auth)/tokens/_components/AddTokenButton.tsx
  - apps/admin/app/(auth)/tokens/_components/AddTokenDialog.tsx
  - apps/admin/app/(auth)/tokens/_components/DegradedBanner.tsx
  - apps/admin/app/(auth)/tokens/_components/DeleteTokenDialog.tsx
  - apps/admin/app/(auth)/tokens/_components/RenameTokenDialog.tsx
  - apps/admin/app/(auth)/tokens/_components/ResetCountdown.tsx
  - apps/admin/app/(auth)/tokens/_components/RotateTokenDialog.tsx
  - apps/admin/app/(auth)/tokens/_components/RowActions.tsx
  - apps/admin/app/(auth)/tokens/_components/Sparkline.tsx
  - apps/admin/app/(auth)/tokens/_components/TokensTable.tsx
  - apps/admin/app/(auth)/tokens/_components/UtilizationBar.tsx
  - apps/admin/app/(auth)/tokens/_lib/api-client.ts
  - apps/admin/app/(auth)/tokens/_lib/schemas.ts
  - apps/admin/app/(auth)/tokens/_lib/view-model.ts
  - apps/admin/app/(auth)/tokens/[id]/_components/DetailChart.tsx
  - apps/admin/app/(auth)/tokens/[id]/page.tsx
  - apps/admin/app/(auth)/tokens/loading.tsx
  - apps/admin/app/(auth)/tokens/page.tsx
  - apps/admin/app/api/tokens/[id]/rename/route.ts
  - apps/admin/app/api/tokens/[id]/rotate/route.ts
  - apps/admin/app/api/tokens/[id]/route.ts
  - apps/admin/app/api/tokens/[id]/toggle/route.ts
  - apps/admin/app/api/tokens/route.ts
  - apps/admin/lib/audit.server.ts
  - apps/admin/lib/csrf.server.ts
  - apps/admin/lib/csrf.shared.ts
  - apps/admin/lib/csrf-cookie.server.ts
  - apps/admin/lib/prometheus.server.ts
  - apps/admin/lib/sops.server.ts
  - apps/admin/lib/token-registry.server.ts
  - secrets/claude-tokens.sops.yaml
  - servers/mcow/claude-usage-exporter/exporter.py
  - servers/mcow/systemd/claude-usage-exporter.service
findings:
  critical: 1
  warning: 5
  info: 6
  total: 12
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-04-17
**Depth:** standard
**Files Reviewed:** 35
**Status:** issues_found

## Summary

Phase 13 implements a Claude OAuth token management page with SOPS-backed
storage, Prometheus-driven utilization metrics, and a tight
CSRF + degraded-mode contract. Security posture is strong: token values
never cross the server/client boundary in list responses, errors carrying
`sk-ant-oat01-*` substrings are globally redacted at the sops.server layer,
audit events force-redact the `value` field, and the exporter runs under
`nobody` with systemd hardening + Tailnet-only `IPAddressAllow`.

One **Critical** correctness bug: the dashboard queries PromQL names
(`claude_usage_5h_pct`, `claude_usage_7d_pct`, `claude_usage_reset_seconds`,
label `label`, reset dimension `window`) that do **not** match the metrics
actually exported by `exporter.py` (`claude_usage_5h_utilization`,
`claude_usage_7d_utilization`, `claude_usage_5h_reset_timestamp` /
`claude_usage_7d_reset_timestamp`, label `name`, no `window` label). Every
utilization column and the detail chart will render "pending" / empty. This
is a live-wire contract break between the two sides of Phase 13.

Five Warnings cover: a TOCTOU race in duplicate-label detection, an
unsanitized `value` parameter in the (currently unused) `setRegistryField`
shell arg concatenation, narrow `sanitizeErrorMessage` heuristic, CSRF
tolerance of missing `Origin`, and inconsistent 404 handling.

## Critical Issues

### CR-01: PromQL metric-name + label contract mismatch between UI and exporter

**File:** `apps/admin/app/(auth)/tokens/page.tsx:22-29`,
`apps/admin/app/(auth)/tokens/[id]/page.tsx:37`,
`apps/admin/app/(auth)/tokens/_lib/view-model.ts:90-103`,
`servers/mcow/claude-usage-exporter/exporter.py:68-107`
**Issue:** The admin page issues these PromQL queries:

- `claude_usage_5h_pct`
- `claude_usage_7d_pct`
- `claude_usage_reset_seconds` (expects `window` label with values
  `"five_hour"` / `"seven_day"`)
- view-model selects samples with `s.labels.label === entry.label`

The exporter publishes different metrics and a different label:

- `claude_usage_5h_utilization`, `claude_usage_7d_utilization`
  (values in 0..1, not 0..100)
- `claude_usage_5h_reset_timestamp`, `claude_usage_7d_reset_timestamp`
  (separate metric families, not a single metric with `window` label;
  they report an **absolute** reset timestamp, not seconds-until-reset)
- label is `name`, not `label`

Result: every `TokenRow.pct5h/pct7d` is `null`, the reset countdown is
always "unknown", the sparkline panel is empty, the detail chart shows
"No range data yet". The page renders, but no real data appears — the
dashboard is cosmetically healthy and functionally dark.

**Fix:** Pick one side of the contract and align. Simplest on the UI side:

```ts
// page.tsx
const [pct5h, pct7d, reset5h, reset7d, sparklines] = await Promise.all([
  queryInstant("claude_usage_5h_utilization * 100").catch(() => []),
  queryInstant("claude_usage_7d_utilization * 100").catch(() => []),
  queryInstant("claude_usage_5h_reset_timestamp - time()").catch(() => []),
  queryInstant("claude_usage_7d_reset_timestamp - time()").catch(() => []),
  queryRange(
    "claude_usage_7d_utilization * 100",
    sevenDaysAgo,
    now,
    3600,
    { revalidateSec: 60 },
  ).catch(() => []),
]);
```

```ts
// view-model.ts
function sampleByLabel(samples: PromInstantSample[], label: string) {
  const match = samples.find((s) => s.labels.name === label); // was .label
  return match ? match.value : null;
}
// Drop resetByWindow; pass reset5h / reset7d directly and match on .name.
```

```ts
// [id]/page.tsx
const promql = `claude_usage_7d_utilization{name="${safeLabel}"} * 100`;
```

Alternatively: add recording rules on Prometheus that republish the
exporter metrics under the `*_pct` / `*_reset_seconds{window=...}` names
and `label=` label the UI expects. Either path ships, but the current
state is a Plan 13-04/13-05 regression and needs a test that asserts the
UI-facing metric name list matches the exporter's registered gauges.

## Warnings

### WR-01: TOCTOU race on duplicate-label check — mutex covers write, not decrypt

**File:** `apps/admin/lib/token-registry.server.ts:116-160, 216-238`
**Issue:** `addToken`/`renameToken` call
`await sops().decryptRegistry()` **outside** the `withMutex` boundary
provided by `replaceRegistry`. Two concurrent Add-Token requests can both
read an identical registry, both pass `ensureUniqueLabel`, and then
serialize through the mutex — the second write wins and silently drops
the first (the duplicate label check never sees the in-flight peer).
Low probability on a single-operator dashboard, but still a data-loss
path.
**Fix:** Acquire the mutex around the entire decrypt→mutate→write cycle
(export a public `withRegistryLock()` from `sops.server.ts`, or make
`replaceRegistry` a helper that takes a `mutator(reg) => nextReg`
callback executed under the mutex). Example:

```ts
export async function mutateRegistry(
  registryPath: string,
  mutator: (reg: TokenRegistry) => Promise<TokenRegistry>,
): Promise<void> {
  return withMutex(async () => {
    const current = await decryptRegistry(registryPath);
    const next = await mutator(current);
    // existing replaceRegistry body inlined here
  });
}
```

### WR-02: Unsanitized `value` in `setRegistryField` --set argv concatenation

**File:** `apps/admin/lib/sops.server.ts:197-222`
**Issue:** `setRegistryField` validates `jsonPath` shape but concatenates
`value` verbatim into `setArg = \`${jsonPath} ${value}\``, then passes
that as the single argument to `sops --set`. Because it's argv-style
(not shell), OS command injection is not possible — but a caller passing
attacker-controlled `value` could inject additional SOPS `--set`
payload fragments (e.g., `" true]["other_field"] "malicious"`), as SOPS
parses the string itself. Function is currently **unused** (all mutation
paths use `replaceRegistry`), so this is a latent vulnerability.
**Fix:** Either delete `setRegistryField` (recommended — no live
callers), or constrain `value` with an allowlist regex matching the
intended JSON literal forms:

```ts
if (!/^(true|false|null|-?\d+(?:\.\d+)?|"[^"\\]*")$/.test(value)) {
  throw new SopsWriteError(registryPath, "invalid value literal");
}
```

### WR-03: `sanitizeErrorMessage` only catches token prefix at string start

**File:** `apps/admin/app/api/tokens/route.ts:25-30`,
`apps/admin/app/api/tokens/[id]/rename/route.ts:21-23`,
`apps/admin/app/api/tokens/[id]/rotate/route.ts:17-19`,
`apps/admin/app/api/tokens/[id]/toggle/route.ts:17-19`,
`apps/admin/app/api/tokens/[id]/route.ts:13-15`
**Issue:** `msg.startsWith("sk-ant-oat01-")` misses embedded leakage
like `"Error while inserting sk-ant-oat01-XYZ: ..."`. The upstream
`sops.server` `redact()` catches this globally, but a non-Sops error
path (e.g., a future `fs` error carrying a token substring, or any
library wrapping the message) would flow through the route handler
un-redacted. Defense-in-depth gap.
**Fix:** Use a global token-pattern redact in every handler (match
`sops.server.ts:80-84`):

```ts
const TOKEN_PATTERN = /sk-ant-oat01-[A-Za-z0-9_-]+/g;
function sanitizeErrorMessage(msg: string): string {
  return msg.replace(TOKEN_PATTERN, "[REDACTED]");
}
```

Consider extracting this to a shared `apps/admin/lib/redact.server.ts`
so the regex has one home.

### WR-04: CSRF verifier tolerates missing Origin header

**File:** `apps/admin/lib/csrf.server.ts:66-72`
**Issue:** `if (origin && origin !== EXPECTED_ORIGIN)` — a request with
no `Origin` at all passes Step 1. Modern browsers always send `Origin`
on same-origin fetches and cross-origin POSTs, so an attacker's cross-
site page cannot strip it. The residual risk is non-browser clients
(curl, Node server-side) forging a request — but those also can't read
the double-submit cookie from a victim's browser, so exploitation
requires already having stolen the cookie. Acceptable posture; flag
only because some CSRF guidance requires `Origin` mandatory on
non-idempotent methods.
**Fix (defense-in-depth):** Require `Origin` OR `Referer` to be present
and match:

```ts
const origin = req.headers.get("origin") ?? req.headers.get("referer");
if (!origin) throw new CsrfError("origin missing");
// For referer, strip path component before comparison.
const originOnly = origin.replace(/^(https?:\/\/[^/]+).*$/, "$1");
if (originOnly !== EXPECTED_ORIGIN) throw new CsrfError("bad origin");
```

### WR-05: Mutation failures return 400 instead of 404 for unknown id

**File:** `apps/admin/lib/token-registry.server.ts:78-82` plus all
API routes' catch arms.
**Issue:** `findEntry` throws `Error("token not found")` which every
route handler catches and maps to HTTP **400** with the message
"token not found" in the body. A 404 is the correct code and doesn't
reveal whether the id is shape-valid-but-missing vs. soft-deleted.
Clients (including the `RowActions` toast handlers) can't distinguish
"you tried to act on a deleted token" from "your body was malformed."
**Fix:** Raise a typed error and branch on it:

```ts
export class TokenNotFoundError extends Error { name = "TokenNotFoundError"; }
// in findEntry: throw new TokenNotFoundError("token not found");
// in route handlers:
if (e instanceof TokenNotFoundError) {
  return NextResponse.json({ error: "not found" }, { status: 404 });
}
```

## Info

### IN-01: `_redact` in exporter over-redacts trailing text

**File:** `servers/mcow/claude-usage-exporter/exporter.py:44-63`
**Issue:** `text.replace(text[text.index(_TOKEN_PREFIX):], marker, 1)`
slices from the first `sk-ant-oat01-` to end-of-string and replaces
the entire suffix. If a token appears mid-message (e.g.
`"HTTP 401 for sk-ant-oat01-XYZ at 2026-04-17"`), operators lose the
trailing `" at 2026-04-17"` context.
**Fix:** Use a regex bounded by the token's own character class:

```python
import re
_TOKEN_RE = re.compile(r"sk-ant-oat01-[A-Za-z0-9_-]+")
def _redact(s):
    if s is None: return ""
    text = s if isinstance(s, str) else str(s)
    return _TOKEN_RE.sub(f"{_TOKEN_PREFIX}[REDACTED]", text)
```

### IN-02: `csrfCookie()` is dead code, diverges from actual cookie writer

**File:** `apps/admin/lib/csrf.server.ts:40-42`
**Issue:** `csrfCookie(token)` builds a `Set-Cookie` string with
`Secure; Max-Age=28800` and no `HttpOnly`. The actual cookie is set via
`issueCsrfCookieOnce` (`csrf-cookie.server.ts:20-33`), which uses the
Next `cookies()` jar and sets `secure: process.env.NODE_ENV ===
"production"`. The two paths disagree on `Secure` in dev and on the
response surface (`Set-Cookie` header vs. jar). `csrfCookie()` has no
importer.
**Fix:** Delete `csrfCookie()` and its helper reference, or route all
cookie issuance through it and call
`res.headers.append("set-cookie", csrfCookie(t))`. Keep one.

### IN-03: `sopsAvailable()` is a synchronous child-process spawn per request

**File:** `apps/admin/lib/sops.server.ts:148-155`, called from every
Route Handler and the `(auth)/tokens/page.tsx` RSC on each render.
**Issue:** `spawnSync("sops", ["--version"])` blocks the Node event
loop (~5-20ms). For an operator dashboard this is invisible, but it's
a small latency floor and a reliability surface (if `sops` ever hangs,
the whole render hangs).
**Fix:** Cache the result in-memory with a short TTL (e.g., 30s),
invalidating only when the underlying binary actually changes:

```ts
let cached: { ok: boolean; at: number } | null = null;
export function sopsAvailable(): boolean {
  const now = Date.now();
  if (cached && now - cached.at < 30_000) return cached.ok;
  // existing spawn
  cached = { ok: res.status === 0, at: now };
  return cached.ok;
}
```

### IN-04: `EXPECTED_ORIGIN` silent hardcoded fallback

**File:** `apps/admin/lib/csrf.shared.ts:16-19`
**Issue:** Falling through to `"https://homelab.makscee.ru"` when no
env var is set works today, but a misdeploy (forgotten env on a new
host) will silently pass CSRF only when requests carry no `Origin`
(see WR-04) and fail every Origin-bearing mutation with confusing
`csrf rejected: bad origin`. No warning is logged at startup.
**Fix:** Log once on server startup when both env vars are unset,
e.g. from an instrumentation entrypoint:

```ts
if (!process.env.NEXT_PUBLIC_EXPECTED_ORIGIN && !process.env.EXPECTED_ORIGIN) {
  console.warn("[csrf] EXPECTED_ORIGIN env unset; using production fallback");
}
```

### IN-05: `TokensTable` is a Server Component that embeds two Client children per row

**File:** `apps/admin/app/(auth)/tokens/_components/TokensTable.tsx`
**Issue:** Each row renders `<Sparkline>` and `<RowActions>`, both
`"use client"`. Fine today, but the per-row client boundary will
matter once the row count grows — every row ships its own recharts
runtime hydrate. Not a correctness issue.
**Fix:** When row counts are expected to exceed ~50, switch Sparkline
to a server-rendered SVG or batch-hydrate rows with a single client
wrapper over the table body.

### IN-06: `notes` field has no label sanitization beyond length

**File:** `apps/admin/app/api/tokens/route.ts:22`,
`apps/admin/app/(auth)/tokens/[id]/page.tsx:109-115`
**Issue:** `notes` accepts any string ≤500 chars and is rendered via
`<div>{entry.notes}</div>`. React escapes text, so XSS is not
exploitable — but control characters, zero-width characters, or
confusable unicode can land in the registry and confuse operators.
**Fix:** Add a Zod refinement that strips control characters:

```ts
notes: z.string().max(500)
  .transform((s) => s.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ""))
  .optional()
```

---

_Reviewed: 2026-04-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
