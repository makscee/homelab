#!/usr/bin/env bash
# sync-ui-kit.sh — re-mirror hub ui-kit SoT into homelab/packages/ui-kit/
#
# Decision A (operator, 2026-04-21): ui-kit is vendored as a checked-in mirror.
# Hub (~/hub/knowledge/standards/ui-kit/) is canonical. Run this script manually
# whenever hub changes. NOT run from CI/deploy.
#
# Safety:
#   - Refuses to clobber if packages/ui-kit/ has uncommitted modifications.
#   - Writes .sync-from-hub with current hub HEAD sha after successful sync.

set -euo pipefail

HUB="${HUB:-$HOME/hub}"
HOMELAB="${HOMELAB:-$HUB/workspace/homelab}"
SRC="$HUB/knowledge/standards/ui-kit/"
DST="$HOMELAB/packages/ui-kit/"

if [[ ! -d "$SRC" ]]; then
  echo "ERROR: hub ui-kit source not found at $SRC" >&2
  exit 2
fi
if [[ ! -d "$DST" ]]; then
  echo "ERROR: homelab ui-kit dest not found at $DST" >&2
  exit 2
fi

# Refuse to clobber uncommitted local edits in packages/ui-kit/
cd "$HOMELAB"
DIRTY=$(git status --porcelain -- packages/ui-kit/ | grep -v '\.sync-from-hub' || true)
if [[ -n "$DIRTY" ]]; then
  echo "ERROR: packages/ui-kit/ has uncommitted local modifications:" >&2
  echo "$DIRTY" >&2
  echo "Commit or discard them before re-syncing." >&2
  exit 1
fi

HUB_SHA=$(git -C "$HUB" rev-parse HEAD)
TODAY=$(date -u +%Y-%m-%d)

echo "Syncing $SRC -> $DST (hub-sha: $HUB_SHA)"
# rsync with --delete: mirror exactly. Preserve .sync-from-hub by excluding it.
rsync -a --delete --exclude='.sync-from-hub' "$SRC" "$DST"

cat >"$DST/.sync-from-hub" <<EOF
hub-sha: $HUB_SHA
synced-at: $TODAY
source: $SRC
note: Vendored mirror of the hub ui-kit SoT (Decision A, 2026-04-21). Do not edit manually. Re-sync via scripts/sync-ui-kit.sh after hub changes.
EOF

echo ""
echo "Diff summary (git status -- packages/ui-kit):"
git status --short -- packages/ui-kit/ || true

echo ""
echo "OK — mirror updated to hub-sha $HUB_SHA"
exit 0
