#!/bin/bash
# Collect AmneziaWG peer metrics for node-exporter textfile collector.
# Cron: * * * * * /usr/local/bin/awg-metrics.sh
# Output: /var/lib/node_exporter/awg.prom
# Mapping: /usr/local/etc/awg-peers.map (IP=username, synced from VoidNet DB)

MAPFILE="/usr/local/etc/awg-peers.map"
OUT="/var/lib/node_exporter/awg.prom.$$"
FINAL="/var/lib/node_exporter/awg.prom"

declare -A NAMES
if [[ -f "$MAPFILE" ]]; then
  while IFS='=' read -r ip name; do
    NAMES["$ip"]="$name"
  done < "$MAPFILE"
fi

NOW=$(date +%s)
TOTAL=0
CONNECTED=0

{
  echo "# HELP awg_peers_total Total configured AmneziaWG peers"
  echo "# TYPE awg_peers_total gauge"
  echo "# HELP awg_peer_transfer_rx_bytes Received bytes per peer"
  echo "# TYPE awg_peer_transfer_rx_bytes counter"
  echo "# HELP awg_peer_transfer_tx_bytes Transmitted bytes per peer"
  echo "# TYPE awg_peer_transfer_tx_bytes counter"
  echo "# HELP awg_peer_last_handshake_seconds Last handshake unix timestamp"
  echo "# TYPE awg_peer_last_handshake_seconds gauge"
  echo "# HELP awg_peers_connected Peers with handshake in last 3 minutes"
  echo "# TYPE awg_peers_connected gauge"
  echo "# HELP awg_peer_connected Whether peer had handshake in last 3 minutes"
  echo "# TYPE awg_peer_connected gauge"

  docker exec amnezia-awg2 awg show awg0 dump 2>/dev/null | tail -n +2 | while IFS=$'\t' read -r pubkey psk endpoint allowed_ips handshake rx tx keepalive; do
    TOTAL=$((TOTAL + 1))
    SHORT=$(echo "$pubkey" | cut -c1-8)
    IP=$(echo "$allowed_ips" | cut -d/ -f1)
    USER="${NAMES[$IP]:-unknown}"

    ONLINE=0
    if [[ "$handshake" -gt 0 ]] && (( (NOW - handshake) < 180 )); then
      ONLINE=1
      CONNECTED=$((CONNECTED + 1))
    fi

    echo "awg_peer_transfer_rx_bytes{username=\"${USER}\",allowed_ip=\"${IP}\",public_key=\"${SHORT}\"} ${rx}"
    echo "awg_peer_transfer_tx_bytes{username=\"${USER}\",allowed_ip=\"${IP}\",public_key=\"${SHORT}\"} ${tx}"
    echo "awg_peer_last_handshake_seconds{username=\"${USER}\",allowed_ip=\"${IP}\",public_key=\"${SHORT}\"} ${handshake}"
    echo "awg_peer_connected{username=\"${USER}\",allowed_ip=\"${IP}\",public_key=\"${SHORT}\"} ${ONLINE}"
  done

  TOTAL=$(docker exec amnezia-awg2 awg show awg0 dump 2>/dev/null | tail -n +2 | wc -l)
  CONNECTED=$(docker exec amnezia-awg2 awg show awg0 dump 2>/dev/null | tail -n +2 | awk -F'\t' -v now="$NOW" '$6 > 0 && (now - $6) < 180 {c++} END {print c+0}')

  echo "awg_peers_total ${TOTAL}"
  echo "awg_peers_connected ${CONNECTED}"
} > "$OUT"

mv "$OUT" "$FINAL"
