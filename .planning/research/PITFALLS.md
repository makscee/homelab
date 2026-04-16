# Pitfalls — Claude Code Usage Monitor

**Milestone:** v2.0 Claude Code Usage Monitor
**Researched:** 2026-04-16
**Overall confidence:** MEDIUM (v1.0 operational evidence HIGH; Anthropic-specific items HIGH on ToS, MEDIUM-LOW on endpoint behavior — no public quota API exists as of April 2026)

> **Read this first.** Two findings dominate every other pitfall and must be resolved in Phase 1 research before any code is written:
>
> 1. **ToS risk is now explicit** (HIGH). Anthropic's 2026 usage-policy update states that OAuth tokens (`sk-ant-oat01-*`) from Free/Pro/Max accounts are only permitted for Claude Code and Claude.ai. Using them in "any other product, tool, or service — including the Agent SDK" violates Consumer Terms. A custom Prometheus exporter that calls Anthropic endpoints with those tokens is — on its face — inside that prohibition. This does not block the milestone (ccusage-style local-log reading is explicitly fine), but it rules out approaches that impersonate Claude Code to call a quota endpoint.
> 2. **No public quota endpoint exists** (HIGH). GitHub issue `anthropics/claude-code#19880` and `#32796` request exactly this feature and both are still open. Phase 1 must choose between: (a) **local log tail** (ccusage model — safe, ToS-clean, but only sees what that host ran); (b) **scrape Claude Code's internal usage call** via the same UA the CLI uses (fast, but ToS-adjacent and unstable); (c) **hybrid** — local counters per worker, aggregated on mcow. Phase 1 picks ONE. Do not design the exporter before this decision.

---

## Anthropic API / ToS Risks

### A-01 — Using OAuth tokens outside Claude Code violates ToS (CRITICAL)
- **Problem:** Custom exporter uses `sk-ant-oat01-*` to hit any Anthropic endpoint. Anthropic's February/April 2026 enforcement wave already blocked third-party harnesses (OpenClaw case) via server-side client fingerprinting.
- **Symptom:** Token silently revoked; user's Claude Code CLI stops working with no warning. Worst case: Max subscription terminated.
- **Prevention (Phase 1):** Treat this as the first go/no-go gate. Approach (a) local-log tail is the only unambiguously safe path. If approach (b) is chosen, document ToS risk in ADR and have the user accept it before Phase 2. Never ship approach (b) without explicit written go-ahead.
- **Warning sign:** Anyone says "just call the endpoint the CLI uses." That is exactly what Anthropic fingerprints against.
- **Phase:** 1 (research), 2 (ADR)

### A-02 — OAuth tokens expire (~4 days) and need refresh
- **Problem:** `sk-ant-oat01-*` tokens are short-lived (~4 days). The login flow stores an access token + refresh token. An exporter that only stores the access token will start emitting `NaN` on day 5.
- **Symptom:** `up{job="claude-usage"} == 1` but `claude_code_weekly_used_ratio` missing; 401 in exporter logs; dashboard gauges blank.
- **Prevention (Phase 2):** If reading the CLI credential store (`~/.claude/credentials.json` or platform keyring), re-read on every scrape — do not cache in memory. If approach (a) local-log tail, OAuth refresh is not our problem — the CLI handles it. **Never hand-roll the refresh flow** (see GitHub `#12447`, `#22602`, `#29718` — even the official CLI has rough edges here).
- **Warning sign:** Exporter worked yesterday, `NaN` today, restart fixes it temporarily — that's the 4-day TTL biting.
- **Phase:** 2 (design), 3 (impl)

### A-03 — Polling frequency can trip rate limits or fingerprinting
- **Problem:** Claude Code's internal usage ping isn't documented; 30s × 5 tokens = 14,400 requests/day per token. Anthropic fingerprints abnormal clients.
- **Symptom:** 429s, then token invalidation, then account-level flags.
- **Prevention (Phase 2):** Default scrape interval 5 min (300s), not 30s. Weekly quota doesn't change faster than minutes. Configurable via compose env with a hard floor of 60s enforced in code.
- **Phase:** 2, 3

