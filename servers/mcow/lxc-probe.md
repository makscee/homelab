# mcow Virtualization Probe

> Note: This file is named `lxc-probe.md` for plan compatibility (Plan 12-03 artifact spec).
> The probe revealed mcow is NOT an LXC — it is a KVM virtual machine. See findings below.

**Date:** 2026-04-17
**Source:** Orchestrator pre-probe executed before Plan 12-03 agent spawn
**VMID:** N/A — mcow is not registered in Proxmox `pct list` (LXC registry); it is a standalone KVM VM

## Probe Commands and Raw Output

```bash
# Step 1: Attempt to find mcow in Proxmox LXC list on tower
$ ssh root@tower "pct list | grep mcow; qm list | grep mcow"
# Result: no output — mcow does not appear in either pct (LXC) or qm (KVM) on tower's Proxmox
# Conclusion: mcow is not hosted on tower's Proxmox at all

# Step 2: Probe virtualization type directly on mcow
$ ssh root@mcow "hostname; systemd-detect-virt; uname -r"
mcow
kvm
6.8.0-107-generic
```

## Parsed Facts

| Key | Value | Implication |
|-----|-------|-------------|
| privilege_level | **N/A (KVM)** | LXC privilege concept does not apply |
| virtualization_type | `kvm` | Full hardware virtualization — no unprivileged-container constraints |
| kernel | `6.8.0-107-generic` | Full kernel — all syscalls available |
| unprivileged line | Absent — not an LXC | No user-namespace translation, no overlay-fs quirks |
| features | N/A | nesting/keyctl/mknod LXC flags irrelevant |
| P-15 applicability | **NOT APPLICABLE** | P-15 only affects unprivileged LXC; KVM has full kernel + CAP_SYS_ADMIN |

## Systemd Hardening Recommendation for Plan 07

**Conclusion:** mcow is a KVM virtual machine with a full Ubuntu 24.04 kernel. All strict systemd hardening directives are safe. The P-15 degraded-hardening branch (ProtectSystem=full, PrivateTmp disabled) does NOT apply.

**Active recommendation — use this block verbatim in `servers/mcow/homelab-admin.service`:**

```ini
[Service]
User=homelab-admin
Group=homelab-admin
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ProtectKernelTunables=yes
ProtectControlGroups=yes
ReadWritePaths=/opt/homelab-admin/app/.next /tmp
```

Rationale: KVM provides full kernel isolation. `ProtectSystem=strict` mounts `/usr`, `/boot`, `/etc` read-only. `PrivateTmp=yes` uses a private `/tmp` namespace. `ProtectKernelTunables=yes` and `ProtectControlGroups=yes` are safe because the guest kernel exposes full capabilities — no user-namespace translation layer exists to block these mounts.

**Degraded variant (NOT used):**

The following would apply only if mcow were an unprivileged LXC (P-15 pitfall). Documented here for reference only — do not transcribe into Plan 07.

```ini
# [Service]
# User=homelab-admin
# NoNewPrivileges=yes
# ProtectSystem=full         # degraded from strict — P-15 LXC overlay quirk
# ProtectHome=yes
# PrivateTmp disabled        # may break in unprivileged LXC
# ProtectKernelTunables disabled
```

## Downstream Consumer

Plan 07 (`12-07-PLAN.md`) reads the "Active recommendation" block above and transcribes it verbatim into `servers/mcow/homelab-admin.service`. No conditional logic needed — the privileged/KVM path is the only path.

## Implications for Other Plans

- **Plan 18 (Web Terminal / node-pty):** `systemd-detect-virt` returns `kvm` — full PTY allocation is available. The "LXC PTY feasibility spike" fallback (ssh2 pure-JS pipe) is unlikely to be needed for KVM reasons. The spike may still be warranted for capability/security reasons but not for LXC/PTY constraints.
- **No `nesting=1` / `keyctl=1` flags** to worry about — KVM, not LXC.
