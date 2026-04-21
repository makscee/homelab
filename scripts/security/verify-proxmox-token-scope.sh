#!/usr/bin/env bash
# SEC-08 D-22-10 — Verify Proxmox dashboard-operator token scope is read-only.
#
# Contract (per D-03 / Phase 19 SECURITY T-19-03): token must have
# VM.Audit + Datastore.Audit and NOTHING ELSE. No write privileges permitted
# (VM.PowerMgmt, VM.Allocate, VM.Config, Sys.Modify, etc).
#
# Runs from operator machine; SSHs to tower as root and queries pveum.
set -euo pipefail

TOWER="${TOWER:-tower}"
USER="${PVE_USER:-dashboard-operator@pve}"
TOKEN_ID="${PVE_TOKEN_ID:-readonly}"

echo "[probe] fetching token permissions for ${USER}!${TOKEN_ID} on ${TOWER}"

# pveum permissions prints a table per path with the effective privileges.
SCOPE=$(ssh root@"${TOWER}" "pveum user permissions ${USER} --path / 2>/dev/null; pveum user token permissions ${USER} ${TOKEN_ID} --path / 2>/dev/null" || true)

if [ -z "${SCOPE}" ]; then
  echo "[FAIL] unable to read token permissions (SSH or pveum failure)"
  exit 1
fi

echo "---"
echo "${SCOPE}"
echo "---"

fail=0
grep -q 'VM.Audit' <<<"${SCOPE}" || { echo "[FAIL] VM.Audit missing"; fail=1; }
grep -q 'Datastore.Audit' <<<"${SCOPE}" || { echo "[FAIL] Datastore.Audit missing"; fail=1; }

# Any privilege matching a write/admin capability is a violation of D-03.
if grep -qE 'VM\.PowerMgmt|VM\.Allocate|VM\.Config|VM\.Console|VM\.Migrate|VM\.Backup|Sys\.Modify|Sys\.PowerMgmt|Datastore\.Allocate|Datastore\.AllocateSpace|Realm\.Allocate|User\.Modify' <<<"${SCOPE}"; then
  echo "[FAIL] write/admin privilege detected on token — violates D-22-10 / D-03"
  fail=1
fi

if [ "${fail}" -eq 0 ]; then
  echo "[ok] Proxmox token scope = VM.Audit + Datastore.Audit only"
fi
exit "${fail}"
