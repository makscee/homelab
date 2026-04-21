#!/usr/bin/env bash
# SEC-08 D-22-12 — Verify homelab-admin is reachable only from Tailnet.
#
# Contract: the admin app's socket MUST NOT be publicly bound on mcow. Caddy
# (which terminates TLS for homelab.makscee.ru) must only accept the request
# from Tailnet-origin IPs; direct origin-IP hits from WAN are out of scope
# for this script (Caddy is Tailnet-scoped per servers/mcow/ingress docs).
#
# Two checks:
#   1. bun homelab-admin process on mcow listens only on localhost/unix-socket.
#   2. The Tailnet-side GET to /api/auth/signin returns a healthy status
#      (200/302/307/401/404) — not a connection failure.
set -euo pipefail

MCOW="${MCOW:-mcow}"
TN_URL="${TN_URL:-https://homelab.makscee.ru/}"

echo "[probe] checking homelab-admin socket binding on ${MCOW}"

# Look for anything bound that matches homelab-admin AND is NOT localhost or a unix socket.
BAD_BIND=$(ssh root@"${MCOW}" "ss -ltnp 2>/dev/null | grep -i homelab-admin | grep -Ev '127\.0\.0\.1|\[::1\]|/run/' || true")

if [ -n "${BAD_BIND}" ]; then
  echo "[FAIL] homelab-admin listens on non-localhost TCP:"
  echo "${BAD_BIND}"
  exit 1
fi

# Show what IS bound (for evidence log).
echo "[info] homelab-admin bindings on ${MCOW}:"
ssh root@"${MCOW}" "ss -ltnp 2>/dev/null | grep -i homelab-admin || echo '  (no matching listener — likely unix socket)'"

echo "[info] Caddy :443 bindings on ${MCOW}:"
ssh root@"${MCOW}" "ss -ltnp 2>/dev/null | grep ':443' | head -5 || true"

echo "[probe] Tailnet leg: curl -I ${TN_URL}"
TN=$(curl -sI --max-time 8 "${TN_URL}" -o /dev/null -w "%{http_code}" || echo "000")
echo "[tailnet] status=${TN}"

case "${TN}" in
  200|302|307|401|404)
    echo "[ok] Tailnet ingress healthy (status=${TN}); admin socket not publicly bound"
    ;;
  *)
    echo "[FAIL] Tailnet ingress returned status=${TN} (expected 200/302/307/401/404)"
    exit 1
    ;;
esac
