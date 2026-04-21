#!/usr/bin/env bash
# D-22-07 — SEC-08 bun audit wrapper
# Fails on HIGH or CRITICAL advisories in apps/admin.
# Re-run target for launch gate and v3.x regression.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO/apps/admin"

echo "[bun-audit] bun version: $(bun --version)"
echo "[bun-audit] repo: $REPO/apps/admin"
echo "[bun-audit] running: bun audit --audit-level=high"
bun audit --audit-level=high

# Defensive npm audit if a package-lock.json slipped in (shouldn't — Bun project).
if [ -f package-lock.json ]; then
  echo "[bun-audit] package-lock.json present — running npm audit --audit-level=high"
  npm audit --audit-level=high
fi

echo "[bun-audit] clean — no HIGH/CRITICAL advisories"
