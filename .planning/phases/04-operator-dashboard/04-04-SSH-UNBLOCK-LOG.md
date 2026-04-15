# 04-04 — animaya-dev SSH Unblock + node-exporter Deploy — Evidence Log

**Started:** 2026-04-15
**Operator:** local macOS (makscee@maksceeos)
**Target:** animaya-dev (LXC 205 on tower, Tailscale 100.119.15.122)

---

## Task 1 — SSH Key Push via `pct exec` 205

### Operator pubkey

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAII/B0YXkktxGIefIKBd+8c7jhCzpxF1c8RhSnvj9DV1t makscee@maksceeos
```

**Fingerprint:** `256 SHA256:8vaMgjqd+rh+Br9jfz0XAOjOA8YH6aoLT+cp0XrXWwI makscee@maksceeos (ED25519)`

Source: `~/.ssh/id_ed25519.pub` on operator machine (same key already authorized on tower/docker-tower/mcow/cc-worker/nether — verified implicitly by SSH success to tower during Task 1).

### LXC 205 status (from tower)

```
$ ssh root@tower 'pct list | grep -E "^\s*205\s"'
205        running                 animaya-dev

$ ssh root@tower 'pct exec 205 -- hostname'
animaya-dev
```

### Key installation (idempotent)

```bash
ssh root@tower "pct exec 205 -- mkdir -p /root/.ssh"
ssh root@tower "pct exec 205 -- chmod 700 /root/.ssh"
ssh root@tower "pct exec 205 -- chown root:root /root/.ssh"
ssh root@tower "pct exec 205 -- bash -c 'touch /root/.ssh/authorized_keys && grep -qxF \"\$PUBKEY\" /root/.ssh/authorized_keys || echo \"\$PUBKEY\" >> /root/.ssh/authorized_keys'"
ssh root@tower "pct exec 205 -- chmod 600 /root/.ssh/authorized_keys"
ssh root@tower "pct exec 205 -- chown root:root /root/.ssh/authorized_keys"
```

### Perm + presence verification

```
$ ssh root@tower 'pct exec 205 -- stat -c "%a %U:%G" /root/.ssh'
700 root:root

$ ssh root@tower 'pct exec 205 -- stat -c "%a %U:%G" /root/.ssh/authorized_keys'
600 root:root

$ ssh root@tower "pct exec 205 -- grep -c 'AAAAC3NzaC1lZDI1NTE5AAAAII/B0YXkktxGIefIKBd' /root/.ssh/authorized_keys"
1
```

### sshd config (LXC 205)

```
#PermitRootLogin prohibit-password   # default — publickey root login allowed
#PubkeyAuthentication yes            # default — publickey auth enabled
```

Both commented = default applies. No sshd edit required; no `systemctl reload sshd` issued.

### End-to-end SSH test from operator

Stale known_hosts entry for `100.119.15.122` (line 85) removed via `ssh-keygen -R`. New host key accepted on first connect (Tailnet-bound; trust boundary per threat model T-04-04-03).

```
$ ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=10 root@animaya-dev 'hostname; uname -a'
animaya-dev
Linux animaya-dev 6.17.2-1-pve #1 SMP PREEMPT_DYNAMIC PMX 6.17.2-1 (2025-10-21T11:55Z) x86_64 GNU/Linux
```

SSH works with key auth, no password prompt, exit 0. **Task 1 complete.**

---
