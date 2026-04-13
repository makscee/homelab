# Feature Landscape

**Domain:** Homelab Infrastructure-as-Code / Disaster Recovery Repository
**Researched:** 2026-04-13
**Operator model:** Claude Code reads repo and executes deployments — structure must be AI-readable and unambiguous

---

## Table Stakes

Features where absence makes the repo useless for its stated goal (full-stack reproducibility from repo alone).

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Server inventory (hardware, IPs, roles) | Can't rebuild what you can't describe | Low | Markdown is fine; must include Tailscale IPs, Proxmox LXC IDs, hosted services per node |
| Docker Compose files per service | Primary deployment unit for docker-tower and mcow | Low | One compose file per logical service group; pinned image tags |
| Per-server bootstrap/rebuild scripts | Recovery starts here — operator needs a clear entry point | Medium | Shell scripts Claude Code can call; idempotent preferred |
| Proxmox LXC definitions (IDs, resources, config) | LXCs are not self-documenting; tower hosts 3 production LXCs | Medium | pct.conf exports or equivalent structured config |
| Tailscale mesh setup | All inter-server comms go through it; losing this = losing the network | Low | Auth key rotation procedure, node registration steps |
| VPN node config (nether: AmneziaWG, XRay/VLESS) | nether is the public entry point; if lost, all VPN users lose access | Medium | Config files committed (secrets scrubbed), restore procedure documented |
| Secrets reference model | Secrets span homelab + animaya + voidnet — must not be embedded in this repo | Low | Document where secrets live (hub level), how to inject them at deploy time |
| Backup and restore procedures | Stateful data (SQLite, media configs, Navidrome DB) can't be recreated from code alone | Medium | Per-service: what data matters, where it's backed up, restore command |
| Runbooks for common operations | Claude Code needs explicit instruction sets, not tribal knowledge | Medium | Minimum: add-server, migrate-service, full-node-rebuild, disaster-recovery |
| Service dependency map | Services have implicit ordering (Tailscale before anything, Prometheus before Grafana) | Low | Simple dependency list or diagram; prevents partial-rebuild failures |

---

## Differentiators

Features beyond baseline reproduction — make the repo operationally excellent or safer.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Monitoring stack as code (Grafana + Prometheus + node-exporter) | Makes failures visible before they become disasters | Medium | Docker Compose + pre-built dashboards committed to repo |
| Health-check scripts per server | Claude Code can verify a rebuild succeeded without human SSH | Medium | Exit-code-based; checks each service endpoint responds |
| Idempotent deploy scripts | Re-running a script doesn't break a partially-working server | Medium | `docker compose up -d` is already idempotent; shell scripts need guards |
| Annotated config files | Why a setting exists matters for future changes; AI operators benefit from inline comments | Low | Especially for non-obvious VPN, Proxmox, and Tailscale settings |
| Migration runbooks (service A → server B) | Services move; procedure should be repeatable, not improvised | Medium | Checklist format: stop, backup, transfer data, redeploy, verify, update DNS/Tailscale |
| Renovate / dependency freshness tracking | Pinned image tags go stale; knowing when is better than not knowing | Low | Renovate bot or manual changelog tracking in CHANGELOG.md |
| Structured deployment log | After Claude Code runs a deployment, record what changed and when | Low | Append-only log file or git commit messages with standard format |
| Network topology diagram | Tailscale mesh + VPN routing is hard to reason about without a map | Low | ASCII or Mermaid diagram in docs; updates when topology changes |

---

## Anti-Features

Things to deliberately not build in this repo.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Fully unattended zero-touch provisioning | Human confirmation is a design constraint (per PROJECT.md); automation without oversight is a liability on production infra | Keep scripts as Claude-executable, human-confirmed steps |
| Storing raw secrets in repo | Security boundary violation; secrets span multiple projects | Reference hub-level secrets; document injection method only |
| Kubernetes / Helm / Flux | Adds orchestration complexity Docker Compose + shell scripts don't need; 6 servers, not 60 | Docker Compose covers the container workload; Proxmox handles LXC isolation |
| Custom CI/CD pipeline (GitHub Actions, GitLab CI) | Homelab has no reliable always-on CI runner; adds fragile dependency | Claude Code is the operator — no pipeline needed |
| Managing media content | Data, not infrastructure; belongs in backup policy, not IaC | Runbook: "restore media from backup location X" |
| Application code for VoidNet or Animaya | Each project has its own workspace; mixing concerns makes both worse | Deployment config only: compose file, env reference, data volume path |
| Drift detection / reconciliation loops | Requires always-on controller (Flux, ArgoCD); overkill for this scale and operator model | Manual drift check via health-check scripts on-demand |

---

## Feature Dependencies

```
Tailscale mesh setup
  → everything else (no node is reachable without it)

Server inventory
  → per-server bootstrap scripts (scripts reference inventory for IPs, IDs)
  → runbooks (procedures reference specific server names/IPs)
  → service dependency map

Secrets reference model
  → Docker Compose files (compose files reference env vars, not raw secrets)
  → per-server bootstrap scripts

Docker Compose files
  → per-service backup/restore procedures
  → health-check scripts

Proxmox LXC definitions
  → per-server bootstrap scripts (LXC must exist before services start)

Monitoring stack
  → health-check scripts (Prometheus metrics feed checks)
```

---

## MVP Recommendation

For the repo to deliver its core value (any server rebuildable from repo alone), prioritize in order:

1. Server inventory — foundation everything else references
2. Tailscale setup documented — prerequisite for all remote access
3. Docker Compose files for docker-tower (media stack) — highest service density, most likely migration target
4. VPN config for nether — highest user-impact if lost
5. Backup/restore procedures for stateful data — the gap between "rebuild the service" and "recover the data"
6. Per-server bootstrap scripts — automate what's documented in steps 1-5
7. Runbooks — codify the procedures Claude Code will actually execute

Defer until after MVP:
- Monitoring stack (valuable but not blocking recovery)
- Health-check scripts (nice for verification; Claude Code can SSH and check manually at first)
- Network topology diagram (document reality before diagramming it)

---

## Sources

- [GitHub: ahinko/home-ops — GitOps homelab reference](https://github.com/ahinko/home-ops)
- [GitHub: piyush97/homelab-gitops — Proxmox + Docker Compose IaC example](https://github.com/piyush97/homelab-gitops)
- [GitHub: ImJustDoingMyPart/homelab — Proxmox + Docker Compose, 19 services](https://github.com/ImJustDoingMyPart/homelab)
- [GitHub: av1155/homelab — runbooks and secrets management patterns](https://github.com/av1155/homelab)
- [ControlMonkey: IaC as disaster recovery blueprint](https://controlmonkey.io/blog/infra-as-code-critical-aspect-for-your-disaster-recovery-plan/)
- [Ergaster: Over-engineering homelab (anti-patterns discussion)](https://ergaster.org/posts/2025/08/04-overegineering-homelab/)
- Confidence: MEDIUM — WebSearch + multiple consistent community sources; no single authoritative standard exists for homelab IaC
