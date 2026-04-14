# Network Topology

> 2026-04-14: tower-sat (LXC 101) decommissioned — see REQUIREMENTS.md SVC-06 invalidated.

Visual representation of how all homelab servers connect. Shows the Tailscale mesh overlay, Proxmox virtualization layer, and VPN paths.

```mermaid
flowchart TB
  subgraph tailscale["Tailscale Mesh (100.101.0.x / 100.91.x.x)"]

    subgraph moscow["Moscow — Physical Infrastructure"]
      subgraph tower-hw["tower (100.101.0.7) — Proxmox Host\ni7-8700 12T, 16GB RAM"]
        tower-proxmox[Proxmox VE :8006]

        subgraph lxc-100["LXC 100 — 8 vCPU, 12GB RAM"]
          docker-tower-node[docker-tower\n100.101.0.8\nMedia Stack]
        end

        subgraph lxc-204["LXC 204"]
          cc-vk-node[cc-vk\n100.91.54.83\nOperator / Claude Code]
        end
      end

      mcow-node[mcow\n100.101.0.9\nStandalone — VoidNet]
    end

    subgraph netherlands["Netherlands — VPS"]
      nether-node[nether\n100.101.0.3\nPublic: 77.239.110.57\nVPN + Reverse Proxy]
    end

  end

  subgraph external["External Access"]
    vpn-clients[VPN Clients\nAmneziaWG]
    browser-users[Browser Users\n*.makscee.ru]
  end

  subgraph storage["tower Physical Storage"]
    wdc[WDC HDD\n/mnt/pve/wdc]
    sea[Seagate HDD\n/mnt/pve/sea]
  end

  %% Proxmox manages LXCs
  tower-proxmox -->|manages| lxc-100
  tower-proxmox -->|manages| lxc-204

  %% Storage bind-mounts into docker-tower
  wdc -.->|bind-mount mp0| docker-tower-node
  sea -.->|bind-mount mp1| docker-tower-node

  %% Tailscale mesh — selected key links (all nodes can reach all nodes)
  tower-proxmox <-.->|Tailscale| mcow-node
  tower-proxmox <-.->|Tailscale| nether-node
  docker-tower-node <-.->|Tailscale| mcow-node
  docker-tower-node <-.->|Tailscale| nether-node
  mcow-node <-.->|Tailscale| nether-node
  cc-vk-node <-.->|Tailscale| tower-proxmox

  %% VPN ingress path
  vpn-clients -->|AmneziaWG :46476/UDP| nether-node
  nether-node -->|Tailscale tunnel| docker-tower-node

  %% Public domain ingress
  browser-users -->|HTTPS :443| nether-node
  nether-node -->|reverse proxy| mcow-node
  nether-node -->|reverse proxy| docker-tower-node

  %% Operator access (SSH via Tailscale)
  cc-vk-node -.->|SSH via Tailscale| tower-proxmox
  cc-vk-node -.->|SSH via Tailscale| docker-tower-node
  cc-vk-node -.->|SSH via Tailscale| mcow-node
  cc-vk-node -.->|SSH via Tailscale| nether-node
```

## Network Facts

| Server | Tailscale IP | Public IP | Location | Type | Resources |
|--------|-------------|-----------|----------|------|-----------|
| tower | 100.101.0.7 | — | Moscow | Physical (Proxmox host) | i7-8700 12T, 16GB RAM |
| docker-tower | 100.101.0.8 | — | Moscow (LXC 100) | Virtual | 8 vCPU, 12GB RAM |
| cc-vk | 100.91.54.83 | — | Moscow (LXC 204) | Virtual | Pending SSH query |
| mcow | 100.101.0.9 | — | Moscow | Standalone | Pending SSH query |
| nether | 100.101.0.3 | 77.239.110.57 | Netherlands | VPS | Pending SSH query |

## Access Patterns

- **Inter-server**: All communication via Tailscale mesh — no public IPs used except nether's VPN endpoint
- **Operator (Claude Code)**: SSH from cc-vk to all servers via Tailscale hostnames (`ssh root@<hostname>`)
- **VPN users**: Connect via AmneziaWG (:46476/UDP) to nether, then access docker-tower services through Tailscale tunnel
- **Public domains**: All `*.makscee.ru` traffic terminates TLS at nether's Caddy, then proxied to mcow or docker-tower via Tailscale
- **Proxmox management**: Direct from tower host to LXC guests; Proxmox UI at tower:8006
- **Media access (VoidNet)**: VPN clients reach Jellyfin (:8096) and Navidrome (:4533) on docker-tower via nether reverse proxy

## Key Network Risks

| Risk | Description |
|------|-------------|
| nether SPOF | If nether goes down: all public VPN access lost, all `*.makscee.ru` domains unreachable |
| cc-vk SPOF | If cc-vk goes down: no Claude Code execution, no deployments until operator machine rebuilt with age key |
| voidnet.db on mcow | Single copy of critical user data — no replication, no backup currently defined |
