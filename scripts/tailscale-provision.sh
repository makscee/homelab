#!/usr/bin/env bash
# scripts/tailscale-provision.sh
# Install Tailscale and join the mesh on a fresh Debian/Ubuntu host.
# Usage (run ON the target host, not from operator):
#   sudo TAILSCALE_AUTH_KEY=tskey-auth-xxxx bash tailscale-provision.sh
# Optional env vars:
#   TAILSCALE_HOSTNAME   - override the advertised node name (default: $(hostname))
#   TAILSCALE_TAGS       - comma-separated tags, e.g. "tag:homelab,tag:server"
#   TAILSCALE_ACCEPT_DNS - "true" to accept Tailnet DNS (default: false)
#
# Notes:
#   - No secret is embedded. Must be supplied via env var at invocation time.
#   - Uses the official Tailscale install script (OS detection + repo setup).
#   - Idempotent: re-running with the same auth key re-registers without error.
set -euo pipefail

: "${TAILSCALE_AUTH_KEY:?Must set TAILSCALE_AUTH_KEY (tskey-auth-...)}"
TAILSCALE_HOSTNAME="${TAILSCALE_HOSTNAME:-$(hostname)}"
TAILSCALE_TAGS="${TAILSCALE_TAGS:-}"
TAILSCALE_ACCEPT_DNS="${TAILSCALE_ACCEPT_DNS:-false}"

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: run as root (sudo)." >&2
  exit 1
fi

if ! command -v tailscale >/dev/null 2>&1; then
  echo "Installing Tailscale..."
  curl -fsSL https://tailscale.com/install.sh | sh
else
  echo "Tailscale already installed: $(tailscale version | head -1)"
fi

UP_ARGS=(
  --auth-key="${TAILSCALE_AUTH_KEY}"
  --hostname="${TAILSCALE_HOSTNAME}"
  --accept-routes
  --accept-dns="${TAILSCALE_ACCEPT_DNS}"
)
if [[ -n "${TAILSCALE_TAGS}" ]]; then
  UP_ARGS+=(--advertise-tags="${TAILSCALE_TAGS}")
fi

echo "Joining Tailnet as ${TAILSCALE_HOSTNAME}..."
tailscale up "${UP_ARGS[@]}"

echo ""
echo "=== tailscale status ==="
tailscale status
echo ""
echo "=== tailscale ip ==="
tailscale ip -4
echo ""
echo "Provisioning complete."
