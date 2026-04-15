---
phase: 04-operator-dashboard
plan: 03
subsystem: monitoring
tags: [alertmanager, telegram, smoke-test, e2e, tailscale-app-connector, secrets-rotation]
requires:
  - 04-01 (Alertmanager on mcow)
  - 04-04 (animaya-dev HostDown cleared, baseline zero alerts)
  - 03-05 (Alertmanager rules + Telegram receiver config)
provides:
  - proof: Alertmanager -> Telegram E2E delivery (FIRING + RESOLVED)
  - infra: Tailscale App Connector on nether for Telegram IPv4 egress
  - bot: @void_homelab_bot (token rotated, SOPS-encrypted)
affects:
  - secrets/mcow.sops.yaml
  - servers/nether (new role: tag:connector)
tech-stack:
  added:
    - Tailscale App Connector (Telegram IPv4 egress via nether NL)
  patterns:
    - Natural-trigger smoke test (stop node_exporter, observe real rule fire)
    - Secret rotation via @BotFather + SOPS re-encrypt
key-files:
  created:
    - .planning/phases/04-operator-dashboard/04-03-SMOKE-LOG.md
    - .planning/phases/04-operator-dashboard/04-03-APP-CONNECTOR-SETUP.md
  modified:
    - secrets/mcow.sops.yaml (telegram_token rotated)
decisions:
  - D-06 reversed: AM-on-mcow assumption was unvalidated; egress mitigated via app connector (keep AM on mcow)
  - Telegram IPv4-only app connector accepted (IPv6 direct path also works)
metrics:
  duration: multi-session (side-quest: egress diagnosis + app connector + token rotation)
  completed: 2026-04-15
---

# Phase 04 Plan 03: Alertmanager -> Telegram Smoke Test Summary

Prometheus `HostDown` natural-trigger on cc-worker fires real FIRING + RESOLVED Telegram messages via `@void_homelab_bot`; E2E proven end-to-end with operator UAT on both messages.

## Outcome

Alertmanager -> Telegram natural-trigger smoke test **PASSED**. FIRING + RESOLVED both delivered end-to-end via new bot `@void_homelab_bot` (token 8559...nSLbk — rotated; old leaked token revoked). Closes Phase 03-03 deferred Telegram E2E test AND Phase 04 SC #3.

## Test Cycle (fresh cycle after AM restart race)

| Event | UTC | Evidence |
|-------|-----|----------|
| `node_exporter stop` on cc-worker | 17:26:20Z | SSH + systemctl is-active=inactive |
| HostDown firing in Prometheus | ~17:32Z | for: 5m + scrape interval |
| FIRING Telegram delivery | ~17:32Z | operator confirmed receipt |
| `node_exporter start` on cc-worker | (in RESOLVED cycle) | systemctl is-active=active |
| Alert cleared in Prom + AM | post-start | /api/v2/alerts empty |
| RESOLVED Telegram delivery | post-clear | operator confirmed receipt |

**Counter deltas:**
- Baseline (pre-fresh-cycle): `telegram=1`
- Post-FIRING: `telegram=2` (delta +1)
- Post-RESOLVED (final): `telegram=5` (final snapshot post-silence-expiry; includes DiskUsageCritical notifications unsilenced at close)

Both FIRING and RESOLVED telegram deliveries confirmed by operator in @void_homelab_bot chat.

## Egress Journey (for future operators)

1. **Initial block:** mcow Moscow ISP L4-blocks Telegram IPv4 CIDRs.
2. **Diagnosis from 04-01:** counter incremented but no delivery -> L4 reach test found timeouts to 149.154.166.0/24.
3. **Root cause:** D-06 (move AM from docker-tower -> mcow) was unvalidated. Phase 03 E2E proof came from docker-tower's working reach; mcow egress was never tested for Telegram CIDRs.
4. **Solution:** Tailscale App Connector on nether (commit `2db150e`, see `04-03-APP-CONNECTOR-SETUP.md`). Advertises Telegram IPv4 CIDRs (149.154.166.110/32, 149.154.167.99/32) through nether's NL egress.
5. **Operator manual steps:** admin console (DNS -> App Connectors + domain `telegram.org`) + ACL `nodeAttrs`/`autoApprovers` + `tag:connector` on nether + `--accept-routes` on mcow.
6. **Actual working path after fix:** mcow -> Telegram direct via **IPv6** (app connector advertises IPv4 only; IPv6 path was never blocked once AM restart+DNS refresh completed). App Connector remains deployed as IPv4 fallback.

