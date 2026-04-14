#!/usr/bin/env bash
# SVC-01: docker-tower compose files reproducible
set -euo pipefail

# No :latest anywhere in actual image references.
if grep -rHn 'image:.*:latest' servers/docker-tower/docker-compose.*.yml; then
  echo "Unpinned :latest tags in docker-tower"; exit 1
fi

# Each compose file must parse successfully. `docker compose config` may not be
# available in every environment (CI, cc-worker without docker). Skip validation
# gracefully if the CLI is missing — the grep checks above still catch the common
# pitfalls.
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  for f in servers/docker-tower/docker-compose.*.yml; do
    docker compose -f "$f" config --quiet >/dev/null 2>&1 \
      || { echo "compose config failed: $f"; exit 1; }
  done
else
  echo "NOTE: docker compose CLI unavailable — skipping config --quiet validation"
fi

test -s servers/docker-tower/.env.example || { echo ".env.example missing"; exit 1; }

readme_lines=$(wc -l < servers/docker-tower/README.md 2>/dev/null || echo 0)
[[ "${readme_lines}" -ge 40 ]] || { echo "README.md missing or <40 lines (got ${readme_lines})"; exit 1; }

test -s secrets/docker-tower.sops.yaml || { echo "secrets/docker-tower.sops.yaml missing"; exit 1; }
grep -q 'ENC\[' secrets/docker-tower.sops.yaml || { echo "secrets file not SOPS-encrypted"; exit 1; }

# No plaintext Grafana password in any committed file under servers/docker-tower/.
# Allow env_file references and the placeholder in .env.example comments.
if grep -rEIn 'GF_SECURITY_ADMIN_PASSWORD=[A-Za-z0-9]' servers/docker-tower/; then
  echo "plaintext Grafana password in compose"; exit 1
fi

echo "SVC-01 OK"
