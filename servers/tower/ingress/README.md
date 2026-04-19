# Tower ingress

External ingress is handled by **iptables DNAT on vmbr0**, not an L7 proxy.
There is no nginx / caddy / haproxy on tower.

## Files

| File | Purpose |
|------|---------|
| `jellyfin.iptables` | Canonical DNAT rule for `vmbr0:8096 → 10.10.20.11:8096` (CT 101 Jellyfin) |

Canonical persisted location on tower: `/etc/iptables/rules.v4` (restored by
`netfilter-persistent.service` on boot).

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