### A-04 — Undocumented endpoint changes without notice
- **Problem:** Any endpoint not in `platform.claude.com/docs/en/api` is unstable by definition. Anthropic can change shape, path, auth header, or remove it in any CLI release.
- **Symptom:** Exporter returns `up 0` after a CLI update; HTTP 404 or JSON schema mismatch in logs.
- **Prevention (Phase 3):** Parse defensively — wrap JSON access in try/except, emit `up 0` + dedicated `claude_code_exporter_errors_total{reason="schema"}` so `ExporterDegraded` can fire independently of quota alerts. Pin CLI version on the exporter host; bump deliberately.
- **Phase:** 3, 4

---

## Secret Handling Mistakes

### S-01 — Token leaked via metric label (CRITICAL)
- **Problem:** Convenient code like `claude_code_weekly_used_ratio{token="sk-ant-oat01-abcdef..."}` exposes the secret to every Prometheus scraper, every Grafana viewer, and every TSDB backup.
- **Prevention (Phase 2 + 3):** Registry entry defines an opaque `label` field (e.g. `label: "mcow-personal"`). Exporter uses ONLY that label. Unit test asserts no label value starts with `sk-`. CI check: `curl /metrics | grep -E 'sk-(ant|oat)' && exit 1`.
- **Warning sign:** Reviewer sees a "token" label name in code — fail the PR.
- **Phase:** 2, 3, 5 (deploy gate)

### S-02 — Token echoed in process crash / systemd logs
- **Problem:** HTTP client debug mode or an unhandled exception logs the full Authorization header. `journalctl -u claude-exporter` then contains the token.
- **Prevention (Phase 3):** Wrap `Authorization` build in a helper that redacts on `repr`. Configure logger to strip headers from exception tracebacks. Set container log driver rotation so any leak has bounded blast radius.
- **Phase:** 3

### S-03 — Env file race / wrong perms (repeat of v1.0 Telegram-token bug)
- **Problem:** SOPS-decrypt writes plaintext; mode `0644` even for a second = any local process reads it. Conversely, `0600 root:root` is too tight — exporter container runs as `nobody(65534)` and gets EACCES (exact v1.0 lesson, PROJECT.md Key Decisions).
- **Prevention (Phase 3):** Reuse v1.0 pattern verbatim: `install -m 0440 -o root -g 65534 /dev/stdin /run/secrets/claude_tokens <<<"$DECRYPTED"`. Decrypt to a tempfile with umask 0177, then `install` atomically.
- **Phase:** 3, 5

### S-04 — Exporter container running as root
- **Problem:** If exporter image doesn't set `USER`, it runs as root → compromise grants root on mcow → access to Alertmanager config, Grafana secrets, SOPS age key (if present).
- **Prevention (Phase 3):** `user: "65534:65534"` in compose. Read-only root FS if feasible. No capabilities.
- **Phase:** 3

### S-05 — Token echoed via `/metrics` debug fields
- **Problem:** Well-meaning counters like `claude_code_exporter_last_request{url="https://api.anthropic.com/...?token=..."}` ship the token in a label.
- **Prevention (Phase 3):** No URL labels ever. Coarsest label is `target_host="api.anthropic.com"`, nothing more.
- **Phase:** 3, 5

### S-06 — SOPS age key on mcow
- **Problem:** Age key on mcow turns mcow into a high-value target and breaks hub-level-secrets principle (v1.0 Phase 01).
- **Prevention (Phase 3):** Match v1.0 `navidrome.env` pattern — decrypt on Ansible controller, push via `ansible.builtin.copy` with `no_log: true`. Never write the age key to any monitored host.
- **Phase:** 3

---

## Prometheus Exporter Pitfalls

### P-01 — On-demand scraping makes `/metrics` slow or stale
- **Problem:** If each scrape triggers a live quota call, scrape duration can exceed scrape timeout (default 10s) and parallel scrapes hammer Anthropic.
- **Prevention (Phase 3):** Background poller updates an in-memory snapshot every 5 min; `/metrics` only serializes the snapshot (sub-ms). Expose `claude_code_quota_last_refresh_timestamp_seconds` so a staleness alert can fire if no refresh for >15 min.
- **Phase:** 3

