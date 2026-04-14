---
status: partial
phase: 02-service-documentation
source: [02-VERIFICATION.md]
started: 2026-04-14T18:00:00Z
updated: 2026-04-14T18:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Start services from committed docker-tower compose files on a fresh LXC
expected: `docker compose up -d` brings all containers healthy; media stack reachable
result: [pending]

### 2. Connect an AmneziaVPN client using the committed template + decrypted SOPS keys
expected: Client authenticates, traffic routes through nether
result: [pending]

### 3. Run scripts/tailscale-provision.sh on a fresh VM with a valid auth key
expected: `tailscale status` shows the host joined the Tailnet
result: [pending]

### 4. Verify VMID 201 remains stopped with disk retained on tower
expected: `ssh root@tower 'pct status 201'` prints `status: stopped`; `pct config 201` still returns a config
result: [pending]

### 5. Apply stale-unit cleanup on mcow per README.md (disable overseer/satellite)
expected: `systemctl is-enabled voidnet-overseer voidnet-satellite` returns disabled/masked
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
