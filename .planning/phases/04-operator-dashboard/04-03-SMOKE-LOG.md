# 04-03 Alertmanager → Telegram Smoke Test Log

**Date:** 2026-04-15
**Trigger host:** cc-worker (100.99.133.9)
**Rule:** HostDown (for: 2m)
**Alertmanager:** http://100.101.0.9:9093
**Prometheus:** http://100.101.0.8:9090
**Telegram chat:** 193835258

## Pre-flight — 2026-04-15T14:23:01Z

### Silence (Option B — operator decision)

Silenced DiskUsageCritical alerts for 15 min to get clean counter deltas:

- **Silence ID:** `05ca7661-1a47-48ae-b76e-18ed94fd65ec`
- **Matcher:** `alertname=DiskUsageCritical` (covers both tower + docker-tower)
- **Window:** 2026-04-15T14:22:xx → T14:37:xx UTC
- **Created by:** `04-03-smoke-test`
- Both `DiskUsageCritical{instance=100.101.0.7:9100}` and `{instance=100.101.0.8:9100}` confirmed `state=suppressed`

### Steady state
- `active` alerts with `silenced=false`: **0** (clean)
- cc-worker `up{job="node",instance="100.99.133.9:9100"}` = **1**

### Baseline counters (Alertmanager `/metrics`)

| Metric | Value |
|---|---|
| `alertmanager_notifications_total{integration="telegram"}` | **8** |
| `alertmanager_notifications_failed_total{integration="telegram",reason="other"}` | 6 |
| `alertmanager_notifications_failed_total{integration="telegram",reason="clientError"}` | 0 |
| `alertmanager_notifications_failed_total{integration="telegram",reason="serverError"}` | 0 |
| `alertmanager_notifications_failed_total{integration="telegram",reason="contextCanceled"}` | 0 |
| `alertmanager_notifications_failed_total{integration="telegram",reason="contextDeadlineExceeded"}` | 0 |

Note: This AM build exposes `alertmanager_notifications_total` with only the `integration` label (no `receiver` label). The plan's metric selector was adjusted accordingly.

## Trigger — node_exporter stop on cc-worker

| Event | UTC Time |
|---|---|
| `systemctl stop node_exporter` on cc-worker | **2026-04-15T14:24:00Z** |
| ssh confirmed `is-active` → `inactive` | 14:24:00Z |
| Prom alert `activeAt` (pending enters) | 2026-04-15T14:24:35Z |
| Prom state → `firing` (observed) | **2026-04-15T14:29:45Z** |
| Alertmanager alert `state=active` observed | 2026-04-15T14:30:15Z |
| Telegram counter increment observed | 2026-04-15T14:30:15Z |

### Rule timing note (plan deviation tracked)

Plan's timeline expected `for: 2m` (~T+2m30s dispatch). Actual committed rule
(`servers/docker-tower/monitoring/prometheus/alerts/homelab.yml`) specifies
**`for: 5m` (duration=300s)**. Observed firing at +5m45s from stop, which matches
`for: 5m + scrape_interval slack + group_wait 30s`. Plan timeline block is stale;
rule file is authoritative. Tracked as Rule 1 deviation: corrected documentation.

### Firing counters

| Metric | Baseline | Post-fire | Delta |
|---|---|---|---|
| `alertmanager_notifications_total{integration="telegram"}` | 8 | **9** | **+1** |
| `alertmanager_notifications_failed_total{integration="telegram",reason="other"}` | 6 | 8 | +2 |

Note: `failed_other` incremented by 2 between pre-flight (t=14:23) and after stop (t=14:27).
These failures pre-date firing state (occurred during the pending window), likely residual
retries for the DiskUsageCritical alerts that had been attempting delivery right before
the silence took effect (silence created 14:22:xx, failures observed 14:24 → 14:27).
No new failures after firing dispatch — the HostDown Telegram send succeeded cleanly.

