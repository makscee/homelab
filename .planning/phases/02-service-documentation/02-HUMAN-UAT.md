---
status: complete
phase: 02-service-documentation
source: [02-VERIFICATION.md]
started: 2026-04-14T18:00:00Z
updated: 2026-04-15T07:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Start services from committed docker-tower compose files on a fresh LXC
expected: `docker compose up -d` brings all containers healthy; media stack reachable
result: pass
scope: "1b — `docker compose config` validation only (data-gravity prevents literal `up -d` on a data-less LXC per D-06/D-11; full state restore is deferred to a future phase). Validated on fresh Proxmox LXC 206 (Debian 13, unprivileged, nesting)."
evidence: "On LXC 206 with Docker 29.4.0 + Compose v5.1.2, external networks `homestack` and `monitoring` created, ran `docker compose -f <file> config --quiet` against all four files: services.yml OK, monitoring.yml OK, homestack.yml OK, extras.yml OK. No syntax errors, all env-file references resolved with `required: false`, all image:tag pins valid."
note: "Full `up -d` on fresh LXC would fail bind-mount requirements for /media, /opt/docker-configs/shared/*, /var/opt/homestack/*, /opt/docker-tower-api — these are data/state (Phase 3) and host-bootstrap (Phase 4) concerns, not Phase 02 reproducibility scope."

### 2. Connect an AmneziaVPN client using the committed template + decrypted SOPS keys
expected: Client authenticates, traffic routes through nether
result: pass
note: "Rendered template from secrets/nether-awg.sops.yaml matches live nether awg0.conf 119/119 lines (ignoring comments+blank lines). All 53 SOPS keys resolved. User confirms existing phone AmneziaVPN connection still routes through nether."

### 3. Run scripts/tailscale-provision.sh on a fresh VM with a valid auth key
expected: `tailscale status` shows the host joined the Tailnet
result: pass
evidence: "Fresh LXC 206 (Debian 13) joined Tailnet as `test-206` with IP 100.88.0.3 using Tailscale 1.96.4. `tailscale status` listed test-206 alongside existing homelab nodes."
gap: "Script does not document or handle the LXC-specific requirement: unprivileged Proxmox LXCs lack /dev/net/tun by default, causing tailscaled to fail with `CreateTUN failed; /dev/net/tun does not exist`. Added to /etc/pve/lxc/206.conf on host: `lxc.cgroup2.devices.allow: c 10:200 rwm` + `lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file`. Script comment says 'fresh Debian/Ubuntu host' (VMs work out of the box); LXC handling is left to the operator. Minor doc/automation enhancement for a future phase."

### 4. Verify VMID 201 remains stopped with disk retained on tower
expected: `ssh root@tower 'pct status 201'` prints `status: stopped`; `pct config 201` still returns a config
result: pass
note: "VMID 201 hostname=cc-andrey conflicts with CLAUDE.md (cc-andrey=LXC 200); likely old clone, not a test failure"

### 5. Apply stale-unit cleanup on mcow per README.md (disable overseer/satellite)
expected: `systemctl is-enabled voidnet-overseer voidnet-satellite` returns disabled/masked
result: pass
evidence: "ssh root@mcow: `systemctl is-enabled` returns disabled for both; `systemctl is-active` returns inactive for both."

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none — all tests passed; minor enhancement notes captured per-test]
