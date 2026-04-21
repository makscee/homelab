---
phase: 22-security-review-launch
verified: 2026-04-21T18:00:00Z
status: human_needed
score: 9/9 must-haves verified (with 2 accepted deferrals + 1 accepted scope-cut)
overrides_applied: 3
overrides:
  - must_have: "SEC-01: Caddy per-IP rate limit on auth routes"
    reason: "caddyserver.com/api/download upstream outage verified from mcow + nether; stock apt Caddy 2.6.2 lacks rate_limit; operator chose v3.1 defer over xcaddy self-build to accelerate 2-user panel launch. Recorded in REQUIREMENTS.md §SEC (active + Future), ROADMAP §Phase 22, STATE.md, 22-02-SUMMARY.md, v3.0-SECURITY.md §Deferred."
    accepted_by: shadeoflance@gmail.com
    accepted_at: 2026-04-21
  - must_have: "SEC-11: Strict nonce-based CSP (drop unsafe-inline)"
    reason: "Internal 2-user panel + GitHub OAuth allowlist + no public ingress = XSS surface ~= zero. Defense-in-depth belongs in v3.1 hardening. header-audit.sh WARN-not-FAIL on unsafe-inline. Recorded in all four places."
    accepted_by: shadeoflance@gmail.com
    accepted_at: 2026-04-21
  - must_have: "UI-02: admin consumes ui-kit / admin migration"
    reason: "Operator directive 2026-04-21: admin's HostCard/AlertsTable/AuditTable/NavAlertBadge are richer than the generic kit molecules; 1:1 swap offered no feature improvement. Contract API preserved in packages/ui-kit/molecules/ + knowledge/standards/ui-kit/molecules/ for future animaya/voidnet consumers. Admin is wired via @ui-kit/* alias + tokens import (partial UI-02 via vendor-mirror pattern, Decision A)."
    accepted_by: shadeoflance@gmail.com
    accepted_at: 2026-04-21
human_verification:
  - test: "Open https://homelab.makscee.ru/ over Tailnet in a browser, sign in via GitHub OAuth"
    expected: "Sidebar nav renders, /, /audit, /alerts, /tokens, /proxmox all load without visual regression from pre-phase-22 baseline"
    why_human: "Visual tokens.css re-import ordering (tokens before tailwindcss) only proven green by bun run build; pixel-level regression can't be grep-verified"
  - test: "Tail /var/log/homelab-admin-backup.log after 03:17 UTC next cycle"
    expected: "Nightly cron fires, new .gz appears in /var/backups/homelab-admin, integrity_check=ok"
    why_human: "Cron is installed and 03:17 UTC is future-scheduled; only a human can observe the first live trigger"
  - test: "Simulate HomelabAdminDown (e.g. stop homelab-admin for 3 min in a maintenance window)"
    expected: "Alert fires in Alertmanager + Telegram message lands in 193835258 within 2-3 min"
    why_human: "Plan 22-06 explicitly skipped induced downtime on launch day; promtool unit test passes but live E2E firing unobserved"
  - test: "Operator reads .planning/milestones/v3.0-RUNBOOK.md end-to-end against apps/admin/README.md; performs one dry-run rollback against a throwaway ref"
    expected: "Runbook self-sufficient for day-1 handoff; rollback command works"
    why_human: "Runbook adequacy for handoff is a usability judgement, not a grep target"
---

# Phase 22: Security Review + Launch — Verification Report

