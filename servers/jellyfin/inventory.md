# jellyfin (CT 101 on tower)

- **Role:** Jellyfin media server (native Debian deb)
- **Host:** Moscow, Proxmox CT 101 on tower
- **Network:** vmbr1 10.10.20.11/24, Tailscale hostname `jellyfin` (100.77.246.74)
- **Services:** jellyfin.service (8096), tailscaled.service, var-cache-jellyfin-transcodes.mount (tmpfs 4G)
- **GPU:** Nvidia RTX 2060 (Turing, 7th-gen NVENC) on tower host. Driver = 590.48.01 from `developer.download.nvidia.com/compute/cuda/repos/debian12`. Nouveau blacklisted in `/etc/modprobe.d/blacklist-nouveau.conf`. Kernel module auto-loads via `/etc/modules-load.d/nvidia.conf`. Passed to LXC via `dev2-dev6` in `/etc/pve/lxc/101.conf`: `/dev/nvidia0`, `/dev/nvidiactl`, `/dev/nvidia-uvm`, `/dev/nvidia-uvm-tools`, `/dev/nvidia-modeset`. LXC has matching userspace libs pinned at 590.48.01-1 via `/etc/apt/preferences.d/nvidia-590`.
- **Intel iGPU:** BIOS-disabled. D-17 deferred permanently — Nvidia replaces iGPU plan.
- **Transcode:** NVENC (h264_nvenc + hevc_nvenc) with NVDEC decode. `/etc/jellyfin/encoding.xml` has `HardwareAccelerationType=nvenc`, `EnableHardwareEncoding=true`, `EnableTonemapping=true`. HardwareDecodingCodecs: h264, hevc, vp9, vp8, av1. Enabled 2026-04-21 after Jujutsu Kaisen S2 HEVC 10-bit lag report.
- **NVENC session limit:** Turing default 3 concurrent NVENC sessions. Apply [keylase/nvidia-patch](https://github.com/keylase/nvidia-patch) on tower if >3 simultaneous streams needed (not yet applied).
- **Subtitles (ASS):** `EnableFallbackFont=true` + `FallbackFontPath=/usr/share/fonts/opentype/noto`, `fonts-noto-cjk` + `fonts-noto-core` installed. Jellyfin 10.11.8 sometimes fails to extract mkv-embedded fonts to `data/attachments/{id}/` → ASS renders blank without fallback. Configured 2026-04-21 after Jujutsu Kaisen S3 report.
- **Media:** /media/wdc + /media/sea (mp0/mp1 RO bindmounts from /mnt/pve/*)
- **External (tailnet):** `https://jellyfin.twin-pogona.ts.net` — Tailscale Serve on LXC (`tailscale serve --bg --https=443 http://localhost:8096`). Preferred for any device on tailnet (peer-to-peer, bypasses exit node, proper TLS). Auto-persists across reboots.
- **External (WAN):** `http://jellyfin.makscee.ru:22098/` → router :22098 → tower nginx `/etc/nginx/sites-enabled/jellyfin-22098.conf` → 10.10.20.11:8096 (HTTP only, no TLS — router/ISP does not forward :80/:443). Replaced socat with nginx 2026-04-21 for proper X-Forwarded-{For,Proto,Host} headers. `network.xml` has `EnablePublishedServerUriByRequest=true` + `KnownProxies=[10.10.20.1,10.10.20.11]` so Jellyfin emits URLs matching client Host header (fixes sub/attachment URLs when client hits `:22098`). Deprecated `jellyfin-fwd-22098.service` (socat) disabled.
- **Hairpin (LAN):** :8096 → tower vmbr0 iptables DNAT → 10.10.20.11:8096
- **Deploy:** `ansible-playbook -i ansible/inventory/homelab.yml ansible/playbooks/deploy-jellyfin.yml`
- **Verify:** `bash scripts/verify-jellyfin-lxc.sh`
- **LXC conf SoT:** `servers/tower/lxc-101-jellyfin.conf`
- **Phase:** 17.1 (migrated from docker-tower LXC 100 on 2026-04-18; operator CPU-only signoff 2026-04-19)
