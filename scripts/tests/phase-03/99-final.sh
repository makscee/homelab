#!/usr/bin/env bash
# 99-final.sh — Phase 03 final gate; invoked by /gsd-verify-work.
# Runs: suite.sh (smoke + Tailnet probes) → healthcheck.sh --all → promtool
#       rule tests → secret scan. Exits 0 only if all phases pass
#       (or degrade non-blockingly in the case of healthcheck warnings).
#
# This script MUST NOT be discovered by smoke.sh — the 99- prefix is excluded
# by smoke.sh's glob filter to prevent recursion.
#
# Usage: bash scripts/tests/phase-03/99-final.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

info "=== Phase 03 FINAL gate ==="

# ─── 1) Full suite (smoke + Tailnet probes) ────────────────────────────────
info "Running full phase-03 suite..."
bash "${SCRIPT_DIR}/suite.sh"

# ─── 2) healthcheck.sh --all (0=ok, 1=degraded non-blocking, 2=fail blocking) ─
info "Running healthcheck.sh --all..."
set +e
"${PHASE_ROOT}/scripts/healthcheck.sh" --all
hc_rc=$?
set -e
case "${hc_rc}" in
  0) ok "all hosts healthy" ;;
  1) info "healthcheck reports DEGRADED — review issues but not blocking" ;;
  *) fail "healthcheck reports FAIL (rc=${hc_rc})"; exit 2 ;;
esac

# ─── 3) promtool rule unit tests ───────────────────────────────────────────
info "Running promtool rule tests..."
bash "${SCRIPT_DIR}/05-promtool-rules-test.sh"

# ─── 4) Secret scan: no plaintext Telegram bot tokens in the repo ──────────
info "Secret scan (no plaintext Telegram tokens)..."
if git -C "${PHASE_ROOT}" grep -E '[0-9]{8,10}:AA[A-Za-z0-9_-]{33,}' \
     -- ':!secrets/' ':!.planning/' 2>/dev/null; then
  fail "potential Telegram bot token found in repo"
  exit 2
fi
ok "secret scan clean"

ok "Phase 03 FINAL gate: GREEN"
