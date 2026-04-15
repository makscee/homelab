# 04-04 — animaya-dev SSH Unblock + node-exporter Deploy — Evidence Log

**Started:** 2026-04-15
**Operator:** local macOS (makscee@maksceeos)
**Target:** animaya-dev (LXC 205 on tower, Tailscale 100.119.15.122)

---

## Task 1 — SSH Key Push via `pct exec` 205

### Operator pubkey

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAII/B0YXkktxGIefIKBd+8c7jhCzpxF1c8RhSnvj9DV1t makscee@maksceeos
```

**Fingerprint:** `256 SHA256:8vaMgjqd+rh+Br9jfz0XAOjOA8YH6aoLT+cp0XrXWwI makscee@maksceeos (ED25519)`

Source: `~/.ssh/id_ed25519.pub` on operator machine (same key already authorized on tower/docker-tower/mcow/cc-worker/nether — verified implicitly by SSH success to tower during Task 1).

### LXC 205 status (from tower)

```
$ ssh root@tower 'pct list | grep -E "^\s*205\s"'
205        running                 animaya-dev

$ ssh root@tower 'pct exec 205 -- hostname'
animaya-dev
```

### Key installation (idempotent)

```bash
ssh root@tower "pct exec 205 -- mkdir -p /root/.ssh"
ssh root@tower "pct exec 205 -- chmod 700 /root/.ssh"
ssh root@tower "pct exec 205 -- chown root:root /root/.ssh"
ssh root@tower "pct exec 205 -- bash -c 'touch /root/.ssh/authorized_keys && grep -qxF \"\$PUBKEY\" /root/.ssh/authorized_keys || echo \"\$PUBKEY\" >> /root/.ssh/authorized_keys'"
ssh root@tower "pct exec 205 -- chmod 600 /root/.ssh/authorized_keys"
ssh root@tower "pct exec 205 -- chown root:root /root/.ssh/authorized_keys"
```

### Perm + presence verification

```
$ ssh root@tower 'pct exec 205 -- stat -c "%a %U:%G" /root/.ssh'
700 root:root

$ ssh root@tower 'pct exec 205 -- stat -c "%a %U:%G" /root/.ssh/authorized_keys'
600 root:root

$ ssh root@tower "pct exec 205 -- grep -c 'AAAAC3NzaC1lZDI1NTE5AAAAII/B0YXkktxGIefIKBd' /root/.ssh/authorized_keys"
1
```

### sshd config (LXC 205)

```
#PermitRootLogin prohibit-password   # default — publickey root login allowed
#PubkeyAuthentication yes            # default — publickey auth enabled
```

Both commented = default applies. No sshd edit required; no `systemctl reload sshd` issued.

### End-to-end SSH test from operator

Stale known_hosts entry for `100.119.15.122` (line 85) removed via `ssh-keygen -R`. New host key accepted on first connect (Tailnet-bound; trust boundary per threat model T-04-04-03).

```
$ ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=10 root@animaya-dev 'hostname; uname -a'
animaya-dev
Linux animaya-dev 6.17.2-1-pve #1 SMP PREEMPT_DYNAMIC PMX 6.17.2-1 (2025-10-21T11:55Z) x86_64 GNU/Linux
```

SSH works with key auth, no password prompt, exit 0. **Task 1 complete.**

---

## Task 2 — node-exporter Deploy + Target Unblock

### Ansible run

```bash
cd ansible
ansible-galaxy collection install -r requirements.yml   # prometheus.prometheus 0.29.1 (was not yet installed on operator)
PATH=/opt/homebrew/opt/gnu-tar/libexec/gnubin:$PATH \
  ansible-playbook -i inventory/homelab.yml playbooks/node-exporter.yml --limit animaya-dev
```

Play recap:
```
animaya-dev : ok=38 changed=8 unreachable=0 failed=0 skipped=10 rescued=0 ignored=0
```

### Host-level verification

```
$ ssh root@animaya-dev 'systemctl is-active node_exporter'
active

$ ssh root@animaya-dev "curl -sf http://127.0.0.1:9100/metrics | grep -c '^node_cpu_seconds_total'"
32

$ ssh root@docker-tower "curl -sf http://100.119.15.122:9100/metrics | grep -c '^node_cpu_seconds_total'"
32   # reachable over Tailnet from monitoring host
```

### Suppression unwind

Quick-fix commit `325c3f5` / `a9da8a2` (quick-260415-fd2) suppressed the animaya-dev HostDown alert *by commenting out the Prometheus file_sd target* — **not** via an Alertmanager silence or alert rule filter. Unwind path:

- `servers/docker-tower/monitoring/prometheus/targets/nodes.yml` — uncommented `100.119.15.122:9100` line; replaced DEFERRED comment with restoration note.
- Deployed to docker-tower: `scp nodes.yml root@docker-tower:/opt/homestack/monitoring/prometheus/targets/nodes.yml`.
- Hot-reload: `curl -fsS -X POST http://localhost:9090/-/reload` on docker-tower → `RELOAD OK` (no container restart).
- Alertmanager side: queried `http://100.101.0.9:9093/api/v2/silences` → no silences present. Alert rules in `alerts/homelab.yml` did not contain an instance filter (verified by inspection during scan). **No alertmanager-side unwind needed.**

### Prometheus target state

```
$ for i in 1..6; do sleep 5; curl .../api/v1/targets | jq '…instance=="100.119.15.122:9100"…'; done
t=+5s health=up
```

Full target query:
```bash
$ ssh root@docker-tower "curl -s http://localhost:9090/api/v1/targets" \
    | jq '[.data.activeTargets[] | select(.labels.instance=="100.119.15.122:9100") | .health] | .[0]'
"up"
```

### Alertmanager state (on mcow, 100.101.0.9:9093 — co-located with Grafana per 04-01)

```
$ curl -s http://100.101.0.9:9093/api/v2/alerts | jq '[.[] | select(.labels.alertname=="HostDown" and .labels.instance=="100.119.15.122:9100" and .status.state=="active")] | length'
0

$ curl -s http://100.101.0.9:9093/api/v2/silences | jq '[.[] | select(.status.state=="active")] | length'
0
```

Pre-existing active alerts (unrelated, **out of scope** for this plan):
- `DiskUsageCritical` on `100.101.0.7:9100` (tower)
- `DiskUsageCritical` on `100.101.0.8:9100` (docker-tower)

### Inventory + host doc updates

- `ansible/inventory/homelab.yml` — `deferred: true` comment block + TODO removed; single-line restoration note added referencing this log.
- `servers/animaya-dev/inventory.md` — appended 2026-04-15 history entry.
- `servers/docker-tower/monitoring/prometheus/targets/nodes.yml` — `100.119.15.122:9100` uncommented; DEFERRED comment replaced with restoration note.

### v1.0 milestone gap

Node-exporter coverage: **5/6 → 6/6.** Last monitored host gap closed. animaya-dev now participates in HostDown/CPU/RAM/Disk alerting normally.

**Task 2 complete.**

