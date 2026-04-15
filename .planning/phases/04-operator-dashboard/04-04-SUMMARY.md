---
phase: 04-operator-dashboard
plan: 04
subsystem: monitoring
tags: [animaya-dev, ssh-unblock, pct-exec, node-exporter, prometheus, ansible, v1.0-milestone]
requirements:
  - MON-01
requires:
  - Tailnet SSH to tower (Proxmox host) as root
  - Operator ed25519 key already authorized on tower
  - `ansible` + `prometheus.prometheus` collection on operator machine (installed during run)
  - Prometheus on docker-tower with `--web.enable-lifecycle` (reload endpoint)
provides:
  - node_exporter systemd service on animaya-dev exposing :9100/metrics
  - Prometheus scrape target `100.119.15.122:9100` (health=up)
  - SSH root@animaya-dev key-auth working from operator over Tailnet
affects:
  - ansible/inventory/homelab.yml (deferred flag + TODO removed)
  - servers/animaya-dev/inventory.md (history entry)
  - servers/docker-tower/monitoring/prometheus/targets/nodes.yml (target uncommented)
  - runtime: /root/.ssh/authorized_keys on animaya-dev; /opt/homestack/monitoring/prometheus/targets/nodes.yml on docker-tower
tech-stack:
  added: []
  patterns:
    - "pct exec <VMID> for LXC-internal ops when SSH is unreachable (Proxmox trust chain)"
    - "Prometheus file_sd target toggling via live reload (no container restart)"
    - "ansible-playbook --limit <host> for targeted re-deploy against already-written playbook"
key-files:
  created:
    - .planning/phases/04-operator-dashboard/04-04-SSH-UNBLOCK-LOG.md
  modified:
    - ansible/inventory/homelab.yml
    - servers/animaya-dev/inventory.md
    - servers/docker-tower/monitoring/prometheus/targets/nodes.yml
decisions:
  - "Used default sshd config on animaya-dev (PermitRootLogin prohibit-password, PubkeyAuthentication yes) — no config edit needed, both settings were commented-default"
  - "Installed prometheus.prometheus 0.29.1 collection at run time (operator's global collection cache didn't have it in this project's configured path) — pulled from requirements.yml, no version drift"
  - "Confirmed quick-260415-fd2 suppression was file_sd-level only (not an Alertmanager silence or alert-rule filter) — unwind = uncomment single line + reload"
metrics:
  duration: ~8min
  completed: 2026-04-15
---

# Phase 04 Plan 04: animaya-dev SSH Unblock + node-exporter Deploy Summary

**One-liner:** Pushed operator ed25519 pubkey into animaya-dev (LXC 205) via `pct exec` from tower, deployed node_exporter via the already-written Ansible playbook, and uncommented the suppressed Prometheus target — closing the last v1.0 monitoring gap (5/6 → 6/6 hosts).

## Outcome

animaya-dev now participates fully in Tailnet monitoring:
- SSH key auth works from operator (`ssh root@animaya-dev` — no password prompt).
- `node_exporter` 1.9.1 running under systemd, `:9100/metrics` reachable over Tailnet.
- Prometheus target `100.119.15.122:9100` health = **up** (transitioned within 5s of `/-/reload`).
- `HostDown` alert count for animaya-dev = **0** active (alert auto-resolved; no stale silences or rule filters).
- `deferred: true` marker + TODO comment removed from `ansible/inventory/homelab.yml`.
- No `--limit 'monitored_hosts:!animaya-dev'` guards needed in future ansible invocations.

## Tasks completed

| # | Task | Commit |
|---|------|--------|
| 1 | Push operator SSH pubkey into LXC 205 via `pct exec` from tower | `d7fdb16` |
| 2 | Deploy node-exporter via ansible; uncomment Prometheus target; remove deferred flag | `4c882e8` |

## Key verification results

| Check | Expected | Actual |
|-------|----------|--------|
| `/root/.ssh/` perms on animaya-dev | `700 root:root` | `700 root:root` ✓ |
| `/root/.ssh/authorized_keys` perms | `600 root:root` | `600 root:root` ✓ |
| Operator pubkey grep count | `≥1` | `1` ✓ |
| `ssh -BatchMode root@animaya-dev 'hostname'` | exit 0, `animaya-dev` | exit 0, `animaya-dev` ✓ |
| `systemctl is-active node_exporter` | `active` | `active` ✓ |
| Local `:9100/metrics` `node_cpu_seconds_total` lines | >0 | 32 ✓ |
| Tailnet `:9100/metrics` from docker-tower | >0 | 32 ✓ |
| Prometheus target health (instance=100.119.15.122:9100) | `up` | `up` ✓ |
| Active HostDown alerts for animaya-dev | 0 | 0 ✓ |
| Active silences on AM | 0 | 0 ✓ |
| `deferred: true` grep in inventory | no match | no match ✓ |
| SSH unblock log exists | file present | `.planning/phases/04-operator-dashboard/04-04-SSH-UNBLOCK-LOG.md` ✓ |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `prometheus.prometheus` collection missing in project path**
- **Found during:** Task 2 first `ansible-playbook` attempt.
- **Issue:** First run errored `the role 'prometheus.prometheus.node_exporter' was not found`. `ansible.cfg` restricts the lookup path to `./collections/...`, which was empty in this clone.
- **Fix:** `ansible-galaxy collection install -r requirements.yml` (version pinned 0.29.1 — identical to what 03-02 used); retried playbook immediately.
- **Files modified:** None in repo — installs to `ansible/collections/` which is `.gitignore`'d.
- **Commit:** N/A (no repo change).

No other deviations. No Rule 4 (architectural) issues. No authentication gates (existing SSH to tower was already configured).

## v1.0 Milestone Impact

- **node-exporter coverage: 5/6 → 6/6.** Last monitored-host gap flagged in `.planning/v1.0-MILESTONE-AUDIT.md` now closed.
- Phase 04-03 smoke test (Telegram alert E2E) can now proceed without a pre-existing HostDown alert muddying the signal on animaya-dev.

## Follow-up / Deferred

None. All critical invariants from the execution context (pubkey-only, perms, suppression unwind, inventory flag flip, Tailnet verification, Prometheus target up) verified.

## Commits

- `d7fdb16` — feat(04-04): push operator ed25519 SSH key into animaya-dev (LXC 205) via pct exec
- `4c882e8` — feat(04-04): deploy node-exporter to animaya-dev; unsuppress Prometheus target

## Self-Check: PASSED

- File exists: `.planning/phases/04-operator-dashboard/04-04-SSH-UNBLOCK-LOG.md` — FOUND
- File modified: `ansible/inventory/homelab.yml` — no `deferred: true` present (grep returns no match)
- File modified: `servers/docker-tower/monitoring/prometheus/targets/nodes.yml` — contains `100.119.15.122:9100` uncommented
- File modified: `servers/animaya-dev/inventory.md` — 2026-04-15 history entry present
- Commit `d7fdb16` — FOUND in `git log`
- Commit `4c882e8` — FOUND in `git log`
- Runtime: node_exporter active, Prometheus target up, 0 active HostDown for animaya-dev, 0 silences
