# tower-sat

| Field | Value |
|-------|-------|
| Hostname | tower-sat |
| Tailscale IP | 100.101.0.10 |
| Role | Satellite services (secondary LXC on tower) |
| Hardware | LXC 101 on tower: 2 vCPUs, 2 GB RAM, 40 GB root disk; disk info pending SSH query |
| Access | `ssh root@tower-sat` via Tailnet |

## Hosted Services

| Service | Port | Image/Binary | Notes |
|---------|------|-------------|-------|
| (services pending SSH query) | — | — | LXC has Docker enabled (tag: docker); actual containers unknown without live query |

## Storage Layout

| Path | Purpose | Stateful Data |
|------|---------|--------------|
| / (root disk) | LXC 101 root filesystem (40 GB) | OS + any service data |
| (additional mounts pending SSH query) | — | — |

## Notes

LXC 101 is an unprivileged container with Docker support (`nesting=1`, `keyctl=1`). The container has a `/dev/net/tun` bind mount, which suggests VPN or tunneling use. No bind-mounted external storage from tower (unlike LXC 100). With only 2 vCPUs and 2 GB RAM, this is a lightweight satellite node. Running services are pending a live SSH query: `ssh root@tower-sat "docker ps && systemctl list-units --type=service --state=running"`.
