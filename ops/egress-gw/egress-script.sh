#!/bin/sh
# egress — toggle cc-box default route between tower LAN and egress-gw.
# Usage: egress on|off|status
set -eu

GW_EGRESS=10.10.20.99   # egress-gw LXC 199 (routes via nether)
GW_DIRECT=10.10.20.1    # tower vmbr1 gateway (direct ISP, Telegram blocked from RU)
STATE=/etc/egress.mode  # contains "on" or "off" — re-applied on boot by egress-apply.service

on() {
  ip route replace default via "$GW_EGRESS"
  echo on > "$STATE"
  echo "default route: $GW_EGRESS (egress-gw)"
}

off() {
  ip route replace default via "$GW_DIRECT"
  echo off > "$STATE"
  echo "default route: $GW_DIRECT (tower direct)"
}

status() {
  mode=$(cat "$STATE" 2>/dev/null || echo "unknown")
  echo "mode: $mode"
  ip route show default
  printf "smoke (api.telegram.org): "
  code=$(curl -s --max-time 5 -o /dev/null -w '%{http_code}' https://api.telegram.org/ 2>&1 || echo "FAIL")
  echo "$code"
  printf "exit IP: "
  curl -s --max-time 5 https://ifconfig.co 2>&1 || echo "FAIL"
  echo
}

case "${1:-}" in
  on) on ;;
  off) off ;;
  status) status ;;
  *) echo "usage: $0 on|off|status" >&2; exit 2 ;;
esac