### P-02 — Missing `up` semantics
- **Problem:** Prometheus sets `up=0` only on scrape-level failure. An exporter returning HTTP 200 with stale/zero data looks fine.
- **Prevention (Phase 3):** Emit explicit `claude_code_exporter_healthy` gauge (1 if last poll succeeded within TTL, else 0), separate from Prometheus's `up`. Alert `ExporterDegraded` binds to this, not `up`.
- **Phase:** 3, 4

### P-03 — Wrong metric names / units
- **Problem:** `claude_code_weekly_percent` (0–100) vs `claude_code_weekly_used_ratio` (0–1). Prometheus convention is ratio `_ratio` suffix; percent confuses PromQL math.
- **Prevention (Phase 2 + 3):** Names locked in PROJECT.md: `claude_code_weekly_used_ratio`, `claude_code_session_used_ratio`. Include `# TYPE gauge` + `# HELP`; verify via `promtool check metrics`.
- **Phase:** 2, 3

### P-04 — Cardinality explosion
- **Problem:** Labeling per-conversation-ID or per-request-ID multiplies time series unboundedly.
- **Prevention (Phase 2):** Allowed label set frozen in PROJECT.md: `label`, `owner_host`, `tier`. No `conversation_id`, `request_id`, `timestamp`. Model breakdown (if API exposes it) uses `model="opus"|"sonnet"|"haiku"` — closed set only.
- **Phase:** 2, 3

### P-05 — Counter reset on weekly boundary confused with restart
- **Problem:** Weekly usage as a counter reset to 0 each Monday breaks `rate()` — counter semantics assume monotonic increase; resets are read as counter restarts and hidden.
- **Prevention (Phase 2):** All quota-used values are **gauges**, never counters. For "total used ever" use a separate `_total` counter that never resets. Weekly reset touches only the gauge.
- **Phase:** 2, 3

### P-06 — Missing HELP/TYPE lines
- **Problem:** Grafana loses human-readable names; `promtool check metrics` warns.
- **Prevention (Phase 3):** Use the official client library (`prometheus_client` for Python or equivalent). It writes HELP/TYPE automatically. Reject hand-rolled text formatters.
- **Phase:** 3

### P-07 — Histograms/summaries where a gauge suffices
- **Problem:** Ratio metrics are instantaneous values — histograms add cost and complexity.
- **Prevention (Phase 2):** Gauges only for v2.0. If poll latency becomes interesting later, a single `*_duration_seconds_summary` is acceptable in Phase 4, not before.
- **Phase:** 2

---

## Multi-Token Management Mistakes

### M-01 — Shared HTTP client state races
- **Problem:** One `requests.Session` reused across goroutines/threads polling N tokens → cookie jar bleed, connection reuse confusion, rare cross-token credential leakage inside the exporter process.
- **Prevention (Phase 3):** One session per token, constructed at poll time. Or a single session with zero mutable state beyond per-call headers. Integration test with ≥3 tokens.
- **Phase:** 3

### M-02 — Slow token blocks all others
- **Problem:** Serial poll loop: token 1 TCP-hangs → tokens 2..N never polled → all gauges stale.
- **Prevention (Phase 3):** Per-token goroutine/task with independent 10s timeout. `asyncio.gather(return_exceptions=True)` pattern. One slow token must not affect any other.
- **Phase:** 3

### M-03 — One invalid token poisons the exporter
- **Problem:** Revoked/mistyped token raises → unhandled exception → exporter crashes → all metrics disappear.
- **Prevention (Phase 3):** Per-token try/except. Failing token → `claude_code_exporter_healthy{label="..."}=0` + `claude_code_exporter_errors_total{label="...",reason="auth"}++`, scrape still returns 200 with all other tokens intact.
- **Phase:** 3, 4

### M-04 — No way to disable a token without redeploy
- **Problem:** Token needs urgent silencing (compromised, account paused), registry is SOPS-encrypted, redeploy takes minutes.
- **Prevention (Phase 2):** Registry schema includes `enabled: true|false`. Exporter re-reads registry on SIGHUP or every N minutes. Alertmanager silence is a short-term complement, not a substitute.
- **Phase:** 2, 3

