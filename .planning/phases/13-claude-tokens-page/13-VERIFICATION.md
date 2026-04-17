---
phase: 13-claude-tokens-page
verified: 2026-04-17T00:00:00Z
status: human_needed
score: 5/5 roadmap success criteria verified in code; SC#5 requires live Tailnet probe
overrides_applied: 0
human_verification:
  - test: "External (non-Tailnet) probe of exporter must fail"
    expected: "curl -sS --max-time 5 http://100.101.0.9:9101/metrics from a non-Tailnet host fails (connection refused / timeout)"
    why_human: "Requires a host outside Tailnet — cannot be proven from the repo checkout."
  - test: "Tailnet probe of exporter returns Prometheus exposition"
    expected: "ssh root@docker-tower 'curl -sS --max-time 5 http://100.101.0.9:9101/metrics | head' returns `# HELP` / `claude_usage_*` lines"
    why_human: "Requires live mcow service; local filesystem cannot prove it is running."
  - test: "Exporter process uid is 65534 (nobody)"
    expected: "ssh root@mcow 'ps -o uid,user -p $(systemctl show -p MainPID --value claude-usage-exporter)' prints uid=65534 user=nobody"
    why_human: "Runtime property of the deployed systemd unit."
  - test: "mtime-poll reload works end-to-end on live exporter"
    expected: "touch /var/lib/claude-usage-exporter/claude-tokens.json then journalctl shows `registry reloaded` within 60s"
    why_human: "Requires live journald on mcow."
  - test: "UI /tokens page renders live gauges + sparkline + add/rotate/toggle/rename/delete flows"
    expected: "Operator opens https://homelab.makscee.ru/tokens, adds a real sk-ant-oat01-* token, gauges appear within one poll cycle; rotate/disable/delete each complete without reload"
    why_human: "Visual UX + live SOPS-write → exporter-reload → Prometheus-scrape pipeline. API-200 != dashboard-working (MEMORY: feedback_verify_ui)."
  - test: "7-day history Recharts panel on /tokens/[id] renders a visible timeseries (no 'No data' empty state)"
    expected: "Opens detail page for an enabled token with ≥1h of exporter data; chart shows a line, not the empty state"
    why_human: "Visual verification; empty-state vs populated chart is not grep-able."
---

# Phase 13: Claude Tokens Page Verification Report

**Phase Goal:** Operator can manage all Claude Code tokens from the web UI — view live utilization gauges, add/rotate/disable/delete tokens via SOPS backend writes — and the v2.0 exporter tech-debt is paid (Tailnet-only bind, uid 65534).

**Verified:** 2026-04-17
**Status:** human_needed — code layer fully verified, live operational steps require human probe
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `/tokens` loads encrypted registry + displays label/owner/tier/date/enabled + degraded mode | ✓ VERIFIED (code) | `app/(auth)/tokens/page.tsx` exists; `TokensTable.tsx`, `DegradedBanner.tsx` present; `loading.tsx` present; `listTokens()` in `token-registry.server.ts` filters `deleted_at`; `sopsAvailable()` 503 path wired in every API route |
| 2 | Add token via form; never reflected in HTML/logs; appears in SOPS + Prom gauges next page load | ✓ VERIFIED (code) / ? HUMAN (live) | `AddTokenDialog.tsx` + `api/tokens/route.ts` with Zod sk-ant-oat01 regex; `PublicTokenEntry = Omit<TokenEntry,'value'>`; global redaction in `redact.server.ts` (WR-03 fix); CR-01 PromQL alignment fix committed. Live "gauges appear next poll" needs human probe |
| 3 | Rotate/disable/rename/delete — no reload, each emits audit row | ✓ VERIFIED (code) | All 4 dialogs present (Rotate/Rename/Toggle via RowActions/Delete); `token-registry.server.ts` emits `emitAudit(...)` on every mutation; JSON stdout → journald |
| 4 | Per-token 7d history Recharts — no "No data" when exporter healthy | ✓ VERIFIED (code) / ? HUMAN (live) | `app/(auth)/tokens/[id]/page.tsx` + `DetailChart.tsx` present; `queryRange` uses revalidate caching; CR-01 aligned PromQL to exporter `claude_usage_7d_utilization`. Visual "not empty" check deferred to human |
| 5 | External curl fails, Tailnet curl works, uid 65534 | ✓ VERIFIED (code) / ? HUMAN (live) | Unit: `User=nobody`, `--bind-address 100.101.0.9`, `IPAddressAllow=100.101.0.0/16`, `IPAddressDeny=any`, `CapabilityBoundingSet=`. Per 13-02-SUMMARY deployment was executed; live uid/external probe needs re-confirmation |

