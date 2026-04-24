# nether — VPN entry/exit + reverse proxy (Netherlands)

## 1. Overview

`nether` (Tailscale IP `100.101.0.3`) is the Netherlands-located VPS that serves as:

- **AmneziaWG VPN entry/exit** on UDP **46476** (container `amnezia-awg2`, 26 configured peers).
- **Caddy reverse proxy** on TCP **80/443/2053** fronting `n8n`, `spacetimedb`, `couchdb`, and proxying VoidNet paths back to `docker-tower` (100.101.0.8) and `mcow` (100.101.0.9).
- **Portainer** on 100.101.0.3:9443 (Tailscale-only binding, not public).

> **Monitoring stack decommissioned 2026-04-14 (plan 03-03).** The secondary
> Grafana/Prometheus/faux-node-exporter stack that ran on nether has been
> retired. The single source of truth for monitoring is now
> `docker-tower`. Native systemd `node_exporter` on nether (port `:9100`)
> replaces the container version and is scraped by docker-tower Prometheus
> over Tailnet.

All inter-server traffic runs over Tailscale. Only AWG UDP 46476, Caddy TCP 80/443/2053, and (internally) Portainer on the Tailnet face the outside world.

## 2. Stacks

| File | Purpose | Start command |
| --- | --- | --- |
| `docker-compose.services.yml` | Live services: `caddy`, `spacetimedb`, `couchdb`, `n8n`, `amnezia-awg2`, `portainer`, `portainer_agent` | `docker compose -f docker-compose.services.yml up -d` |
| ~~`docker-compose.monitoring.yml`~~ | **DECOMMISSIONED 2026-04-14 (plan 03-03)** — file removed; monitoring consolidated onto docker-tower. Historical capture preserved in git history. | — |
| `docker-compose.void.yml` | **ARCHIVED** — legacy VoidNet overseer/uplink architecture. Do NOT deploy. | — |

All image tags are pinned to `image@sha256:<digest>` per D-05. The `amnezia-awg2` image is built locally on nether from `/opt/amnezia`; its digest pins the currently deployed build.

Run `bash ../../scripts/verify-phase02.sh` from the repo root to validate this directory against its acceptance criteria.

## 3. AmneziaWG reproduction procedure

The AWG config splits into two artifacts:

- `amnezia-awg.conf.template` — public obfuscation parameters (Jc/Jmin/Jmax, S1-S4, H1-H4) + placeholders `__SOPS:server_private_key__`, `__SOPS:peer_N_pubkey__`, `__SOPS:peer_N_psk__`.
- `../../secrets/nether-awg.sops.yaml` — SOPS+age encrypted private keys + peer public keys + pre-shared keys (53 fields total: 1 server key + 26 pubkeys + 26 PSKs).

To rebuild the runtime config on a fresh nether host:

1. `sops --decrypt ../../secrets/nether-awg.sops.yaml > /tmp/nether-awg-keys.yaml` (on the operator machine with the age key).
2. Render the template: substitute every `__SOPS:KEY__` token in `amnezia-awg.conf.template` with the matching value from `/tmp/nether-awg-keys.yaml`. Copy the rendered file to `/opt/amnezia/awg/awg0.conf` on nether.
3. `shred -u /tmp/nether-awg-keys.yaml` (or `rm -f` on macOS) — never leave plaintext keys on disk.
4. `docker compose -f docker-compose.services.yml up -d amnezia-awg2`.
5. Verify: `ssh root@nether "docker exec amnezia-awg2 awg show"` — should list 26 peers.

## 4. Caddy

`Caddyfile` in this repo is the **authoritative** reverse-proxy configuration. `docker-compose.services.yml` bind-mounts it into the caddy container at `/etc/caddy/Caddyfile:ro`.

**Important drift note:** the live caddy container (as captured 2026-04-14) had the Caddyfile inlined into its `command:` via an `echo > /etc/caddy/Caddyfile && caddy run` construct. The repo version reproduces an equivalent configuration via bind-mount, which is the deployment path we enforce going forward. Changes to the reverse proxy must land in this repo and be redeployed — do not `docker exec` the running caddy to edit `/etc/caddy/Caddyfile` in place.

Hosts currently proxied: `n8n.makscee.ru`, `aoi.makscee.ru:3000`, `sync.makscee.ru`, `notes.makscee.ru`, `makscee.ru`, `voidnet.makscee.ru` (with `/jellyfin/*` and `/navidrome*` path handlers back to docker-tower, default route to mcow), `animaya.makscee.ru`, `admin.makscee.ru` (tailnet-gated, VDN-21), and an internal `https://nether:2053`.

### 4.1 `admin.makscee.ru` — tailnet-gated voidnet admin (VDN-21)

Dedicated vhost for voidnet's admin portal + admin API. **Reachable only from the Tailscale CGNAT range `100.64.0.0/10`.** Public requests (any non-tailnet source IP) get `403 forbidden` at Caddy — the request never reaches mcow.

