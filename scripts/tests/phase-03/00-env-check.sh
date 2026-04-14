#!/usr/bin/env bash
# 00-env-check.sh — Wave 0 operator tooling and firewall gate check
# Usage: bash scripts/tests/phase-03/00-env-check.sh
# Exit 0 only if all required binary tools are present on PATH.
# PVE firewall and animaya-dev Python state are captured to stdout but do not affect exit.

set -euo pipefail

PASS=0
FAIL=0
FIREWALL_LOG="/tmp/phase-03-pve-firewall.txt"

ok()   { echo "[OK]   $*"; }
fail() { echo "[FAIL] $*" >&2; }
info() { echo "[INFO] $*"; }

# ─── Binary checks ────────────────────────────────────────────────────────────

check_binary() {
  local bin="$1"
  local install_hint="$2"
  if command -v "$bin" > /dev/null 2>&1; then
    local ver
    ver=$("$bin" --version 2>&1 | head -1 || echo "(version unknown)")
    ok "$bin: $ver"
    PASS=$(( PASS + 1 ))
  else
    fail "$bin not found. Install: $install_hint"
    FAIL=$(( FAIL + 1 ))
  fi
}

info "=== Phase 03 — Wave 0 environment check ==="
echo ""

info "--- Binary checks ---"
check_binary promtool    "apt-get install prometheus  OR  docker run --rm prom/prometheus:v2.53.0 promtool --version"
check_binary amtool      "apt-get install prometheus-alertmanager  OR  docker run --rm prom/alertmanager amtool --version"
check_binary shellcheck  "apt-get install shellcheck"
check_binary yamllint    "pip install yamllint  OR  apt-get install yamllint"
check_binary jq          "apt-get install jq"
check_binary curl        "apt-get install curl"
check_binary ssh         "apt-get install openssh-client"

echo ""

# ─── PVE firewall state ────────────────────────────────────────────────────────

info "--- PVE firewall state on tower ---"
{
  echo "# Phase 03 PVE firewall capture — $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo ""
  ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no root@tower \
    "pve-firewall status 2>&1; echo '---'; iptables -L INPUT -n 2>&1 | grep -E '9100|ACCEPT' || true" 2>&1
} | tee "$FIREWALL_LOG" || {
  echo "WARNING: SSH to tower failed — could not capture PVE firewall state" | tee -a "$FIREWALL_LOG"
}

# Check for potential block
if grep -q "enabled" "$FIREWALL_LOG" 2>/dev/null && ! grep -qE "9100" "$FIREWALL_LOG" 2>/dev/null; then
  echo ""
  echo "WARNING: PVE firewall may block 9100 — see A2 in RESEARCH.md"
  echo "         Review $FIREWALL_LOG before running Plan 03-02"
fi

echo ""
info "PVE firewall state saved to: $FIREWALL_LOG"
echo ""

# ─── animaya-dev Python3 check ─────────────────────────────────────────────────

info "--- animaya-dev Python3 availability (Ansible dependency — Plan 03-02 prerequisite) ---"
ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no root@animaya-dev \
  "python3 --version 2>&1 || echo 'Python3 NOT found. Run: apt-get install -y python3'" 2>&1 || {
  echo "WARNING: SSH to animaya-dev failed — confirm Python3 manually before Plan 03-02"
}
echo ""

# ─── Summary ──────────────────────────────────────────────────────────────────

info "--- Summary ---"
echo "Binary checks: $PASS passed, $FAIL failed"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "FAILED: $FAIL required tool(s) missing. Install them before proceeding."
  exit 1
fi

echo "All binary checks passed."
exit 0
