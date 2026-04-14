#!/usr/bin/env bash
# 03-compose-validate.sh — Offline schema validation for docker-compose.monitoring.yml
# Usage: bash scripts/tests/phase-03/03-compose-validate.sh
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

COMPOSE_FILE="${PHASE_ROOT}/servers/docker-tower/docker-compose.monitoring.yml"

assert_file "$COMPOSE_FILE"

# 1. Docker Compose config validation (offline — does not require /run/secrets)
if docker compose -f "$COMPOSE_FILE" config --quiet 2>/dev/null; then
  ok "docker compose config --quiet passed"
else
  fail "docker compose config failed"
  exit 1
fi

# 2. Old faux node-exporter services must be gone
count=$(grep -c 'node-exporter-' "$COMPOSE_FILE" 2>/dev/null || true)
count=$(echo "$count" | tr -d '[:space:]')
if [[ "${count:-0}" -eq 0 ]]; then
  ok "No node-exporter-* services (removed)"
else
  fail "node-exporter-* still present ($count occurrences)"
  exit 1
fi

# 3. Mislabeled docker-exporter (blackbox-exporter) must be gone
if ! grep -q 'docker-exporter' "$COMPOSE_FILE"; then
  ok "docker-exporter removed"
else
  fail "docker-exporter still present"
  exit 1
fi

# 4. Alertmanager service must be present
if grep -q 'alertmanager' "$COMPOSE_FILE"; then
  ok "alertmanager service present"
else
  fail "alertmanager service missing"
  exit 1
fi

# 5. cAdvisor service must be present
if grep -q 'gcr.io/cadvisor/cadvisor' "$COMPOSE_FILE"; then
  ok "cadvisor service present"
else
  fail "cadvisor service missing"
  exit 1
fi

# 6. Prometheus retention must be 720h
if grep -q '720h' "$COMPOSE_FILE"; then
  ok "Prometheus retention set to 720h"
else
  fail "Prometheus retention is not 720h"
  exit 1
fi

# 7. Grafana must bind to Tailnet IP only
if grep -q '100.101.0.8:3000:3000' "$COMPOSE_FILE"; then
  ok "Grafana bound to 100.101.0.8:3000 (Tailnet only)"
else
  fail "Grafana not bound to 100.101.0.8:3000"
  exit 1
fi

# 8. Exactly 4 services: prometheus, grafana, alertmanager, cadvisor
svc_count=$(docker compose -f "$COMPOSE_FILE" config --services 2>/dev/null | wc -l | tr -d ' \n')
if [[ "$svc_count" -eq 4 ]]; then
  ok "Exactly 4 services in compose file"
else
  fail "Expected 4 services, got $svc_count"
  docker compose -f "$COMPOSE_FILE" config --services 2>/dev/null || true
  exit 1
fi

ok "All compose validation checks passed"
