#!/usr/bin/env bash
# install.sh --- push soak spike to mcow, run smoke, arm the 24h timer.
# Runs from operator workstation. Requires: SSH to root@mcow, $CLAUDE_USAGE_TOKEN in env.
set -euo pipefail
: "${CLAUDE_USAGE_TOKEN:?Set CLAUDE_USAGE_TOKEN before running install.sh}"
HERE="$(cd "$(dirname "$0")" && pwd)"
MCOW=${MCOW_HOST:-root@mcow}

echo "==> Ensuring jq installed on mcow"
ssh "$MCOW" 'command -v jq >/dev/null || (apt-get update -qq && apt-get install -y -qq jq)'

echo "==> Creating directories"
ssh "$MCOW" 'install -d -m 0755 /usr/local/sbin/claude-usage-soak /etc/claude-usage-soak /var/lib/claude-usage-soak; install -d -m 0755 /var/log'

echo "==> Pushing scripts + units"
scp -q "$HERE"/soak.sh         "$MCOW":/usr/local/sbin/claude-usage-soak/soak.sh
scp -q "$HERE"/smoke.sh        "$MCOW":/usr/local/sbin/claude-usage-soak/smoke.sh
scp -q "$HERE"/analyze.sh      "$MCOW":/usr/local/sbin/claude-usage-soak/analyze.sh
scp -q "$HERE"/claude-usage-soak.service "$MCOW":/etc/systemd/system/claude-usage-soak.service
scp -q "$HERE"/claude-usage-soak.timer   "$MCOW":/etc/systemd/system/claude-usage-soak.timer
ssh "$MCOW" 'chmod 0755 /usr/local/sbin/claude-usage-soak/*.sh'

echo "==> Writing EnvironmentFile /etc/claude-usage-soak/env (0600)"
ssh "$MCOW" "install -m 0600 /dev/stdin /etc/claude-usage-soak/env <<EOF
CLAUDE_USAGE_TOKEN=$CLAUDE_USAGE_TOKEN
EOF
chmod 0600 /etc/claude-usage-soak/env"

echo "==> Running smoke.sh on mcow"
if ! ssh "$MCOW" 'CLAUDE_USAGE_TOKEN_FILE=/root/.not-used /usr/local/sbin/claude-usage-soak/smoke.sh' 2>/dev/null; then
  # smoke.sh expects either env or file; install a tmp file-mode variant
  ssh "$MCOW" "install -m 0600 /dev/stdin /root/.claude-usage-token <<EOF
$CLAUDE_USAGE_TOKEN
EOF"
  ssh "$MCOW" 'CLAUDE_USAGE_TOKEN_FILE=/root/.claude-usage-token /usr/local/sbin/claude-usage-soak/smoke.sh'
fi

echo "==> Reloading systemd, enabling timer"
ssh "$MCOW" 'systemctl daemon-reload && systemctl enable --now claude-usage-soak.timer'
ssh "$MCOW" 'systemctl list-timers claude-usage-soak.timer --no-pager'

echo "==> Done. Wait ~360s, then:"
echo "    ssh $MCOW 'tail -5 /var/log/claude-usage-soak.jsonl'"
