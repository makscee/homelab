# 04-03 — Tailscale App Connector Setup on `nether`

**Date:** 2026-04-15
**Operator decision:** Route mcow → api.telegram.org egress via nether's NL uplink using Tailscale App Connector (per plan 04-03 architectural checkpoint).
**Scope of this commit:** nether CLI advertisement only. Admin-console enablement + ACL tagging + domain mapping pending operator.

---

## 1. Tailscale Docs Reference

- KB: https://tailscale.com/kb/1281/app-connectors
- Confirmed 2026 CLI flag name: **`--advertise-connector`** (not `--app-connector`; `--app-connector` surfaces only as a risk-ack token in `--accept-risk=mac-app-connector`).
- `tailscale set --help` excerpt from nether:
  ```
  --advertise-connector, --advertise-connector=false
      offer to be an app connector for domain specific internet traffic for the tailnet
  ```

## 2. Pre-state on `nether`

| Field          | Value                                                 |
| -------------- | ----------------------------------------------------- |
| Tailscale ver  | `1.96.4` (commit `8cf541dfd`)                         |
| OS             | linux                                                 |
| HostName       | `nether`                                              |
| TailscaleIPs   | `100.101.0.3`, `fd7a:115c:a1e0::9b37:6ea`              |
| Tags           | `['tag:personal']`                                    |
| CapMap sample  | `default-auto-update, funnel, https, file-sharing, funnel-ports` — **no `app-connectors` cap yet** |

**Note on sibling services on nether:** `awg-quick@awg0`, `xray`, `xrayr` systemd units reported `inactive` under those exact names. Operator should confirm the real unit names (likely `amneziawg-quick@awg0` or `wg-quick@wg0`, and `xray.service` with capitalisation). **App-connector advertisement is orthogonal** — it is a Tailscale-daemon role, does not touch Xray/AmneziaWG user-space listeners, does not modify routes advertised by those services, and does not open new ports on the host.

## 3. CLI action performed

```bash
ssh root@nether 'tailscale set --advertise-connector=true'
```

**stdout/stderr:**
```
Warning: UDP GRO forwarding is suboptimally configured on ens3, UDP forwarding
throughput capability will increase with a configuration change.
See https://tailscale.com/s/ethtool-config-udp-gro
```

Non-zero tunables warning only — no error, command accepted. The UDP GRO hint is a pre-existing perf tip unrelated to app-connectors and is safe to address later.

## 4. Post-state

`tailscale status --self --json` still shows `Tags: ['tag:personal']` and no `app-connectors` capability in `CapMap` — as expected; the capability is granted by the coordination server once the admin console enables the feature for this node and ACLs permit it.

## 5. Operator handoff

See `.planning/.continue-here.md` sections **A** (admin-console clicks), **B** (ACL tagging), **C** (bot-token rotation).

### Tag requirement summary

nether currently holds only `tag:personal`. Tailscale app connectors generally work best with a dedicated tag (`tag:connector`) so ACLs can express "any tailnet node → tag:connector:*" without loosening the broader personal-tag policy. Recommended path: **add `tag:connector` alongside `tag:personal` via admin-console Machines edit.**

### Domains to configure

Minimum:
- `api.telegram.org` (Bot API — what Alertmanager calls)
- `core.telegram.org` (documentation + auxiliary)

Optional (add only if the minimum set doesn't resolve the dispatch failure):
- `telegram.org`
- `*.t.me`

CIDRs (`149.154.160.0/20` etc.) are **not** entered into the app-connector UI — Tailscale resolves by domain and programs magic-DNS IPs automatically. Advertising raw CIDRs would require `--advertise-routes`, which is a different feature.

## 6. Rollback

If app-connector causes any unexpected behaviour on nether, disable with:
```bash
ssh root@nether 'tailscale set --advertise-connector=false'
```
…and remove the connector from the admin console. No impact on AmneziaWG/Xray.

## 7. Next steps

Blocked on operator completing admin-console A+B and bot-token rotation C (see `.planning/.continue-here.md`). Then executor resumes 04-03 smoke test.
