#!/usr/bin/env bash
# D-22-18 / plan 22-06 — DNS + TLS validity gate for homelab-admin.
#
# Asserts:
#   - $HOST resolves via DNS (A/AAAA).
#   - TLS certificate for $HOST:443 is fetchable and valid for > $MIN_DAYS days.
#
# Exit 0 on pass, 1 on any failure. Safe to run from cron or a pre-launch gate.
#
# Usage:
#   bash scripts/launch/check-dns-tls.sh
#   HOST=example.com MIN_DAYS=14 bash scripts/launch/check-dns-tls.sh
set -euo pipefail

HOST="${HOST:-homelab.makscee.ru}"
MIN_DAYS="${MIN_DAYS:-30}"

# --- DNS ------------------------------------------------------------------
IP="$(dig +short "$HOST" | tail -1 || true)"
if [ -z "$IP" ]; then
  echo "[FAIL] DNS: $HOST does not resolve"
  exit 1
fi
echo "[ok] DNS: $HOST -> $IP"

# --- TLS handshake + cert expiry -----------------------------------------
END="$(echo | openssl s_client -servername "$HOST" -connect "$HOST:443" 2>/dev/null \
  | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
if [ -z "$END" ]; then
  echo "[FAIL] TLS: could not fetch cert for $HOST"
  exit 1
fi
echo "[cert] notAfter=$END"

# Portable epoch parse: macOS date -j first, GNU date -d fallback.
if END_EPOCH="$(date -j -f "%b %e %H:%M:%S %Y %Z" "$END" +%s 2>/dev/null)"; then
  :
else
  END_EPOCH="$(date -d "$END" +%s)"
fi
NOW_EPOCH="$(date +%s)"
DAYS_LEFT=$(( (END_EPOCH - NOW_EPOCH) / 86400 ))
echo "[cert] days_left=$DAYS_LEFT"

if [ "$DAYS_LEFT" -lt "$MIN_DAYS" ]; then
  echo "[FAIL] TLS: cert expires in $DAYS_LEFT days (< $MIN_DAYS)"
  exit 1
fi
echo "[ok] TLS: cert valid > $MIN_DAYS days"
