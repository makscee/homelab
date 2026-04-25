# Ansible — Homelab Infrastructure Automation

## Purpose

Manage configuration and service deployment across all 6 Tailnet-reachable homelab hosts using the `prometheus.prometheus` collection and future collections.

Current playbooks:
- `playbooks/node-exporter.yml` — deploy native systemd `node_exporter` on all monitored hosts

## Prerequisites

- Ansible 2.17+ installed on operator machine
- SSH access to all hosts via Tailnet (root)
- Collections installed (see below)

## Quick Start

```bash
cd ansible

# Install collections (one-time, or after requirements.yml changes)
ansible-galaxy collection install -r requirements.yml -p ./collections

# Verify SSH connectivity to all hosts
ansible -m ping monitored_hosts

# Dry run — review what would change
ansible-playbook playbooks/node-exporter.yml --check

# Apply — deploy node_exporter to all hosts
ansible-playbook playbooks/node-exporter.yml
```

## Host Inventory

All 6 Tailnet hosts are declared in `inventory/homelab.yml`. Hosts connect via Tailscale mesh using root SSH.

| Host | Tailnet IP | Status |
|------|-----------|--------|
| tower | 100.101.0.7 | Active |
| docker-tower | 100.101.0.8 | Active |
| cc-worker | 100.99.133.9 | Active |
| mcow | 100.101.0.9 | Active |
| nether | 100.101.0.3 | Active |
| animaya-dev | 100.119.15.122 | **SSH BLOCKED** — publickey auth refused (see Deferred below) |

## Deferred: animaya-dev

animaya-dev (LXC 205, 100.119.15.122) is Tailnet-reachable (ping OK) but SSH publickey auth
is refused for root. node_exporter cannot be deployed until SSH access is established.

**Resolution:** Push operator SSH public key via Proxmox console on tower:
```bash
# From tower console or pvesh:
pct exec 205 -- mkdir -p /root/.ssh
pct exec 205 -- bash -c "echo '<operator-pubkey>' >> /root/.ssh/authorized_keys"
```
After SSH access is established, re-run the playbook and it will deploy node_exporter to animaya-dev.

## Collections

Collections are installed locally under `ansible/collections/` (git-ignored).
Do not commit the `collections/` directory.

## Variables

See `group_vars/all.yml` for node_exporter version and listen address.
Per-host overrides go in `host_vars/<hostname>.yml`.

## Adding a public probe URL (VDN-22)

`deploy-voidnet-api.yml` ends each deploy by probing every URL in
`voidnet_probe_urls` (defined in the playbook's `vars:` block). Each row
asserts a status code and, optionally, the `Location` header for
redirect rows. A violation triggers the playbook rescue and rolls back
to `.prev` — same path as the existing health/portal probes. This
codifies hub `CLAUDE.md` Deploy rule #2.

To extend the list, edit `vars: voidnet_probe_urls:` in
`playbooks/deploy-voidnet-api.yml` and add a row:

```yaml
- {url: "https://voidnet.makscee.ru/new-page", status: 200}
- {url: "https://voidnet.makscee.ru/gated",    status: 307, location: "/login"}
```

- `url` — absolute URL with scheme + host. Anonymous GET only.
- `status` — exact expected status (int). Encode alternates as separate rows.
- `location` — optional. Asserted only on rows that set it. Exact match against the response's lowercase `location` header. Use a relative path (e.g. `/login`).

To bypass strict mode during a known-flaky upstream incident:

```
ansible-playbook -i inventory/homelab.yml playbooks/deploy-voidnet-api.yml \
  -e voidnet_probe_strict=false
```

Violations log via the assert's `fail_msg` but do not trigger rescue. Restore the default by omitting the flag on the next deploy.

To unit-test the violations Jinja chain locally:

```
ansible-playbook -i localhost, --connection=local playbooks/test-probe-assert.yml
```

The fixture exercises 4 cases (all-pass, status mismatch, location mismatch, row without location) against synthetic `probe_results`.

Spec: `docs/superpowers/specs/2026-04-25-vdn-22-deploy-url-probe-design.md`.
