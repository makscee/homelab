#!/usr/bin/env bash
# Run this after enabling Intel iGPU in BIOS and rebooting tower.
# It detects the Intel GPU, updates LXC passthrough, deploys QSV config,
# and restarts Jellyfin.
set -euo pipefail

echo "=== Step 1: Detect Intel iGPU on tower ==="
INTEL_RENDER=$(ssh root@tower 'for d in /sys/class/drm/renderD*; do
  vendor=$(cat "$d/device/vendor" 2>/dev/null)
  if [ "$vendor" = "0x8086" ]; then
    basename "$d"
    exit 0
  fi
done; echo "NOT_FOUND"')

if [ "$INTEL_RENDER" = "NOT_FOUND" ]; then
  echo "ERROR: Intel iGPU not detected. Did you enable it in BIOS?"
  echo "  BIOS → Advanced → System Agent Configuration → Graphics Configuration"
  echo "  Set iGPU Multi-Monitor → Enabled"
  exit 1
fi

echo "Found Intel iGPU at /dev/dri/$INTEL_RENDER"

echo ""
echo "=== Step 2: Verify DRI device in LXC ==="
LXC_CHECK=$(ssh root@docker-tower "ls /dev/dri/$INTEL_RENDER 2>/dev/null && echo OK || echo MISSING")
if [ "$LXC_CHECK" = "MISSING" ]; then
  echo "DRI device not yet in LXC. You may need to reboot LXC 100:"
  echo "  ssh root@tower 'pct reboot 100'"
  exit 1
fi
echo "DRI device available in LXC"

echo ""
echo "=== Step 3: Check vainfo inside Jellyfin container ==="
ssh root@docker-tower "docker exec jellyfin /usr/lib/jellyfin-ffmpeg/vainfo --display drm --device /dev/dri/$INTEL_RENDER 2>&1 | tail -20"

echo ""
echo "=== Step 4: Deploy QSV encoding config ==="
scp /tmp/jellyfin_encoding_qsv.xml root@docker-tower:/opt/docker-configs/shared/jellyfin/config/encoding.xml
echo "QSV config deployed"

echo ""
echo "=== Step 5: Update VaapiDevice path if needed ==="
ssh root@docker-tower "sed -i 's|<VaapiDevice>/dev/dri/renderD128</VaapiDevice>|<VaapiDevice>/dev/dri/$INTEL_RENDER</VaapiDevice>|' /opt/docker-configs/shared/jellyfin/config/encoding.xml"
echo "VaapiDevice set to /dev/dri/$INTEL_RENDER"

echo ""
echo "=== Step 6: Restart Jellyfin ==="
ssh root@docker-tower 'docker restart jellyfin'
echo ""
echo "=== Done! ==="
echo "QSV hardware transcoding is now enabled."
echo "Test playback at http://docker-tower:8096/"
echo ""
echo "Changes made:"
echo "  - HardwareAccelerationType: qsv"
echo "  - Low-power H264/HEVC encoders: enabled"
echo "  - HEVC encoding: allowed"
echo "  - HW decode codecs: h264, hevc, mpeg2, vc1, vp8, vp9"
echo "  - Tonemapping: enabled"
