#!/usr/bin/env bash
# SVC-05: Tailscale provisioning script exists and is safe
set -euo pipefail
test -x scripts/tailscale-provision.sh || { echo "tailscale-provision.sh missing or not executable"; exit 1; }
bash -n scripts/tailscale-provision.sh || { echo "tailscale-provision.sh syntax error"; exit 1; }
grep -q 'tailscale up' scripts/tailscale-provision.sh || { echo "script does not call tailscale up"; exit 1; }
grep -q 'TAILSCALE_AUTH_KEY' scripts/tailscale-provision.sh || { echo "script does not take TAILSCALE_AUTH_KEY"; exit 1; }
if grep -E 'tskey-[a-zA-Z0-9-]{10,}' scripts/tailscale-provision.sh; then
  echo "script contains literal tskey auth key"; exit 1
fi
echo "SVC-05 OK"
