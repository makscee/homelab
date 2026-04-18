#!/usr/bin/env bash
# scripts/verify-jellyfin-lxc.sh — Wave-0 probe for Phase 17.1 LXC 101.
# Exits non-zero until Plan 02 lands Jellyfin install.
set -euo pipefail
echo "[17.1] LXC 101 probe — stub; superseded by Plan 02 checks."
ssh root@tower 'pct status 101' | grep -q running || { echo "FAIL: pct status"; exit 1; }
ssh root@tower 'pct config 101' | grep -q 'unprivileged: 1' || { echo "FAIL: not unprivileged"; exit 1; }
ssh root@tower 'pct config 101' | grep -qE 'mp[01]:.*ro=1' || { echo "FAIL: mp RO missing"; exit 1; }
ssh root@tower 'pct config 101' | grep -q 'dev0: /dev/dri/renderD128' || { echo "FAIL: dev0 missing"; exit 1; }
echo "[17.1] stub checks passed — Jellyfin install/health NOT yet verified."
exit 1   # intentional: forces Plan 02+ to extend script before we call it green
