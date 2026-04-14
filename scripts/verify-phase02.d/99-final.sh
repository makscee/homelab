#!/usr/bin/env bash
# Phase 2 final gate: secret sweep + requirement coverage summary
set -euo pipefail

# 1. Secret sweep - no tskey-*, no base64 WireGuard keys, no obvious passwords outside SOPS
# Exclude planning docs (which describe the pattern) and the harness snippets that scan for it.
# Anything OUTSIDE .planning/ and scripts/verify-phase02.d/ is operator-reachable and must be clean.
if git ls-files \
    | grep -vE '^(\.planning/|scripts/verify-phase02\.d/)' \
    | xargs -r grep -lE 'tskey-[a-zA-Z0-9-]{10,}' 2>/dev/null; then
  echo "FAIL: literal Tailscale auth key found in tracked files"
  exit 1
fi

# WireGuard keys: only permitted inside *.sops.yaml (SOPS-encrypted)
if git ls-files | grep -v '\.sops\.ya\?ml$' \
    | xargs -r grep -lE '^(PrivateKey|PresharedKey) = [A-Za-z0-9+/]{40,}=*$' 2>/dev/null; then
  echo "FAIL: raw WireGuard key material in non-SOPS file"
  exit 1
fi

# Grafana password: must not be literal in compose files
if git ls-files 'servers/**/docker-compose*.yml' \
    | xargs -r grep -lE 'GF_SECURITY_ADMIN_PASSWORD=[^$].*[A-Za-z0-9]{4,}' 2>/dev/null; then
  echo "FAIL: plaintext Grafana password in a compose file"
  exit 1
fi

# 2. SVC-06 explicitly invalidated - tower-sat must not resurface
if [[ -e servers/tower-sat ]] || [[ -e servers/tower/lxc-101-tower-sat.conf ]]; then
  echo "FAIL: tower-sat artifacts resurfaced (SVC-06 is invalidated)"
  exit 1
fi

# 3. Requirement coverage summary - each required artifact exists
# Use parallel arrays (portable to bash 3.2 on macOS; target hosts have bash 4+).
REQ_PAIRS=(
  "SVC-01:servers/docker-tower/README.md"
  "SVC-02:servers/mcow/README.md"
  "SVC-03:servers/tower/lxc-204-cc-worker.conf"
  "SVC-04:secrets/nether-awg.sops.yaml"
  "SVC-05:scripts/tailscale-provision.sh"
  "SVC-07:servers/cc-worker/inventory.md"
  "SVC-08:servers/cc-andrey/inventory.md"
)
for pair in "${REQ_PAIRS[@]}"; do
  req="${pair%%:*}"
  path="${pair#*:}"
  test -s "$path" || { echo "FAIL: ${req} artifact missing: $path"; exit 1; }
done

echo "PHASE 02 FINAL SWEEP OK (SVC-01..05, 07, 08; SVC-06 invalidated)"
