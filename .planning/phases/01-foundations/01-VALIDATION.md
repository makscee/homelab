---
phase: 1
slug: foundations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | shell assertions + grep verification |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `bash tests/phase-01-quick.sh` |
| **Full suite command** | `bash tests/phase-01-full.sh` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bash tests/phase-01-quick.sh`
- **After every plan wave:** Run `bash tests/phase-01-full.sh`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | SEC-01 | — | .gitignore blocks .env, *.key, *.pem | integration | `grep '.env' .gitignore` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | SEC-02 | — | .sops.yaml exists with age encryption config | integration | `test -f .sops.yaml` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 2 | INV-01 | — | 6 server inventory docs exist | integration | `ls docs/inventory/*.md \| wc -l` | ❌ W0 | ⬜ pending |
| 1-02-02 | 02 | 2 | INV-02 | — | Each inventory has IP, role, specs, services | integration | `grep -l 'Tailscale IP' docs/inventory/*.md` | ❌ W0 | ⬜ pending |
| 1-03-01 | 03 | 2 | INV-03 | — | Dependency map and network topology exist | integration | `test -f docs/dependency-map.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/phase-01-quick.sh` — quick validation script stubs
- [ ] `tests/phase-01-full.sh` — full validation script stubs

*Existing infrastructure covers most phase requirements — validation is file-existence and content-based.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SSH to each server to verify specs | INV-01 | Requires Tailscale network access | SSH to each server, run `uname -a`, `free -h`, `nproc` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
