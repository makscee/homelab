#!/usr/bin/env bash
# Smoke probe: verify node_exporter :9100/metrics is reachable on all Tailnet hosts.
# Exits 0 only if all 5 deployed hosts are reachable.
# animaya-dev (100.119.15.122) is excluded — SSH-blocked, deployment deferred.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib.sh" 2>/dev/null || true

ok() { echo "[OK] $*"; }
fail_host() { echo "[FAIL] $*" >&2; FAILED=$((FAILED+1)); }

FAILED=0

# 5 reachable hosts — animaya-dev excluded (deferred: SSH publickey blocked)
TARGETS=(
  "100.101.0.7:9100"   # tower
  "100.101.0.8:9100"   # docker-tower
  "100.99.133.9:9100"  # cc-worker
  "100.101.0.9:9100"   # mcow
  "100.101.0.3:9100"   # nether
)

for target in "${TARGETS[@]}"; do
  if curl -sf --max-time 5 "http://${target}/metrics" | head -1 | grep -q '^# HELP'; then
    ok "node-exporter reachable: ${target}"
  else
    fail_host "node-exporter UNREACHABLE: ${target}"
  fi
done

# animaya-dev — expected deferred, just note it
echo "[SKIP] animaya-dev (100.119.15.122:9100) — SSH-blocked, deployment deferred"

if [ "${FAILED}" -gt 0 ]; then
  echo "[FAIL] ${FAILED} host(s) unreachable" >&2
  exit 1
fi

ok "All deployed node-exporter endpoints reachable (animaya-dev deferred)"
