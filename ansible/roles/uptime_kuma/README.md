# uptime_kuma role

Deploys self-hosted [uptime-kuma](https://github.com/louislam/uptime-kuma) on `nether`,
fronted by Caddy on `status.makscee.ru`.

## First deploy

1. Verify Cloudflare A-record `status.makscee.ru → <nether public ipv4>`.
2. `ansible-playbook ansible/playbooks/deploy-uptime-kuma.yml --tags preflight,pre`
   - Brings up kuma + tailnet-only Caddy.
   - Provisions admin user, monitors, TG notifier, status page over socket.io.
3. From a tailnet host, browse `https://status.makscee.ru/dashboard` and confirm provisioning.
4. `ansible-playbook ansible/playbooks/deploy-uptime-kuma.yml --tags publish,smoke`
   - Flips Caddy to public; runs smoke assertions.

## Re-converge

`ansible-playbook ansible/playbooks/deploy-uptime-kuma.yml` — idempotent.

## Rotate TG bot token

1. `sops workspace/homelab/secrets/nether/uptime-kuma.sops.yaml` — update token.
2. `ansible-playbook ansible/playbooks/deploy-uptime-kuma.yml --tags provision`.

## Restore from backup

```bash
ssh root@nether
cd /opt/uptime-kuma
docker compose stop
tar -xzf backups/kuma-YYYY-MM-DD.tar.gz -C data
docker compose start
```

## Add a new monitor

Append to `kuma_monitors` in `defaults/main.yml`. Re-run with `--tags provision`.

## Caddy convention

nether runs Caddy as a docker container (`servers/nether/docker-compose.services.yml`)
with the Caddyfile bind-mounted from the host path
`{{ kuma_caddyfile_path }}` (default `/root/homelab/servers/nether/Caddyfile`).
There is no `import sites/*.caddy` directive on this host. The role therefore:

- Uses `ansible.builtin.blockinfile` to patch a marker-delimited block
  (`# {mark} uptime-kuma`) into the live Caddyfile rather than dropping a
  separate file in `/etc/caddy/sites/`.
- Reloads via `docker exec {{ kuma_caddy_container_name }} caddy reload`
  rather than `systemctl reload caddy`, since caddy runs in a container, not
  as a host systemd unit.

If the host's Caddyfile location ever changes, override `kuma_caddyfile_path`
in inventory or via `-e` on the play. The block content is rendered from
`templates/caddy-private.j2` or `templates/caddy-public.j2` per the
`kuma_caddy_phase` variable.

The repo-side authoritative Caddyfile (`servers/nether/Caddyfile`) is the
source of truth for nether's static routes; this role's blockinfile addition
on the live host is functionally a deploy-side patch. To make the change
durable across nether rebuilds, hand-merge the rendered block into
`servers/nether/Caddyfile` after first successful deploy and commit.
