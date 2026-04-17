---
phase: 14-global-overview-audit-log
plan: 01
subsystem: infra
tags: [ansible, prometheus, node-exporter, cadvisor, monitoring, tailscale]

requires:
  - phase: 12-infra-foundation
    provides: ansible inventory, group_vars/all.yml, vendored prometheus.prometheus collection

provides:
  - node-exporter playbook covering all 6 Tailnet hosts with Tailscale-only bind
  - cAdvisor playbook scoped to docker_hosts (docker-tower + mcow) with Tailscale-only bind
  - Prometheus file_sd targets for all 6 node_exporter endpoints + 2 cAdvisor endpoints
  - docker_hosts inventory group (docker-tower + mcow)

affects: [14-global-overview-audit-log, 17-alerts]

tech-stack:
  added: [gcr.io/cadvisor/cadvisor:v0.56.1, node_exporter 1.11.1, community.docker.docker_container]
  patterns:
    - Tailscale-only exporter bind via tailscale_ip host_var (SEC-03/T-14-01-01/T-14-01-02)
    - pre_task assert pattern for required host_vars before remote ops
    - Per-target hostname labels in Prometheus file_sd targets

key-files:
  created:
    - ansible/playbooks/cadvisor.yml
    - servers/docker-tower/monitoring/prometheus/targets/cadvisor.yml (extended)
  modified:
    - ansible/inventory/homelab.yml
    - ansible/group_vars/all.yml
    - ansible/playbooks/node-exporter.yml
    - servers/docker-tower/monitoring/prometheus/targets/nodes.yml

key-decisions:
  - "cadvisor_host_port host_var used for mcow (18080) vs docker-tower (8080) — voidnet-api owns :8080 on mcow"
  - "community.docker.docker_container used directly (not prometheus.prometheus.cadvisor role) for explicit Tailnet-bind control"
  - "animaya-dev (100.119.15.122) added to node_exporter targets — new host from 2026-04-14 was missing"
  - "cc-worker excluded from docker_hosts per research Assumption A4 (no Docker daemon)"

patterns-established:
  - "tailscale_ip host_var required for all monitored hosts — assert pre_task enforces this"
  - "All exporter ports bound to {{ tailscale_ip }} not 0.0.0.0 — homelab-wide security pattern"

requirements-completed: [DASH-01]

duration: ~20min
completed: 2026-04-17
---

# Phase 14 Plan 01: Exporter Provisioning Summary

**node_exporter playbook extended to all 6 Tailnet hosts + cAdvisor playbook created for docker-tower/mcow, both binding exclusively to Tailscale IPs; Prometheus file_sd targets updated with hostname labels**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-17
- **Completed:** 2026-04-17
- **Tasks:** 3 of 3 complete (Task 3 operator-executed and approved)
- **Files modified:** 6

## Accomplishments

- Extended inventory with `tailscale_ip` host_var for all 6 hosts + `docker_hosts` group
- Updated node-exporter playbook to bind exclusively to Tailscale IP (SEC-03 / T-14-01-01)
- Created cAdvisor playbook scoped to `docker_hosts` with Tailnet-only port binding (T-14-01-02)
- All 6 node_exporter targets + 2 cAdvisor targets listed in Prometheus file_sd with hostname labels
- Bumped node_exporter_version 1.8.2 -> 1.11.1; pinned cadvisor_version v0.56.1

## Task Commits

1. **Task 1: Extend inventory + targets + node-exporter playbook** - `64524c9` (feat)
2. **Task 2: Create cAdvisor playbook targeting docker_hosts only** - `03b8086` (feat)
3. **Task 3: Operator deploys exporters and verifies Prometheus scrape** - APPROVED (operator-executed, human-verify checkpoint)

## Files Created/Modified

- `ansible/inventory/homelab.yml` - Added tailscale_ip host_vars for all 6 hosts; added docker_hosts group
- `ansible/group_vars/all.yml` - node_exporter_version 1.11.1, cadvisor_version v0.56.1, Tailnet bind address
- `ansible/playbooks/node-exporter.yml` - assert pre_task, Tailscale-only web_listen_address
- `ansible/playbooks/cadvisor.yml` - NEW: community.docker container, Tailnet port bind, ro mounts, probe post_task
- `servers/docker-tower/monitoring/prometheus/targets/nodes.yml` - All 6 hosts with hostname labels (including animaya-dev 100.119.15.122)
- `servers/docker-tower/monitoring/prometheus/targets/cadvisor.yml` - docker-tower :8080 + mcow :18080 with hostname labels

## Decisions Made

- Used `community.docker.docker_container` directly for cAdvisor rather than the `prometheus.prometheus.cadvisor` role — gives explicit control over port binding format needed for Tailnet-only constraint
- mcow cAdvisor uses external port 18080 (not 8080) because voidnet-api occupies 8080; handled via `cadvisor_host_port` host_var
- animaya-dev was the missing host (added 2026-04-14 post last provisioning) — now added to all targets
- cc-worker excluded from docker_hosts per research Assumption A4 (no Docker daemon on that LXC)

## Deviations from Plan

None - plan executed exactly as written. cadvisor.yml was partially scaffolded during Task 1 but was untracked; committed as Task 2.

## Issues Encountered

- `cadvisor.yml` file existed on disk as untracked (created during Task 1 work session but not staged). Confirmed content met all Task 2 acceptance criteria before committing as Task 2.

## User Setup Required

**Operator action required — Task 3 checkpoint.**

Run from `ansible/`:
```
ansible-playbook -i inventory/homelab.yml playbooks/node-exporter.yml
ansible-playbook -i inventory/homelab.yml playbooks/cadvisor.yml
```

Then verify in Prometheus:
- `up{job="node"}` — expect 6 results all value=1
- `up{job="cadvisor"}` — expect 2 results all value=1
- External port scan of any host's public IP on :9100 or :8080 must time out (Tailnet bind confirmed)

Type "approved" to proceed to wave 2.

## Next Phase Readiness

- All IaC artifacts deployed by operator; Prometheus scrape verified (up=1 for all targets)
- Plan 14-02 (Grafana dashboards / DASH-01) can proceed — data sources live

---
*Phase: 14-global-overview-audit-log*
*Completed: 2026-04-17*
