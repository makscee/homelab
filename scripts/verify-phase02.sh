#!/usr/bin/env bash
# Phase 02 verification harness. Each plan contributes a snippet in scripts/verify-phase02.d/.
# Usage: bash scripts/verify-phase02.sh [--quick]
set -euo pipefail
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "${SCRIPT_DIR}/.." && pwd )"
cd "${REPO_ROOT}"
MODE="${1:-full}"
FAILED=0
shopt -s nullglob
for snippet in "${SCRIPT_DIR}/verify-phase02.d/"*.sh; do
  echo "=== $(basename "${snippet}") ==="
  if ! MODE="${MODE}" bash "${snippet}"; then
    echo "FAIL: ${snippet}" >&2
    FAILED=$((FAILED+1))
  fi
done
if [[ ${FAILED} -gt 0 ]]; then
  echo "verify-phase02: ${FAILED} snippet(s) failed" >&2
  exit 1
fi
echo "verify-phase02: all snippets passed"