### M-05 — Registry schema drift vs SOPS validation
- **Problem:** Typo in a new entry key (`labal:` not `label:`). SOPS still encrypts; exporter `KeyError`s at scrape.
- **Prevention (Phase 2):** JSON Schema or pydantic validation at startup; `claude-exporter --validate-registry` subcommand run by Ansible pre-deploy.
- **Phase:** 2, 3, 5

---

## Alertmanager Rule Pitfalls

### AM-01 — Alert fires on first evaluation for already-over-quota tokens
- **Problem:** Exporter starts, token is already at 97% (nothing wrong, just the current state). `WeeklyQuotaCritical` fires instantly → Telegram spam.
- **Prevention (Phase 4):** All rules use `for: 5m` minimum, `for: 15m` for Critical. No instant-fire rules. Document in rule comments.
- **Phase:** 4

### AM-02 — Weekly/session reset causes flap (HIGH → resolve → HIGH)
- **Problem:** Gauge goes 0.81 → 0.00 (Monday reset) → 0.12 by noon → threshold re-crossed within a day → alert re-fires on the same underlying reality.
- **Prevention (Phase 4):** `for: 15m` on `WeeklyQuotaHigh` so the Monday dip doesn't trigger resolve-then-refire artifacts. Alertmanager `repeat_interval: 24h` for High, `6h` for Critical (v1.0 lesson: nflog resets on AM restart). Consider two-threshold hysteresis: `fire_at > 0.80 unless claude_code_weekly_used_ratio < 0.75`.
- **Phase:** 4

### AM-03 — Per-token alerts flood Telegram
- **Problem:** 5 tokens all cross 80% on a busy Tuesday → 5 separate Telegram messages within a minute.
- **Prevention (Phase 4):** `group_by: [alertname, severity]` — groups all `WeeklyQuotaHigh` into one message listing affected tokens. NOT `group_by: [instance, label]`.
- **Phase:** 4

### AM-04 — Only dispatch attempts counted, not successes (v1.0 replay)
- **Problem:** `alertmanager_notifications_total` increments on attempt. Silent Telegram delivery failure (Moscow egress) still increments the counter, smoke test passes.
- **Prevention (Phase 5):** Reuse v1.0 smoke test — induce fresh fire-resolve cycle AND verify the message landed in the Telegram chat. Check `alertmanager_notifications_failed_total` explicitly.
- **Phase:** 5

### AM-05 — Rule unit tests missing
- **Problem:** Typo in label selector → silently never fires.
- **Prevention (Phase 4):** `promtool test rules` covering: over-threshold fires after `for:`; under-threshold doesn't fire; flap across reset doesn't double-fire. Matches v1.0 healthcheck-CLI pattern.
- **Phase:** 4

---

## Grafana Dashboard Pitfalls

### G-01 — Time range shorter than reset window hides resets
- **Problem:** Default 1h time range; user looks right after reset, sees `0.03`, concludes exporter is broken because it was `0.85` yesterday.
- **Prevention (Phase 4):** Default time range = 7d (one weekly cycle). Reset boundary as annotation or vertical line from `claude_code_weekly_reset_timestamp_seconds`.
- **Phase:** 4

### G-02 — "All" in token-selector variable multi-plots overlap unreadably
- **Problem:** Multi-value `$label=All` renders 5 lines in one gauge → noise.
- **Prevention (Phase 4):** Gauge panels bind to single token (`$label` single-value). Timeseries panel uses multi-value. Separate "per-token detail" row that repeats per `$label`.
- **Phase:** 4

### G-03 — Thresholds hardcoded, drift from alert rule
- **Problem:** Dashboard says 80% yellow / 95% red; alert now fires at 85% → user confusion.
- **Prevention (Phase 4):** Thresholds from dashboard variables (`$high_threshold=0.8`, `$critical_threshold=0.95`). CI script greps both values from rule file + dashboard JSON.
- **Phase:** 4

### G-04 — "API 200 ≠ works" (v1.0 feedback_verify_ui lesson)
- **Problem:** Exporter returns 200, Prometheus ingests, rule evaluates — yet dashboard shows `No data` because of a panel PromQL typo.
- **Prevention (Phase 5):** Render dashboard in a browser, screenshot each panel, verify expected shape. Per memory lesson: API-200 ≠ dashboard-working.
- **Phase:** 5

