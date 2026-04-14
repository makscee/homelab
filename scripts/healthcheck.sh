#!/usr/bin/env bash
# scripts/healthcheck.sh — Query Prometheus HTTP API to verify host health.
# Usage:
#   scripts/healthcheck.sh <hostname>         # single host
#   scripts/healthcheck.sh --all              # all 6 hosts (NDJSON on stdout)
#   scripts/healthcheck.sh --help
# Exit: 0=ok, 1=degraded (warnings), 2=fail (critical)
# Deps: curl, jq
# Transport: Prometheus HTTP API at http://100.101.0.8:9090 (no SSH)
#
# Contract:
#   Output JSON schema (per host):
#     {
#       "host":       "<name>",
#       "status":     "ok" | "degraded" | "fail",
#       "issues":     [{"metric": "...", "value": "...", "threshold": "..."}],
#       "checked_at": "<ISO-8601-UTC>"
#     }
#
# Checks (per CONTEXT.md lock):
#   1. up{job="node",instance=...}  == 1               → fail if 0
#   2. min(disk avail / size) across fstypes           → fail if < 10%
#   3. memory MemAvailable / MemTotal                  → degraded if < 10%
#   4. time() - node_boot_time_seconds < 180           → info only (tag "recently_booted")

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────

PROM="${PROM_URL:-http://100.101.0.8:9090}"
CHECKED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

ALL_HOSTS=(tower docker-tower cc-worker mcow nether animaya-dev)

# host_ip HOST — echo the Tailnet IP for HOST; exit-code 1 (and empty) if unknown.
# Portable across bash 3.2 (macOS default) and bash 4+.
host_ip() {
  case "$1" in
    tower)        printf '%s' "100.101.0.7" ;;
    docker-tower) printf '%s' "100.101.0.8" ;;
    cc-worker)    printf '%s' "100.99.133.9" ;;
    mcow)         printf '%s' "100.101.0.9" ;;
    nether)       printf '%s' "100.101.0.3" ;;
    animaya-dev)  printf '%s' "100.119.15.122" ;;
    *)            return 1 ;;
  esac
}

# ─── Helpers ─────────────────────────────────────────────────────────────────

usage() {
  cat <<'EOF'
Usage:
  scripts/healthcheck.sh <hostname>    # e.g. scripts/healthcheck.sh mcow
  scripts/healthcheck.sh --all         # NDJSON of all 6 hosts
  scripts/healthcheck.sh --help

Exit: 0=ok, 1=degraded, 2=fail.
Deps: curl, jq. Override Prometheus URL with PROM_URL env var.

Hosts: tower, docker-tower, cc-worker, mcow, nether, animaya-dev
EOF
}

# prom_query QUERY — curl Prometheus /api/v1/query; print raw JSON; return 1 on failure.
prom_query() {
  local query="$1"
  local response
  if ! response=$(curl -sf --max-time 10 \
      --get "${PROM}/api/v1/query" \
      --data-urlencode "query=${query}" 2>/dev/null); then
    echo "healthcheck: prometheus query failed: ${query}" >&2
    return 1
  fi
  printf '%s' "${response}"
}

# jq_value RESPONSE — extract first vector result's .value[1]; empty string if none.
jq_value() {
  local response="$1"
  printf '%s' "${response}" | jq -r '
    if .status == "success" and (.data.result | length) > 0
    then .data.result[0].value[1] // ""
    else ""
    end' 2>/dev/null || printf ''
}

# jq_min_value RESPONSE — extract minimum .value[1] across all results; empty if none.
jq_min_value() {
  local response="$1"
  printf '%s' "${response}" | jq -r '
    if .status == "success" and (.data.result | length) > 0
    then [.data.result[].value[1] | tonumber] | min | tostring
    else ""
    end' 2>/dev/null || printf ''
}

# emit_json HOST STATUS ISSUES_JSON — print a single JSON line via jq -c.
emit_json() {
  local host="$1" status="$2" issues_json="$3"
  jq -c -n \
    --arg host "$host" \
    --arg status "$status" \
    --arg ts "$CHECKED_AT" \
    --argjson issues "$issues_json" \
    '{host:$host,status:$status,issues:$issues,checked_at:$ts}'
}

# make_issue METRIC VALUE THRESHOLD → one JSON object string, no newline.
# Bash 3.2-compatible (no namerefs). Callers append to their own array.
make_issue() {
  local metric="$1" value="$2" threshold="$3"
  jq -c -n \
    --arg metric "$metric" \
    --arg value "$value" \
    --arg threshold "$threshold" \
    '{metric:$metric,value:$value,threshold:$threshold}'
}

# issues_join ITEM... → "[{...},{...}]" (or "[]")
issues_join() {
  if [[ "$#" -eq 0 ]]; then
    printf '[]'
    return
  fi
  local joined
  joined=$(IFS=, ; printf '%s' "$*")
  printf '[%s]' "${joined}"
}

# ─── Core check ──────────────────────────────────────────────────────────────

