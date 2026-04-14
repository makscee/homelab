#!/usr/bin/env bash
# 05-promtool-rules-test.sh — Run promtool rule unit tests + syntax check.
# Usage: bash scripts/tests/phase-03/05-promtool-rules-test.sh
# Exits 0 if promtool is absent (gracefully skipped) — install with:
#   brew install prometheus   (macOS)
#   apt install prometheus    (Debian/Ubuntu)
# The phase gate (99-final.sh) and CI should run this where promtool is present.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

RULES="${MON_ROOT}/prometheus/alerts/homelab.yml"
TEST_FILE="${MON_ROOT}/prometheus/tests/homelab_test.yml"

section() { echo -e "\n${_YELLOW}=== $* ===${_RESET}"; }

section "File presence"
assert_file "${RULES}"
assert_file "${TEST_FILE}"

if ! command -v promtool >/dev/null 2>&1; then
  info "promtool not installed — skipping rule-eval tests"
  info "install: brew install prometheus  |  apt install prometheus"
  ok "05-promtool-rules-test: skipped (promtool absent)"
  exit 0
fi

section "promtool check rules (syntax)"
if promtool check rules "${RULES}"; then
  ok "rules syntax-clean"
else
  fail "promtool check rules failed on ${RULES}"
  exit 1
fi

section "promtool test rules (unit)"
if promtool test rules "${TEST_FILE}"; then
  ok "rule unit tests passed"
else
  fail "promtool test rules failed on ${TEST_FILE}"
  exit 1
fi

ok "05-promtool-rules-test: all checks passed"
