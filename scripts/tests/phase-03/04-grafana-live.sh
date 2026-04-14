#!/usr/bin/env bash
# Test: Live Grafana API verification — datasource UID + 3 dashboards in Homelab folder
# Run from repo root: bash scripts/tests/phase-03/04-grafana-live.sh
#
# NOTE: Credentials are decrypted from SOPS at invocation time on the operator machine.
# This script assumes the operator has the SOPS age key available (set +x is implicit —
# no trace mode, credentials never written to disk or logs).
# For CI/untrusted runners this would need rework to inject creds via env vars.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

source "${SCRIPT_DIR}/lib.sh"

section() { echo -e "\n${_YELLOW}=== $* ===${_RESET}"; }

GRAFANA="http://100.101.0.8:3000"

# Decrypt credentials from SOPS
ADMIN_USER=$(sops --decrypt "${REPO_ROOT}/secrets/docker-tower.sops.yaml" | grep GF_SECURITY_ADMIN_USER | awk '{print $2}')
ADMIN_PASS=$(sops --decrypt "${REPO_ROOT}/secrets/docker-tower.sops.yaml" | grep GF_SECURITY_ADMIN_PASSWORD | awk '{print $2}')

section "Grafana health"
python3 -c "
import urllib.request, base64, json, sys
creds = base64.b64encode('${ADMIN_USER}:${ADMIN_PASS}'.encode()).decode()
req = urllib.request.Request('${GRAFANA}/api/health', headers={'Authorization': f'Basic {creds}'})
r = urllib.request.urlopen(req, timeout=10)
d = json.loads(r.read())
assert d.get('database') == 'ok', f'database not ok: {d}'
print(f'Grafana {d[\"version\"]} healthy')
" && ok "Grafana healthy" || { fail "Grafana not healthy"; exit 1; }

section "Datasource UID check"
python3 -c "
import urllib.request, base64, json, sys
creds = base64.b64encode('${ADMIN_USER}:${ADMIN_PASS}'.encode()).decode()
headers = {'Authorization': f'Basic {creds}'}
req = urllib.request.Request('${GRAFANA}/api/datasources/uid/prometheus-homelab', headers=headers)
ds = json.loads(urllib.request.urlopen(req, timeout=10).read())
assert ds['type'] == 'prometheus', f'type wrong: {ds[\"type\"]}'
assert ds['url'] == 'http://100.101.0.8:9090', f'url wrong: {ds[\"url\"]}'
print(f'uid={ds[\"uid\"]} type={ds[\"type\"]} url={ds[\"url\"]}')
" && ok "Datasource prometheus-homelab provisioned correctly" || { fail "Datasource check failed"; exit 1; }

section "Dashboard checks"
for uid in node-exporter-full cadvisor-containers homelab-summary; do
  python3 -c "
import urllib.request, base64, json, sys
creds = base64.b64encode('${ADMIN_USER}:${ADMIN_PASS}'.encode()).decode()
headers = {'Authorization': f'Basic {creds}'}
req = urllib.request.Request('${GRAFANA}/api/dashboards/uid/${uid}', headers=headers)
db = json.loads(urllib.request.urlopen(req, timeout=10).read())
folder = db['meta'].get('folderTitle', '')
db_uid = db['dashboard'].get('uid', '')
title = db['dashboard'].get('title', '')
assert folder == 'Homelab', f'folder wrong: {folder!r} (expected Homelab)'
assert db_uid == '${uid}', f'uid wrong: {db_uid!r}'
print(f'uid={db_uid} title={title!r} folder={folder!r}')
" && ok "Dashboard ${uid} loaded in Homelab folder" || { fail "Dashboard ${uid} check failed"; exit 1; }
done

echo ""
echo "All live Grafana checks passed."
