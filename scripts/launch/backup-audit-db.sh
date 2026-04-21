#!/usr/bin/env bash
# Phase 22 D-22-14 — nightly backup of homelab-admin audit.db on mcow.
# Uses sqlite3 .backup for a consistent online dump (safe while app is running).
# Installed to /usr/local/sbin/backup-audit-db.sh by deploy-homelab-admin.yml.
set -euo pipefail
SRC="/var/lib/homelab-admin/audit.db"
DEST_DIR="/var/backups/homelab-admin"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
mkdir -p "$DEST_DIR"
chmod 0700 "$DEST_DIR"
TS=$(date -u +%Y%m%dT%H%M%SZ)
DEST="$DEST_DIR/audit.db.$TS"
sqlite3 "$SRC" ".backup '$DEST'"
gzip -9 "$DEST"
# Retention: delete gzipped backups older than RETAIN_DAYS
find "$DEST_DIR" -type f -name 'audit.db.*.gz' -mtime +"$RETAIN_DAYS" -delete
echo "[backup] wrote $DEST.gz"
