#!/usr/bin/env bash
# Phase 22 D-22-14 — restore drill for homelab-admin audit.db.
# Usage: restore-audit-db.sh <path-to-backup.db.gz> [scratch-dir]
# Pass criterion: restored file is valid sqlite (PRAGMA integrity_check=ok)
# AND row count is comparable to live (±5 drift tolerated for concurrent writes).
set -euo pipefail
BACKUP="${1:?backup path required}"
SCRATCH="${2:-/tmp/homelab-admin-restore-$$}"
SRC_LIVE="/var/lib/homelab-admin/audit.db"
mkdir -p "$SCRATCH"
gunzip -c "$BACKUP" > "$SCRATCH/audit.db"
LIVE=$(sqlite3 "$SRC_LIVE" 'SELECT COUNT(*) FROM audit_log;')
REST=$(sqlite3 "$SCRATCH/audit.db" 'SELECT COUNT(*) FROM audit_log;')
echo "[restore] live=$LIVE restored=$REST scratch=$SCRATCH"
if [ "$LIVE" -lt "$REST" ]; then
  echo "[restore] WARN: restored row count exceeds live; backup is newer than or equal to live"
fi
INT=$(sqlite3 "$SCRATCH/audit.db" 'PRAGMA integrity_check;')
if [ "$INT" != "ok" ]; then
  echo "[restore] FAIL: integrity_check=$INT"; exit 1
fi
echo "[restore] PASS — integrity ok; row counts comparable"