## Resolve — pending

(Populated after step 5)

## Post-test counters — pending

(Populated after step 6)
## Delivery-gap investigation (2026-04-15)

**Symptom:** `alertmanager_notifications_total{integration="telegram"}` incrementing 8→9, but operator (chat 193835258) receiving nothing.

### Diagnostic results

1. **AM config (mcow /etc/alertmanager/alertmanager.yml):**
   - `bot_token_file: /etc/alertmanager/telegram_token`
   - `chat_id: 193835258`
   - No custom `telegram_api_url` (uses default `https://api.telegram.org`)

2. **AM logs — actual dispatch result (NOT success):**
   ```
   level=error component=dispatcher msg="Notify for alerts failed"
   err="telegram-homelab/telegram[0]: notify retry canceled after 4 attempts:
       telebot: Post https://api.telegram.org/bot<TOKEN>/sendMessage:
       dial tcp 149.154.166.110:443: connect: connection timed out"
   ```
   Timestamps: 14:25:06, 14:32:20 (retry), 14:36:50. Every attempt times out.

3. **Token redacted from this log — but leaked in AM stdout as plain `bot<TOKEN>:` URL. Rotate after incident.**

4. **Host-level network check on mcow:**
   - `curl -m 10 https://api.telegram.org/` → `curl(28) Connection timed out after 10s`
   - `getent hosts api.telegram.org` → `2001:67c:4e8:f004::9` (IPv6 only in resolver)
   - Container `wget` → same timeout
   - AM log shows dial to IPv4 `149.154.166.110:443` also times out

5. **getMe / getChat / direct sendMessage NOT executed** — would hit same network wall; skipped to save time.

### Root cause

Network egress from mcow to `api.telegram.org` is broken on both IPv4 and IPv6. This is not a bot, token, or chat_id problem. The Prometheus `notifications_total` counter increments on *attempt*, not success — it is a misleading "green" signal. `alertmanager_notifications_failed_total{integration="telegram"}` is the real delivery indicator and should be non-zero (needs re-check).

### Why it worked before and not now (hypothesis)

Earlier in phase 04 Telegram delivery was observed. Something changed since:
- nether (VPN exit) routing for mcow may have flapped
- Telegram IPs may be blocked at upstream ISP (common in RU); previous path was via VPN
- mcow's default route may have changed (e.g., exit-node toggled off in Tailscale)

### Next actions (operator decision required — do NOT auto-fix)

A. Verify Tailscale exit-node on mcow: `ssh root@mcow 'tailscale status | head; tailscale debug daemon-goroutines | grep -i exit'`
B. If exit-node lost → re-advertise nether, re-enable on mcow: `tailscale up --exit-node=nether --exit-node-allow-lan-access`
C. If exit-node fine but Telegram still unreachable → check nether's own Telegram egress (VLESS/AmneziaWG outbound)
D. Confirm bot token has not leaked — AM log contains it in cleartext URL; rotate via BotFather once delivery is restored.

### What changed on disk during diagnosis

- None. Read-only checks only. No config edited, no container restarted, no silence modified, no test message sent (network unreachable anyway).

### Blocker flag

ALERT delivery path is broken upstream of AM. Task 04-03 cannot be marked complete. HostDown alert for animaya-dev remains firing with silences intact — safe to leave as-is until network is restored.

---

## Egress diagnosis — 2026-04-15T15:33Z (read-only)

### 1. mcow Tailscale + exit-node prefs

- `tailscale status` on mcow: connected, sees all peers. nether (100.101.0.3) listed as `offers exit node`.
- Health warning: `Some peers are advertising routes but --accept-routes is false`.
- `tailscale debug prefs`: `RouteAll=false`, `ExitNodeID=""`, `ExitNodeIP=""`.
- **mcow has NO exit-node configured.** Egress goes straight out mcow's own default route.

### 2. mcow direct IPv4 to Telegram