### G-05 — Dashboard not in provisioning
- **Problem:** Dashboard built in UI, not exported to JSON in repo → lost on Grafana reinstall (DR-blocker).
- **Prevention (Phase 4):** `servers/mcow/grafana/dashboards/claude-usage.json`, provisioned via file provider. Same pattern as v1.0 overview dashboard.
- **Phase:** 4

---

## Homelab-Specific Pitfalls

### H-01 — Moscow ISP may block api.anthropic.com (CRITICAL — direct v1.0 replay)
- **Problem:** mcow's Moscow ISP L4-blocked Telegram IPv4 in v1.0. No evidence yet that it does or doesn't block Anthropic, but base rate says assume hostile until proven otherwise. Symptom would match v1.0 Telegram: attempt counter rises, none succeed.
- **Prevention (Phase 1 PRE-WORK):** Run on mcow BEFORE writing a line of exporter code:
  ```
  ssh root@mcow 'curl -4 -m 8 -sSIL https://api.anthropic.com/ >/dev/null && echo OK4 || echo FAIL4'
  ssh root@mcow 'curl -6 -m 8 -sSIL https://api.anthropic.com/ >/dev/null && echo OK6 || echo FAIL6'
  ```
  If FAIL4+FAIL6 → run exporter on docker-tower (different ISP, clean egress proven in v1.0). If FAIL4 only → rely on IPv6 or App Connector pattern (nether advertises anthropic CIDRs like it does Telegram).
- **Decision point:** where to host exporter. Default assumption (mcow) is NOT safe until this check runs.
- **Phase:** 1 (pre-research smoke)

### H-02 — Tailscale MagicDNS shadowing
- **Problem:** MagicDNS could in theory hijack `api.anthropic.com` (unlikely, but Tailscale split-DNS has surprised us before).
- **Prevention (Phase 1):** `dig api.anthropic.com @127.0.0.1` and `@1.1.1.1`; confirm identical answers. If diverge, `tailscale set --accept-dns=false` or override via compose `extra_hosts`.
- **Phase:** 1

### H-03 — Compose file drift (v1.0 tech-debt replay)
- **Problem:** `homestack` → `homelab` path drift just happened (2026-04-16). Hand-editing compose on mcow and forgetting to commit = one restart away from losing the change.
- **Prevention (Phase 3):** Deploy exclusively via new `ansible/playbooks/deploy-mcow.yml` (parallel to `deploy-docker-tower.yml`). No `scp compose.yml root@mcow:`. Canonical path `/opt/homelab/` — ansible enforces it.
- **Phase:** 3, 5

### H-04 — NTP skew on mcow vs Anthropic
- **Problem:** Session window is 5h rolling; mcow clock drift → session-reset timestamps wrong by minutes.
- **Prevention (Phase 3):** Verify `timedatectl` shows `System clock synchronized: yes` on mcow. v1.0 `NodeTimeOffsetHigh` alert from node-exporter already exists — confirm it covers mcow.
- **Phase:** 3, 5

---

## Operational Pitfalls

### O-01 — Exporter restart loses session-start estimate
- **Problem:** If exporter computes session start by detecting first usage after a 5h gap, restart loses that state → gauge briefly wrong.
- **Prevention (Phase 2 ADR):** Accept it. Document that gauges may show `NaN` for up to one poll interval after restart. Do NOT persist state to disk — that adds a backup/restore problem for little gain.
- **Phase:** 2

### O-02 — No DR story — exporter config lost = registry lost
- **Problem:** mcow LXC dies → SOPS `claude-tokens.sops.yaml` is in git (safe), but the decrypted runtime copy is gone → worker LXCs each have a local `sk-ant-oat01-*` from past logins, but there's no central registry → rebuild = hunting.
- **Prevention (Phase 3):** The SOPS file IS the DR artifact. Document recovery in `.planning/DR-playbook.md`: `sops --decrypt | ansible.builtin.copy` brings it back in one step. Aligns with deferred DR milestone (DR-01..04).
- **Phase:** 3, 6 (docs)

