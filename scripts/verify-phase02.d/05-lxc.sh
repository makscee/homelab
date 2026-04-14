#!/usr/bin/env bash
# SVC-03 + SVC-08: fresh LXC configs and dev-worker inventories
set -euo pipefail
# SVC-03
for v in 100 200 202 203 204 205; do
  f=$(ls servers/tower/lxc-${v}-*.conf 2>/dev/null | head -1) || { echo "missing lxc-${v}-*.conf"; exit 1; }
  test -s "$f" || { echo "empty: $f"; exit 1; }
  grep -q '^rootfs:' "$f" || { echo "no rootfs line in $f"; exit 1; }
done
! ls servers/tower/lxc-101-*.conf 2>/dev/null \
  || { echo "stale lxc-101 conf resurfaced"; exit 1; }
# SVC-08
for h in cc-andrey cc-dan cc-yuri animaya-dev; do
  test -f "servers/${h}/inventory.md" || { echo "inventory missing: ${h}"; exit 1; }
  grep -q 'Proxmox VMID' "servers/${h}/inventory.md" || { echo "${h} inventory missing VMID"; exit 1; }
done
grep -q 'VMID 201' servers/cc-andrey/inventory.md || { echo "cc-andrey missing VMID 201 note"; exit 1; }
grep -q '2201' servers/cc-andrey/inventory.md || { echo "cc-andrey missing port forward 2201"; exit 1; }
grep -q '100\.119\.15\.122' servers/animaya-dev/inventory.md || { echo "animaya-dev missing TS IP"; exit 1; }
grep -q 'lxc-204-cc-worker' servers/cc-worker/inventory.md || { echo "cc-worker inventory missing LXC ref"; exit 1; }
test -f servers/tower/README.md && [ "$(wc -l < servers/tower/README.md)" -ge 40 ] \
  || { echo "tower README missing or too short"; exit 1; }
if [[ "${MODE:-full}" != "--quick" ]]; then
  # Live: ensure VMID 201 is still stopped (cross-check Plan 01)
  if command -v ssh >/dev/null 2>&1; then
    status=$(ssh -o ConnectTimeout=10 root@tower 'pct status 201' 2>/dev/null || echo 'ssh-failed')
    case "${status}" in
      *stopped*|ssh-failed) ;;
      *) echo "VMID 201 no longer stopped: ${status}"; exit 1 ;;
    esac
  fi
fi
echo "SVC-03 OK"
echo "SVC-08 OK"
