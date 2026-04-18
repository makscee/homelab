#!/usr/bin/env bash
# scripts/verify-jellyfin-lxc.sh — Phase 17.1 CT 101 runtime probe.
#
# Exit status:
#   0 — all hard checks pass (WARN items don't fail)
#   1 — any hard check failed
#
# D-17 (HW transcode via Intel iGPU) is currently DEFERRED — iGPU is
# BIOS-disabled on tower (NVIDIA RTX 2060 is sole DRM device). VA-API / iHD
# checks therefore emit WARN (not FAIL). See 17.1-02-IGPU-PROBE.md for the
# BIOS-toggle + resume checklist. When D-17 is met, flip the WARN block to
# hard-fail.

set -euo pipefail

PASS=0
WARN=0
FAIL=0

pass() { printf '[PASS] %s\n' "$1"; PASS=$((PASS+1)); }
warn() { printf '[WARN] %s\n' "$1"; WARN=$((WARN+1)); }
fail() { printf '[FAIL] %s\n' "$1"; FAIL=$((FAIL+1)); }

check() {
  # check "label" "remote-cmd" "grep-pattern(optional; empty = just exit-0)"
  local label="$1" cmd="$2" pat="${3:-}"
  local out
  if out="$(eval "$cmd" 2>&1)"; then
    if [[ -z "$pat" ]] || grep -qE "$pat" <<<"$out"; then
      pass "$label"
    else
      fail "$label — pattern '$pat' not matched; got: $(head -1 <<<"$out")"
    fi
  else
    fail "$label — cmd failed: $(head -1 <<<"$out")"
  fi
}

check_warn() {
  local label="$1" cmd="$2" pat="${3:-}" hint="${4:-}"
  local out
  if out="$(eval "$cmd" 2>&1)"; then
    if [[ -z "$pat" ]] || grep -qE "$pat" <<<"$out"; then
      pass "$label"
      return
    fi
  fi
  warn "$label — ${hint:-expected '$pat'}; got: $(head -1 <<<"$out")"
}

echo "=== 17.1 CT 101 verification ==="

# 1. LXC infra (from Plan 01)
check "pct 101 running"              "ssh root@tower 'pct status 101'"                  'running'
check "pct 101 unprivileged"         "ssh root@tower 'pct config 101'"                  'unprivileged: 1'
check "pct 101 mp RO bindmount"      "ssh root@tower 'pct config 101'"                  'mp[01]:.*ro=1'
check "pct 101 dev0 renderD128"      "ssh root@tower 'pct config 101'"                  'dev0:.*/dev/dri/renderD128'

# 2. Jellyfin service runtime
check "jellyfin systemd active"      "ssh root@jellyfin 'systemctl is-active jellyfin'" '^active$'
check "tmpfs mount unit active"      "ssh root@jellyfin 'systemctl is-active var-cache-jellyfin-transcodes.mount'" '^active$'
check "transcodes is tmpfs"          "ssh root@jellyfin 'findmnt /var/cache/jellyfin/transcodes -no FSTYPE'" '^tmpfs$'
check "tmpfs opts nosuid+noexec+4G"  "ssh root@jellyfin 'findmnt /var/cache/jellyfin/transcodes -no OPTIONS'" 'nosuid.*noexec|noexec.*nosuid'
check "tmpfs size=4G"                "ssh root@jellyfin 'findmnt /var/cache/jellyfin/transcodes -no SIZE'" '(^|\s)4G\s*$'

# 3. User/group membership (present for later D-17 use)
check "jellyfin in render group"     "ssh root@jellyfin 'id jellyfin'"                  '\brender\b'
check "jellyfin in video group"      "ssh root@jellyfin 'id jellyfin'"                  '\bvideo\b'

# 4. Media bindmounts
check "/media/wdc readable"          "ssh root@jellyfin 'test -r /media/wdc && echo ok'" '^ok$'
check "/media/sea readable"          "ssh root@jellyfin 'test -r /media/sea && echo ok'" '^ok$'

# 5. apt holds (D-06)
check "apt hold: jellyfin"           "ssh root@jellyfin 'apt-mark showhold'"            '^jellyfin$'
check "apt hold: jellyfin-ffmpeg7"   "ssh root@jellyfin 'apt-mark showhold'"            '^jellyfin-ffmpeg7$'

# 6. Health endpoint
check "jellyfin /health local"       "ssh root@jellyfin 'curl -sf http://localhost:8096/health'" 'Healthy'
check "jellyfin /health over Tailnet" "ssh root@jellyfin 'curl -sf --max-time 5 http://100.77.246.74:8096/health'" 'Healthy'
# vmbr1 path (10.10.20.11) is gated by Plan 04 tower ingress; WARN-only here.
check_warn "jellyfin /health from tower (vmbr1)" \
  "ssh root@tower 'curl -sf --max-time 5 http://10.10.20.11:8096/health'" \
  'Healthy' \
  "vmbr1 path is a Plan 04 concern (tower:22098 ingress); Tailnet path is authoritative for 17.1-02"

# 7. D-17 HW transcode probe — WARN-only while iGPU BIOS-disabled.
#    When BIOS toggle lands (see 17.1-02-IGPU-PROBE.md) promote these to
#    hard `check`s to close the D-17 gate.
HW_HINT="D-17 deferred; see .planning/phases/17.1-migrate-jellyfin-to-dedicated-lxc-on-tower/17.1-02-IGPU-PROBE.md (BIOS: iGPU Multi-Monitor=Enabled)"

check_warn "renderD128 is Intel (not nouveau)" \
  "ssh root@jellyfin 'ls -l /dev/dri/ 2>&1; readlink -f /dev/dri/renderD128 2>&1; lspci -nn 2>&1 | grep -iE \"vga|display|3d\" || true'" \
  'Intel.*(UHD|HD|Iris)' \
  "$HW_HINT"

check_warn "vainfo reports iHD driver" \
  "ssh root@jellyfin '/usr/lib/jellyfin-ffmpeg/vainfo --display drm --device /dev/dri/renderD128 2>&1 || true'" \
  'iHD|Intel iHD' \
  "$HW_HINT"

echo
echo "=== summary: pass=$PASS warn=$WARN fail=$FAIL ==="
if (( FAIL > 0 )); then
  echo "[17.1] verification FAILED"
  exit 1
fi
if (( WARN > 0 )); then
  echo "[17.1] verification PASSED with $WARN warning(s) (D-17 deferred)"
else
  echo "[17.1] verification PASSED (all checks green)"
fi
exit 0
