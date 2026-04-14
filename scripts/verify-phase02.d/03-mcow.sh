#!/usr/bin/env bash
# SVC-02: mcow systemd units audited + documented
set -euo pipefail
test -f servers/mcow/README.md || { echo "mcow README missing"; exit 1; }
[ "$(wc -l < servers/mcow/README.md)" -ge 50 ] || { echo "mcow README too short"; exit 1; }
grep -q 'voidnet-bot' servers/mcow/README.md || { echo "README does not mention voidnet-bot"; exit 1; }
grep -q 'STALE' servers/mcow/README.md || { echo "README does not flag any STALE units"; exit 1; }
test -s servers/mcow/systemd-audit.txt || { echo "systemd audit evidence missing"; exit 1; }
for section in '## is-active' '## is-enabled' '## portal-probe'; do
  grep -q "${section}" servers/mcow/systemd-audit.txt || { echo "audit missing section: ${section}"; exit 1; }
done
for unit in voidnet-bot voidnet-api; do
  test -f "servers/mcow/${unit}.service" || { echo "${unit}.service missing"; exit 1; }
done
test -s servers/mcow/.env.example || { echo ".env.example missing"; exit 1; }
if [[ "${MODE:-full}" != "--quick" ]]; then
  # Live check: bot + api active on mcow
  if command -v ssh >/dev/null 2>&1; then
    for unit in voidnet-bot voidnet-api; do
      state=$(ssh -o ConnectTimeout=10 root@mcow "systemctl is-active ${unit}" 2>/dev/null || echo 'ssh-failed')
      case "${state}" in
        active) ;;
        ssh-failed) echo "WARN: cannot SSH mcow — skipping ${unit} live check" ;;
        *) echo "${unit} not active on mcow: ${state}"; exit 1 ;;
      esac
    done
  fi
fi
echo "SVC-02 OK"
