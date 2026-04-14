#!/usr/bin/env bash
# smoke.sh — Phase 03 config-only validation harness (offline, <30s)
# Iterates all NN-*.sh snippets in lexical order, excluding 00-env-check.sh.
# Usage: bash scripts/tests/phase-03/smoke.sh
# Exit nonzero if any snippet fails.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

shopt -s nullglob

TOTAL=0
PASSED=0
FAILED=0

info "=== Phase 03 SMOKE — config-only validation ==="
echo ""

for snippet in "${SCRIPT_DIR}"/[0-9][0-9]-*.sh; do
  name="$(basename "$snippet")"

  # Skip env-check — it is a Wave 0 gate, not part of the sampling harness
  if [[ "$name" == "00-env-check.sh" ]]; then
    continue
  fi

  TOTAL=$(( TOTAL + 1 ))
  echo "--- ${name} ---"

  if bash "$snippet"; then
    ok "${name}: passed"
    PASSED=$(( PASSED + 1 ))
  else
    fail "${name}: FAILED"
    FAILED=$(( FAILED + 1 ))
  fi
  echo ""
done

echo "SMOKE: ${PASSED}/${TOTAL} passed"

if [[ "$FAILED" -gt 0 ]]; then
  exit 1
fi
