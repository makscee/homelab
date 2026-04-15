#!/bin/bash
# Collect AmneziaWG peer metrics for node-exporter textfile collector.
# Cron: * * * * * /usr/local/bin/awg-metrics.sh
# Output: /var/lib/node_exporter/awg.prom

OUT="/var/lib/node_exporter/awg.prom.$$"
FINAL="/var/lib/node_exporter/awg.prom"

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

  TOTAL=0
  CONNECTED=0
  NOW=$(date +%s)

  docker exec amnezia-awg2 awg show awg0 dump 2>/dev/null | tail -n +2 | while IFS=$'\t' read -r pubkey psk endpoint allowed_ips handshake rx tx keepalive; do
    TOTAL=$((TOTAL + 1))
    SHORT=$(echo "$pubkey" | cut -c1-8)
    IP=$(echo "$allowed_ips" | cut -d/ -f1)

    echo "awg_peer_transfer_rx_bytes{public_key=\"${SHORT}\",allowed_ip=\"${IP}\"} ${rx}"
    echo "awg_peer_transfer_tx_bytes{public_key=\"${SHORT}\",allowed_ip=\"${IP}\"} ${tx}"
    echo "awg_peer_last_handshake_seconds{public_key=\"${SHORT}\",allowed_ip=\"${IP}\"} ${handshake}"
  done

  TOTAL=$(docker exec amnezia-awg2 awg show awg0 dump 2>/dev/null | tail -n +2 | wc -l)
  CONNECTED=$(docker exec amnezia-awg2 awg show awg0 dump 2>/dev/null | tail -n +2 | awk -F'\t' -v now="$NOW" '$6 > 0 && (now - $6) < 180 {c++} END {print c+0}')

  echo "awg_peers_total ${TOTAL}"
  echo "awg_peers_connected ${CONNECTED}"
} > "$OUT"

mv "$OUT" "$FINAL"
