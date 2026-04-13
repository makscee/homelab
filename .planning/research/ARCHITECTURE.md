# Architecture Patterns: Homelab IaC Repository

**Domain:** Homelab infrastructure-as-code monorepo
**Researched:** 2026-04-13
**Overall confidence:** MEDIUM (patterns verified across multiple real repos; specifics adapted to this topology)

---

## Recommended Architecture

A **hybrid layout** — primary axis is server/node, secondary axis is service — because this homelab has distinct machines with distinct roles. Per-service-only layouts lose the ability to say "rebuild docker-tower from scratch." Per-server-only layouts make it hard to track a service that could move between servers.

### Directory Structure

```
homelab/
├── inventory/                  # Ground truth: what exists
│   ├── servers.md              # Canonical server list (mirrors CLAUDE.md)
│   └── services.md             # Every running service, which server, which port
│
├── hosts/                      # Per-server configs and provisioning
│   ├── tower/                  # Proxmox host
│   │   ├── README.md           # Role, specs, hosted LXCs
│   │   ├── lxc/                # LXC container configs
│   │   │   ├── docker-tower.conf
│   │   │   ├── tower-sat.conf
│   │   │   └── cc-vk.conf
│   │   └── provision.sh        # Recreate LXCs from scratch
│   ├── docker-tower/           # Media stack LXC
│   │   ├── README.md
│   │   ├── docker-compose.yml  # Full media stack compose
│   │   └── deploy.sh           # Pull + up on this host
│   ├── tower-sat/
│   │   ├── README.md
│   │   └── docker-compose.yml
│   ├── cc-vk/
│   │   ├── README.md
│   │   └── docker-compose.yml
│   ├── mcow/
│   │   ├── README.md
│   │   └── docker-compose.yml  # VoidNet: bot, API, portal
│   └── nether/
│       ├── README.md
│       ├── amneziawg/          # WireGuard-based VPN config
│       └── xray/               # XRay/VLESS config
│
├── network/                    # Tailscale mesh config
│   ├── README.md               # Topology diagram + IP table
│   └── tailscale-acl.hujson   # ACL policy (if managed)
│
├── monitoring/                 # Cross-cutting observability
│   ├── docker-compose.yml      # Grafana + Prometheus + node-exporter
│   ├── prometheus/
│   │   └── prometheus.yml
│   └── grafana/
│       └── dashboards/
│
├── runbooks/                   # Structured operational procedures
│   ├── add-server.md
│   ├── migrate-service.md
│   ├── disaster-recovery.md
│   ├── backup-restore.md
│   └── deploy-voidnet.md
│
├── scripts/                    # Shared shell utilities
│   ├── ssh-exec.sh             # Run command on a host via Tailscale
│   ├── backup.sh               # Trigger backup on target host
│   └── health-check.sh         # Ping all hosts + check services
│
└── secrets/                    # Stubs only — never raw values
    └── README.md               # Points to hub-level secrets manager
```

---

## Component Boundaries

| Component | Responsibility | Talks To |
|-----------|---------------|----------|
| `inventory/` | Single source of truth for what exists | Referenced by all other components |
| `hosts/<name>/` | Config + compose + deploy script for one machine | `network/` for IPs, `secrets/` for env refs |
| `network/` | Tailscale topology, ACLs, IP allocations | `hosts/` (IPs), `monitoring/` (scrape targets) |
| `monitoring/` | Grafana + Prometheus stack, deployed on one host | Scrapes node-exporter on all hosts via Tailscale |
| `runbooks/` | Human+AI-readable step-by-step procedures | References `hosts/`, `scripts/`, `inventory/` |
| `scripts/` | Shared utilities called by runbooks and deploy scripts | SSH into hosts via Tailscale IPs |
| `secrets/` | Stub references, no raw values | Hub-level secrets store (outside this repo) |

---

## Data Flow

```
Claude Code reads runbook
        │
        ▼
runbook references hosts/<server>/deploy.sh
        │
        ▼
deploy.sh SSHes into host (via Tailscale IP from inventory/)
        │
        ▼
docker-compose up -d on target host
        │
        ▼
node-exporter on host → prometheus (monitoring/) → grafana dashboards
```

Secrets flow: hub secrets store → `.env` injected at deploy time → never written to repo.

---

## Suggested Build Order (Phase Dependencies)

1. **inventory/** first — everything else depends on knowing what exists. Cannot write host configs without an accurate server list.

2. **hosts/** per server — once inventory is settled, document each machine. Start with what already exists (docker-tower has compose files). Proxmox LXC configs on tower are highest value (tower is the blast radius leader).

3. **network/** — document Tailscale topology once hosts are catalogued. ACL policy is optional if Tailscale is already configured manually.

4. **scripts/** — write shared utilities after per-host deploy scripts reveal what's repetitive.

5. **monitoring/** — deploy after hosts are stable. Needs scrape target IPs, which come from inventory.

6. **runbooks/** — write after automation scripts exist. Runbooks reference scripts; can't write accurate runbooks against nonexistent scripts.

---

## Anti-Patterns to Avoid

### Flat Root-Level Compose Files
**What:** Single `docker-compose.yml` at repo root containing all services across all hosts.
**Why bad:** Impossible to deploy a single server's stack independently. No clear ownership.
**Instead:** One compose file per host under `hosts/<name>/`.

### Secrets in Repo
**What:** `.env` files or hardcoded credentials committed anywhere in the tree.
**Why bad:** Secrets rotate; repo history is permanent.
**Instead:** `secrets/README.md` documents variable names; actual values live at hub level.

### Runbooks Without Canonical Steps
**What:** Prose descriptions ("restart the thing, then check Grafana").
**Why bad:** Claude Code needs unambiguous, executable steps — not vague narrative.
**Instead:** Numbered steps, exact commands, explicit SSH targets from inventory.

### Per-Service Layout Without Server Anchor
**What:** `services/jellyfin/`, `services/radarr/` at top level without host context.
**Why bad:** When docker-tower needs full rebuild, there's no single place to find its complete stack.
**Instead:** Services live under their host. Cross-host service index goes in `inventory/services.md`.

---

## Scalability Considerations

| Concern | Now (6 servers) | Future |
|---------|-----------------|--------|
| Adding a server | Create `hosts/<name>/`, add to inventory | Same pattern scales |
| Service migration | Move compose section, update inventory | Runbook covers this |
| Monitoring scope | Single Prometheus + Grafana instance | Federation or separate per-site if latency matters |
| Secrets rotation | Manual, hub-level | Hub can integrate Vault later without repo changes |

---

## Sources

- [av1155/homelab — production-grade Proxmox IaC structure](https://github.com/av1155/homelab)
- [piyush97/homelab-gitops — 24-container Proxmox + media stack](https://github.com/piyush97/homelab-gitops)
- [clearlybaffled/homelab — GitOps + Ansible patterns](https://github.com/clearlybaffled/homelab)
- [infrastructure-as-code.com — repository structure patterns](https://infrastructure-as-code.com/posts/repository-structure.html)
- [homelab-monorepo case study](https://blog.clayshekleton.com/homelab-monorepo/)
- [Proxmox GitOps self-contained CI/CD](https://dev.to/stevius10/proxmox-gitops-a-self-contained-cicd-control-plane-for-proxmox-ve-5hmb)