## Security

- **Leak:** Old bot token leaked in cleartext to mcow docker journald (Alertmanager dispatch URLs contained `bot_token` query param before switch to `bot_token_file`).
- **Rotation:** Rotated via @BotFather -> operator; new token stored SOPS-encrypted in `secrets/mcow.sops.yaml`.
- **Deployment:** `/run/secrets/telegram_token` on mcow, mode 0440 root:65534.
- **Cleanup:** Leaked log lines truncated on mcow.
- **Revocation:** Old token revoked at Telegram side.

## AM Restart Race (explainer for future debug)

When AM restarts, `alertmanager_notifications_total` counter resets. Alerts already notified pre-restart have nflog entries suppressing re-notify (`repeat_interval=1h`). If the alert clears before `repeat_interval` elapses, no FIRING re-notify in current AM lifetime + no RESOLVED notify either (AM has no "I fired this" memory post-restart).

**Solution for smoke testing:** induce a **fresh** fire-resolve cycle after any AM restart. This is what we did in the final successful test.

## Deviations from Plan

### [Rule 3 - Blocker] Pre-existing DiskUsageCritical polluting pre-flight

- **Found during:** Task 1 pre-flight
- **Issue:** DiskUsageCritical firing on tower + docker-tower (tech debt from 03-05) broke "0 active alerts" invariant.
- **Fix:** Silenced for 15 min initially, extended to ~45 min as needed. Operator authorized. Silences expired at plan close.
- **Commit:** N/A (runtime AM API silence, not committed state)

### [Rule 4 - Architectural] Egress block discovered mid-test

- **Found during:** First Task 2 attempt — counter +1 but no Telegram message
- **Issue:** mcow Moscow ISP L4-blocks Telegram IPv4 CIDRs; D-06 assumption invalid.
- **Fix:** Operator-approved 4-step side quest: diagnose -> Tailscale App Connector on nether -> token rotation (due to leak) -> re-smoke.
- **Commit:** `2db150e` (app connector role) + SOPS re-encrypt commits
- **Scope impact:** New infrastructure (app connector on nether) added outside original plan scope; documented in `04-03-APP-CONNECTOR-SETUP.md`.

## Follow-ups (tech debt)

- **DiskUsageCritical** persistent on tower + docker-tower — root-cause disk pressure investigation out of Phase 04 scope.
- **App Connector IPv4-only limitation:** IPv6 to Telegram bypasses connector entirely. Fine operationally (both paths work); worth noting as architecture nuance.
- **Operator runbook:** document AM restart nflog behavior (fresh cycle required for smoke tests).
- **D-06 decision record:** update CONTEXT.md or create an ADR noting D-06 assumptions were invalidated; mitigation is the app connector. Keep AM on mcow (working now).

## Artifacts

- `.planning/phases/04-operator-dashboard/04-03-SMOKE-LOG.md` — full investigation log
- `.planning/phases/04-operator-dashboard/04-03-APP-CONNECTOR-SETUP.md` — app connector setup steps (reproducible)
- Operator FIRING + RESOLVED Telegram receipts confirmed (not screenshotted this session; could be added later)
- Counter metrics captured above

## Phase 04 SC #3

**CLOSED** - Real Alertmanager rule fire + resolve both delivered via Telegram, E2E proven.

## Self-Check: PASSED

- `.planning/phases/04-operator-dashboard/04-03-SMOKE-LOG.md` — FOUND
- `.planning/phases/04-operator-dashboard/04-03-APP-CONNECTOR-SETUP.md` — FOUND
- Final counter snapshot captured: `telegram=5`
- `.planning/.continue-here.md` — DELETED (checkpoint resolved)
- Silences expired at close
