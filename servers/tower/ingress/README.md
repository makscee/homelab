# Tower ingress

External ingress to service LXCs is handled by **socat systemd forwards**, not
iptables DNAT and not an L7 proxy. There is no nginx / caddy / haproxy on tower.

## Why socat, not DNAT

Tower runs Tailscale with exit-node rules that install a policy route for
`10.10.20.0/24` via table 100 (and default via table 52 → `tailscale0`). A
kernel DNAT'd flow forwards reply packets from the service LXC back through
tower, where the FORWARD-path routing decision picks `tailscale0` — asymmetric
to the original WAN ingress path, so external clients silently time out on SYN.

A userspace `socat TCP-LISTEN → TCP` relay terminates the inbound TCP on tower
itself, so reply packets are OUTPUT from tower (src = tower LAN IP, matched by
`ip rule prio 80: from 192.168.1.103 lookup main`) and egress `vmbr0` via the
default gateway. Hairpin-only vs real-WAN UAT is the tell: DNAT passes hairpin,
fails WAN.

## Services

| Unit | Listen | Backend | Purpose |
|------|--------|---------|---------|
| `jellyfin-fwd-22098.service` | `:22098` | `10.10.20.11:8096` | External Jellyfin (`http://jellyfin.makscee.ru:22098/`) |
| `cc-fwd-20{1,2,3}.service`   | `:220{2,3,4}` | cc-* LXC :22 | SSH forwards for cc-andrey/cc-dan/cc-yuri |

Internal hairpin for `:8096 → CT 101` is still provided by iptables DNAT on
`vmbr0` (in `/etc/iptables/rules.v4`, reapplied by `netfilter-persistent`), so
LAN clients resolving `jellyfin.makscee.ru` to the router's WAN IP can reach
Jellyfin without leaving the LAN.

## Leaf-LXC Tailscale pitfall (REQUIRED for service LXCs on vmbr1)

**Any leaf-service LXC on vmbr1 (10.10.20.0/24) that runs Tailscale MUST set
`--accept-routes=false`.**

If a tailnet peer anywhere in the tailnet advertises `10.10.20.0/24` as a subnet
route, accepting that advertisement on an LXC that is *itself* in `10.10.20.0/24`
installs `10.10.20.0/24 dev tailscale0 table 52`, which shadows the L2-local
route via `eth0`. Reply packets to `10.10.20.1` (tower) then egress
`tailscale0`, the gateway never sees them, and external ingress via DNAT
silently times out.

Apply once on CT 101 (and any future leaf LXC on vmbr1):

```bash
pct exec <CTID> -- tailscale set --accept-routes=false
```

Persistence: stored in `/var/lib/tailscale/tailscaled.state`, survives `systemctl
restart tailscaled` and reboot automatically. No systemd override needed.

Verify:

```bash
pct exec <CTID> -- tailscale debug prefs | grep RouteAll   # RouteAll: false
pct exec <CTID> -- ip route get 10.10.20.1                 # dev eth0, not tailscale0
```

See `.planning/phases/17.1-migrate-jellyfin-to-dedicated-lxc-on-tower/17.1-04-INGRESS-LOG.md`
for the incident record.
