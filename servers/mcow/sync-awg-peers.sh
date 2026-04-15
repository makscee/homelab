#!/bin/bash
# Sync VoidNet peer→username mapping to nether for AWG metrics.
# Cron on mcow: */5 * * * * /usr/local/bin/sync-awg-peers.sh

sqlite3 /opt/voidnet/voidnet.db \
  "SELECT REPLACE(p.address,'/32',''), COALESCE(u.username, u.display_name, 'user_' || u.id)
   FROM peers p JOIN users u ON p.user_id = u.id
   WHERE p.server_name LIKE '%nether%'" \
  | sed 's/|/=/' \
  | ssh -o ConnectTimeout=5 root@nether "cat > /usr/local/etc/awg-peers.map"