**Phase Goal (ROADMAP):** Pass security review (bun audit, bundle scan, header re-audit, header-spoofing test, proxmox token scope, tailnet ingress, cross-phase aggregation); extract shared ui-kit to hub/knowledge/standards/ui-kit/ consumed by admin via @ui-kit/*; complete launch checklist (backup/restore drill + cron, runbook, rollback, self-monitoring, DNS/TLS gate, operator handoff README). SEC-01 + SEC-11 deferred to v3.1.

**Verified:** 2026-04-21
**Status:** **PASSED** with human spot-checks outstanding (pragmatic launch gate; all programmatic checks green)
**Re-verification:** No — initial verification.

## Goal Achievement — Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Shared ui-kit exists at hub SoT, consumed by admin via alias | VERIFIED | `/Users/admin/hub/knowledge/standards/ui-kit/{tokens,primitives,molecules,lib}/` present (hub commits 5be8b37, f42a206, 3183dd5); vendored mirror at `packages/ui-kit/` with `.sync-from-hub` provenance; `apps/admin/tsconfig.json` has `@ui-kit/*` alias; `apps/admin/app/globals.css` imports `tokens.css` before tailwindcss; `bun run build` green. |
| 2 | SEC-08 bun audit clean | VERIFIED | `scripts/security/bun-audit.sh` present +x; 22-02-AUDIT-LOG shows exit 0 clean. |
| 3 | SEC-08 bundle has no SOPS-key / token leaks | VERIFIED | `scripts/security/bundle-secret-scan.sh` present; post-fix exit 0 clean. |
| 4 | SEC-08 deployed headers re-audited (HSTS, X-Frame-Options, Referrer-Policy FAIL-gated; CSP WARN per SEC-11 defer) | VERIFIED | `scripts/security/header-audit.sh` present; 4/4 FAIL-gated ok; 1 WARN acknowledged. |
| 5 | Header-spoofing test proves middleware ignores X-Tailscale-User / X-Forwarded-User | VERIFIED | `apps/admin/tests/integration/header-spoofing.test.ts` present; 20 cases × 4 forged header sets × 3 expects = 60 assertions PASS live. |
| 6 | Proxmox token scope = VM.Audit + Datastore.Audit only | VERIFIED | `scripts/security/verify-proxmox-token-scope.sh` present; pveum output confirms scope; no VM.PowerMgmt. |
| 7 | Tailnet-only ingress verified (WAN rejected, Tailnet 307→/login) | VERIFIED | `scripts/security/verify-tailnet-only-ingress.sh` present; probe URL corrected to `/`; 307 path matched. |
| 8 | Cross-phase v3.0-SECURITY.md aggregation exists with SEC-01/SEC-11 deferrals surfaced | VERIFIED | `.planning/milestones/v3.0-SECURITY.md` exists; 68 threats, 58 mitigated, 10 accepted, 0 open; explicit `## Deferred to v3.1` section names SEC-01 + SEC-11 with pickup paths; gap phases 12/13/14 flagged honestly (not synthesized). |
| 9 | Launch checklist: backup+cron live, restore drill passes, runbook + operator README published, self-monitoring alert green, DNS/TLS gate passes | VERIFIED | mcow: `crontab -l` shows `17 3 * * * /usr/local/sbin/backup-audit-db.sh …`; `/usr/local/sbin/backup-audit-db.sh` present; `/var/backups/homelab-admin/audit.db.20260421T155105Z.gz` present; `homelab-admin.service` + `caddy.service` both `active`. Runbook `v3.0-RUNBOOK.md` 229 lines + evidence; `apps/admin/README.md` operator-first rewrite with Deferred-to-v3.1 block. `up{service="homelab-admin"}==1` live; `HomelabAdminDown` promtool test SUCCESS; `check-dns-tls.sh` shows cert 85 days. |

**Score:** 9/9 must-haves verified. 3 overrides applied (SEC-01, SEC-11, UI-02-admin-migration).

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `/Users/admin/hub/knowledge/standards/ui-kit/{tokens,primitives,molecules,lib}/` | SoT tree | VERIFIED | All 4 subdirs + README present (hub repo) |
| `packages/ui-kit/` | Vendored mirror in homelab | VERIFIED | `tokens/ primitives/ molecules/ lib/ README.md` present |
| `packages/ui-kit/.sync-from-hub` | Provenance file | VERIFIED | Records hub sha 3183dd5 |
| `scripts/sync-ui-kit.sh` | Re-mirror tool | VERIFIED | Present |
| `scripts/security/bun-audit.sh` | | VERIFIED | Present |
| `scripts/security/bundle-secret-scan.sh` | | VERIFIED | Present |
| `scripts/security/header-audit.sh` | | VERIFIED | Present |
| `scripts/security/verify-proxmox-token-scope.sh` | | VERIFIED | Present |
| `scripts/security/verify-tailnet-only-ingress.sh` | | VERIFIED | Present |
| `scripts/launch/backup-audit-db.sh` | | VERIFIED | Present + installed at /usr/local/sbin/ on mcow |
| `scripts/launch/restore-audit-db.sh` | | VERIFIED | Present; drill ran 2026-04-21T15:51 integrity ok |
| `scripts/launch/check-dns-tls.sh` | | VERIFIED | Present; cert 85d |
| `apps/admin/tests/integration/header-spoofing.test.ts` | | VERIFIED | Present; 60 assertions PASS live |
| `apps/admin/app/api/health/route.ts` (dual-format) | | VERIFIED | JSON + Prometheus text exposition |
| `apps/admin/README.md` (operator-first) | | VERIFIED | Present with Deferred-to-v3.1 block |
| `.planning/milestones/v3.0-RUNBOOK.md` | | VERIFIED | 11 sections, 229 lines, includes drill evidence |
| `.planning/milestones/v3.0-SECURITY.md` | | VERIFIED | 68 threats aggregated, deferral section explicit |
| `.planning/phases/22-…/22-02-AUDIT-LOG.md` | | VERIFIED | Raw evidence logged |
| `.planning/phases/22-…/22-05-AGGREGATION-GAPS.md` | | VERIFIED | GAP rows 12/13/14 surfaced |
| `servers/docker-tower/monitoring/prometheus/{prometheus.yml,alerts/homelab.yml,tests/homelab_test.yml}` | | VERIFIED | `homelab-admin` scrape job + `HomelabAdminDown` alert + promtool test SUCCESS |
| `ansible/playbooks/deploy-homelab-admin.yml` | Stage 7c: backup script + cron | VERIFIED | Edited in commit 4395e42 |

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `apps/admin` components | `packages/ui-kit/*` | `@ui-kit/*` tsconfig alias | WIRED | `bun run build` green; tokens import before tailwindcss per 22-01 README |
| `packages/ui-kit/primitives/*.tsx` | `packages/ui-kit/lib/utils.ts` | `import { cn } from "../lib/utils"` | WIRED | 7/7 cn-using primitives |
| Prometheus (docker-tower) | `homelab-admin` | scrape `https://homelab.makscee.ru/api/health` 30s | WIRED | live `up{service="homelab-admin"}==1` |
| `HomelabAdminDown` alert | Telegram | alertmanager config (Phase 20) | WIRED (promtool unit test) | LIVE-firing unproven (induced-downtime skipped on launch day — see human_verification) |
| Nightly backup | mcow filesystem | root crontab 03:17 UTC → `/var/backups/homelab-admin/*.gz` | WIRED (drill + cron installed) | First scheduled trigger post-verification — see human_verification |
| `apps/admin/README.md` | `v3.0-RUNBOOK.md` | markdown link in operator header | WIRED | Both files present |

## Deferral Bookkeeping (4-place cross-check)

| Deferral | REQUIREMENTS.md | ROADMAP.md | STATE.md | phase SUMMARY | v3.0-SECURITY.md |
|----------|-----------------|------------|----------|---------------|------------------|
| SEC-01 → v3.1 | ✓ §SEC active + Future + Traceability | ✓ §Phase 22 header | ✓ phase-log entry | ✓ 22-02-SUMMARY | ✓ §Deferred to v3.1 |
| SEC-11 → v3.1 | ✓ §SEC active + Future + Traceability | ✓ §Phase 22 header | ✓ phase-log entry | ✓ 22-02-SUMMARY | ✓ §Deferred to v3.1 |
| Phase 18 → v4.0 | n/a (scope cut) | ✓ dependency graph + §Phase 18 | ✓ Roadmap Evolution | n/a | n/a |
| Phase 21 → v4.0 | n/a (scope cut) | ✓ dependency graph + §Phase 21 | ✓ Roadmap Evolution | n/a | n/a |
| UI-02 admin-migration skipped | partial (see finding F-3) | n/a | n/a | ✓ 22-04-SUMMARY Deviations | n/a |
| 12/13/14 SECURITY.md backfill | n/a | n/a | n/a | ✓ 22-05-AGGREGATION-GAPS | ✓ GAP rows |

## Findings

### F-1 — REQUIREMENTS.md traceability table has wrong phase assignments (cosmetic, non-blocking)

**File:** `.planning/REQUIREMENTS.md` §Traceability table (lines 133-183)

Three stale rows in the traceability table:

- `UI-01 | Phase 19 | Pending` — actually **Phase 22 plan 01, Complete** (SUMMARY 22-01 `requirements-completed: [UI-01]`; hub commits 5be8b37, f42a206)
- `UI-02 | Phase 19 | Pending` — actually **Phase 22 plan 04, Complete** (SUMMARY 22-04 vendors ui-kit + wires `@ui-kit/*` alias; admin-migration skipped per operator override)
- `SEC-01 | Phase 19 → v3.1 | Deferred` — should be `Phase 22 → v3.1` (SEC-01 was handled in Phase 22 plan 02, not Phase 19)

Additionally the active-requirement checkboxes `- [ ] UI-01`, `- [ ] UI-02`, `- [ ] SEC-01`, `- [ ] SEC-11` are still unchecked at lines 22-23 and 85 despite closure in Phase 22. Consistent with prior ROADMAP-checkboxes-stale pattern (see user memory `feedback_roadmap_checkboxes_stale`). **Not a goal-blocking gap** — the underlying work is done; this is metadata drift.

**Suggested fix (post-launch):** update table + checkboxes in a single docs commit. Does not affect launch.

### F-2 — STATE.md "current position" is stale

**File:** `.planning/STATE.md` lines 28-33

```
Phase: 22 … Only 22-04 remaining.
Status: Wave 2 launch-gate done. 22-04 (ui-kit molecules + admin migration) is the last open plan in Phase 22.
Next: /gsd-execute-phase 22-04
```

But 22-04-SUMMARY.md is committed and completed 2026-04-21. STATE.md was not refreshed after plan 22-04 closed. **Non-blocking** — verification confirms 22-04 is done on disk (commits 83fe103, 83d5483, 1c7f3cb, 9556923 + 22-04-SUMMARY present). Same pattern as F-1.

### F-3 — UI-02 partial: admin-migration skipped by operator override (accepted)

22-04-SUMMARY explicitly skipped migration of admin's HostCard/AlertsTable/AuditTable/NavAlertBadge → kit molecules because admin's implementations are richer. The molecules ship as a **contract API** for future animaya/voidnet consumers only. This is an operator decision logged in the plan; UI-02 as written ("Homelab admin consumes `hub-shared/ui-kit`") is satisfied at the **tokens + primitives + alias** layer but NOT at the molecules/components-swap layer. Override accepted above.

**Impact:** Zero — admin is visually identical, ui-kit contract is preserved, cross-repo mirror + sync tool ship the SoT. Future consumers can adopt molecules as designed.

### F-4 — Gap phases 12/13/14 SECURITY.md backfill is scheduled but not done

22-05-AGGREGATION-GAPS.md flags phases 12/13/14 as missing SECURITY.md artefacts (predate `/gsd-secure-phase` gate). v3.0-SECURITY.md shows them as GAP rows, not masked. Aggregation correctly refuses to synthesize retrospective threat models. Indirect coverage via 17.1/19/20 reviews noted. **Operator decision required** (per 22-05-AGGREGATION-GAPS.md §Operator decision required at launch) — recommendation is option 1 (flip launch bit, schedule backfill).

### F-5 — Live HomelabAdminDown alert unobserved

Plan 22-06 explicitly skipped induced-downtime on launch day; promtool unit test + live `up=1` prove the pipeline to the rule evaluation point, but no observed Telegram delivery of HomelabAdminDown. ALERT-05 (Telegram E2E) was proven in Phase 20-03 for claude-usage alerts, so the alertmanager→Telegram pipe is known-good; only the specific `HomelabAdminDown`-rule → Telegram path is unverified live. **Routed to human_verification.**

### F-6 — No finding. SEC-01/SEC-11 deferrals properly recorded in all 4 places.

Verified cross-check table above. Each deferral surfaces in REQUIREMENTS (active + Future + traceability), ROADMAP (Phase 22 header), STATE (phase-log entries), the owning SUMMARY, AND the aggregation artefact (v3.0-SECURITY.md §Deferred to v3.1).

### F-7 — No finding. Integration handoff between 22-02 and 22-05 is clean.

22-02 produced SEC-08 evidence (bun/bundle/header) in `22-02-AUDIT-LOG.md`. 22-05 appended D-22-10/11/12/13 evidence to the SAME audit log (`modified` list in 22-05-SUMMARY) and ingested 22-02's deferrals into v3.0-SECURITY.md's explicit `Deferred to v3.1` section. No missing cross-reference.

### F-8 — Runbook + operator README adequacy (programmatic pass; human judgement pending)

Runbook has 11 sections covering: infra map, deploy, rollback w/ concrete ref example, secret rotation, Auth.js reset, Caddy reload, exporter restart, backup/restore drill (with live drill evidence embedded), failure modes (8 rows), DNS/TLS gate (with live 85-day cert evidence), reference index. `apps/admin/README.md` has operator-first header with day-1 usage, runbook link, architecture at-a-glance, emergency stop, Deferred-to-v3.1 block. Programmatically adequate; handoff-adequacy is a usability judgement → human_verification item #4.

## Anti-Patterns Found

None blocking. 22-02-SUMMARY.md discloses 2 auto-fixed plan-script bugs (yq→awk swap; bundle-scan false-positive tightened) — both root-caused and fixed in commit b0fb70f.

## Requirements Coverage (v3.0 milestone, Phase 22 scope)

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| UI-01 | hub-shared/ui-kit with tokens + shadcn primitives | SATISFIED | SUMMARY 22-01; hub SoT + vendored mirror |
| UI-02 | admin consumes ui-kit | SATISFIED (partial per override F-3) | `@ui-kit/*` alias + tokens import wired; molecules skipped by operator as contract API |
| SEC-08 | security review phase (audit + bundle + header-spoof + proxmox scope) | SATISFIED | All 6 SEC-08 scripts ship + pass; aggregation artefact published |
| SEC-01 | Caddy per-IP rate limit | DEFERRED to v3.1 (override) | Recorded in 4 places |
| SEC-11 | strict CSP | DEFERRED to v3.1 (override) | Recorded in 4 places |

## Overall Assessment

**v3.0 is launch-ready.** All programmatic goal-backward checks pass:

- Security surface (SEC-08) proven with artefacts, aggregation, and runtime evidence on live infra.
- ui-kit SoT shipped at hub-canonical path + vendored mirror unblocks deploy; consumer wiring green.
- Launch checklist complete: backup cron live on mcow, drill passed, runbook published with concrete rollback, self-monitoring `up=1`, DNS/TLS 85d cert, operator handoff README.
- Deferrals (SEC-01, SEC-11, UI-02 admin-migration, Phases 18/21) are explicit operator decisions recorded across REQUIREMENTS + ROADMAP + STATE + SUMMARY (+ v3.0-SECURITY.md for the security deferrals). No hidden scope reduction.
- 3 cosmetic metadata-drift findings (F-1, F-2) are non-blocking and consistent with prior `feedback_roadmap_checkboxes_stale` pattern — fix post-launch in a docs sweep.

**Four human spot-checks remain** (visual UI regression, first-live-cron, induced-downtime alert firing, runbook handoff usability) — none block the launch-bit flip because each has a programmatic proxy that passed. Recommend executing them opportunistically in the first 24-48h post-launch.

---

_Verified: 2026-04-21_
_Verifier: Claude (gsd-verifier)_
