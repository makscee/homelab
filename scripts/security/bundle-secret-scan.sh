#!/usr/bin/env bash
# D-22-08 — SEC-08 production bundle secret scan
#
# Scans apps/admin/.next/static (client-shipped JS + JSON) for leakage of env
# var NAMES defined in secrets/mcow.sops.yaml, plus well-known API-token
# prefixes. Scope is deliberately .next/static only — server-only chunks may
# legitimately reference env names via process.env access in SSR code.
#
# Exits non-zero if any leak is detected.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
BUNDLE="$REPO/apps/admin/.next"
STATIC="$BUNDLE/static"
SOPS_FILE="$REPO/secrets/mcow.sops.yaml"

if [ ! -d "$STATIC" ]; then
  echo "[scan] .next/static not present — building apps/admin first"
  (cd "$REPO/apps/admin" && bun install --frozen-lockfile && bun run build)
fi

if [ ! -f "$SOPS_FILE" ]; then
  echo "[scan] FAIL — $SOPS_FILE not found"
  exit 1
fi

# Extract top-level SOPS keys via yq — no value decryption. We only need NAMES.
if ! command -v yq >/dev/null 2>&1; then
  echo "[scan] FAIL — yq not installed (brew install yq or apt install yq)"
  exit 1
fi

KEYS=$(yq -r 'keys[] | select(. != "sops")' "$SOPS_FILE")
KEY_COUNT=$(echo "$KEYS" | grep -c . || true)
echo "[scan] checking $STATIC for leakage of $KEY_COUNT SOPS key names"
echo "$KEYS" | sed 's/^/  - /'

LEAKED=0
while IFS= read -r k; do
  [ -z "$k" ] && continue
  if grep -rIn --include='*.js' --include='*.json' -- "$k" "$STATIC" 2>/dev/null; then
    echo "[scan] LEAK: '$k' present in client static bundle"
    LEAKED=1
  fi
done <<< "$KEYS"

# Well-known token prefixes — fail-fast on raw token leakage regardless of key name.
for PREFIX in 'sk-ant-oat01-' 'sk-ant-api03-' 'ghp_' 'github_pat_' 'ghs_' 'gho_'; do
  if grep -rIn --include='*.js' --include='*.json' -- "$PREFIX" "$STATIC" 2>/dev/null; then
    echo "[scan] LEAK: token prefix '$PREFIX' present in client static bundle"
    LEAKED=1
  fi
done

if [ $LEAKED -ne 0 ]; then
  echo "[scan] FAIL — secret leakage detected"
  exit 1
fi
echo "[scan] clean — no SOPS key names or token prefixes in .next/static"
