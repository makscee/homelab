---
phase: 19
slug: proxmox-ops-readonly
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-21
---

# Phase 19 — Validation Strategy

> Reconstructed retroactively via `/gsd-validate-phase 19` on 2026-04-21 (State B: no prior VALIDATION.md, SUMMARYs present).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (Next.js admin)** | Bun test (`bun:test`) |
| **Framework (E2E)** | Playwright (skip-gated on `PW_SESSION_COOKIE`) |
| **Framework (Ansible)** | `ansible-playbook --check` + live infra probes |
| **Config file** | `apps/admin/package.json` (bun), `apps/admin/playwright.config.ts` |
| **Quick run command** | `cd apps/admin && bun test app/api/proxmox lib/proxmox.server.test.ts lib/proxmox-tls-guard.test.ts` |
| **Full suite command** | `cd apps/admin && bun test && bun run lint && bun run build` |
| **Estimated runtime** | ~15 seconds (unit) |

---

## Sampling Rate

- **After every task commit:** quick run (proxmox tests only)
- **After every plan wave:** full suite + `bun run build`
- **Before `/gsd-verify-work`:** full suite green + deploy + live `/api/health` 200
- **Max feedback latency:** ~15 s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 19-01-00 | 01 | 1 | PROXMOX-06 | T-19-04 | SAN `DNS:tower` present on pveproxy cert | manual (live infra) | `openssl s_client -connect tower:8006 ... \| grep DNS:tower` | N/A | ✅ manual-signed |
| 19-01-01 | 01 | 1 | PROXMOX-06 | T-19-01,03 | Idempotent pveum provisioning, `no_log` on secrets | manual (live infra) | `ansible-playbook --check provision-proxmox-dashboard-token.yml` | ✅ | ✅ manual-signed |
| 19-01-02 | 01 | 1 | PROXMOX-06 | T-19-02 | SOPS populated, 2nd run 0-changed | manual (live infra) | `sops --decrypt --extract '["proxmox_dashboard"]["token_secret"]' ... \| grep -E '^[a-f0-9-]{36}$'` | ✅ | ✅ manual-signed |
| 19-01-03 | 01 | 1 | PROXMOX-06 | T-19-05 | mcow env-file 0600, tower-ca.pem 0640, 4 PROXMOX_* vars | manual (live infra) | `ssh root@mcow 'test -f /etc/homelab-admin/tower-ca.pem && grep -c ^PROXMOX_ /etc/homelab-admin/env'` | ✅ | ✅ manual-signed |
| 19-02-01 | 02 | 2 | PROXMOX-06 | T-19-06..11 | CA-pinned undici.Agent, token header, TLS pin enforced | unit | `bun test lib/proxmox.server.test.ts` (5 tests) | ✅ | ✅ green |
| 19-02-02 | 02 | 2 | PROXMOX-01,05 | T-19-07 | `GET /api/proxmox/lxcs` auth-gated + zod-validated + resilient | unit | `bun test app/api/proxmox/lxcs/route.test.ts` (4) | ✅ | ✅ green |
| 19-02-03 | 02 | 2 | PROXMOX-01 | T-19-07,08 | `/lxcs/[vmid]`, `/tasks`, `/tasks/[upid]/log` routes | unit | `bun test app/api/proxmox/lxcs/\[vmid\]/**` (11) | ✅ | ✅ green |
| 19-02-04 | 02 | 2 | PROXMOX-06 | — | Repo-wide `NODE_TLS_REJECT_UNAUTHORIZED` guard | unit (regression) | `bun test lib/proxmox-tls-guard.test.ts` | ✅ (added 2026-04-21) | ✅ green |
| 19-03-01 | 03 | 3 | PROXMOX-01 | — | `/proxmox` list page (10s poll, tower-down banner) | e2e | `bunx playwright test e2e/proxmox-list.spec.ts` (skip-gated) | ✅ | ⚠️ skip-gated |
| 19-03-02 | 03 | 3 | PROXMOX-01 | — | `/proxmox/[vmid]` detail (30s poll, click-to-expand log) | e2e | `bunx playwright test e2e/proxmox-detail.spec.ts` (skip-gated) | ✅ | ⚠️ skip-gated |
| 19-03-03 | 03 | 3 | PROXMOX-01,05 | — | Live UAT via Playwright MCP on `https://homelab.makscee.ru/proxmox` | manual | operator-driven browser walkthrough | N/A | ✅ manual-signed |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky/skip-gated*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* Retroactive audit added one regression guard (`lib/proxmox-tls-guard.test.ts`) to close the PROXMOX-06 "no TLS bypass" gap — previously only hand-run via `grep -r`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tower pveproxy SAN contains `DNS:tower` | PROXMOX-06 | Requires live tower at `tower:8006`; cert material is environment-bound | `openssl s_client -connect tower:8006 -showcerts </dev/null 2>/dev/null \| openssl x509 -noout -text \| grep -E 'DNS:tower(\.\|,\|$)'` — signed off 19-01-SUMMARY |
| Ansible provisioning playbook idempotence | PROXMOX-06 | Needs SSH to tower + `pveum`; touches real PVE ACL state | `cd ansible && ansible-playbook -i inventory/homelab.yml playbooks/provision-proxmox-dashboard-token.yml` — 1st run 4 changed, 2nd run 0 changed (19-01-SUMMARY) |
| SOPS `proxmox_dashboard` populated | PROXMOX-06 | Requires local age key to decrypt | `sops --decrypt --extract '["proxmox_dashboard"]["token_secret"]' secrets/mcow.sops.yaml \| grep -E '^[a-f0-9-]{36}$'` |
| mcow env-file + CA file perms | PROXMOX-06 | Requires SSH to mcow + correct uid/gid on target | `ssh root@mcow 'stat -c %a /etc/homelab-admin/tower-ca.pem'` → `640`; env-file 0600 |
| Playwright e2e live run | PROXMOX-01 | Requires `PW_SESSION_COOKIE` from a real NextAuth session | Export cookie from authed browser → `PW_SESSION_COOKIE=... bunx playwright test e2e/proxmox-*.spec.ts` |
| `/proxmox` visual UAT | PROXMOX-01,05 | Aesthetic/visual parity with /audit + /alerts | Operator drives Playwright MCP against `https://homelab.makscee.ru/proxmox` — signed off 2026-04-19 per 19-03-SUMMARY |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or documented manual-only reason
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (Plans 02+03 fully unit-covered; Plan 01 is infrastructure)
- [x] Wave 0 covers all MISSING references (TLS guard added)
- [x] No watch-mode flags
- [x] Feedback latency < 15 s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-21

---

## Validation Audit 2026-04-21

| Metric | Count |
|--------|-------|
| Gaps found | 3 |
| Resolved | 1 (PROXMOX-06 TLS-bypass regression guard) |
| Escalated to manual-only | 2 (Playwright skip-gated on session cookie; Plan 01 live-infra probes) |

Added:
- `apps/admin/lib/proxmox-tls-guard.test.ts` — repo-wide scan for `NODE_TLS_REJECT_UNAUTHORIZED` across `apps/admin/` + `ansible/`. Passes (0 hits).
