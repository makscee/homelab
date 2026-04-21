#!/bin/bash
set -e
FFMPEG=/usr/lib/jellyfin-ffmpeg/ffmpeg
BASE=/var/lib/jellyfin/data/attachments

sqlite3 /var/lib/jellyfin/data/jellyfin.db \
  "SELECT lower(hex(Id))||\"|\"||Path FROM BaseItems WHERE Path LIKE \"$1\" AND Path LIKE \"%.mkv\";" | \
while IFS=\| read hex path; do
  [ -z "$hex" ] && continue
  # hex is ascii bytes of uppercase GUID string like "DC4A...-...". Decode to lowercase.
  guid=$(printf "%s" "$hex" | sed "s/../\\\\x&/g" | xargs -0 printf "%b" | tr "A-Z" "a-z")
  [ -z "$guid" ] && continue
  prefix="${guid:0:2}"
  dir="$BASE/$prefix/$guid"
  mkdir -p "$dir"
  if [ -n "$(ls -A "$dir" 2>/dev/null)" ]; then
    echo "SKIP $(basename "$path") ($guid)"
    continue
  fi
  echo "EXTRACT $(basename "$path") -> $guid"
  ( cd "$dir" && "$FFMPEG" -v error -dump_attachment:t "" -i "$path" -t 0 -f null - 2>/dev/null || true )
  chown -R jellyfin:jellyfin "$dir"
done