- **Who can reach it:** any host on our tailnet (this mac, cc-worker, cc-\*, docker-tower, mcow, nether itself). Operator home IPs are NOT allowlisted — ssh is the same trust boundary, and we already require tailnet for ssh.
- **Route split:**
  - `/api/admin/*` → `voidnet-api` admin listener at `100.101.0.9:8081`
  - `/api/*`, `/health` → `voidnet-api` public listener at `100.101.0.9:8080`
  - everything else → `voidnet-web` (Next.js portal) at `100.101.0.9:3848`
- **Header injection:** Caddy sets `X-Tailscale-Ip` from `{http.request.remote.host}` after the source-IP gate accepts. Client-supplied values are overwritten (not appended). The public `voidnet.makscee.ru` vhost strips this header (see `request_header -X-Tailscale-Ip` there) so forgery on the public face is blocked.
- **Probe it** (from any tailnet host):
  ```sh
  curl -fsSI https://admin.makscee.ru/admin/claude-key   # expect 200
  ```
  From a non-tailnet network (e.g. phone mobile data):
  ```sh
  curl -sI https://admin.makscee.ru/                     # expect 403
  ```
- **Lockout runbook:** if somehow tailnet is unreachable, `ssh root@nether`, edit `/opt/caddy/Caddyfile` to widen `@cgnat remote_ip ...` temporarily, `docker exec caddy caddy reload --config /etc/caddy/Caddyfile`, then revert + mirror the change back to this repo.
- **Spec:** `hub/docs/superpowers/specs/2026-04-24-vdn-21-admin-portal-gate-design.md`.

## 5. Ports exposed to the internet

| Port | Protocol | Service | Purpose |
| --- | --- | --- | --- |
| 46476 | UDP | amnezia-awg2 | AmneziaWG VPN entry |
| 80 | TCP | caddy | HTTP → HTTPS redirect + ACME HTTP-01 |
| 443 | TCP | caddy | HTTPS reverse proxy |
| 2053 | TCP | caddy | Internal TLS endpoint (`https://nether:2053` → xui:2053) |
| 100.101.0.3:8000 | TCP | portainer | Portainer edge agent (Tailscale-only) |
| 100.101.0.3:9443 | TCP | portainer | Portainer UI (Tailscale-only) |
| 127.0.0.1:5984 | TCP | couchdb | CouchDB admin (loopback-only; reached via Caddy) |
| 127.0.0.1:5678 | TCP | n8n | n8n UI (loopback-only; reached via Caddy) |
| 3000 | TCP | spacetimedb | SpacetimeDB (public via Caddy on aoi.makscee.ru:3000) |

Any port appearing in `docker ps` that is NOT in the table above should be treated as drift and investigated.

## 6. Secrets

| File | Fields | Used by |
| --- | --- | --- |
| `../../secrets/nether.sops.yaml` | `COUCHDB_USER`, `COUCHDB_PASSWORD` (+ historical `GF_SECURITY_ADMIN_*` — unused since 03-03 monitoring decommission; safe to prune in a follow-up cleanup plan) | `docker-compose.services.yml` (CouchDB) |
| `../../secrets/nether-awg.sops.yaml` | `server_private_key`, `peer_1..26_pubkey`, `peer_1..26_psk` | Rendered into `/opt/amnezia/awg/awg0.conf` before `amnezia-awg2` starts |

Decrypt workflow:

```sh
# From servers/nether/:
sops --decrypt ../../secrets/nether.sops.yaml \
  | awk -F': ' '/^[A-Z]/{gsub(/"/,"",$2); print $1"="$2}' > .env
# .env is gitignored; never commit it.
```

Raw-key detection runs in `scripts/verify-phase02.d/04-nether.sh` — CI will fail if `PrivateKey = <base64>` or `PresharedKey = <base64>` ever lands in this directory.

## 7. SPOF note (STATE.md blocker)

nether is a **single point of failure** for the Netherlands VPN path and for the Caddy-fronted public services. If nether dies:

- AmneziaWG clients lose connectivity until a replacement nether is provisioned and the rendered `awg0.conf` is restored from `secrets/nether-awg.sops.yaml`.
- Public hostnames (`*.makscee.ru`) go dark.
- Recovery path: provision a new VPS with the same public IP (DNS fallback), install Docker + SOPS+age, clone this repo, follow §3 (AWG render) and `docker compose -f docker-compose.services.yml up -d`.

Phase 2 documents this SPOF; redesigning for HA is out of scope (see D-11, threat register T-02-04-05 — accepted).

## 8. Not captured (by design)

- **Live caddy container's inlined Caddyfile command** — replaced with repo bind-mount per §4. Reproducibility > drift preservation.
- **Application-internal state** of n8n workflows, CouchDB databases, SpacetimeDB modules, Portainer settings — these are data, not config; see Phase 3 (backup/restore scope per D-06).
- **Provisioning of `/opt/amnezia`** on host (dnsutils-network, container build context) — assumed present; future Phase 4 may add an Ansible role.
- **Port 2053 upstream `xui:2053`** — referenced by Caddyfile but `xui` container is not present in the compose; either stale or provisioned outside this compose. Left as-is; flagged for future audit.
