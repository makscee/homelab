#!/usr/bin/env bash
# 01-prometheus-config.sh — validate committed prometheus.yml + targets + alerts
# Part of the Phase 03 smoke harness. Sourced by smoke.sh.
# Usage: bash scripts/tests/phase-03/01-prometheus-config.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

info "01-prometheus-config: validating committed Prometheus configuration files"

# ─── File existence ───────────────────────────────────────────────────────────

assert_file "${MON_ROOT}/prometheus/prometheus.yml"
assert_file "${MON_ROOT}/prometheus/targets/nodes.yml"
assert_file "${MON_ROOT}/prometheus/targets/cadvisor.yml"
assert_file "${MON_ROOT}/prometheus/alerts/homelab.yml"

# ─── promtool checks ──────────────────────────────────────────────────────────

assert_cmd promtool

promtool check config "${MON_ROOT}/prometheus/prometheus.yml"
ok "promtool check config: passed"

promtool check rules "${MON_ROOT}/prometheus/alerts/homelab.yml"
ok "promtool check rules: passed"

# ─── yamllint checks ──────────────────────────────────────────────────────────

assert_cmd yamllint

yamllint -d '{extends: relaxed, rules: {line-length: {max: 120}}}' \
  "${MON_ROOT}/prometheus/targets/nodes.yml" \
  "${MON_ROOT}/prometheus/targets/cadvisor.yml"
ok "yamllint targets: passed"

yamllint -d '{extends: relaxed, rules: {line-length: {max: 120}}}' \
  "${MON_ROOT}/prometheus/prometheus.yml"
ok "yamllint prometheus.yml: passed"
