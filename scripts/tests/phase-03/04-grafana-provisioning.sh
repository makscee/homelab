#!/usr/bin/env bash
# Test: Grafana provisioning config files are valid and correctly structured
# Run from repo root: bash scripts/tests/phase-03/04-grafana-provisioning.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

source "${SCRIPT_DIR}/lib.sh"

section() { echo -e "\n${_YELLOW}=== $* ===${_RESET}"; }

# Paths
DS_YAML="${REPO_ROOT}/servers/docker-tower/monitoring/grafana/provisioning/datasources/prometheus.yml"
DB_YAML="${REPO_ROOT}/servers/docker-tower/monitoring/grafana/provisioning/dashboards/dashboards.yml"
NODE_JSON="${REPO_ROOT}/servers/docker-tower/monitoring/grafana/provisioning/dashboards/json/node-exporter-full.json"
CADV_JSON="${REPO_ROOT}/servers/docker-tower/monitoring/grafana/provisioning/dashboards/json/cadvisor-containers.json"
SUMM_JSON="${REPO_ROOT}/servers/docker-tower/monitoring/grafana/provisioning/dashboards/json/homelab-summary.json"

section "File presence"
assert_file "${DS_YAML}"
assert_file "${DB_YAML}"
assert_file "${NODE_JSON}"
assert_file "${CADV_JSON}"
assert_file "${SUMM_JSON}"

section "YAML content checks"
grep -q 'uid: prometheus-homelab' "${DS_YAML}" && ok "datasource uid prometheus-homelab present" || fail "datasource uid prometheus-homelab missing"
grep -q 'allowUiUpdates: false' "${DB_YAML}" && ok "allowUiUpdates: false present" || fail "allowUiUpdates: false missing"
grep -q 'updateIntervalSeconds: 30' "${DB_YAML}" && ok "updateIntervalSeconds: 30 present" || fail "updateIntervalSeconds missing"

section "JSON validity"
python3 -c "import json,sys; json.load(open(sys.argv[1]))" "${NODE_JSON}" && ok "node-exporter-full.json is valid JSON" || fail "node-exporter-full.json invalid JSON"
python3 -c "import json,sys; json.load(open(sys.argv[1]))" "${CADV_JSON}" && ok "cadvisor-containers.json is valid JSON" || fail "cadvisor-containers.json invalid JSON"
python3 -c "import json,sys; json.load(open(sys.argv[1]))" "${SUMM_JSON}" && ok "homelab-summary.json is valid JSON" || fail "homelab-summary.json invalid JSON"

section "Dashboard UID checks"
python3 -c "
import json, sys
d = json.load(open(sys.argv[1]))
assert d.get('uid') == sys.argv[2], f'uid mismatch: {d.get(\"uid\")} != {sys.argv[2]}'
print(f'uid OK: {d[\"uid\"]}')
" "${NODE_JSON}" "node-exporter-full" && ok "node-exporter-full uid correct" || fail "node-exporter-full uid wrong"

python3 -c "
import json, sys
d = json.load(open(sys.argv[1]))
assert d.get('uid') == sys.argv[2], f'uid mismatch: {d.get(\"uid\")} != {sys.argv[2]}'
print(f'uid OK: {d[\"uid\"]}')
" "${CADV_JSON}" "cadvisor-containers" && ok "cadvisor-containers uid correct" || fail "cadvisor-containers uid wrong"

python3 -c "
import json, sys
d = json.load(open(sys.argv[1]))
assert d.get('uid') == sys.argv[2], f'uid mismatch: {d.get(\"uid\")} != {sys.argv[2]}'
print(f'uid OK: {d[\"uid\"]}')
" "${SUMM_JSON}" "homelab-summary" && ok "homelab-summary uid correct" || fail "homelab-summary uid wrong"

section "No residual string datasource references"
for f in "${NODE_JSON}" "${CADV_JSON}" "${SUMM_JSON}"; do
  name=$(basename "$f")
  python3 -c "
import json, sys

def check_datasources(obj, path=''):
    issues = []
    if isinstance(obj, dict):
        if 'datasource' in obj:
            ds = obj['datasource']
            if isinstance(ds, str) and ds:
                issues.append(f'{path}.datasource = string {repr(ds)!r}')
            elif isinstance(ds, dict):
                uid = ds.get('uid', '')
                if uid and uid != 'prometheus-homelab' and not uid.startswith('-- '):
                    issues.append(f'{path}.datasource.uid = {repr(uid)}')
        for k, v in obj.items():
            issues.extend(check_datasources(v, path+'.'+k))
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            issues.extend(check_datasources(item, path+f'[{i}]'))
    return issues

d = json.load(open(sys.argv[1]))
issues = check_datasources(d)
if issues:
    print('RESIDUAL DATASOURCE REFS:')
    for i in issues[:10]:
        print(' ', i)
    sys.exit(1)
" "$f" && ok "${name}: no residual string datasource refs" || fail "${name}: has residual string datasource refs"
done

section "No __inputs placeholder"
for f in "${NODE_JSON}" "${CADV_JSON}" "${SUMM_JSON}"; do
  name=$(basename "$f")
  python3 -c "
import json,sys
d = json.load(open(sys.argv[1]))
assert '__inputs' not in d, '__inputs key found — template placeholder not removed'
" "$f" && ok "${name}: no __inputs key" || fail "${name}: __inputs key present"
done

section "Compose bind-mount check"
COMPOSE="${REPO_ROOT}/servers/docker-tower/docker-compose.monitoring.yml"
grep -q '/etc/grafana/provisioning' "${COMPOSE}" && ok "compose mounts /etc/grafana/provisioning" || fail "compose missing /etc/grafana/provisioning mount"

echo ""
echo "All provisioning checks passed."
