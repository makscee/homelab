---
phase: 02
slug: service-documentation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Shell scripts + SSH verification commands |
| **Config file** | none — validation via SSH commands against live servers |
| **Quick run command** | `ssh root@<host> docker ps --format '{{.Names}}'` |
| **Full suite command** | `scripts/verify-phase-02.sh` (to be created) |
| **Estimated runtime** | ~30 seconds per server |

---

## Sampling Rate

- **After every task commit:** Verify files exist and are syntactically valid
- **After every plan wave:** SSH into target server and verify services match committed configs
- **Before `/gsd-verify-work`:** Full suite must confirm all 6 servers' configs match live state
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | SVC-01 | T-02-01 / — | Compose files have no embedded secrets | file check | `grep -rL 'password\|secret\|token' servers/docker-tower/docker-compose*.yml` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | SVC-02 | — | N/A | file check | `test -f servers/mcow/README.md` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | SVC-03 | — | N/A | file check | `test -f servers/tower/lxc-204-cc-vk.conf` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | SVC-04 | — | VPN keys encrypted via SOPS | file check | `grep -q 'sops' secrets/nether.sops.yaml` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | SVC-05 | — | Auth key not hardcoded | script check | `test -x scripts/tailscale-provision.sh` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | SVC-06 | — | N/A | file check | `ls servers/tower-sat/docker-compose*.yml 2>/dev/null` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Verify SSH connectivity to all 6 servers via Tailscale
- [ ] Confirm `docker` CLI available on docker-tower, nether
- [ ] Confirm `pct` CLI available on tower
- [ ] Verify SOPS + age keys accessible on operator machine

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Services start correctly from committed compose | SVC-01, SVC-02, SVC-06 | Requires Docker engine on target host | SSH into host, `docker compose up -d`, verify containers healthy |
| AmneziaVPN connects from client | SVC-04 | Requires VPN client device | Connect using documented config, verify traffic routes through nether |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
