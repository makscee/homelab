---
phase: 02
slug: service-documentation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
revised: 2026-04-14 (post-drift-discovery re-plan)
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Revised after 2026-04-14 drift discovery — validates against reconciled scope.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Shell scripts + SSH verification commands against live servers |
| **Config file** | none — validation via SSH commands against Tailscale-reachable hosts |
| **Quick run command** | `bash scripts/verify-phase02.sh --quick` |
| **Full suite command** | `bash scripts/verify-phase02.sh` |
| **Estimated runtime** | ~60 seconds (9 servers/containers to check) |

---

## Sampling Rate

- **After every task commit:** Verify files exist, YAML syntactically valid (`docker compose config --quiet`), no plaintext secrets (grep)
- **After every plan wave:** SSH into relevant server and verify live state matches committed configs
- **Before `/gsd-verify-work`:** Full suite must confirm all inventoried servers' configs match live state
- **Max feedback latency:** 90 seconds per task

---

## Per-Requirement Verification Map

| Requirement | Expected File/Outcome | Verify Command |
|-------------|----------------------|----------------|
| SVC-01 | `servers/docker-tower/docker-compose.*.yml` with pinned tags | `grep -c ':latest' servers/docker-tower/docker-compose.*.yml` → 0 |
| SVC-02 | `servers/mcow/README.md` documents live systemd units, stale units flagged | `test -f servers/mcow/README.md && grep -q 'voidnet-bot' servers/mcow/README.md` |
| SVC-03 | LXC configs for 100, 200, 202, 203, 204, 205 pulled fresh | `ls servers/tower/lxc-{100,200,202,203,204,205}-*.conf \| wc -l` = 6 |
| SVC-04 | AmneziaWG config committed, keys SOPS-encrypted | `sops --decrypt secrets/nether-awg.sops.yaml > /dev/null` |
| SVC-05 | `scripts/tailscale-provision.sh` exists and executable | `test -x scripts/tailscale-provision.sh` |
| ~~SVC-06~~ | ~~tower-sat docs~~ INVALIDATED | `test ! -d servers/tower-sat` |
| SVC-07 | CLAUDE.md accurate, tower-sat removed, cc-vk renamed | `grep -q 'cc-worker' CLAUDE.md && ! grep -q 'tower-sat' CLAUDE.md` |
| SVC-08 | New LXC inventory files + VMID 201 stopped | `test -f servers/cc-andrey/inventory.md && test -f servers/cc-dan/inventory.md && test -f servers/cc-yuri/inventory.md && test -f servers/animaya-dev/inventory.md && ssh root@tower 'pct status 201' \| grep -q stopped` |

---

## Wave 0 Requirements (Pre-flight — already completed 2026-04-14)

- [x] SSH to 4 tailnet servers verified: docker-tower, mcow, nether, tower
- [x] `pct list` on tower returns VMIDs 100, 200, 201, 202, 203, 204, 205 (confirmed — no 101)
- [x] SOPS 3.12.1 and age 1.3.1 confirmed on operator machine
- [x] Tailscale mesh confirmed; cc-worker reachable via 100.99.133.9 (direct) or `pct exec 204` on tower
- [x] LIVE-AUDIT.md drift captured via this workflow pause — see CONTEXT.md D-12 through D-17

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Services start correctly from committed compose | SVC-01, SVC-02 | Requires Docker engine on target host | SSH into host, `docker compose up -d`, verify containers healthy |
| AmneziaVPN connects from client | SVC-04 | Requires VPN client device | Connect using documented config, verify traffic routes through nether |
| Tailscale provision script adds a new node | SVC-05 | Requires fresh machine + admin auth key | Run on test VM, verify `tailscale status` on target shows joined |
| VMID 201 stopped with disk retained | SVC-08 | Live pct command | SSH tower, `pct status 201` shows `stopped`, `pct config 201` succeeds |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (N/A — Wave 0 pre-flight is already done)
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter after all plan checks pass

**Approval:** pending
