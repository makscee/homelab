#!/usr/bin/env bash
# 05-healthcheck.sh — Unit tests for scripts/healthcheck.sh
# Offline-safe: tests that don't require a live Prometheus are always run;
# live integration checks run only when PROM_URL/-/healthy responds.
# Usage: bash scripts/tests/phase-03/05-healthcheck.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

HEALTH="${PHASE_ROOT}/scripts/healthcheck.sh"
FAILED=0

section() { echo -e "\n${_YELLOW}=== $* ===${_RESET}"; }

section "File presence + permissions"
assert_file "${HEALTH}"
if [[ -x "${HEALTH}" ]]; then
  ok "healthcheck.sh is executable"
else
  fail "healthcheck.sh is not executable"
  FAILED=$(( FAILED + 1 ))
fi

section "shellcheck"
if command -v shellcheck >/dev/null 2>&1; then
  if shellcheck "${HEALTH}"; then
    ok "shellcheck clean"
  else
    fail "shellcheck reported issues"
    FAILED=$(( FAILED + 1 ))
  fi
else
  info "shellcheck not installed — skipping"
fi

section "--help exits 0 with usage"
if out=$("${HEALTH}" --help 2>&1); then
  if grep -q "Usage:" <<<"${out}"; then
    ok "--help prints usage"
  else
    fail "--help output missing 'Usage:'"
    FAILED=$(( FAILED + 1 ))
  fi
else
  fail "--help exited non-zero"
  FAILED=$(( FAILED + 1 ))
fi

section "no args → exit 2 with usage"
set +e
out=$("${HEALTH}" 2>&1); rc=$?
set -e
if [[ "${rc}" -eq 2 ]]; then
  ok "no-args exit 2"
else
  fail "no-args exit was ${rc} (expected 2)"
  FAILED=$(( FAILED + 1 ))
fi

section "unknown host → exit 2 + emits fail JSON with unknown_host"
set +e
out=$("${HEALTH}" bogus-host 2>/dev/null); rc=$?
set -e
if [[ "${rc}" -eq 2 ]]; then
  ok "bogus-host exit 2"
else
  fail "bogus-host exit was ${rc} (expected 2)"
  FAILED=$(( FAILED + 1 ))
fi
if jq -e '.host == "bogus-host" and .status == "fail"' <<<"${out}" >/dev/null 2>&1; then
  ok "bogus-host JSON host+status correct"
else
  fail "bogus-host JSON malformed: ${out}"
  FAILED=$(( FAILED + 1 ))
fi
# stderr carries the message; final output is JSON with unknown_host in issues
if jq -e '.issues[] | select(.metric == "unknown_host")' <<<"${out}" >/dev/null 2>&1; then
  ok "bogus-host issues contain unknown_host"
else
  fail "bogus-host issues missing unknown_host entry"
  FAILED=$(( FAILED + 1 ))
fi

# ── Live integration (only when Prometheus is reachable) ──
section "Live Prometheus probe"
if curl -sf --max-time 5 "${PROM_URL}/-/healthy" >/dev/null 2>&1; then
  ok "Prometheus reachable — running live checks"

  section "Single host: docker-tower — valid JSON schema"
  set +e
  out=$("${HEALTH}" docker-tower 2>/dev/null); rc=$?
  set -e
  if jq -e '.host and .status and (.issues|type=="array") and .checked_at' <<<"${out}" >/dev/null 2>&1; then
    ok "docker-tower JSON has required fields"
  else
    fail "docker-tower JSON missing fields: ${out}"
    FAILED=$(( FAILED + 1 ))
  fi
  if jq -e '.status | IN("ok","degraded","fail")' <<<"${out}" >/dev/null 2>&1; then
    ok "docker-tower status ∈ {ok,degraded,fail}"
  else
    fail "docker-tower status invalid: ${out}"
    FAILED=$(( FAILED + 1 ))
  fi
  # rc must be 0/1/2
  if [[ "${rc}" -ge 0 && "${rc}" -le 2 ]]; then
    ok "docker-tower exit code ${rc} in {0,1,2}"
  else
    fail "docker-tower exit code ${rc} out of range"
    FAILED=$(( FAILED + 1 ))
  fi

  section "--all: NDJSON of 6 hosts"
  set +e
  out=$("${HEALTH}" --all 2>/dev/null); rc=$?
  set -e
  lines=$(printf '%s\n' "${out}" | grep -c '^{' || true)
  if [[ "${lines}" -eq 6 ]]; then
    ok "--all emitted 6 JSON lines"
  else
    fail "--all emitted ${lines} lines (expected 6)"
    FAILED=$(( FAILED + 1 ))
  fi
  # Each line must parse and have required fields
  if printf '%s\n' "${out}" | jq -e 'select(.host and .status and (.issues|type=="array") and .checked_at)' >/dev/null 2>&1; then
    ok "--all lines all schema-valid"
  else
    fail "--all produced schema-invalid lines"
    FAILED=$(( FAILED + 1 ))
  fi
  if [[ "${rc}" -ge 0 && "${rc}" -le 2 ]]; then
    ok "--all exit code ${rc} in {0,1,2}"
  else
    fail "--all exit code ${rc} out of range"
    FAILED=$(( FAILED + 1 ))
  fi
else
  info "Prometheus unreachable at ${PROM_URL}/-/healthy — skipping live checks"
fi

echo ""
if [[ "${FAILED}" -gt 0 ]]; then
  fail "05-healthcheck: ${FAILED} assertion(s) failed"
  exit 1
fi
ok "05-healthcheck: all assertions passed"
