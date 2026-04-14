#!/usr/bin/env bash
# lib.sh — shared helpers for Phase 03 test harness
# Source this file; do not execute directly.
# Usage: source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

set -euo pipefail

# ─── Root paths ───────────────────────────────────────────────────────────────

PHASE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MON_ROOT="${PHASE_ROOT}/servers/docker-tower/monitoring"

# ─── Remote endpoints ─────────────────────────────────────────────────────────

PROM_URL="http://100.101.0.8:9090"
AM_URL="http://100.101.0.8:9093"

# ─── Colour helpers ───────────────────────────────────────────────────────────

_RED='\033[0;31m'
_GREEN='\033[0;32m'
_YELLOW='\033[1;33m'
_RESET='\033[0m'

ok()   { echo -e "${_GREEN}[OK]${_RESET}   $*"; }
fail() { echo -e "${_RED}[FAIL]${_RESET} $*" >&2; }
info() { echo -e "${_YELLOW}[INFO]${_RESET} $*"; }

# ─── Assertion helpers ────────────────────────────────────────────────────────

# assert_file FILE — fail if FILE does not exist or is empty
assert_file() {
  local f="$1"
  if [[ ! -f "$f" ]]; then
    fail "File not found: $f"
    return 1
  fi
  ok "File exists: $f"
}

# assert_cmd CMD — fail if CMD is not on PATH
assert_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" > /dev/null 2>&1; then
    fail "Command not found: $cmd"
    return 1
  fi
  ok "Command available: $cmd"
}

# prom_query_must_succeed QUERY — curl Prometheus API and assert .status=="success"
prom_query_must_succeed() {
  local query="$1"
  local url="${PROM_URL}/api/v1/query?query=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$query" 2>/dev/null || echo "$query")"
  local response
  response=$(curl -sf --max-time 10 "$url" 2>/dev/null) || {
    fail "Prometheus query failed (network): $query"
    return 1
  }
  local status
  status=$(echo "$response" | jq -r '.status' 2>/dev/null) || {
    fail "Prometheus response not valid JSON for query: $query"
    return 1
  }
  if [[ "$status" != "success" ]]; then
    fail "Prometheus query returned status='$status' for: $query"
    return 1
  fi
  ok "Prometheus query succeeded: $query"
}
