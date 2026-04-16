#!/usr/bin/env bash
# soak.sh --- single-tick poller for Phase 05 feasibility soak.
# Invoked by claude-usage-soak.service (oneshot). Appends one JSONL row per run.
# Halts the timer after 3 consecutive network-errors OR 3 consecutive 401/403.
set -euo pipefail

ENDPOINT="https://api.anthropic.com/api/oauth/usage"
UA="claude-usage-soak/0.1"
BETA="oauth-2025-04-20"
LOG=/var/log/claude-usage-soak.jsonl
STATE_DIR=/var/lib/claude-usage-soak
FAIL_COUNTER="$STATE_DIR/consecutive_fail"
AUTHFAIL_COUNTER="$STATE_DIR/consecutive_authfail"
HALT_THRESHOLD=3

mkdir -p "$STATE_DIR"
touch "$FAIL_COUNTER" "$AUTHFAIL_COUNTER"
[[ -s "$FAIL_COUNTER"     ]] || echo 0 > "$FAIL_COUNTER"
[[ -s "$AUTHFAIL_COUNTER" ]] || echo 0 > "$AUTHFAIL_COUNTER"

: "${CLAUDE_USAGE_TOKEN:?CLAUDE_USAGE_TOKEN not set (expected from EnvironmentFile)}"

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
BODY=$(mktemp); HDRS=$(mktemp)
trap 'rm -f "$BODY" "$HDRS"' EXIT

set +e
read -r HTTP_STATUS TIME_TOTAL < <(
  curl -4 -sS -o "$BODY" -D "$HDRS" \
    -w '%{http_code} %{time_total}\n' \
    --max-time 15 \
    -H "Authorization: Bearer ${CLAUDE_USAGE_TOKEN}" \
    -H "anthropic-beta: ${BETA}" \
    -H "User-Agent: ${UA}" \
    -H "Accept: application/json" \
    "$ENDPOINT"
)
CURL_EXIT=$?
set -e
HTTP_STATUS=${HTTP_STATUS:-0}
TIME_TOTAL=${TIME_TOTAL:-0}
LATENCY_MS=$(awk -v t="$TIME_TOTAL" 'BEGIN{printf "%d", t*1000}')

SCHEMA_HASH=null
SCHEMA_MATCH=false
PRESENT_JSON='[]'
if [[ "$HTTP_STATUS" == "200" && -s "$BODY" ]]; then
  if command -v jq >/dev/null; then
    SCHEMA_HASH=$(jq -S . "$BODY" 2>/dev/null | sha256sum | cut -d' ' -f1 || echo null)
    PRESENT_JSON=$(jq -c '
      [
        (if .five_hour.utilization        != null then "five_hour.utilization" else empty end),
        (if .seven_day.utilization        != null then "seven_day.utilization" else empty end),
        (if .five_hour.resets_at          != null then "five_hour.resets_at" else empty end),
        (if .seven_day.resets_at          != null then "seven_day.resets_at" else empty end),
        (if .seven_day_sonnet.utilization != null then "seven_day_sonnet.utilization" else empty end),
        (if .seven_day_opus.utilization   != null then "seven_day_opus.utilization" else empty end)
      ]' "$BODY" 2>/dev/null || echo '[]')
    # schema_match = all 4 required fields present AND at least one model-specific variant
    required_ok=$(jq -c 'length' <<< "$PRESENT_JSON")
    # required set has 4 entries (2 utilizations + 2 resets_at) + optional sonnet/opus
    SCHEMA_MATCH=$(jq 'contains(["five_hour.utilization","seven_day.utilization","five_hour.resets_at","seven_day.resets_at"]) and (contains(["seven_day_sonnet.utilization"]) or contains(["seven_day_opus.utilization"]))' <<< "$PRESENT_JSON")
  fi
fi

RETRY_AFTER=$(awk 'BEGIN{IGNORECASE=1} /^retry-after:/{sub(/^[^:]*:[ \t]*/,""); sub(/\r$/,""); print; exit}' "$HDRS")
RETRY_AFTER_JSON=$([[ -n "$RETRY_AFTER" ]] && jq -Rn --arg v "$RETRY_AFTER" '$v' || echo null)
REQUEST_ID=$(awk 'BEGIN{IGNORECASE=1} /^x-request-id:/{sub(/^[^:]*:[ \t]*/,""); sub(/\r$/,""); print; exit}' "$HDRS")
REQUEST_ID_JSON=$([[ -n "$REQUEST_ID" ]] && jq -Rn --arg v "$REQUEST_ID" '$v' || echo null)

# Halt counters.
if [[ "$CURL_EXIT" != "0" || "$HTTP_STATUS" == "0" ]]; then
  FAIL=$(($(<"$FAIL_COUNTER") + 1)); echo "$FAIL" > "$FAIL_COUNTER"
else
  echo 0 > "$FAIL_COUNTER"
  FAIL=0
fi
if [[ "$HTTP_STATUS" == "401" || "$HTTP_STATUS" == "403" ]]; then
  AF=$(($(<"$AUTHFAIL_COUNTER") + 1)); echo "$AF" > "$AUTHFAIL_COUNTER"
else
  echo 0 > "$AUTHFAIL_COUNTER"
  AF=0
fi

CONSEC=$FAIL; (( AF > CONSEC )) && CONSEC=$AF

jq -nc \
  --arg ts "$TS" \
  --argjson status "$HTTP_STATUS" \
  --argjson latency "$LATENCY_MS" \
  --argjson hash "$( [[ "$SCHEMA_HASH" == "null" ]] && echo null || jq -Rn --arg v "$SCHEMA_HASH" '$v' )" \
  --argjson match "$SCHEMA_MATCH" \
  --argjson present "$PRESENT_JSON" \
  --argjson retry "$RETRY_AFTER_JSON" \
  --argjson reqid "$REQUEST_ID_JSON" \
  --argjson consec "$CONSEC" \
  --argjson curl_exit "$CURL_EXIT" \
  '{ts:$ts, http_status:$status, latency_ms:$latency, schema_hash:$hash, schema_match:$match, required_fields_present:$present, retry_after:$retry, request_id:$reqid, consecutive_fail:$consec, curl_exit:$curl_exit}' \
  >> "$LOG"
chmod 0600 "$LOG" 2>/dev/null || true

# Halt conditions (D-05-06).
if (( FAIL >= HALT_THRESHOLD )); then
  logger -t claude-usage-soak "HALT: $FAIL consecutive network errors"
  systemctl stop claude-usage-soak.timer || true
  exit 0
fi
if (( AF >= HALT_THRESHOLD )); then
  logger -t claude-usage-soak "HALT: $AF consecutive auth failures (401/403)"
  systemctl stop claude-usage-soak.timer || true
  exit 0
fi
exit 0
