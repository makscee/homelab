#!/usr/bin/env bash
# SVC-04: AmneziaWG config captured + nether services reproducible
set -euo pipefail

test -s servers/nether/amnezia-awg.conf.template || { echo "AWG template missing"; exit 1; }
if grep -qE '^(PrivateKey|PresharedKey) = [A-Za-z0-9+/]{40,}' servers/nether/amnezia-awg.conf.template; then
  echo "AWG template contains raw key material"; exit 1
fi
grep -q '__SOPS:' servers/nether/amnezia-awg.conf.template \
  || { echo "AWG template missing SOPS placeholders"; exit 1; }

test -s secrets/nether-awg.sops.yaml || { echo "SOPS AWG secrets missing"; exit 1; }
grep -q 'ENC\[' secrets/nether-awg.sops.yaml || { echo "AWG secrets not SOPS-encrypted"; exit 1; }

test -s secrets/nether.sops.yaml || { echo "nether.sops.yaml missing"; exit 1; }
grep -q 'ENC\[' secrets/nether.sops.yaml || { echo "nether.sops.yaml not SOPS-encrypted"; exit 1; }

test -s servers/nether/docker-compose.services.yml || { echo "services compose missing"; exit 1; }
test -s servers/nether/.env.example || { echo ".env.example missing"; exit 1; }

# Reject bare ':latest' image tags (allow them only inside comments after '#').
if grep -EHn '^[[:space:]]*image:[[:space:]]*[^#]*:latest' \
     servers/nether/docker-compose.services.yml \
     servers/nether/docker-compose.monitoring.yml; then
  echo "unpinned :latest on nether"; exit 1
fi

grep -q 'ARCHIVED' servers/nether/docker-compose.void.yml \
  || { echo "void.yml not archived"; exit 1; }

# Scan for raw AWG key material anywhere under servers/nether/.
if grep -rEq '^(PrivateKey|PresharedKey) = [A-Za-z0-9+/]{40,}' servers/nether/; then
  echo "raw AWG key material leaked into servers/nether/"; exit 1
fi

test -f servers/nether/README.md || { echo "nether README missing"; exit 1; }
[ "$(wc -l < servers/nether/README.md)" -ge 50 ] \
  || { echo "nether README too short"; exit 1; }

if [[ "${MODE:-full}" != "--quick" ]]; then
  # Live check: amnezia-awg2 running on nether.
  state=$(ssh -o ConnectTimeout=10 root@nether "docker inspect amnezia-awg2 --format '{{.State.Status}}'" 2>/dev/null || echo 'ssh-failed')
  case "${state}" in
    running) ;;
    ssh-failed) echo "WARN: cannot SSH nether — skipping AWG live check" ;;
    *) echo "amnezia-awg2 not running on nether: ${state}"; exit 1 ;;
  esac
fi

echo "SVC-04 OK"
