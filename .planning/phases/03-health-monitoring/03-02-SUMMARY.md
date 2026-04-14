---
plan: 03-02
phase: 03-health-monitoring
status: complete
completed: 2026-04-14
requirements: [MON-01]
---

# 03-02 SUMMARY — Ansible node_exporter deploy

## Outcome

Native systemd `node_exporter` 1.9.1 deployed to 5/6 Tailnet hosts via the `prometheus.prometheus.node_exporter` role. `:9100/metrics` verified reachable from the operator over Tailscale on every deployed host. animaya-dev deferred — SSH publickey auth is not set up for `root` or `admin` on that LXC.

## Hosts deployed

| Host | Tailscale IP | Status | Systemd | :9100/metrics |
|------|--------------|--------|---------|---------------|
| tower | 100.101.0.7 | ✓ | active | OK |
| docker-tower | 100.101.0.8 | ✓ | active | OK |
| cc-worker | 100.99.133.9 | ✓ | active | OK |
| mcow | 100.101.0.9 | ✓ | active | OK |
| nether | 100.101.0.3 | ✓ | active | OK |
| animaya-dev | 100.119.15.122 | **DEFERRED** | — | — |

Ansible PLAY RECAP (final live run):
```
cc-worker     : ok=34 changed=8 unreachable=0 failed=0
docker-tower  : ok=34 changed=8 unreachable=0 failed=0
mcow          : ok=34 changed=8 unreachable=0 failed=0
nether        : ok=34 changed=8 unreachable=0 failed=0
tower         : ok=38 changed=8 unreachable=0 failed=0
```

## Key files created

- `ansible/ansible.cfg`
- `ansible/requirements.yml` (prometheus.prometheus 0.29.x, community.general)
- `ansible/inventory/homelab.yml` (6 hosts, animaya-dev marked `deferred: true`)
- `ansible/playbooks/node-exporter.yml`
- `ansible/group_vars/all.yml`
- `ansible/README.md`
- `scripts/tests/phase-03/02-node-exporter-ansible.sh` (syntax/lint gate)
- `scripts/tests/phase-03/02-node-exporter-reachable.sh` (Tailnet :9100 probe)

## Commits

- `fc050cd` feat(03-02): scaffold Ansible repo + node-exporter playbook
- `1459b00` feat(03-02): deploy node_exporter to 5/6 hosts + phase-03 test scripts

## Deviations

### animaya-dev — SSH blocked (deferred)

`ssh root@animaya-dev` and `ssh admin@animaya-dev` both return `Permission denied (publickey,password)`. Tailscale reach is fine (host key accepted on `animaya-dev.twin-pogona.ts.net`); the LXC simply has no authorized key for this operator. `ansible -m ping` confirms UNREACHABLE.

**Inventory handling:** `ansible/inventory/homelab.yml` marks the host with `deferred: true` and an inline `# TODO: push SSH key from tower/Proxmox — blocked Phase 03 on 2026-04-14`. All `ansible-playbook` invocations use `--limit 'monitored_hosts:!animaya-dev'` until this is resolved.

**Follow-up:** push an authorized SSH public key onto animaya-dev (via `pct exec` from tower or root console), then re-run `ansible-playbook playbooks/node-exporter.yml --limit animaya-dev` — inventory and playbook are ready.

### Operator = local macOS (not cc-worker)

Per CLAUDE.md, cc-worker LXC 204 is designated "Claude Code runner." This run used the local operator laptop instead. Ansible and the `prometheus.prometheus` collection are installed locally; cc-worker has neither. Two small adaptations were needed for macOS:

1. `community.general.yaml` stdout callback was removed in collection 12.x — replaced with builtin `default` + `result_format=yaml`.
2. The role downloads and unarchives the binary on the operator before pushing it to targets. macOS BSD tar fails; `brew install gnu-tar` plus `PATH=/opt/homebrew/opt/gnu-tar/libexec/gnubin:$PATH` (set only for the `ansible-playbook` invocation) fixes this.

If future Phase 03 work moves operator to cc-worker, both workarounds become moot (Debian has GNU tar natively and the role is Linux-native).

### Playbook post-task guards

Added `when: not ansible_check_mode` to the three post-task verification steps (systemd check, uri probe, fail-fast) so `--check` dry-runs pass cleanly. Live runs still verify service state + metrics endpoint on every host.

## Requirements covered

- MON-01: Node-exporter is running on all 6 hosts and exposes CPU, memory, disk metrics
  — **5/6 covered** live. animaya-dev deferred and tracked. Inventory + playbook ready to complete the 6th host once SSH access is provisioned.

## Next

Plan 03-03 can scrape the live targets now — Prometheus `nodes.yml` file_sd from 03-01 already lists all 6 Tailnet IPs (animaya-dev will show as `down` in Prometheus until deferred host is provisioned; documented in alerts README).
