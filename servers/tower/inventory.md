# tower

| Field | Value |
|-------|-------|
| Hostname | tower |
| Tailscale IP | 100.101.0.7 |
| Role | Proxmox host — runs all Moscow LXC containers |
| Hardware | Intel i7-8700 (12 threads), 16 GB RAM; disk info pending SSH query |
| Access | `ssh root@tower` via Tailnet |

## Hosted Services

| Service | Port | Image/Binary | Notes |
|---------|------|-------------|-------|
| Proxmox VE | 8006 | proxmox-ve | Hypervisor management UI |
| LXC 100 — docker-tower | — | Debian LXC | 8 cores, 12 GB RAM, IP 100.101.0.8 |
| LXC 101 — tower-sat | — | Debian LXC | 2 cores, 2 GB RAM, IP 100.101.0.10 |
| LXC 204 — cc-vk | — | Debian LXC | IP 100.91.54.83; Claude Code runner |

## Storage Layout

| Path | Purpose | Stateful Data |
|------|---------|--------------|
| /mnt/pve/wdc | WDC HDD mount point (shared to docker-tower mp0) | Media library volume |
| /mnt/pve/sea | Seagate HDD mount point (shared to docker-tower mp1) | Media library volume |
| toshi:100/vm-100-disk-0.raw | LXC 100 root disk (100 GB) | docker-tower OS + configs |
| toshi:101/vm-101-disk-0.raw | LXC 101 root disk (40 GB) | tower-sat OS + configs |
| /etc/pve/lxc/ | Proxmox LXC config directory | LXC definitions (100.conf, 101.conf, 204.conf) |

## Notes

Tower is the physical machine. It runs no application services directly — all services live inside LXC containers. The Proxmox storage pool `toshi` backs the container disks. Two external HDDs (`wdc`, `sea`) are mounted into LXC 100 (docker-tower) as media volumes via bind mounts. LXC features `nesting=1` and `fuse=1` are enabled on docker-tower to support Docker-in-LXC.