**Score:** 5/5 truths have complete code-layer evidence; 4 require human confirmation of live operational state (flagged above).

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `apps/admin/lib/sops.server.ts` | ✓ VERIFIED | 10KB; mutex + mutateRegistry (WR-01 fix), replaceRegistry, decryptRegistry, setRegistryField removed per WR-02 |
| `apps/admin/lib/prometheus.server.ts` | ✓ VERIFIED | queryInstant + queryRange + PromQueryError |
| `apps/admin/lib/audit.server.ts` | ✓ VERIFIED | emitAudit → stdout JSON with redacted value field |
| `apps/admin/lib/token-registry.server.ts` | ✓ VERIFIED | listTokens/add/rotate/toggle/rename/softDelete; TokenNotFoundError (WR-05 fix) |
| `apps/admin/lib/csrf.shared.ts` | ✓ VERIFIED | Neutral constants, no server-only marker |
| `apps/admin/lib/csrf.server.ts` | ✓ VERIFIED | verifyCsrf + Origin/Referer requirement (WR-04 fix) |
| `apps/admin/lib/redact.server.ts` | ✓ VERIFIED | Global regex redaction (WR-03 fix, net-new to plan) |
| 5× `app/api/tokens/**/route.ts` | ✓ VERIFIED | All 5 present; each has `runtime='nodejs'`, `verifyCsrf`, `sopsAvailable`, `auth()`, `params: Promise<{id:string}>` on 4 dynamic routes |
| `app/(auth)/tokens/page.tsx` + children | ✓ VERIFIED | RSC list page, TokensTable, Sparkline, UtilizationBar, ResetCountdown, DegradedBanner, loading.tsx |
| `app/(auth)/tokens/[id]/page.tsx` + DetailChart | ✓ VERIFIED | Detail page + Recharts component present |
| All 5 mutation dialogs | ✓ VERIFIED | AddTokenDialog, RotateTokenDialog, RenameTokenDialog, DeleteTokenDialog, RowActions (toggle) |
| `secrets/claude-tokens.sops.yaml` | ✓ VERIFIED | SOPS-encrypted registry exists |
| `servers/mcow/systemd/claude-usage-exporter.service` | ✓ VERIFIED | User=nobody, Tailnet bind, full hardening set |
| `servers/mcow/claude-usage-exporter/exporter.py` | ✓ VERIFIED | 11KB with argparse + mtime reload |
| `ansible/playbooks/deploy-claude-usage-exporter.yml` | ✓ VERIFIED | Idempotent decrypt→render→drop pattern |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| API routes → token-registry | named imports | ✓ WIRED |
| token-registry → sops.server | decrypt/replace/mutate | ✓ WIRED |
| token-registry → audit.server | emitAudit per mutation | ✓ WIRED |
| prometheus.server → mcow:9090/api/v1/query | fetch | ✓ WIRED |
| UI client code → csrf.shared | constants import (no server-only violation) | ✓ WIRED |
| exporter.py → registry file | st_mtime poll | ✓ WIRED |
| systemd unit → 100.101.0.9:9101 | --bind-address flag | ✓ WIRED |

### Requirements Coverage

| Requirement | Plan | Status | Evidence |
|-------------|------|--------|----------|
| TOKEN-01 | 13-01, 13-02 | ✓ SATISFIED | sops.server.ts + encrypted registry + runtime subprocess decrypt |
| TOKEN-02 | — | ? HUMAN | (Ansible decrypt-and-mount; evidence in 13-02-SUMMARY) |
| TOKEN-03 | 13-03 | ✓ SATISFIED | 5 CRUD API routes + token-registry.server.ts |
| TOKEN-04 | 13-03 | ✓ SATISFIED | softDeleteToken + rotateToken + toggleEnabled |
| TOKEN-05 | 13-03 | ✓ SATISFIED | audit.server.ts emits per-mutation JSON |
| TOKEN-06 | 13-04 | ✓ SATISFIED | UtilizationBar, Sparkline, ResetCountdown in list page |
| TOKEN-07 | 13-03, 13-05 | ✓ SATISFIED | PublicTokenEntry strips value; global redaction; CSRF on all routes |
| SEC-03 | 13-02 | ✓ SATISFIED (code) / ? HUMAN (live) | Unit file hardened; live uid probe needs human |

All 8 requirement IDs declared across phase 13 plans are accounted for. No orphans.

### Anti-Patterns Found

None blocking. The 6 Info-level findings (IN-01..IN-06) from 13-REVIEW.md were intentionally deferred and documented in 13-REVIEW-FIX.md — all 6 Critical/Warning findings were fixed (CR-01, WR-01..WR-05).

### Human Verification Required

See YAML frontmatter `human_verification:` — 6 items covering live Tailnet probe, external-fail probe, uid 65534 confirmation, mtime reload on running service, visual UX of /tokens flows, and Recharts populated state.

### Gaps Summary

No code-layer gaps. Every must-have artifact exists, is substantive, is wired, and carries the review-driven hardening (CSRF Origin/Referer, global redaction, TokenNotFoundError→404, mutex across read-write cycle, PromQL contract alignment). The phase cannot be marked `passed` because SC#5 and the UX success criteria (SC#1 "works", SC#2 "gauges populated", SC#4 "no No-data") require live operational confirmation that cannot be grep-verified — per the MEMORY lesson "API-200 ≠ dashboard-working", these are mandatory human checks.

---

_Verified: 2026-04-17_
_Verifier: Claude (gsd-verifier)_