# check_host HOST — prints one JSON line; returns 0/1/2.
check_host() {
  local host="$1"
  local ip=""
  ip=$(host_ip "$host" || true)

  if [[ -z "$ip" ]]; then
    echo "healthcheck: unknown host '${host}'" >&2
    local issues_arr=()
    issues_arr+=("$(make_issue "unknown_host" "${host}" "known_host")")
    emit_json "${host}" "fail" "$(issues_join "${issues_arr[@]}")"
    return 2
  fi

  local instance="${ip}:9100"
  local issues_arr=()
  local worst=0  # 0=ok 1=degraded 2=fail

  # ── Check 1: Prometheus reachable? (use "up" query itself as a probe) ──────
  local up_resp
  if ! up_resp=$(prom_query "up{job=\"node\",instance=\"${instance}\"}"); then
    issues_arr+=("$(make_issue "prometheus" "unreachable" "http200")")
    emit_json "${host}" "fail" "$(issues_join "${issues_arr[@]}")"
    return 2
  fi

  # ── Check 2: up == 1 ──────────────────────────────────────────────────────
  local up_val
  up_val=$(jq_value "${up_resp}")
  if [[ -z "${up_val}" ]]; then
    issues_arr+=("$(make_issue "up" "no_data" "1")")
    worst=2
  elif [[ "${up_val}" != "1" ]]; then
    issues_arr+=("$(make_issue "up" "${up_val}" "1")")
    worst=2
  fi

  # ── Check 3: Disk — min(avail/size) across fstypes; fail if < 0.10 ───────
  local disk_resp disk_min
  if disk_resp=$(prom_query "min by (instance) ((node_filesystem_avail_bytes{fstype!~\"tmpfs|overlay|squashfs\",instance=\"${instance}\"} / node_filesystem_size_bytes{fstype!~\"tmpfs|overlay|squashfs\",instance=\"${instance}\"}))"); then
    disk_min=$(jq_value "${disk_resp}")
    if [[ -n "${disk_min}" ]]; then
      # Compare: fail if disk_min < 0.10
      if awk -v v="${disk_min}" 'BEGIN { exit !(v+0 < 0.10) }'; then
        local pct
        pct=$(awk -v v="${disk_min}" 'BEGIN { printf "%.1f%%", v*100 }')
        issues_arr+=("$(make_issue "disk" "${pct}" "10%")")
        [[ "${worst}" -lt 2 ]] && worst=2
      fi
    fi
  fi

  # ── Check 4: Memory — MemAvailable/MemTotal < 0.10 → degraded ─────────────
  local mem_resp mem_val
  if mem_resp=$(prom_query "node_memory_MemAvailable_bytes{instance=\"${instance}\"} / node_memory_MemTotal_bytes{instance=\"${instance}\"}"); then
    mem_val=$(jq_value "${mem_resp}")
    if [[ -n "${mem_val}" ]]; then
      if awk -v v="${mem_val}" 'BEGIN { exit !(v+0 < 0.10) }'; then
        local pct
        pct=$(awk -v v="${mem_val}" 'BEGIN { printf "%.1f%%", v*100 }')
        issues_arr+=("$(make_issue "memory" "${pct}" "10%")")
        [[ "${worst}" -lt 1 ]] && worst=1
      fi
    fi
  fi

  # ── Check 5: Recent reboot — info only ────────────────────────────────────
  local reboot_resp reboot_val
  if reboot_resp=$(prom_query "time() - node_boot_time_seconds{instance=\"${instance}\"}"); then
    reboot_val=$(jq_value "${reboot_resp}")
    if [[ -n "${reboot_val}" ]]; then
      if awk -v v="${reboot_val}" 'BEGIN { exit !(v+0 < 180) }'; then
        local secs
        secs=$(awk -v v="${reboot_val}" 'BEGIN { printf "%ds", v }')
        issues_arr+=("$(make_issue "uptime" "${secs}" "180s")")
        # Info only — do NOT change worst_exit
      fi
    fi
  fi

  # ── Emit JSON and return code ─────────────────────────────────────────────
  local status
  case "${worst}" in
    0) status="ok" ;;
    1) status="degraded" ;;
    2) status="fail" ;;
    *) status="fail" ;;
  esac

  # Guard array expansion under set -u for zero-length arrays (bash 3.2 quirk)
  if [[ "${#issues_arr[@]}" -eq 0 ]]; then
    emit_json "${host}" "${status}" "[]"
  else
    emit_json "${host}" "${status}" "$(issues_join "${issues_arr[@]}")"
  fi
  return "${worst}"
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
  # Dependency checks
  for cmd in curl jq; do
    if ! command -v "${cmd}" >/dev/null 2>&1; then
      echo "healthcheck: required command missing: ${cmd}" >&2
      exit 2
    fi
  done

  if [[ "$#" -eq 0 ]]; then
    usage >&2
    exit 2
  fi

  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --all)
      local max_exit=0 rc
      for h in "${ALL_HOSTS[@]}"; do
        rc=0
        check_host "$h" || rc=$?
        [[ "${rc}" -gt "${max_exit}" ]] && max_exit="${rc}"
      done
      exit "${max_exit}"
      ;;
    -*)
      echo "healthcheck: unknown option '$1'" >&2
      usage >&2
      exit 2
      ;;
    *)
      local host="$1"
      if ! host_ip "${host}" >/dev/null 2>&1; then
        echo "healthcheck: unknown host '${host}'" >&2
        local issues_arr=()
        issues_arr+=("$(make_issue "unknown_host" "${host}" "known_host")")
        emit_json "${host}" "fail" "$(issues_join "${issues_arr[@]}")"
        exit 2
      fi
      local rc=0
      check_host "${host}" || rc=$?
      exit "${rc}"
      ;;
  esac
}

main "$@"
