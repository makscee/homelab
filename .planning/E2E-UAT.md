# E2E UAT — homelab.makscee.ru (v3.0 full-stack walk-through)

**Precondition:** logged into GitHub in your browser. URL: https://homelab.makscee.ru

Pre-verified by Claude (2026-04-21):
- ✅ Public access (not Tailnet-only), TLS via Caddy + Let's Encrypt
- ✅ `/`, `/audit`, `/proxmox`, `/alerts`, `/voidnet/users`, `/tokens` all render
- ✅ 169 unit tests pass
- ✅ `/tokens` SopsDecryptError fixed (commit `0cb00d2`) — both tokens show `max` tier, live 5h/7d usage, reset countdown

Scenarios below are for **your** sign-off. Each one is self-contained. Say "pass", "fail: X", or "skip: Y".

---

## 1. Public + unauthenticated access

1. Open a **private/incognito** window.
2. Visit https://homelab.makscee.ru/
3. **Expect:** redirect to GitHub OAuth sign-in page (you are NOT already logged in).
4. Cancel/close. Visit https://homelab.makscee.ru/api/tokens directly.
5. **Expect:** HTTP 401 JSON (not 200, not a redirect to your logged-in session).

*Confirms: public ingress works, auth gate enforced at both page + API layer.*

---

## 2. GitHub OAuth sign-in

1. In incognito, click the GitHub sign-in button at https://homelab.makscee.ru/login.
2. Approve GitHub consent.
3. **Expect:** land on `/`, header shows your avatar + username "makscee", nav shows 6 links (Overview, Claude Tokens, Audit, VoidNet, Proxmox, Alerts).

---

## 3. Overview (`/`) — live Tailnet snapshot

1. Navigate to `/`.
2. **Expect:** 4 host cards (tower, docker-tower, cc-worker, mcow), each with:
   - CPU/memory/disk progress bars with current percentages
   - Uptime + load averages
   - Net-rx 15m sparkline (SVG)
   - Status badge "fresh"
3. Leave tab open ~35 seconds. **Expect:** numbers tick (page auto-refreshes every 30s, no full reload flash).

---

## 4. Claude Tokens (`/tokens`) — read + live usage

1. Navigate to `/tokens`.
2. **Expect:** table with 2 rows: `makscee` and `andrey`. Columns: Label, Tier (`max`), Owner, 5h usage, 7d usage, Resets in, 7-day trend sparkline, State (`Enabled`), Row actions.
3. Numbers should match Grafana (5h ≈1–2% for makscee, ≈2% for andrey today).
4. Click a row. **Expect:** drawer/detail view with full metadata (id, added_at = 2026-04-17).

---

## 5. Claude Tokens — mutations (**destructive, only do if comfortable**)

### 5a. Add token (non-destructive — you can immediately delete)
1. Click **Add token**.
2. Fill: label `uat-test`, paste a throwaway string `sk-ant-oat01-UAT_TEST_PLEASE_DELETE`, tier `pro`, owner `uat`.
3. Submit.
4. **Expect:** row appears, audit entry created.
5. Delete it via row actions.
6. **Expect:** row disappears, audit entry for delete.

### 5b. Disable + re-enable existing
1. Row actions → Disable on `andrey`.
2. **Expect:** state chip flips to "Disabled", Prom exporter stops polling it within 30s.
3. Re-enable.

### 5c. Rotate
1. Row actions → Rotate on a test token you add.
2. **Expect:** old value replaced, `rotated_at` timestamp set.

---

## 6. Audit log (`/audit`)

1. Navigate to `/audit` after doing actions in §5.
2. **Expect:** entries for each mutation (add/delete/disable/rotate) with actor=`makscee`, target id, timestamp, IP.
3. Filter by actor / action type if UI supports — verify filters work.

---

## 7. Proxmox (`/proxmox`) — read-only

1. Navigate to `/proxmox`.
2. **Expect:** LXC list for tower (CT 100 docker-tower, 101 jellyfin, 200/202/203 cc-andrey/dan/yuri, 204 cc-worker, 205 animaya-dev). Each row: vmid, name, status, cpu/mem, uptime.
3. Click an LXC (e.g. 204 cc-worker).
4. **Expect:** detail page with tasks tab (recent Proxmox task log for that vmid).
5. Click a task to see task log output.

---

## 8. Alerts (`/alerts`) — live Prometheus + Alertmanager

1. Navigate to `/alerts`.
2. **Expect:** "No firing alerts" empty state (heading: "No firing alerts", subtitle mentions 15s Prometheus poll).
3. Leave tab, ~30s later — no stale-data banner, no full reload.
4. *(Optional induced firing test)*: SSH mcow and `systemctl stop prometheus-node-exporter` briefly; `/alerts` should show NodeExporterDown within ~1 min. Restart after.

---

## 9. VoidNet (`/voidnet/users`)

1. Navigate to `/voidnet/users`.
2. **Expect:** placeholder text "VoidNet Users — Coming in Phase 15" (deferred, handled in voidnet repo).

---

## 10. Security headers + TLS

1. Run: `curl -sI https://homelab.makscee.ru/ | grep -iE 'strict-transport|x-frame|x-content|referrer|permissions'`
2. **Expect:**
   - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
   - `X-Frame-Options: DENY`
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
3. Run: `curl -sI http://homelab.makscee.ru/` — **expect** 308 redirect to HTTPS.

---

## 11. Sign out

1. Click **Sign out** in header.
2. **Expect:** session cleared, land on login. Navigating to `/tokens` without re-auth → 401/redirect.

---

## Known non-issues
- `favicon.ico` 404 in console — cosmetic, safe to ignore.
- `/voidnet/users` placeholder only — feature lives in voidnet repo.

## Report format
For each scenario, reply with number + result:
```
1 pass
2 pass
3 pass
4 pass
5a skip (don't want to touch production)
5b pass
...
```
