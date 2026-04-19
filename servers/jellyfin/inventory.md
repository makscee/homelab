# jellyfin (CT 101 on tower)

- **Role:** Jellyfin media server (native Debian deb)
- **Host:** Moscow, Proxmox CT 101 on tower
- **Network:** vmbr1 10.10.20.11/24, Tailscale hostname `jellyfin` (100.77.246.74)
- **Services:** jellyfin.service (8096), tailscaled.service, var-cache-jellyfin-transcodes.mount (tmpfs 4G)
- **iGPU:** /dev/dri/renderD128 via Proxmox dev0: passthrough (driver currently nouveau — Intel iGPU BIOS-disabled; D-17 deferred per `17.1-02-IGPU-PROBE.md`)
- **Media:** /media/wdc + /media/sea (mp0/mp1 RO bindmounts from /mnt/pve/*)
- **External:** jellyfin.makscee.ru → router → tower vmbr0 iptables DNAT → 10.10.20.11:8096
- **Deploy:** `ansible-playbook -i ansible/inventory/homelab.yml ansible/playbooks/deploy-jellyfin.yml`
- **Verify:** `bash scripts/verify-jellyfin-lxc.sh`
- **LXC conf SoT:** `servers/tower/lxc-101-jellyfin.conf`
- **Phase:** 17.1 (migrated from docker-tower LXC 100 on 2026-04-18; operator CPU-only signoff 2026-04-19)
