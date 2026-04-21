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

# Extract top-level SOPS keys via awk — no value decryption, just NAMES.
# SOPS-YAML keeps top-level keys unencrypted (only values are ENC[...]), so a
# pure awk pass is sufficient and avoids a yq dependency on operator machines.
# Match: start-of-line identifier followed by ":" — skip the "sops:" metadata block.
KEYS=$(awk '
  /^sops:[[:space:]]*$/ { insops=1; next }
  /^[^[:space:]#]/ { insops=0 }
  insops { next }
  /^[A-Za-z_][A-Za-z0-9_]*:/ {
    k=$1; sub(/:.*$/,"",k);
    if (k != "sops") print k
  }
' "$SOPS_FILE")
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

# Well-known token prefixes — fail-fast on raw token leakage.
# Pattern requires prefix + >=20 key-charset chars to distinguish a real
# leaked token from UI placeholder strings (e.g. "sk-ant-oat01-...") and
# regex validators in bundled zod schemas (e.g. /^sk-ant-oat01-[A-Za-z0-9_-]+$/).
PATTERNS=(
  'sk-ant-oat01-[A-Za-z0-9_-]{20,}'
  'sk-ant-api03-[A-Za-z0-9_-]{20,}'
  'ghp_[A-Za-z0-9]{30,}'
  'github_pat_[A-Za-z0-9_]{30,}'
  'ghs_[A-Za-z0-9]{30,}'
  'gho_[A-Za-z0-9]{30,}'
)
for PAT in "${PATTERNS[@]}"; do
  if grep -rInE --include='*.js' --include='*.json' -- "$PAT" "$STATIC" 2>/dev/null; then
    echo "[scan] LEAK: token-like string matching '$PAT' in client static bundle"
    LEAKED=1
  fi
done

if [ $LEAKED -ne 0 ]; then
  echo "[scan] FAIL — secret leakage detected"
  exit 1
fi
echo "[scan] clean — no SOPS key names or token prefixes in .next/static"
