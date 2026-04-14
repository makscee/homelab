#!/usr/bin/env bash
# 03-alertmanager-config.sh — Validate alertmanager.yml config (offline, no live host needed)
# Usage: bash scripts/tests/phase-03/03-alertmanager-config.sh
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

AM_CFG="${MON_ROOT}/alertmanager/alertmanager.yml"

# 1. File must exist
assert_file "$AM_CFG"

# 2. chat_id must be a bare integer (not quoted) — Risk 5 guard
if grep -E '^\s*chat_id:\s*-?[0-9]+$' "$AM_CFG" > /dev/null; then
  ok "chat_id is a bare integer"
else
  fail "chat_id is missing or quoted — must be a bare integer"
  exit 1
fi

# 3. No raw bot token literal in committed file
# Pattern: 8-10 digits, colon, then AAxxxxxxx (Telegram token format)
if grep -E '[0-9]{8,10}:AA[A-Za-z0-9_-]{33,}' "$AM_CFG" > /dev/null 2>&1; then
  fail "Raw Telegram bot token detected in alertmanager.yml — SECURITY VIOLATION"
  exit 1
else
  ok "No raw bot token in alertmanager.yml"
fi

# 4. Must use bot_token_file (not inline bot_token)
if grep -q 'bot_token_file' "$AM_CFG"; then
  ok "bot_token_file pattern used"
else
  fail "bot_token_file not found — inline token or missing config"
  exit 1
fi

# 5. amtool check-config
# amtool validates syntax but does NOT read the token file at check time.
# If amtool is not installed locally, fall back to Docker.
if command -v amtool > /dev/null 2>&1; then
  if amtool check-config "$AM_CFG"; then
    ok "amtool check-config passed"
  else
    fail "amtool check-config failed"
    exit 1
  fi
else
  info "amtool not on PATH — using Docker fallback"
  # Copy to a temp dir with a predictable filename so Docker volume works
  TMPDIR_AM=$(mktemp -d)
  cp "$AM_CFG" "$TMPDIR_AM/alertmanager.yml"
  # Create a dummy token file so amtool doesn't reject a missing bot_token_file path
  touch "$TMPDIR_AM/telegram_token"
  # Rewrite bot_token_file path to /cfg/telegram_token for the container check
  sed 's|bot_token_file:.*|bot_token_file: /cfg/telegram_token|' "$TMPDIR_AM/alertmanager.yml" > "$TMPDIR_AM/alertmanager_check.yml"
  if docker run --rm \
    --entrypoint amtool \
    -v "$TMPDIR_AM:/cfg" \
    prom/alertmanager:v0.27.0 \
    check-config /cfg/alertmanager_check.yml; then
    ok "amtool check-config passed (Docker fallback)"
  else
    fail "amtool check-config failed (Docker fallback)"
    rm -rf "$TMPDIR_AM"
    exit 1
  fi
  rm -rf "$TMPDIR_AM"
fi

ok "All alertmanager config checks passed"