### O-03 — Silent token rotation
- **Problem:** User rotates a worker's OAuth via `/login`, forgets to update SOPS registry. Exporter keeps using the old token, gets 401, emits `NaN`, user doesn't notice for days.
- **Prevention (Phase 4):** Alert `ClaudeExporterAuthFailure` on `increase(claude_code_exporter_errors_total{reason="auth"}[15m]) > 0` — fires loud and fast.
- **Phase:** 4

### O-04 — Logs verbose enough to matter for mcow disk
- **Problem:** mcow already has persistent `DiskUsageCritical` (v1.0 known tech debt). New service with verbose logs at 5-min intervals can push it over.
- **Prevention (Phase 3):** `logging.driver: json-file` with `max-size: 10m, max-file: 3` in compose. INFO default; DEBUG only via env.
- **Phase:** 3

---

## Summary Table — Pitfall → Phase → Prevention Action

| # | Pitfall | Phase | Prevention action (one-liner) |
|---|---------|-------|-------------------------------|
| A-01 | ToS: OAuth outside Claude Code forbidden | 1, 2 | Phase-1 go/no-go; prefer local-log; ADR + user sign-off if endpoint approach |
| A-02 | OAuth 4-day TTL | 2, 3 | Re-read credential store every scrape; never hand-roll refresh |
| A-03 | Poll frequency trips rate limit / fingerprint | 2, 3 | Default scrape 300s, hard floor 60s in code |
| A-04 | Undocumented endpoint changes | 3, 4 | Defensive JSON + `exporter_errors_total{reason="schema"}` |
| S-01 | Token in metric label | 2, 3, 5 | Opaque `label` only; CI grep for `sk-` in `/metrics` |
| S-02 | Token in crash logs | 3 | Redacted auth helper + header-stripped tracebacks |
| S-03 | Env file wrong perms (v1.0 replay) | 3, 5 | `install -m 0440 root:65534` verbatim |
| S-04 | Exporter as root | 3 | `user: "65534:65534"`, no caps |
| S-05 | Token leaks via debug labels | 3, 5 | No URL/request labels; reviewer gate |
| S-06 | SOPS age key on mcow | 3 | Decrypt on controller, push via `ansible.copy` |
| P-01 | On-demand scrape slow | 3 | Background poller + in-memory snapshot |
| P-02 | Missing `up` semantics | 3, 4 | Explicit `exporter_healthy` gauge |
| P-03 | Wrong metric naming | 2, 3 | Lock names; `promtool check metrics` |
| P-04 | Cardinality explosion | 2, 3 | Frozen label allowlist |
| P-05 | Counter reset confusion | 2, 3 | Quota = gauge, not counter |
| P-06 | Missing HELP/TYPE | 3 | Use official client lib |
| P-07 | Histogram where gauge suffices | 2 | Gauges only for v2.0 |
| M-01 | Shared HTTP state race | 3 | Session per token; 3-token integration test |
| M-02 | Slow token blocks others | 3 | Per-token timeout + `asyncio.gather` |
| M-03 | One bad token kills exporter | 3, 4 | Per-token try/except + error counter |
| M-04 | Can't disable without redeploy | 2, 3 | `enabled: bool` in registry, SIGHUP reload |
| M-05 | Registry schema drift | 2, 3, 5 | Pydantic validation + `--validate-registry` |
| AM-01 | Instant-fire on startup | 4 | `for: 5m`/`15m` on all rules |
| AM-02 | Weekly-reset flap | 4 | `for: 15m` + hysteresis + `repeat_interval: 24h` |
| AM-03 | N-token Telegram flood | 4 | `group_by: [alertname, severity]` |
| AM-04 | Attempts vs successes (v1.0 replay) | 5 | Manual smoke confirms Telegram chat delivery |
| AM-05 | Missing rule tests | 4 | `promtool test rules` coverage |
| G-01 | Reset window hidden | 4 | Default time range 7d + reset annotation |
| G-02 | "All" overlap | 4 | Single-token gauges, multi-token timeseries |
| G-03 | Threshold drift | 4 | Dashboard variables + CI grep vs rule file |
| G-04 | Dashboard UI verification (v1.0 lesson) | 5 | Browser render + screenshot |
| G-05 | Dashboard not provisioned | 4 | JSON in repo, file-provider |
| H-01 | Moscow ISP may block Anthropic | 1 | `curl -4/-6` smoke BEFORE coding; fallback host = docker-tower |
| H-02 | MagicDNS shadowing | 1 | `dig @127.0.0.1 vs @1.1.1.1` diff |
| H-03 | Compose drift (v1.0 replay) | 3, 5 | Deploy only via new ansible playbook |
| H-04 | NTP skew | 3, 5 | `timedatectl` + existing `NodeTimeOffsetHigh` |
| O-01 | Restart loses session estimate | 2 | Accept + document; no disk state |
| O-02 | DR story missing | 3, 6 | SOPS file IS the DR artifact; runbook |
| O-03 | Silent token rotation | 4 | `ClaudeExporterAuthFailure` alert |
| O-04 | Log disk pressure on mcow | 3 | `json-file` driver with size caps |

