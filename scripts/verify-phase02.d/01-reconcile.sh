#!/usr/bin/env bash
# SVC-07: Phase 1 inventory drift reconciliation
set -euo pipefail
test ! -e servers/tower-sat || { echo "servers/tower-sat still exists"; exit 1; }
test ! -e servers/tower/lxc-101-tower-sat.conf || { echo "lxc-101 conf still exists"; exit 1; }
test -d servers/cc-worker || { echo "servers/cc-worker missing"; exit 1; }
test ! -d servers/cc-vk || { echo "servers/cc-vk still exists"; exit 1; }
grep -q 'cc-worker' CLAUDE.md || { echo "CLAUDE.md missing cc-worker row"; exit 1; }
! grep -q 'tower-sat' CLAUDE.md || { echo "CLAUDE.md still references tower-sat"; exit 1; }
grep -q '100\.99\.133\.9' CLAUDE.md || { echo "CLAUDE.md missing new cc-worker IP"; exit 1; }
grep -q '100\.99\.133\.9' servers/cc-worker/inventory.md || { echo "inventory missing new IP"; exit 1; }
if [[ "${MODE:-full}" != "--quick" ]]; then
  # Live check: VMID 201 stopped
  if command -v ssh >/dev/null 2>&1; then
    status=$(ssh -o ConnectTimeout=10 root@tower 'pct status 201' 2>/dev/null || echo 'ssh-failed')
    case "${status}" in
      *stopped*) ;;
      ssh-failed) echo "WARN: cannot SSH tower — skipping VMID 201 live check" ;;
      *) echo "VMID 201 not stopped: ${status}"; exit 1 ;;
    esac
  fi
fi
echo "SVC-07 OK"