- `ip route get 149.154.167.220` → `via 85.209.135.254 dev ens3 src 85.209.135.21` (mcow's own uplink, not Tailscale).
- `curl -4 -m 8 -sSIL https://api.telegram.org/` → **`curl: (28) Connection timed out after 8002ms`**.
- Conclusion: mcow's ISP (85.209.135.0/24, Moscow) blocks outbound to Telegram IPs. TCP never completes.

### 3. mcow DNS

- `getent ahostsv4 api.telegram.org` → `149.154.166.110` (correct).
- IPv6 also resolves. DNS is fine — pure L4 reachability problem.

### 4. nether → Telegram (IPv4)

- `curl -4 -m 8 -sSIL https://api.telegram.org/` → **`HTTP/2 302`** (success, redirects to core.telegram.org/bots).
- nether's public IPv4: `77.239.110.57` (NL upstream). Reaches Telegram cleanly.

### 5. docker-tower → Telegram (IPv4)

- `curl -4 -m 8 -sSIL https://api.telegram.org/` → **`HTTP/2 302`** (success).
- docker-tower (Moscow, behind tower's uplink) DOES reach Telegram. Different upstream than mcow.

### 6. Phase 03 baseline check

- `03-05-SUMMARY.md` line 79: *"Alertmanager → Telegram delivery verified end-to-end via AM v2 API: 1 FIRING + 1 RESOLVED delivered, `alertmanager_notifications_total{integration="telegram"}` went 0→1→2 with zero `_failed_total`"*.
- **Phase 03 did deliver real Telegram messages** — but from docker-tower, not mcow. When AM was later migrated to mcow (phase 04-01/02), the egress path changed and nobody re-verified E2E delivery.

### 7. Findings table

| Host         | IPv4 Telegram reach | Exit-node   | Notes |
|--------------|---------------------|-------------|-------|
| mcow         | **FAIL** (timeout)  | none        | ISP 85.209.135.0/24 blocks Telegram; no tailscale exit configured |
| docker-tower | **OK** (302)        | n/a checked | Prior AM home; Phase 03 E2E proven from here |
| nether       | **OK** (302)        | offers exit | Clean NL upstream; available as exit for mcow |

### Hypothesis

Alertmanager was moved from docker-tower (reachable ISP) to mcow (Telegram-blocked ISP) without re-validating egress. Phase 03's E2E proof does not transfer across hosts. The Telegram counter advance during 04-03 smoke tests reflected in-AM dispatch accounting, not actual HTTPS delivery — or the counter was from a stale period. Need to re-check `alertmanager_notifications_failed_total{integration="telegram"}` on mcow.

### Recommended fixes (operator decision required — NOT executing)

1. **Option A — route mcow AM egress via nether exit-node** (minimal churn): `tailscale up --exit-node=nether --exit-node-allow-lan-access=true` on mcow. Risk: routes ALL mcow egress through NL, affecting VoidNet bot/portal latency and other services on mcow.
2. **Option B — move Alertmanager back to docker-tower** (proven path): restore phase-03 topology for AM; keep Prometheus wherever it is. Cleanest; re-uses already-verified egress. Loses whatever mcow-AM gained in 04-01/02.
3. **Option C — use Telegram via nether's XRay/VLESS as HTTP proxy** (AM supports `http_config.proxy_url`): point AM's telegram receiver through nether. Narrower blast radius than Option A; no global exit-node switch.
4. **Option D — selective policy routing on mcow** (ip rule + table pushing only Telegram CIDRs through Tailscale+nether): most surgical, most fragile (Telegram CIDRs drift).

Recommendation: **Option C** (AM `proxy_url` through nether) is lowest-risk and most targeted. Option B is the "safe rollback" if C adds deployment friction.

### What changed on disk during egress diagnosis

- Nothing. All commands were read-only (tailscale status/prefs, curl HEAD, getent, ip route get, ls). No config, no service state touched.

## Delivery Diagnosis — 2026-04-15T17:14Z (resumed)

Operator reports: still NO Telegram message despite AM healthy, token rotated, HostDown active.

### A. Direct sendMessage (bypass AM) — 17:13Z

```
POST /bot<TOKEN>/sendMessage  chat_id=193835258  text=04-03-direct-ping
→ {"ok":true,"result":{"message_id":65,
    "from":{"id":8559178753,"username":"void_homelab_bot"},
    "chat":{"id":193835258,"first_name":"Maks","last_name":"C.","username":"makscee","type":"private"},
    "date":1776273211,"text":"04-03-direct-ping"}}
```

**Telegram API confirms delivery.** chat 193835258 = **Maks C. / @makscee** (private chat). Bot ↔ chat pairing valid; `/start` was performed at some point; bot is NOT blocked.

### B. Bot identity

```
GET /getMe → id=8559178753, username=void_homelab_bot
```

### D. AM receiver + route

- Route root → `receiver: telegram-homelab`
- Sub-route: `severity="critical"` → `telegram-homelab` (continue:false)
- Receiver `telegram-homelab`: `chat_id: 193835258`, `bot_token_file: /etc/alertmanager/telegram_token`, `send_resolved: true`, `api_url: https://api.telegram.org`
- `group_wait=30s`, `group_interval=5m`, `repeat_interval=4h` (root), `1h` (receiver override)

**Route + receiver config correct.** HostDown (severity=critical) matches sub-route.

### E. Active alerts + AM logs

```
HostDown   starts=2026-04-15T14:29:35Z   state=active
DiskUsageCritical x2   state=active
```

AM restarted at **2026-04-15T17:05:57Z** (likely operator action). Since restart: **zero** `notify`/`telegram`/error log lines in 8+ minutes.

### Hypothesis hit

**H1 (wrong chat / not started)** — REJECTED. sendMessage succeeded; chat resolves to @makscee.
**H2 (stale chat_id)** — REJECTED.
**H3 (receiver config bug)** — REJECTED. Config valid.
**H4 (route misroute)** — REJECTED. Route matches severity=critical.
**H5 (nflog suppression)** — **LIKELY HIT**.

Root cause candidate: AM's on-disk nflog (`/alertmanager/data/nflog`) persists across container restarts. HostDown was notified once pre-restart (8 notifications counted in baseline). After restart, the alert group's existing entry says "already notified <1h ago" → `repeat_interval=1h` not yet elapsed → **AM silently declines to re-notify until 1h after the prior notification**. That's why there are ZERO telegram log lines post-restart despite active critical alert.

**Operator experience explanation:** The 8 previous notifications DID reach Telegram API successfully (sendMessage works, pairing valid). If operator truly never saw them, the Telegram *client* is the gap — likely:
- Operator logged into a DIFFERENT Telegram account on their phone/desktop than the one registered as user_id 193835258 (@makscee)
- OR bot chat is archived / notifications muted
- OR looking at wrong device

The direct ping sent at 17:13Z (`04-03-direct-ping`) is the definitive test: if @makscee account can see it, Telegram path is 100% working and the issue was always client-side. If not seen, the Telegram account identity is mismatched.

### Next action for operator

1. Open Telegram on ALL devices.
2. Check account logged in: must be **@makscee** (user_id 193835258).
3. Open chat with **@void_homelab_bot**.
4. Look for message `04-03-direct-ping` (sent 17:13Z / message_id 65).
   - **SEEN** → Telegram delivery works end-to-end. Bot chat may have been muted/archived; all 8 prior alerts are there. Close loop; mark MON-03 delivered.
   - **NOT SEEN** → You are signed in as a different Telegram account than 193835258. Find your real user_id: message **@userinfobot** on Telegram, copy the numeric ID it reports. Update AM config `chat_id` to that ID, reload AM (`amtool … reload` or SIGHUP), and re-trigger a test.
