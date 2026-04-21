#!/usr/bin/env bash
# D-22-09 — SEC-08 deployed-header re-audit for https://homelab.makscee.ru
# Asserts CSP (no unsafe-inline), HSTS max-age >= 31536000, X-Frame-Options DENY,
# Referrer-Policy strict-origin-when-cross-origin. Run from a Tailnet host.
set -euo pipefail

URL="${URL:-https://homelab.makscee.ru/}"
echo "[header-audit] GET -I $URL"
HEADERS=$(curl -sIL --max-time 10 "$URL")
echo "$HEADERS"

fail=0
check() {
  local name="$1" pattern="$2"
  if echo "$HEADERS" | grep -iE "$pattern" >/dev/null; then
    echo "[ok] $name"
  else
    echo "[FAIL] $name — no match for: $pattern"
    fail=1
  fi
}

check "CSP header present"                             '^content-security-policy:'
check "HSTS max-age >= 31536000"                       '^strict-transport-security:.*max-age=(3153[6-9][0-9]{3}|[3-9][0-9]{7,})'
check "X-Frame-Options: DENY"                          '^x-frame-options:[[:space:]]*DENY'
check "Referrer-Policy: strict-origin-when-cross-origin" '^referrer-policy:[[:space:]]*strict-origin-when-cross-origin'

# Separate fail if CSP contains unsafe-inline
if echo "$HEADERS" | grep -i '^content-security-policy:' | grep -qi 'unsafe-inline'; then
  echo "[FAIL] CSP contains unsafe-inline"
  fail=1
else
  echo "[ok] CSP has no unsafe-inline"
fi

exit $fail
