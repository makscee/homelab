#!/usr/bin/env bash
# suite.sh — Phase 03 full validation harness: smoke + Tailnet live probes (<90s)
# Usage: bash scripts/tests/phase-03/suite.sh
# Exit nonzero if smoke or any live probe fails.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

info "=== Phase 03 SUITE — smoke + Tailnet probes ==="
echo ""

# ─── Smoke (config-only) ──────────────────────────────────────────────────────

info "Running smoke harness..."
bash "${SCRIPT_DIR}/smoke.sh"
echo ""

# ─── Live Tailnet probes ──────────────────────────────────────────────────────

info "--- Live Tailnet probes ---"
PROBE_FAIL=0

# Prometheus health
if curl -sf --max-time 5 "${PROM_URL}/-/healthy" > /dev/null 2>&1; then
  ok "Prometheus healthy: ${PROM_URL}/-/healthy"
else
  fail "Prometheus not reachable at ${PROM_URL}/-/healthy (may not be deployed yet)"
  PROBE_FAIL=$(( PROBE_FAIL + 1 ))
fi

# Prometheus active targets
if curl -sf --max-time 5 "${PROM_URL}/api/v1/targets" 2>/dev/null \
    | jq -e '.data.activeTargets | length > 0' > /dev/null 2>&1; then
  ok "Prometheus has active targets"
else
  fail "Prometheus reports no active targets (may not be deployed yet)"
  PROBE_FAIL=$(( PROBE_FAIL + 1 ))
fi

# Alertmanager health — gated: only fail if amtool is available (Plan 03-03 prerequisite)
# This probe degrades gracefully until Plan 03-03 deploys Alertmanager.
if command -v amtool > /dev/null 2>&1; then
  if curl -sf --max-time 5 "${AM_URL}/-/healthy" > /dev/null 2>&1; then
    ok "Alertmanager healthy: ${AM_URL}/-/healthy"
  else
    fail "Alertmanager not reachable at ${AM_URL}/-/healthy (deploy in Plan 03-03)"
    PROBE_FAIL=$(( PROBE_FAIL + 1 ))
  fi
else
  info "amtool not found — Alertmanager probe skipped (Plan 03-03 gate)"
fi

echo ""

if [[ "$PROBE_FAIL" -gt 0 ]]; then
  fail "SUITE: ${PROBE_FAIL} live probe(s) failed"
  exit 1
fi

echo "SUITE: OK"
