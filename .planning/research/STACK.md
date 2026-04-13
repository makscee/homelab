# Technology Stack

**Project:** Homelab Infrastructure-as-Code
**Researched:** 2026-04-13
**Confidence:** MEDIUM-HIGH (verified against official Ansible docs and 2025 community practice)

---

## Recommended Stack

### Configuration Management (Primary IaC Layer)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Ansible | 2.17+ (core) | Server config, service deployment, Docker Compose orchestration | No state file complexity; YAML playbooks are AI-readable; works over SSH with no agent; perfect for Claude Code as operator |
| community.docker collection | 5.1.0+ | Managing Docker Compose stacks on remote hosts | `docker_compose_v2` module is the current standard; old V1 module removed in collection 4.0.0 |
| community.proxmox collection | 1.x (new) | LXC container lifecycle on tower | Migrated from `community.general.proxmox`; use `community.proxmox.proxmox` going forward |

**Rationale for Ansible-first (not Terraform+Ansible):** This homelab has no cloud resources and no ephemeral infra churn. Terraform adds state file management overhead with no benefit when servers are long-lived physical/LXC machines. Ansible handles both provisioning (LXC creation) and configuration in one tool, which simplifies AI-operator workflows significantly.

### Secrets Management

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| SOPS | 3.9+ | Encrypt secrets committed to git | Encrypts values, leaves keys readable; native git integration; no external service |
| age | 1.2+ | Encryption backend for SOPS | Simpler than PGP, modern cryptography, no key management complexity, SSH key support |

**Pattern:** Secrets live in `.sops.yaml`-configured encrypted files in the hub repo (not homelab repo). Homelab repo references env files that are decrypted at deploy time on the operator's machine. Claude Code decrypts with the operator's age key before running playbooks.

**NOT:** Ansible Vault — creates per-vault password management complexity across multiple repos. SOPS+age is cleaner for multi-project hub structure.

### Inventory and Host Management

| Technology | Purpose | Why |
|------------|---------|-----|
| Ansible static inventory (INI or YAML) | Declare all 6 servers with Tailscale IPs, groups, vars | Static is appropriate — servers are known and stable; dynamic inventory adds complexity with no benefit |

Inventory groups: `proxmox_hosts`, `docker_hosts`, `lxc_containers`, `vpn_nodes`. Variables per-host cover Tailscale IP, role, LXC ID where applicable.

### Repository Structure

```
homelab/
  inventory/
    hosts.yml              # All 6 servers with groups and vars
    group_vars/
      all.yml              # Global vars (non-secret)
      docker_hosts.yml     # Docker-specific vars
  playbooks/
    site.yml               # Master playbook (imports all roles)
    docker-tower.yml       # Media stack
    nether.yml             # VPN node
    mcow.yml               # VoidNet services
    monitoring.yml         # Grafana + Prometheus
  roles/
    common/                # Base: SSH hardening, updates, Tailscale
    docker/                # Docker Engine install + Compose plugin
    media-stack/           # Jellyfin, Navidrome, *arr, qBit
    monitoring/            # Grafana, Prometheus, node-exporter
    vpn/                   # AmneziaWG + XRay/VLESS on nether
    voidnet/               # VoidNet deployment config
  services/
    docker-tower/
      docker-compose.yml   # Media stack compose file
    mcow/
      docker-compose.yml   # VoidNet compose file
    monitoring/
      docker-compose.yml   # Monitoring stack
  runbooks/
    add-server.md
    migrate-service.md
    disaster-recovery.md
  scripts/
    rebuild-host.sh        # Wrapper: decrypt secrets → run playbook
```

### Monitoring Stack

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Prometheus | 2.x (latest) | Metrics collection | Standard; integrates with all services |
| Grafana | 11.x (latest) | Dashboards | Standard; node-exporter dashboards prebuilt |
| node-exporter | 1.8+ | Host metrics | Standard; one per host |
| cAdvisor | 0.49+ | Container metrics | Docker-native; integrates with Prometheus |

Deploy all via Docker Compose on a dedicated monitoring stack (tower-sat is appropriate).

### Networking (Tailscale)

| Technology | Purpose | Why |
|------------|---------|-----|
| Tailscale | Mesh VPN, all inter-server comms | Already deployed; SSH over Tailnet is the standard operator path |
| Tailscale Ansible role (`artis3n.tailscale`) | Automate Tailscale install/auth on new nodes | Well-maintained community role; avoids reimplementing auth key flow |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Config management | Ansible | Terraform+Ansible | Terraform state file adds overhead; no cloud resources to justify it |
| Config management | Ansible | SaltStack | More complex architecture (master+minions); smaller homelab community |
| Secrets | SOPS+age | Ansible Vault | Per-project vault passwords; doesn't span hub repos cleanly |
| Secrets | SOPS+age | HashiCorp Vault | Server to maintain; overkill for 6-node homelab |
| Container management | Docker Compose (managed by Ansible) | Portainer | Portainer GitOps requires Portainer server; adds a service to maintain; Ansible direct is simpler for AI operator |
| Container management | Docker Compose | Kubernetes/k3s | Massive complexity increase; no benefit at this scale |
| Monitoring | Prometheus+Grafana | Netdata | Less flexible; harder to extend; Prometheus/Grafana is better for long-term |

---

## Installation Bootstrap

```bash
# On operator machine (Claude Code runner — cc-vk or local)
pip install ansible
ansible-galaxy collection install community.docker community.proxmox community.general
ansible-galaxy role install artis3n.tailscale

# SOPS + age
brew install sops age          # macOS
# or: curl -sLO sops release, apt install age

# Verify connectivity
ansible all -i inventory/hosts.yml -m ping
```

---

## Confidence Notes

| Decision | Confidence | Basis |
|----------|------------|-------|
| Ansible as primary tool | HIGH | Official docs + strong 2025 community consensus for homelab |
| community.proxmox (new collection) | MEDIUM | Verified module migration in official Ansible docs; collection still maturing |
| community.docker v2 module | HIGH | Official Ansible docs confirm V1 removed, V2 is current standard |
| SOPS+age for secrets | HIGH | Multiple 2025 sources + active project (SOPS 3.9 released 2024) |
| No Terraform | MEDIUM | Logical for this use case; no long-lived state needed; validated by homelab community advice |
| Monitoring stack versions | MEDIUM | Current major versions correct as of training; verify latest tags at deploy time |

---

## Sources

- [Ansible community.docker collection — docker_compose_v2 module](https://docs.ansible.com/projects/ansible/latest/collections/community/docker/docker_compose_v2_module.html)
- [Community.Proxmox Ansible collection](https://docs.ansible.com/projects/ansible/latest/collections/community/proxmox/index.html)
- [SOPS GitHub](https://github.com/getsops/sops)
- [Managing secrets with SOPS in homelab](https://www.codedge.de/posts/managing-secrets-sops-homelab/)
- [Ansible made homelab reproducible](https://www.xda-developers.com/ansible-made-my-entire-homelab-reproducible-with-one-command/)
- [Terraform vs Ansible for homelab 2025](https://medium.com/@kanishetty/terraform-vs-ansible-which-one-should-you-use-in-2025-6adc58ef84a6)
- [Homelab GitOps IaC — Proxmox + Ansible](https://github.com/jarkinV/homelab-infrastructure)
