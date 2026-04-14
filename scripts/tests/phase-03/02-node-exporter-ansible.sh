#!/usr/bin/env bash
# Test: ansible syntax-check and lint for node-exporter playbook
# Config-only — no network required.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANSIBLE_DIR="$(cd "${SCRIPT_DIR}/../../../ansible" && pwd)"

source "${SCRIPT_DIR}/lib.sh" 2>/dev/null || true

ok() { echo "[OK] $*"; }
fail() { echo "[FAIL] $*" >&2; exit 1; }

cd "${ANSIBLE_DIR}"

# Ensure collections are installed
if [ ! -d "./collections/ansible_collections/prometheus/prometheus" ]; then
  echo "Installing collections..."
  ansible-galaxy collection install -r requirements.yml -p ./collections -q
fi

# Syntax check
echo "Running ansible-playbook --syntax-check..."
ansible-playbook playbooks/node-exporter.yml --syntax-check \
  && ok "syntax-check passed" \
  || fail "syntax-check failed"

# ansible-lint (optional — skip if not installed)
if command -v ansible-lint &>/dev/null; then
  echo "Running ansible-lint..."
  ansible-lint playbooks/node-exporter.yml \
    && ok "ansible-lint passed" \
    || fail "ansible-lint failed"
else
  echo "[WARN] ansible-lint not installed — skipping lint"
fi

ok "02-node-exporter-ansible.sh complete"