---

## Warning Signs — Pre-Ship Checklist Per Phase

**Before exiting Phase 1 (Research):**
- [ ] ToS risk decision recorded in ADR with user sign-off
- [ ] `curl -4/-6 api.anthropic.com` from mcow documented — pass or fallback decided
- [ ] Chosen approach: local-log / endpoint / hybrid — written explicitly

**Before exiting Phase 3 (Exporter build):**
- [ ] `curl /metrics | grep -E 'sk-(ant|oat)'` returns nothing
- [ ] Integration test with ≥3 tokens, 1 intentionally invalid — other 2 still emit data
- [ ] Exporter `docker inspect` shows `User: 65534:65534`
- [ ] Registry file on mcow mode 0440, owner root, group 65534
- [ ] `promtool check metrics` clean
- [ ] No token value in `journalctl -u claude-exporter` across simulated crash

**Before exiting Phase 4 (Alerts + Dashboard):**
- [ ] `promtool test rules` passes: threshold, flap-across-reset, no-instant-fire
- [ ] Dashboard JSON committed under `servers/mcow/grafana/dashboards/`
- [ ] `group_by` inspected in alertmanager.yml

**Before declaring v2.0 shipped (Phase 5 smoke):**
- [ ] Induced a fresh High alert AND confirmed the Telegram message landed in chat
- [ ] All panels rendered in a browser and visually inspected (v1.0 lesson)
- [ ] `alertmanager_notifications_failed_total` is 0 since last deploy
- [ ] Four days after deploy: tokens still authenticating (TTL survived)

---

## Sources

- [Anthropic Usage Policy Update 2026](https://www.anthropic.com/news/usage-policy-update) — MEDIUM
- [Anthropic clarifies ban on third-party tool access — The Register, 2026-02-20](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access/) — HIGH (ToS stance)
- [GitHub #19880 — Public API Endpoint for Claude.ai Usage Limits](https://github.com/anthropics/claude-code/issues/19880) — HIGH (open)
- [GitHub #32796 — Expose Max plan usage limits via Claude Code API/SDK](https://github.com/anthropics/claude-code/issues/32796) — HIGH (open)
- [GitHub #12447 — OAuth token expiration disrupts autonomous workflows](https://github.com/anthropics/claude-code/issues/12447) — HIGH (~4d TTL)
- [Claude Code OAuth Token Expiry — daveswift.com](https://daveswift.com/claude-oauth-update/) — MEDIUM
- [I Tried to Reverse Engineer Claude Code's Usage Limits — claudecodecamp.com](https://www.claudecodecamp.com/p/i-tried-to-reverse-engineer-claude-code-s-usage-limits) — MEDIUM
- [Writing exporters — Prometheus](https://prometheus.io/docs/instrumenting/writing_exporters/) — HIGH
- [Alertmanager Configuration — Prometheus](https://prometheus.io/docs/alerting/latest/configuration/) — HIGH
- [Chris's Wiki — Alertmanager Flapping](https://utcc.utoronto.ca/~cks/space/blog/sysadmin/PrometheusAlertmanagerFlapping) — MEDIUM
- v1.0 operational memory: `~/.claude/projects/-Users-admin-hub-workspace-homelab/memory/project_mcow_egress_lesson.md`, `feedback_verify_ui.md`, `project_docker_tower_canonical_path.md` — HIGH (direct)
- v1.0 compose pattern: `servers/mcow/docker-compose.monitoring.yml` — HIGH (`install -m 0440 root:65534`)
