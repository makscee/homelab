#!/usr/bin/env bash
# smoke.sh --- one-shot egress + schema smoke test for api.anthropic.com/api/oauth/usage
# Phase 05 feasibility gate (v2.0 Claude Code Usage Monitor).
# Invoked MANUALLY on mcow before arming the 24h soak timer.
# Reads token from $CLAUDE_USAGE_TOKEN or from file at $CLAUDE_USAGE_TOKEN_FILE (mode 0600).
# Exit codes:
#   0 = 200 OK + all required schema fields present
#   2 = HTTP non-200 (stdout records http_status)
#   3 = schema mismatch (required field missing)
#   4 = token not provided / wrong perms
#   5 = network/TLS error (curl nonzero exit)
set -euo pipefail

ENDPOINT="https://api.anthropic.com/api/oauth/usage"
UA="claude-usage-soak/0.1"
BETA="oauth-2025-04-20"

if [[ -n "${CLAUDE_USAGE_TOKEN:-}" ]]; then
  TOKEN="$CLAUDE_USAGE_TOKEN"
elif [[ -n "${CLAUDE_USAGE_TOKEN_FILE:-}" && -r "$CLAUDE_USAGE_TOKEN_FILE" ]]; then
  perms=$(stat -c '%a' "$CLAUDE_USAGE_TOKEN_FILE" 2>/dev/null || stat -f '%Lp' "$CLAUDE_USAGE_TOKEN_FILE")
  if [[ "$perms" != "600" && "$perms" != "400" ]]; then
    echo "ERROR: $CLAUDE_USAGE_TOKEN_FILE has perms $perms; expected 0600 or 0400" >&2
    exit 4
  fi
  TOKEN=$(tr -d '\n\r' < "$CLAUDE_USAGE_TOKEN_FILE")
else
  echo "ERROR: set CLAUDE_USAGE_TOKEN or CLAUDE_USAGE_TOKEN_FILE" >&2
  exit 4
fi

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

HTTP_STATUS=$(curl -4 -sS -o "$TMP" -w '%{http_code}' \
  --max-time 15 \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "anthropic-beta: ${BETA}" \
  -H "User-Agent: ${UA}" \
  -H "Accept: application/json" \
  "$ENDPOINT") || { echo "network-error curl_exit=$?"; exit 5; }

echo "http_status=$HTTP_STATUS"
if [[ "$HTTP_STATUS" != "200" ]]; then
  echo "body:"; cat "$TMP"; echo
  exit 2
fi

command -v jq >/dev/null || { echo "ERROR: jq required" >&2; exit 3; }

ok=true
for path in '.five_hour.utilization' '.seven_day.utilization' '.five_hour.resets_at' '.seven_day.resets_at'; do
  v=$(jq -r "$path // empty" "$TMP")
  if [[ -z "$v" || "$v" == "null" ]]; then echo "MISSING: $path"; ok=false
  else echo "OK: $path = $v"; fi
done

sonnet=$(jq -r '.seven_day_sonnet.utilization // empty' "$TMP")
opus=$(jq -r   '.seven_day_opus.utilization   // empty' "$TMP")
if [[ -z "$sonnet" && -z "$opus" ]]; then
  echo "MISSING: .seven_day_sonnet.utilization OR .seven_day_opus.utilization"; ok=false
else
  echo "OK: model-specific utilization (sonnet=${sonnet:-n/a} opus=${opus:-n/a})"
fi

hash=$(jq -S . "$TMP" | sha256sum | cut -d' ' -f1)
echo "schema_hash=$hash"

echo "--- body ---"
cat "$TMP"
echo
echo "--- end body ---"

$ok || exit 3
exit 0
